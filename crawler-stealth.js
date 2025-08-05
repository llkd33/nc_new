import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
// Stealth 플러그인은 아직 Playwright에서 완전히 지원되지 않음
// 대신 수동으로 봇 감지 우회 기능 구현
import dotenv from 'dotenv';

dotenv.config();

// Stealth 모드는 context와 page 설정으로 구현

// 환경변수
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NAVER_ID = process.env.NAVER_ID;
const NAVER_PASSWORD = process.env.NAVER_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 카페 설정
const CAFE_CONFIG = {
    '부동산스터디': {
        clubId: '10322296',
        menuId: '334',
        cafeName: '부동산스터디',
        cafeUrl: 'https://cafe.naver.com/jaegebal'
    },
    '부린이집': {
        clubId: '29738397',
        menuId: '12',
        cafeName: '부린이집',
        cafeUrl: 'https://cafe.naver.com/burini'
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomDelay(min = 1000, max = 3000) {
    const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(delayTime);
}

// 향상된 네이버 로그인
async function stealthLogin(page) {
    console.log('🥷 Stealth 모드 네이버 로그인 시도...');
    
    try {
        // 로그인 페이지로 이동
        await page.goto('https://nid.naver.com/nidlogin.login', {
            waitUntil: 'load',
            timeout: 60000
        });
        
        await randomDelay(3000, 5000);
        
        // 로그인 폼이 로드될 때까지 대기
        await page.waitForSelector('#id', { visible: true, timeout: 10000 });
        
        // 아이디 입력 - 더 자연스럽게
        const idInput = await page.$('#id');
        await idInput.click({ delay: 100 });
        await randomDelay(500, 1000);
        
        // 클립보드 복사/붙여넣기 방식 시뮬레이션
        await page.evaluate((id) => {
            document.querySelector('#id').value = id;
            document.querySelector('#id').dispatchEvent(new Event('input', { bubbles: true }));
        }, NAVER_ID);
        
        await randomDelay(1000, 2000);
        
        // 비밀번호 입력
        const pwInput = await page.$('#pw');
        await pwInput.click({ delay: 100 });
        await randomDelay(500, 1000);
        
        await page.evaluate((pw) => {
            document.querySelector('#pw').value = pw;
            document.querySelector('#pw').dispatchEvent(new Event('input', { bubbles: true }));
        }, NAVER_PASSWORD);
        
        await randomDelay(1000, 2000);
        
        // 로그인 상태 유지 체크 해제
        const keepLogin = await page.$('#keep');
        if (keepLogin) {
            const isChecked = await page.$eval('#keep', el => el.checked);
            if (isChecked) {
                await keepLogin.click({ delay: 100 });
                await randomDelay(500, 1000);
            }
        }
        
        // 스크린샷 (디버깅용)
        if (process.env.GITHUB_ACTIONS) {
            await page.screenshot({ path: 'before-login.png' });
        }
        
        // 로그인 버튼 클릭
        console.log('🔄 로그인 버튼 클릭...');
        const loginButton = await page.$('.btn_login');
        
        // 클릭 전 마우스 움직임 시뮬레이션
        const box = await loginButton.boundingBox();
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
        await randomDelay(200, 500);
        
        await Promise.all([
            page.waitForNavigation({ 
                waitUntil: 'networkidle', 
                timeout: 60000 
            }).catch(e => console.log('Navigation timeout - continuing...')),
            loginButton.click({ delay: 100 })
        ]);
        
        await randomDelay(5000, 8000);
        
        // 로그인 성공 확인
        const currentUrl = page.url();
        console.log('현재 URL:', currentUrl);
        
        // 여러 방법으로 로그인 확인
        let isLoggedIn = false;
        
        if (!currentUrl.includes('nidlogin') && !currentUrl.includes('login')) {
            isLoggedIn = true;
        } else {
            // 메인 페이지로 이동해서 확인
            await page.goto('https://www.naver.com', { waitUntil: 'networkidle' });
            await randomDelay(2000, 3000);
            
            isLoggedIn = await page.evaluate(() => {
                // 로그인 상태 확인 (여러 선택자 시도)
                const logoutBtn = document.querySelector('.link_logout, .MyView-module__link_logout, [class*="logout"]');
                const loginBtn = document.querySelector('.link_login');
                const userInfo = document.querySelector('.MyView-module__name, .user_info');
                
                return (logoutBtn !== null || userInfo !== null) && loginBtn === null;
            });
        }
        
        if (isLoggedIn) {
            console.log('✅ 로그인 성공!');
            
            // 쿠키 저장
            const cookies = await page.context().cookies();
            console.log(`🍪 ${cookies.length}개 쿠키 저장됨`);
            
            return true;
        } else {
            console.error('❌ 로그인 실패');
            
            if (process.env.GITHUB_ACTIONS) {
                await page.screenshot({ path: 'login-failed.png' });
            }
            
            return false;
        }
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        
        if (process.env.GITHUB_ACTIONS) {
            await page.screenshot({ path: 'login-error.png' });
        }
        
        return false;
    }
}

// 게시글 크롤링
async function crawlWithLogin(page, cafeConfig) {
    const results = [];
    
    try {
        // 카페 메인 페이지로 이동
        console.log(`📍 ${cafeConfig.cafeName} 접속 중...`);
        await page.goto(cafeConfig.cafeUrl, { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        await randomDelay(2000, 3000);
        
        // iframe 찾기
        const frame = page.frames().find(f => f.name() === 'cafe_main');
        if (!frame) {
            console.log('⚠️  cafe_main iframe을 찾을 수 없음, 직접 URL 시도');
            
            // 직접 게시판 URL로 이동
            const boardUrl = `${cafeConfig.cafeUrl}/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}`;
            await page.goto(boardUrl, { waitUntil: 'networkidle' });
            await randomDelay(2000, 3000);
        }
        
        const targetFrame = frame || page;
        
        // 게시판으로 이동
        if (frame) {
            const boardUrl = `/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}&search.boardtype=L`;
            await frame.goto(boardUrl, { waitUntil: 'networkidle' });
            await randomDelay(2000, 3000);
        }
        
        // 게시글 목록 수집
        const posts = await targetFrame.evaluate(() => {
            const results = [];
            const rows = document.querySelectorAll('.article-board tbody tr, table.board-box tbody tr');
            
            for (let i = 0; i < Math.min(rows.length, 5); i++) {
                const row = rows[i];
                
                // 공지사항 제외
                if (row.querySelector('.ico-list-notice')) continue;
                
                const titleEl = row.querySelector('.article, a.article');
                const authorEl = row.querySelector('.td_name a, .p-nick a');
                const dateEl = row.querySelector('.td_date');
                
                if (titleEl && authorEl) {
                    const href = titleEl.getAttribute('href');
                    const articleId = href?.match(/articleid=(\d+)/)?.[1];
                    
                    if (articleId) {
                        results.push({
                            articleId,
                            title: titleEl.textContent.trim(),
                            author: authorEl.textContent.trim(),
                            date: dateEl?.textContent.trim() || '',
                            href
                        });
                    }
                }
            }
            
            return results;
        });
        
        console.log(`✅ ${posts.length}개 게시글 발견`);
        
        // 각 게시글 상세 내용 수집
        for (const post of posts) {
            try {
                console.log(`📄 수집 중: ${post.title}`);
                
                if (frame) {
                    // iframe 내에서 이동
                    await frame.goto(`/ArticleRead.nhn?clubid=${cafeConfig.clubId}&articleid=${post.articleId}`, {
                        waitUntil: 'networkidle'
                    });
                } else {
                    // 직접 URL로 이동
                    await page.goto(`${cafeConfig.cafeUrl}/ArticleRead.nhn?clubid=${cafeConfig.clubId}&articleid=${post.articleId}`, {
                        waitUntil: 'networkidle'
                    });
                }
                
                await randomDelay(1500, 2500);
                
                // 게시글 내용 추출
                const content = await targetFrame.evaluate(() => {
                    const contentEl = document.querySelector('.se-main-container, .ContentRenderer, #postViewArea');
                    return contentEl ? contentEl.innerHTML : '';
                });
                
                // 이미지 URL 추출
                const imageUrls = await targetFrame.evaluate(() => {
                    const images = document.querySelectorAll('.se-image-resource img, .ContentRenderer img');
                    return Array.from(images)
                        .map(img => img.src)
                        .filter(src => src && !src.includes('cafe_meta'))
                        .slice(0, 5);
                });
                
                results.push({
                    cafe_name: cafeConfig.cafeName,
                    board_name: `게시판${cafeConfig.menuId}`,
                    title: post.title,
                    content_html: content,
                    author: post.author,
                    created_at: new Date().toISOString(),
                    original_url: `${cafeConfig.cafeUrl}/${post.articleId}`,
                    image_urls: imageUrls.length > 0 ? imageUrls : null,
                    status: 'pending'
                });
                
            } catch (error) {
                console.error(`❌ 게시글 수집 실패: ${error.message}`);
            }
            
            await randomDelay(2000, 3000);
        }
        
    } catch (error) {
        console.error(`❌ ${cafeConfig.cafeName} 크롤링 실패:`, error.message);
    }
    
    return results;
}

// 메인 함수
export async function crawlWithStealth() {
    console.log('🥷 Stealth 모드 네이버 카페 크롤링 시작');
    console.log('🔐 향상된 로그인 방식 사용');
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 계정 정보가 없습니다.');
        return [];
    }
    
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-features=IsolateOrigins,site-per-process',
            '--flag-switches-begin',
            '--disable-site-isolation-trials',
            '--flag-switches-end'
        ]
    });
    
    const allResults = [];
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
            permissions: ['geolocation'],
            geolocation: { latitude: 37.5665, longitude: 126.9780 }, // 서울
            extraHTTPHeaders: {
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
            }
        });
        
        // 추가 스크립트 주입
        await context.addInitScript(() => {
            // 자동화 감지 우회
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Chrome 확인
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {}
            };
            
            // 플러그인
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // 언어
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko']
            });
        });
        
        const page = await context.newPage();
        
        // 로그인
        const loginSuccess = await stealthLogin(page);
        if (!loginSuccess) {
            throw new Error('네이버 로그인 실패');
        }
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            const posts = await crawlWithLogin(page, cafeConfig);
            allResults.push(...posts);
            
            console.log(`✅ ${cafeName}: ${posts.length}개 수집 완료`);
            await randomDelay(3000, 5000);
        }
        
        // Supabase에 저장
        if (allResults.length > 0) {
            console.log(`\n💾 총 ${allResults.length}개 게시글 저장 중...`);
            
            const { error } = await supabase
                .from('naver_cafe_posts')
                .insert(allResults);
            
            if (error) {
                console.error('❌ DB 저장 실패:', error.message);
            } else {
                console.log('✅ DB 저장 완료');
            }
        }
        
    } catch (error) {
        console.error('❌ 크롤링 중 오류:', error.message);
    } finally {
        await browser.close();
    }
    
    console.log(`\n✅ 크롤링 완료! 총 ${allResults.length}개의 새 게시글 처리`);
    return allResults;
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlWithStealth()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}