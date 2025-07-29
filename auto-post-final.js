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

async function debugFrameStructure(page) {
    const frames = page.frames();
    console.log(`\n=== 프레임 구조 분석 (총 ${frames.length}개) ===`);
    for (let i = 0; i < frames.length; i++) {
        const frame = frames[i];
        console.log(`Frame ${i}: ${frame.name() || 'unnamed'} - ${frame.url()}`);
    }
    console.log('=====================================\n');
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
        
        // 3. 새로운 접근 방법 - 카페 메인 페이지에서 시작
        const cafeUrl = `https://cafe.naver.com/atohealing`;
        console.log('카페로 이동:', cafeUrl);
        await page.goto(cafeUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(2000);
        
        // 프레임 구조 확인
        await debugFrameStructure(page);
        
        // 4. 글쓰기 버튼 찾기
        console.log('글쓰기 버튼 찾는 중...');
        
        // cafe_main iframe 찾기
        let cafeFrame = page.frames().find(f => f.name() === 'cafe_main');
        
        if (cafeFrame) {
            console.log('cafe_main iframe에서 작업');
            
            // 글쓰기 버튼 클릭 시도
            const writeButtonSelectors = [
                'a.write_btn',
                'a[href*="ArticleWrite"]',
                'button:has-text("글쓰기")',
                'a:has-text("글쓰기")',
                '.btn_write'
            ];
            
            for (const selector of writeButtonSelectors) {
                try {
                    await cafeFrame.click(selector, { timeout: 2000 });
                    console.log(`글쓰기 버튼 클릭 성공: ${selector}`);
                    await page.waitForTimeout(3000);
                    break;
                } catch {
                    continue;
                }
            }
            
            // 프레임 구조 재확인
            await debugFrameStructure(page);
            
            // 글쓰기 프레임 찾기
            cafeFrame = page.frames().find(f => 
                f.name() === 'cafe_main' || 
                f.url().includes('ArticleWrite')
            );
            
            if (cafeFrame) {
                // 제목 입력
                console.log('제목 입력 시도...');
                try {
                    await cafeFrame.fill('input[name="subject"]', `[자동] ${post.title}`);
                    console.log('제목 입력 성공');
                } catch (e) {
                    console.log('제목 입력 실패:', e.message);
                }
                
                // 내용 입력
                const textContent = post.content_html
                    .replace(/<[^>]*>/g, '')
                    .replace(/&nbsp;/g, ' ')
                    .trim();
                
                console.log('내용 입력 시도...');
                
                // SmartEditor 체크
                const innerFrames = cafeFrame.childFrames ? cafeFrame.childFrames() : [];
                if (innerFrames.length > 0) {
                    console.log('SmartEditor 발견');
                    try {
                        const editorFrame = innerFrames[0];
                        await editorFrame.click('body');
                        await editorFrame.type('body', textContent);
                        console.log('SmartEditor 입력 성공');
                    } catch (e) {
                        console.log('SmartEditor 입력 실패:', e.message);
                    }
                } else {
                    // 일반 textarea
                    try {
                        await cafeFrame.fill('textarea[name="content"]', textContent);
                        console.log('textarea 입력 성공');
                    } catch (e) {
                        console.log('textarea 입력 실패:', e.message);
                    }
                }
                
                // 등록 버튼
                console.log('등록 버튼 클릭 시도...');
                const submitSelectors = [
                    'a.BaseButton--skinGreen',
                    'a.btn',
                    'button[type="submit"]',
                    'a:has-text("등록")'
                ];
                
                for (const selector of submitSelectors) {
                    try {
                        await cafeFrame.click(selector, { timeout: 2000 });
                        console.log(`등록 버튼 클릭 성공: ${selector}`);
                        break;
                    } catch {
                        continue;
                    }
                }
            }
        } else {
            // iframe이 없는 경우 직접 URL 접근
            console.log('iframe이 없어 직접 URL로 접근합니다.');
            const directWriteUrl = `https://cafe.naver.com/ca-fe/cafes/${MY_CAFE.clubId}/articles/write?menuId=${MY_CAFE.menuId}`;
            await page.goto(directWriteUrl, { waitUntil: 'networkidle' });
            await page.waitForTimeout(3000);
            
            // 페이지에서 직접 작업
            try {
                await page.fill('input[name="subject"]', `[자동] ${post.title}`);
                const textContent = post.content_html.replace(/<[^>]*>/g, '').trim();
                await page.fill('textarea', textContent);
                await page.click('button:has-text("등록")');
                console.log('직접 입력 성공');
            } catch (e) {
                console.log('직접 입력 실패:', e.message);
            }
        }
        
        await page.waitForTimeout(3000);
        console.log('✅ 작업 완료!');
        
        // Supabase 업데이트는 성공 확인 후에만
        // await supabase
        //     .from('naver_cafe_posts')
        //     .update({ status: 'uploaded', uploaded_at: new Date().toISOString() })
        //     .eq('id', post.id);
        
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
postToNaverCafe()
    .then(() => console.log('\n✅ 완료'))
    .catch(console.error);