import { createClient } from '@supabase/supabase-js';
import { Builder, By, Key, until } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import dotenv from 'dotenv';

dotenv.config();

// 환경변수
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NAVER_ID = process.env.NAVER_ID;
const NAVER_PASSWORD = process.env.NAVER_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 카페 설정
const CAFE_CONFIG = {
    '호텔라이프': {
        clubId: '18786605',
        menuId: '105',
        cafeName: '호텔라이프',
        cafeUrl: 'https://cafe.naver.com/hotellife'
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomDelay(min = 1000, max = 3000) {
    const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(delayTime);
}

// Selenium으로 네이버 로그인
async function seleniumLogin(driver) {
    console.log('🚗 Selenium 네이버 로그인 시도...');
    
    try {
        // 로그인 페이지로 이동
        await driver.get('https://nid.naver.com/nidlogin.login');
        await randomDelay(3000, 5000);
        
        // ID 입력
        const idInput = await driver.wait(until.elementLocated(By.id('id')), 10000);
        await idInput.click();
        await randomDelay(500, 1000);
        
        // 천천히 타이핑
        for (const char of NAVER_ID) {
            await idInput.sendKeys(char);
            await delay(100 + Math.random() * 200);
        }
        
        await randomDelay(1000, 2000);
        
        // 비밀번호 입력
        const pwInput = await driver.findElement(By.id('pw'));
        await pwInput.click();
        await randomDelay(500, 1000);
        
        for (const char of NAVER_PASSWORD) {
            await pwInput.sendKeys(char);
            await delay(100 + Math.random() * 200);
        }
        
        await randomDelay(1000, 2000);
        
        // 로그인 유지 체크 해제
        try {
            const keepLogin = await driver.findElement(By.id('keep'));
            const isChecked = await keepLogin.isSelected();
            if (isChecked) {
                await keepLogin.click();
                await randomDelay(500, 1000);
            }
        } catch (e) {
            // 로그인 유지 옵션이 없을 수 있음
        }
        
        // 로그인 버튼 클릭
        console.log('🔄 로그인 버튼 클릭...');
        const loginBtn = await driver.findElement(By.className('btn_login'));
        await loginBtn.click();
        
        // 로그인 완료 대기
        await driver.wait(async () => {
            const url = await driver.getCurrentUrl();
            return !url.includes('nidlogin');
        }, 30000);
        
        await randomDelay(3000, 5000);
        
        // 로그인 확인
        await driver.get('https://www.naver.com');
        await randomDelay(2000, 3000);
        
        const pageSource = await driver.getPageSource();
        const isLoggedIn = pageSource.includes('logout') || !pageSource.includes('로그인');
        
        if (isLoggedIn) {
            console.log('✅ 로그인 성공!');
            return true;
        } else {
            console.log('❌ 로그인 실패');
            return false;
        }
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        return false;
    }
}

// 게시글 크롤링
async function crawlCafeWithSelenium(driver, cafeConfig) {
    const results = [];
    
    try {
        // 카페로 이동
        console.log(`📍 ${cafeConfig.cafeName} 접속 중...`);
        await driver.get(cafeConfig.cafeUrl);
        await randomDelay(3000, 5000);
        
        // iframe으로 전환
        const iframes = await driver.findElements(By.tagName('iframe'));
        let cafeFrame = null;
        
        for (const iframe of iframes) {
            const name = await iframe.getAttribute('name');
            if (name === 'cafe_main') {
                cafeFrame = iframe;
                break;
            }
        }
        
        if (cafeFrame) {
            await driver.switchTo().frame(cafeFrame);
            console.log('✅ cafe_main iframe 전환 성공');
        }
        
        // 게시판으로 이동
        const boardUrl = `/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}&search.boardtype=L`;
        await driver.get(`${cafeConfig.cafeUrl}${boardUrl}`);
        await randomDelay(3000, 5000);
        
        // 다시 iframe 전환 (페이지 이동 후)
        if (cafeFrame) {
            const iframes2 = await driver.findElements(By.tagName('iframe'));
            for (const iframe of iframes2) {
                const name = await iframe.getAttribute('name');
                if (name === 'cafe_main') {
                    await driver.switchTo().frame(iframe);
                    break;
                }
            }
        }
        
        // 게시글 목록 가져오기
        const articleRows = await driver.findElements(By.css('.article-board tbody tr'));
        console.log(`📋 ${articleRows.length}개 행 발견`);
        
        const posts = [];
        
        for (let i = 0; i < Math.min(articleRows.length, 5); i++) {
            try {
                const row = articleRows[i];
                
                // 공지사항 체크
                const noticeIcons = await row.findElements(By.css('.ico-list-notice'));
                if (noticeIcons.length > 0) continue;
                
                // 제목 가져오기
                const titleElements = await row.findElements(By.css('.article'));
                if (titleElements.length === 0) continue;
                
                const titleElement = titleElements[0];
                const title = await titleElement.getText();
                const href = await titleElement.getAttribute('href');
                
                // 작성자
                const authorElements = await row.findElements(By.css('.td_name a'));
                const author = authorElements.length > 0 ? await authorElements[0].getText() : '작성자';
                
                // 날짜
                const dateElements = await row.findElements(By.css('.td_date'));
                const date = dateElements.length > 0 ? await dateElements[0].getText() : '';
                
                // articleId 추출
                const articleMatch = href?.match(/articleid=(\d+)/);
                const articleId = articleMatch ? articleMatch[1] : null;
                
                if (articleId) {
                    posts.push({
                        articleId,
                        title,
                        author,
                        date,
                        href
                    });
                }
            } catch (e) {
                console.error('게시글 목록 파싱 오류:', e.message);
            }
        }
        
        console.log(`✅ ${posts.length}개 게시글 발견`);
        
        // 각 게시글 내용 수집
        for (const post of posts) {
            try {
                console.log(`📄 수집 중: ${post.title}`);
                
                // 게시글로 이동
                const articleUrl = `${cafeConfig.cafeUrl}/ArticleRead.nhn?clubid=${cafeConfig.clubId}&articleid=${post.articleId}`;
                await driver.get(articleUrl);
                await randomDelay(2000, 3000);
                
                // iframe 재전환
                const iframes3 = await driver.findElements(By.tagName('iframe'));
                for (const iframe of iframes3) {
                    const name = await iframe.getAttribute('name');
                    if (name === 'cafe_main') {
                        await driver.switchTo().frame(iframe);
                        break;
                    }
                }
                
                // 내용 추출
                let content = '';
                const contentSelectors = [
                    '.se-main-container',
                    '.ContentRenderer',
                    '#postViewArea',
                    '#tbody'
                ];
                
                for (const selector of contentSelectors) {
                    try {
                        const elements = await driver.findElements(By.css(selector));
                        if (elements.length > 0) {
                            content = await elements[0].getAttribute('innerHTML');
                            break;
                        }
                    } catch (e) {
                        // 다음 선택자 시도
                    }
                }
                
                // 이미지 URL 수집
                const imageElements = await driver.findElements(By.css('img'));
                const imageUrls = [];
                
                for (const img of imageElements) {
                    const src = await img.getAttribute('src');
                    if (src && !src.includes('cafe_meta') && !src.includes('blank.gif')) {
                        imageUrls.push(src);
                        if (imageUrls.length >= 5) break;
                    }
                }
                
                results.push({
                    cafe_name: cafeConfig.cafeName,
                    board_name: `게시판${cafeConfig.menuId}`,
                    title: post.title,
                    content_html: content || '<p>내용을 불러올 수 없습니다.</p>',
                    author: post.author,
                    created_at: new Date().toISOString(),
                    original_url: articleUrl,
                    image_urls: imageUrls.length > 0 ? imageUrls : null,
                    status: 'pending'
                });
                
                // 기본 프레임으로 돌아가기
                await driver.switchTo().defaultContent();
                
            } catch (error) {
                console.error(`❌ 게시글 수집 실패: ${error.message}`);
                await driver.switchTo().defaultContent();
            }
            
            await randomDelay(2000, 3000);
        }
        
    } catch (error) {
        console.error(`❌ ${cafeConfig.cafeName} 크롤링 실패:`, error.message);
        await driver.switchTo().defaultContent();
    }
    
    return results;
}

// 메인 함수
export async function crawlWithSelenium() {
    console.log('🚗 Selenium 네이버 카페 크롤링 시작');
    console.log('🔐 실제 Chrome 브라우저 사용');
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 계정 정보가 없습니다.');
        return [];
    }
    
    // Chrome 옵션 설정
    const options = new chrome.Options();
    
    if (HEADLESS) {
        options.addArguments('--headless');
    }
    
    options.addArguments(
        '--no-sandbox',
        '--disable-dev-shm-usage',
        '--disable-blink-features=AutomationControlled',
        '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        '--window-size=1920,1080',
        '--lang=ko-KR'
    );
    
    // Chrome 실험적 옵션
    options.setUserPreferences({
        'excludeSwitches': ['enable-automation'],
        'useAutomationExtension': false
    });
    
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
    
    const allResults = [];
    
    try {
        // 자동화 감지 우회 스크립트 주입
        await driver.executeScript(`
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            window.chrome = {
                runtime: {},
            };
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5],
            });
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko'],
            });
        `);
        
        // 로그인
        const loginSuccess = await seleniumLogin(driver);
        if (!loginSuccess) {
            throw new Error('네이버 로그인 실패');
        }
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            const posts = await crawlCafeWithSelenium(driver, cafeConfig);
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
        await driver.quit();
    }
    
    console.log(`\n✅ 크롤링 완료! 총 ${allResults.length}개의 새 게시글 처리`);
    return allResults;
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlWithSelenium()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}