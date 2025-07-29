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

async function waitForNaverLogin(page) {
    // 로그인 상태 확인
    try {
        await page.waitForSelector('.gnb_name', { timeout: 5000 });
        return true;
    } catch {
        return false;
    }
}

async function postToNaverCafe() {
    const browser = await chromium.launch({ 
        headless: false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        const page = await context.newPage();
        
        // 1. 네이버 로그인
        console.log('🔐 네이버 로그인...');
        await page.goto('https://nid.naver.com/nidlogin.login');
        
        // 로그인 폼 대기
        await page.waitForSelector('#id', { state: 'visible' });
        
        // ID/PW 입력
        await page.fill('#id', process.env.NAVER_ID);
        await page.fill('#pw', process.env.NAVER_PASSWORD);
        
        // 로그인 버튼 클릭
        await page.click('.btn_login');
        
        // 로그인 완료 대기
        await page.waitForNavigation({ waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        
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
        
        // 3. 카페 글쓰기 페이지로 직접 이동 (구형 URL 사용)
        const writeUrl = `https://cafe.naver.com/ArticleWrite.nhn?m=write&clubid=${MY_CAFE.clubId}&menuid=${MY_CAFE.menuId}`;
        console.log('글쓰기 페이지로 이동:', writeUrl);
        
        await page.goto(writeUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        
        // 4. iframe 찾기
        const frames = page.frames();
        console.log(`프레임 수: ${frames.length}`);
        
        let targetFrame = null;
        
        // cafe_main iframe 찾기
        for (const frame of frames) {
            const url = frame.url();
            if (frame.name() === 'cafe_main' || url.includes('ArticleWrite')) {
                targetFrame = frame;
                console.log('작업할 프레임 발견:', url);
                break;
            }
        }
        
        if (!targetFrame) {
            console.log('iframe을 찾을 수 없어 메인 페이지에서 작업합니다.');
            targetFrame = page;
        }
        
        // 5. 제목 입력
        console.log('✏️ 게시글 작성 중...');
        
        // 제목 입력 필드 찾기
        const titleSelectors = [
            'input[name="subject"]',
            'input[id="subject"]',
            'input.subject',
            'input[placeholder*="제목"]'
        ];
        
        let titleInput = null;
        for (const selector of titleSelectors) {
            try {
                titleInput = await targetFrame.waitForSelector(selector, { timeout: 2000 });
                if (titleInput) {
                    console.log(`제목 입력 필드 발견: ${selector}`);
                    break;
                }
            } catch {
                continue;
            }
        }
        
        if (titleInput) {
            await titleInput.fill(`[자동] ${post.title}`);
        } else {
            console.error('제목 입력 필드를 찾을 수 없습니다.');
        }
        
        // 6. 내용 입력
        const textContent = post.content_html
            .replace(/<[^>]*>/g, '')
            .replace(/&nbsp;/g, ' ')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&amp;/g, '&')
            .trim();
        
        console.log('내용 입력 중...');
        
        // SmartEditor iframe 찾기
        const editorFrames = targetFrame.childFrames();
        if (editorFrames.length > 0) {
            console.log('SmartEditor 발견');
            try {
                const editorFrame = editorFrames[0];
                const editorBody = await editorFrame.waitForSelector('body', { timeout: 3000 });
                await editorBody.click();
                await editorFrame.keyboard.type(textContent);
            } catch (e) {
                console.log('SmartEditor 입력 실패, textarea 시도');
            }
        }
        
        // textarea 시도
        const contentSelectors = [
            'textarea[name="content"]',
            'textarea[id="content"]',
            'textarea.content',
            'textarea'
        ];
        
        for (const selector of contentSelectors) {
            try {
                const textarea = await targetFrame.waitForSelector(selector, { timeout: 1000 });
                if (textarea) {
                    await textarea.fill(textContent);
                    console.log(`내용 입력 완료: ${selector}`);
                    break;
                }
            } catch {
                continue;
            }
        }
        
        // 7. 등록 버튼 클릭
        console.log('등록 버튼 찾는 중...');
        await page.waitForTimeout(1000);
        
        const submitSelectors = [
            'a.BaseButton--skinGreen',
            'button[type="submit"]',
            'a.btn_write',
            'a.btn',
            'button:has-text("등록")',
            'a:has-text("등록")'
        ];
        
        let clicked = false;
        for (const selector of submitSelectors) {
            try {
                await targetFrame.click(selector, { timeout: 2000 });
                console.log(`등록 버튼 클릭 성공: ${selector}`);
                clicked = true;
                break;
            } catch {
                continue;
            }
        }
        
        if (!clicked) {
            console.error('등록 버튼을 찾을 수 없습니다.');
        } else {
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
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
        console.error('스택:', error.stack);
    } finally {
        console.log('\n브라우저를 닫으려면 Enter를 누르세요...');
        await new Promise(resolve => process.stdin.once('data', resolve));
        await browser.close();
    }
}

// 실행
console.log('🚀 네이버 카페 자동 글쓰기 시작...\n');
postToNaverCafe()
    .then(() => console.log('\n✅ 완료'))
    .catch(console.error);