import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

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
        await page.waitForSelector('#id', { state: 'visible' });
        
        await page.fill('#id', process.env.NAVER_ID);
        await page.fill('#pw', process.env.NAVER_PASSWORD);
        await page.click('.btn_login');
        
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
        
        // 3. 글쓰기 URL로 직접 이동 (구형 URL)
        const writeUrl = `https://cafe.naver.com/ArticleWrite.nhn?m=write&clubid=${CAFE_INFO.clubId}&menuid=${CAFE_INFO.menuId}`;
        console.log('글쓰기 페이지로 이동:', writeUrl);
        await page.goto(writeUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);
        
        // 4. iframe 내에서 작업
        const frames = page.frames();
        console.log(`프레임 수: ${frames.length}`);
        
        // cafe_main iframe 찾기
        const cafeFrame = frames.find(f => f.name() === 'cafe_main' || f.url().includes('ArticleWrite'));
        
        if (cafeFrame) {
            console.log('cafe_main iframe에서 작업');
            
            // 제목 입력
            try {
                await cafeFrame.waitForSelector('input[name="subject"]', { timeout: 5000 });
                await cafeFrame.fill('input[name="subject"]', `[자동] ${post.title}`);
                console.log('✅ 제목 입력 완료');
            } catch (e) {
                console.log('❌ 제목 입력 실패:', e.message);
                return;
            }
            
            // 내용 입력
            const textContent = post.content_html
                .replace(/<[^>]*>/g, '')
                .replace(/&nbsp;/g, ' ')
                .replace(/\n\n+/g, '\n\n')
                .trim();
            
            // SmartEditor 확인
            const editorFrames = cafeFrame.childFrames();
            let contentEntered = false;
            
            if (editorFrames && editorFrames.length > 0) {
                console.log('SmartEditor 감지');
                try {
                    const editorFrame = editorFrames[0];
                    const body = await editorFrame.waitForSelector('body', { timeout: 3000 });
                    await body.click();
                    await editorFrame.keyboard.type(textContent);
                    console.log('✅ SmartEditor 내용 입력 완료');
                    contentEntered = true;
                } catch (e) {
                    console.log('SmartEditor 입력 실패, textarea 시도');
                }
            }
            
            if (!contentEntered) {
                try {
                    await cafeFrame.waitForSelector('textarea[name="content"]', { timeout: 3000 });
                    await cafeFrame.fill('textarea[name="content"]', textContent);
                    console.log('✅ textarea 내용 입력 완료');
                } catch (e) {
                    console.log('❌ 내용 입력 실패:', e.message);
                    return;
                }
            }
            
            // 등록 버튼 클릭
            console.log('등록 버튼 찾는 중...');
            await page.waitForTimeout(1000);
            
            const buttonClicked = await cafeFrame.evaluate(() => {
                // 등록 버튼 찾기
                const buttons = document.querySelectorAll('a, button');
                for (const btn of buttons) {
                    if (btn.textContent.includes('등록') || btn.textContent.includes('확인')) {
                        btn.click();
                        return true;
                    }
                }
                return false;
            });
            
            if (buttonClicked) {
                console.log('✅ 등록 버튼 클릭 완료');
                await page.waitForTimeout(3000);
                
                // 성공 시 Supabase 업데이트
                await supabase
                    .from('naver_cafe_posts')
                    .update({ 
                        status: 'uploaded',
                        uploaded_at: new Date().toISOString()
                    })
                    .eq('id', post.id);
                
                console.log('✅ 게시글 업로드 성공!');
            } else {
                console.log('❌ 등록 버튼을 찾을 수 없습니다');
            }
            
        } else {
            console.log('❌ cafe_main iframe을 찾을 수 없습니다');
        }
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        console.log('\n브라우저를 닫으려면 Enter를 누르세요...');
        await new Promise(resolve => process.stdin.once('data', resolve));
        await browser.close();
    }
}

// 실행
console.log('🚀 네이버 카페 자동 글쓰기 시작...\n');
console.log(`📍 카페: ${CAFE_INFO.name} (ID: ${CAFE_INFO.clubId})`);
console.log(`📍 게시판: ${CAFE_INFO.menuId}번\n`);

postToNaverCafe()
    .then(() => console.log('\n✅ 프로그램 종료'))
    .catch(console.error);