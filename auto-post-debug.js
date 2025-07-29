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
        
        // 3. 카페로 이동
        await page.goto(`https://cafe.naver.com/${MY_CAFE.clubId}`);
        await page.waitForTimeout(2000);
        
        // 4. 글쓰기 버튼 찾기 및 클릭
        console.log('글쓰기 버튼 찾는 중...');
        
        // iframe 확인
        const frames = page.frames();
        console.log(`총 ${frames.length}개의 프레임 발견`);
        frames.forEach((f, i) => {
            console.log(`Frame ${i}: ${f.url()}`);
        });
        
        // cafe_main iframe 찾기
        const frame = frames.find(f => f.name() === 'cafe_main' || f.url().includes('ArticleList'));
        
        if (frame) {
            console.log('cafe_main iframe 발견!');
            
            // 글쓰기 버튼 클릭
            try {
                await frame.click('a.write_btn');
                console.log('글쓰기 버튼 클릭 성공');
            } catch {
                // 다른 선택자 시도
                await frame.click('a[href*="ArticleWrite"]');
            }
            
            await page.waitForTimeout(3000);
            
            // 새로운 프레임 상태 확인
            const newFrames = page.frames();
            const writeFrame = newFrames.find(f => f.url().includes('ArticleWrite'));
            const targetFrame = writeFrame || frame;
            
            // 제목 입력
            console.log('제목 입력 중...');
            await targetFrame.fill('input[name="subject"]', `[자동] ${post.title}`);
            
            // 내용 입력
            const textContent = post.content_html
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .trim();
            
            console.log('내용 입력 중...');
            
            // SmartEditor 확인
            try {
                const editorFrames = targetFrame.childFrames();
                if (editorFrames.length > 0) {
                    console.log('SmartEditor 발견');
                    const editorFrame = editorFrames[0];
                    await editorFrame.click('body');
                    await editorFrame.type('body', textContent);
                } else {
                    // 일반 textarea
                    await targetFrame.fill('textarea[name="content"]', textContent);
                }
            } catch {
                console.log('일반 textarea 사용');
                await targetFrame.fill('textarea', textContent);
            }
            
            // 등록 버튼 클릭
            console.log('등록 버튼 찾는 중...');
            try {
                await targetFrame.click('a.BaseButton--skinGreen');
            } catch {
                try {
                    await targetFrame.click('button[type="submit"]');
                } catch {
                    await targetFrame.click('a.btn');
                }
            }
            
            await page.waitForTimeout(3000);
            console.log('✅ 게시글 작성 완료!');
            
            // Supabase 상태 업데이트
            await supabase
                .from('naver_cafe_posts')
                .update({ 
                    status: 'uploaded',
                    uploaded_at: new Date().toISOString()
                })
                .eq('id', post.id);
            
        } else {
            console.error('cafe_main iframe을 찾을 수 없습니다');
            
            // 직접 글쓰기 URL로 이동
            console.log('직접 글쓰기 페이지로 이동 시도...');
            const writeUrl = `https://cafe.naver.com/ArticleWrite.nhn?m=write&clubid=${MY_CAFE.clubId}&menuid=${MY_CAFE.menuId}`;
            await page.goto(writeUrl);
            await page.waitForTimeout(3000);
            
            // 페이지에서 직접 작업
            await page.fill('input[name="subject"]', `[자동] ${post.title}`);
            const textContent = post.content_html
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .trim();
            await page.fill('textarea', textContent);
            await page.click('a.btn');
        }
        
    } catch (error) {
        console.error('❌ 오류:', error);
        console.error('상세:', error.stack);
    } finally {
        console.log('\n종료하려면 Enter를 누르세요...');
        await new Promise(resolve => process.stdin.once('data', resolve));
        await browser.close();
    }
}

// 실행
console.log('🚀 네이버 카페 자동 글쓰기 시작...\n');
postToNaverCafe()
    .then(() => console.log('\n✅ 완료'))
    .catch(console.error);