import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// 글을 올릴 내 카페 정보 설정
const MY_CAFE = {
    clubId: '25447805',  // 카페 ID
    menuId: '5'          // 게시판 ID
};

async function postToNaverCafe() {
    const browser = await chromium.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const page = await browser.newPage();
        
        // 1. 네이버 로그인
        console.log('🔐 네이버 로그인...');
        await page.goto('https://nid.naver.com/nidlogin.login');
        await page.fill('#id', process.env.NAVER_ID);
        await page.fill('#pw', process.env.NAVER_PASSWORD);
        await page.click('.btn_login');
        await page.waitForNavigation();
        
        // 2. pending 게시글 가져오기
        const { data: posts } = await supabase
            .from('naver_cafe_posts')
            .select('*')
            .eq('status', 'pending')
            .limit(1);
        
        if (!posts || posts.length === 0) {
            console.log('업로드할 게시글이 없습니다.');
            return;
        }
        
        const post = posts[0];
        console.log(`📋 업로드 시작: ${post.title}`);
        
        // 3. 카페 글쓰기 페이지로 직접 이동
        const writeUrl = `https://cafe.naver.com/ca-fe/cafes/${MY_CAFE.clubId}/articles/write?menuId=${MY_CAFE.menuId}`;
        await page.goto(writeUrl);
        await page.waitForTimeout(3000);
        
        // 4. iframe 찾기 - 여러 방법 시도
        let frame = null;
        
        // 방법 1: iframe 이름으로 찾기
        frame = page.frames().find(f => f.name() === 'cafe_main');
        
        // 방법 2: iframe URL로 찾기
        if (!frame) {
            const frames = page.frames();
            for (const f of frames) {
                const url = f.url();
                if (url.includes('ArticleWrite') || url.includes('articles/write')) {
                    frame = f;
                    break;
                }
            }
        }
        
        // 방법 3: 직접 iframe 요소 찾기
        if (!frame) {
            try {
                const iframeElement = await page.$('iframe#cafe_main');
                if (iframeElement) {
                    frame = await iframeElement.contentFrame();
                }
            } catch (e) {
                console.log('iframe 요소 찾기 실패');
            }
        }
        
        // iframe 없이 직접 작업
        const targetFrame = frame || page;
        
        // 5. 제목 입력
        console.log('✏️ 게시글 작성 중...');
        await targetFrame.fill('input[name="subject"]', `[자동] ${post.title}`);
        
        // 6. 내용 입력 - HTML 제거하고 텍스트만
        const textContent = post.content_html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .trim();
        
        // SmartEditor가 있는 경우
        try {
            const editorFrame = targetFrame.childFrames()[0];
            if (editorFrame) {
                await editorFrame.click('body');
                await editorFrame.type('body', textContent);
            }
        } catch {
            // 일반 textarea인 경우
            await targetFrame.fill('textarea[name="content"]', textContent);
        }
        
        // 7. 등록 버튼 클릭
        await targetFrame.click('a.btn');
        await page.waitForTimeout(3000);
        
        console.log('✅ 게시글 작성 완료!');
        
        // 8. Supabase 상태 업데이트
        await supabase
            .from('naver_cafe_posts')
            .update({ 
                status: 'uploaded',
                uploaded_at: new Date().toISOString()
            })
            .eq('id', post.id);
            
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await browser.close();
    }
}

// 실행
console.log('🚀 네이버 카페 자동 글쓰기 시작...\n');
postToNaverCafe()
    .then(() => console.log('\n✅ 완료'))
    .catch(console.error);