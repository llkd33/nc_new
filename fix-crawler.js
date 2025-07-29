import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);

async function fixedCrawler() {
    console.log('🔧 수정된 크롤러 시작...\n');
    
    const browser = await chromium.launch({ 
        headless: false,  // 문제 확인을 위해 브라우저 표시
        slowMo: 500      // 동작을 느리게 해서 관찰
    });
    
    try {
        const page = await browser.newPage();
        
        // 1. 로그인
        console.log('1️⃣ 네이버 로그인...');
        await page.goto('https://nid.naver.com/nidlogin.login');
        await page.fill('#id', process.env.NAVER_ID);
        await page.fill('#pw', process.env.NAVER_PASSWORD);
        await page.click('.btn_login');
        await page.waitForNavigation();
        console.log('✅ 로그인 성공\n');
        
        // 2. 카페 접속 (올바른 URL 사용)
        console.log('2️⃣ 카페 접속...');
        await page.goto('https://cafe.naver.com/jaegebal');
        await page.waitForTimeout(3000);
        
        // 3. iframe 찾기 및 안정화 대기
        console.log('3️⃣ iframe 로드 대기...');
        const frameElement = await page.waitForSelector('iframe#cafe_main');
        const frame = await frameElement.contentFrame();
        
        if (!frame) {
            throw new Error('iframe을 찾을 수 없습니다');
        }
        
        // 4. 현재 상태 확인
        const currentUrl = frame.url();
        console.log(`현재 Frame URL: ${currentUrl}\n`);
        
        // 5. 게시판 이동 방법 개선 - 직접 URL 사용
        console.log('4️⃣ 게시판으로 이동...');
        
        // 방법 1: frame 내에서 직접 네비게이션
        try {
            await frame.goto('/ArticleList.nhn?search.clubid=12730407&search.menuid=84&search.boardtype=L');
            await page.waitForTimeout(3000);
            console.log('✅ 게시판 이동 성공\n');
        } catch (e) {
            console.log('⚠️  직접 이동 실패, 링크 클릭 시도...');
            
            // 방법 2: 메뉴 링크 클릭
            const menuLink = await frame.$('a[href*="menuid=84"]');
            if (menuLink) {
                await menuLink.click();
                await page.waitForTimeout(3000);
            }
        }
        
        // 6. 게시글 추출 (frame이 여전히 유효한지 확인)
        console.log('5️⃣ 게시글 추출...');
        
        // frame 재획득 (detached 방지)
        const newFrameElement = await page.waitForSelector('iframe#cafe_main');
        const newFrame = await newFrameElement.contentFrame();
        
        const posts = await newFrame.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('.article-board tbody tr');
            
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const row = rows[i];
                
                // 각 요소 존재 여부 확인
                const titleEl = row.querySelector('.td_article .article');
                const authorEl = row.querySelector('.td_name');
                const dateEl = row.querySelector('.td_date');
                
                if (titleEl) {
                    // 작성자 추출 개선
                    let author = 'Unknown';
                    if (authorEl) {
                        // 모든 텍스트 노드 수집
                        const authorText = authorEl.textContent.trim();
                        // a 태그 내부 텍스트 우선
                        const authorLink = authorEl.querySelector('a');
                        author = authorLink ? authorLink.textContent.trim() : authorText;
                    }
                    
                    results.push({
                        title: titleEl.textContent.trim(),
                        author: author,
                        date: dateEl ? dateEl.textContent.trim() : '',
                        href: titleEl.getAttribute('href'),
                        // 디버그 정보
                        debug: {
                            hasTitle: !!titleEl,
                            hasAuthor: !!authorEl,
                            hasDate: !!dateEl,
                            authorHTML: authorEl ? authorEl.innerHTML : ''
                        }
                    });
                }
            }
            
            return results;
        });
        
        console.log(`\n✅ ${posts.length}개 게시글 추출됨:`);
        posts.forEach((post, i) => {
            console.log(`${i+1}. ${post.title}`);
            console.log(`   작성자: ${post.author} | 날짜: ${post.date}`);
            console.log(`   디버그:`, post.debug);
        });
        
        // 7. 첫 번째 게시글 내용 테스트
        if (posts.length > 0 && posts[0].href) {
            console.log('\n6️⃣ 게시글 내용 추출 테스트...');
            
            // 새 탭에서 열기 (frame detached 방지)
            const newPage = await browser.newPage();
            await newPage.goto(`https://cafe.naver.com/jaegebal${posts[0].href}`);
            await newPage.waitForTimeout(2000);
            
            const contentFrame = await newPage.waitForSelector('iframe#cafe_main');
            const cFrame = await contentFrame.contentFrame();
            
            const content = await cFrame.evaluate(() => {
                const selectors = ['.se-main-container', '.ContentRenderer', '#postViewArea'];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) return el.textContent.substring(0, 200) + '...';
                }
                return '내용을 찾을 수 없음';
            });
            
            console.log(`내용 미리보기: ${content}`);
            await newPage.close();
        }
        
        console.log('\n분석 완료! 브라우저를 확인하세요. Enter를 누르면 종료됩니다...');
        await new Promise(resolve => process.stdin.once('data', resolve));
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await browser.close();
    }
}

fixedCrawler();