import express from 'express';
import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const app = express();
app.use(express.json());

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// 카페 정보
const CAFE_INFO = {
    name: 'atohealing',
    clubId: '25447805',
    menuId: '5'
};

// 네이버 카페 글쓰기 함수
async function postToNaverCafe(postData) {
    const browser = await chromium.launch({ 
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const context = await browser.newContext();
        const page = await context.newPage();
        
        // 네이버 로그인
        await page.goto('https://nid.naver.com/nidlogin.login');
        await page.fill('#id', process.env.NAVER_ID);
        await page.fill('#pw', process.env.NAVER_PASSWORD);
        await page.click('.btn_login');
        await page.waitForNavigation();
        
        // 글쓰기 페이지로 이동
        const writeUrl = `https://cafe.naver.com/ArticleWrite.nhn?m=write&clubid=${CAFE_INFO.clubId}&menuid=${CAFE_INFO.menuId}`;
        await page.goto(writeUrl);
        await page.waitForTimeout(2000);
        
        // iframe 내에서 작업
        const frames = page.frames();
        const cafeFrame = frames.find(f => f.name() === 'cafe_main');
        
        if (cafeFrame) {
            // 제목 입력
            await cafeFrame.fill('input[name="subject"]', postData.title);
            
            // 내용 입력
            const textContent = postData.content
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .trim();
            
            // SmartEditor 또는 textarea
            const editorFrames = cafeFrame.childFrames();
            if (editorFrames && editorFrames.length > 0) {
                const editorFrame = editorFrames[0];
                await editorFrame.click('body');
                await editorFrame.type('body', textContent);
            } else {
                await cafeFrame.fill('textarea[name="content"]', textContent);
            }
            
            // 등록
            await cafeFrame.evaluate(() => {
                const buttons = document.querySelectorAll('a, button');
                for (const btn of buttons) {
                    if (btn.textContent.includes('등록')) {
                        btn.click();
                        break;
                    }
                }
            });
            
            await page.waitForTimeout(3000);
            return { success: true };
        }
        
        throw new Error('카페 iframe을 찾을 수 없습니다');
        
    } catch (error) {
        console.error('글쓰기 실패:', error);
        return { success: false, error: error.message };
    } finally {
        await browser.close();
    }
}

// API 엔드포인트
app.post('/api/post-to-naver', async (req, res) => {
    try {
        const { postId } = req.body;
        
        if (!postId) {
            // postId가 없으면 pending 게시글 조회
            const { data: posts } = await supabase
                .from('naver_cafe_posts')
                .select('*')
                .eq('status', 'pending')
                .order('created_at_server', { ascending: true })
                .limit(1);
            
            if (!posts || posts.length === 0) {
                return res.json({ 
                    success: false, 
                    message: '업로드할 게시글이 없습니다' 
                });
            }
            
            const post = posts[0];
            const result = await postToNaverCafe({
                title: `[자동] ${post.title}`,
                content: post.content_html
            });
            
            if (result.success) {
                // 성공 시 상태 업데이트
                await supabase
                    .from('naver_cafe_posts')
                    .update({ 
                        status: 'uploaded',
                        uploaded_at: new Date().toISOString()
                    })
                    .eq('id', post.id);
                
                res.json({ 
                    success: true, 
                    message: '게시글 업로드 성공',
                    postId: post.id,
                    title: post.title
                });
            } else {
                // 실패 시 상태 업데이트
                await supabase
                    .from('naver_cafe_posts')
                    .update({ 
                        status: 'failed',
                        error_message: result.error
                    })
                    .eq('id', post.id);
                
                res.json({ 
                    success: false, 
                    error: result.error 
                });
            }
        }
    } catch (error) {
        console.error('API 오류:', error);
        res.status(500).json({ 
            success: false, 
            error: error.message 
        });
    }
});

// 상태 확인 엔드포인트
app.get('/api/status', async (req, res) => {
    const { data: stats } = await supabase
        .from('naver_cafe_posts')
        .select('status')
        .order('created_at_server', { ascending: false })
        .limit(10);
    
    const summary = {
        pending: stats.filter(s => s.status === 'pending').length,
        uploaded: stats.filter(s => s.status === 'uploaded').length,
        failed: stats.filter(s => s.status === 'failed').length
    };
    
    res.json({ 
        success: true, 
        stats: summary,
        cafeInfo: CAFE_INFO
    });
});

// 서버 시작
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`🚀 API 서버가 포트 ${PORT}에서 실행 중입니다`);
    console.log(`📍 POST http://localhost:${PORT}/api/post-to-naver`);
    console.log(`📍 GET  http://localhost:${PORT}/api/status`);
});

// 정기 실행 (옵션)
if (process.env.AUTO_RUN === 'true') {
    setInterval(async () => {
        console.log('⏰ 자동 업로드 확인 중...');
        const response = await fetch(`http://localhost:${PORT}/api/post-to-naver`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const result = await response.json();
        console.log('결과:', result);
    }, 5 * 60 * 1000); // 5분마다
}