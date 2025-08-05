import { createClient } from '@supabase/supabase-js';
import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

// 환경변수
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NAVER_ID = process.env.NAVER_ID;
const NAVER_PASSWORD = process.env.NAVER_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';
const IS_GITHUB_ACTIONS = process.env.GITHUB_ACTIONS === 'true';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 호텔라이프 카페만 크롤링
const HOTEL_CAFE = {
    clubId: '18786605',
    menuId: '105',
    cafeName: '호텔라이프',
    cafeUrl: 'https://cafe.naver.com/hotellife'
};

// TARGET_CAFE removed - Make.com will handle posting

// 헬퍼 함수
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomDelay(min = 1000, max = 3000) {
    const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(delayTime);
}

function parseKoreanDate(dateStr) {
    const now = new Date();
    
    if (dateStr.includes(':')) {
        const [hours, minutes] = dateStr.split(':').map(Number);
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }
    
    if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length === 2) {
            const [month, day] = parts.map(Number);
            const date = new Date(now.getFullYear(), month - 1, day);
            if (date > now) {
                date.setFullYear(date.getFullYear() - 1);
            }
            return date;
        } else if (parts.length === 3) {
            const [year, month, day] = parts.map(Number);
            return new Date(2000 + year, month - 1, day);
        }
    }
    
    return now;
}

// 로그인
async function login(driver) {
    console.log('🔐 네이버 로그인 시작...');
    
    try {
        // 네이버 메인으로 이동
        await driver.get('https://www.naver.com');
        await delay(3000);
        
        // 로그인 버튼 클릭
        await driver.executeScript(`
            const loginBtn = document.querySelector('.link_login');
            if (loginBtn) loginBtn.click();
        `);
        
        await delay(3000);
        
        // 로그인 페이지 확인
        const currentUrl = await driver.getCurrentUrl();
        if (!currentUrl.includes('nid.naver.com')) {
            await driver.get('https://nid.naver.com/nidlogin.login?mode=form&url=https://www.naver.com');
            await delay(3000);
        }
        
        console.log('📝 로그인 정보 입력 중...');
        
        // ID 입력
        const idInput = await driver.findElement(By.id('id'));
        await idInput.click();
        await delay(500);
        
        for (const char of NAVER_ID) {
            await idInput.sendKeys(char);
            await delay(100 + Math.random() * 200);
        }
        
        await delay(1000);
        
        // Tab으로 이동
        await idInput.sendKeys(Key.TAB);
        await delay(500);
        
        // 비밀번호 입력
        const pwInput = await driver.findElement(By.id('pw'));
        for (const char of NAVER_PASSWORD) {
            await pwInput.sendKeys(char);
            await delay(100 + Math.random() * 200);
        }
        
        await delay(1000);
        
        // 로그인 유지 해제
        try {
            const keepLogin = await driver.findElement(By.id('keep'));
            const isChecked = await keepLogin.isSelected();
            if (isChecked) {
                await keepLogin.click();
                await delay(500);
            }
        } catch (e) {
            // 없을 수도 있음
        }
        
        // Enter로 로그인
        console.log('🔑 Enter 키로 로그인...');
        await pwInput.sendKeys(Key.ENTER);
        
        await delay(5000);
        
        // 기기 등록 팝업 처리
        try {
            const newDevice = await driver.findElement(By.css('.btn_cancel'));
            await newDevice.click();
            await delay(2000);
        } catch (e) {
            // 팝업이 없을 수 있음
        }
        
        // 로그인 성공 확인
        await driver.get('https://www.naver.com');
        await delay(3000);
        
        const isLoggedIn = await driver.executeScript(`
            const logoutBtn = document.querySelector('.MyView-module__link_logout');
            const loginBtn = document.querySelector('.link_login');
            return !!logoutBtn || !loginBtn;
        `);
        
        if (isLoggedIn) {
            console.log('✅ 로그인 성공!');
            return true;
        }
        
        console.error('❌ 로그인 실패');
        
        if (IS_GITHUB_ACTIONS) {
            try {
                const screenshot = await driver.takeScreenshot();
                await fs.writeFile('login-failed-hotellife.png', screenshot, 'base64');
                console.log('📸 로그인 실패 스크린샷 저장됨');
            } catch (e) {
                // 무시
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        return false;
    }
}

// 호텔라이프 카페 크롤링
async function crawlHotelLife(driver) {
    const results = [];
    
    try {
        console.log(`\n📋 ${HOTEL_CAFE.cafeName} 카페 크롤링 시작...`);
        console.log(`🔗 URL: ${HOTEL_CAFE.cafeUrl}`);
        console.log(`📌 게시판 ID: ${HOTEL_CAFE.menuId}`);
        
        // 카페 메인으로 이동
        await driver.get(HOTEL_CAFE.cafeUrl);
        await delay(3000);
        
        // iframe 찾기 - 여러 방법 시도
        let iframe;
        try {
            // 방법 1: ID로 찾기
            iframe = await driver.findElement(By.id('cafe_main'));
        } catch (e) {
            try {
                // 방법 2: name으로 찾기
                iframe = await driver.findElement(By.name('cafe_main'));
            } catch (e2) {
                try {
                    // 방법 3: 첫 번째 iframe
                    iframe = await driver.findElement(By.tagName('iframe'));
                } catch (e3) {
                    console.error('❌ iframe을 찾을 수 없습니다');
                    // iframe 없이 진행 시도
                }
            }
        }
        
        if (iframe) {
            await driver.switchTo().frame(iframe);
            await delay(1000);
        }
        
        // 게시판으로 이동 - 직접 URL 접근
        const boardUrl = `https://cafe.naver.com/ArticleList.nhn?search.clubid=${HOTEL_CAFE.clubId}&search.menuid=${HOTEL_CAFE.menuId}`;
        console.log(`📍 게시판 이동: ${boardUrl}`);
        await driver.get(boardUrl);
        await delay(3000);
        
        // iframe으로 전환 시도
        try {
            await driver.switchTo().defaultContent();
            const newIframe = await driver.findElement(By.id('cafe_main'));
            await driver.switchTo().frame(newIframe);
        } catch (e) {
            console.log('⚠️ iframe 전환 실패, 현재 페이지에서 진행');
        }
        
        // 게시글 목록 수집 - 여러 선택자 시도
        const posts = await driver.executeScript(() => {
            const results = [];
            
            // 다양한 게시판 선택자 시도
            const selectors = [
                '.article-board tbody tr',
                '.board-list tbody tr',
                '#main-area tbody tr',
                'table.board-box tbody tr'
            ];
            
            let rows = null;
            for (const selector of selectors) {
                rows = document.querySelectorAll(selector);
                if (rows.length > 0) {
                    console.log(`게시글 목록 발견: ${selector}`);
                    break;
                }
            }
            
            if (!rows || rows.length === 0) {
                console.log('게시글 목록을 찾을 수 없습니다');
                return results;
            }
            
            for (const row of rows) {
                // 공지사항 제외
                if (row.querySelector('.ico-list-notice') || 
                    row.querySelector('.notice') ||
                    row.classList.contains('notice')) continue;
                
                // 게시글 링크 찾기
                const articleLink = row.querySelector('.article') || 
                                  row.querySelector('a.title') ||
                                  row.querySelector('.td_article a') ||
                                  row.querySelector('td.title a');
                
                // 작성자 찾기
                const authorElement = row.querySelector('.td_name .m-tcol-c') ||
                                    row.querySelector('.td_name a') ||
                                    row.querySelector('.writer') ||
                                    row.querySelector('.nick');
                
                // 날짜 찾기
                const dateElement = row.querySelector('.td_date') ||
                                  row.querySelector('.date') ||
                                  row.querySelector('td.date');
                
                if (articleLink && authorElement && dateElement) {
                    results.push({
                        title: articleLink.textContent?.trim(),
                        author: authorElement.textContent?.trim(),
                        date: dateElement.textContent?.trim(),
                        href: articleLink.getAttribute('href')
                    });
                }
                
                if (results.length >= 5) break;
            }
            
            return results;
        });
        
        console.log(`✅ ${posts.length}개 게시글 목록 수집`);
        
        // 게시글이 없으면 스크린샷 저장
        if (posts.length === 0 && IS_GITHUB_ACTIONS) {
            try {
                const screenshot = await driver.takeScreenshot();
                await fs.writeFile('no-posts-found.png', screenshot, 'base64');
                console.log('📸 게시글 없음 스크린샷 저장');
                
                // 현재 URL 확인
                const currentUrl = await driver.getCurrentUrl();
                console.log(`📍 현재 URL: ${currentUrl}`);
                
                // 페이지 소스 일부 출력
                const pageSource = await driver.getPageSource();
                console.log(`📄 페이지 소스 일부: ${pageSource.substring(0, 500)}...`);
            } catch (e) {
                console.log('스크린샷 저장 실패:', e.message);
            }
        }
        
        // 각 게시글 상세 내용 수집
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            console.log(`📄 [${i+1}/${posts.length}] ${post.title}`);
            
            try {
                // 게시글로 이동
                await driver.get(`${HOTEL_CAFE.cafeUrl}${post.href}`);
                await delay(2000);
                
                // iframe 전환
                await driver.switchTo().defaultContent();
                const articleIframe = await driver.findElement(By.id('cafe_main'));
                await driver.switchTo().frame(articleIframe);
                
                // 컨텐츠 추출
                const content = await driver.executeScript(() => {
                    const contentEl = document.querySelector('.se-main-container') || 
                                    document.querySelector('.ContentRenderer') ||
                                    document.querySelector('#tbody');
                    return contentEl ? contentEl.innerHTML : '';
                });
                
                results.push({
                    cafe_name: HOTEL_CAFE.cafeName,
                    board_name: '게시판',
                    title: post.title,
                    author: post.author,
                    created_at: parseKoreanDate(post.date).toISOString(),
                    content_html: content || '<p>내용을 불러올 수 없습니다.</p>',
                    original_url: `${HOTEL_CAFE.cafeUrl}${post.href}`
                });
                
            } catch (error) {
                console.error(`❌ 게시글 내용 추출 실패: ${error.message}`);
            }
            
            await randomDelay();
        }
        
    } catch (error) {
        console.error(`❌ ${HOTEL_CAFE.cafeName} 크롤링 실패:`, error.message);
    }
    
    await driver.switchTo().defaultContent();
    return results;
}

// 포스팅 기능 제거 - Make.com이 처리
/*
async function postToCafe(driver, posts) {
    console.log(`\n📝 ${TARGET_CAFE.url} 카페에 포스팅 시작...`);
    const postedPosts = [];
    
    try {
        // 타겟 카페로 이동
        await driver.get(TARGET_CAFE.url);
        await delay(3000);
        
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            console.log(`\n📤 [${i+1}/${posts.length}] 포스팅: ${post.title}`);
            
            try {
                // 글쓰기 페이지로 이동
                const writeUrl = `${TARGET_CAFE.url}/cafe-info/CafeWriteForm.nhn?menuid=${TARGET_CAFE.menuId}`;
                await driver.get(writeUrl);
                await delay(3000);
                
                // iframe 전환
                await driver.switchTo().defaultContent();
                const writeIframe = await driver.findElement(By.id('cafe_main'));
                await driver.switchTo().frame(writeIframe);
                
                // 제목 입력
                const titleWithSource = `[${post.cafe_name}] ${post.title}`;
                const titleInput = await driver.findElement(By.css('input[name="title"], #subject'));
                await titleInput.click();
                await titleInput.clear();
                await titleInput.sendKeys(titleWithSource);
                await delay(1000);
                
                // 내용 입력
                try {
                    // Smart Editor 3.0
                    const se3 = await driver.findElement(By.css('.se-container'));
                    if (se3) {
                        await driver.executeScript(`
                            const editor = document.querySelector('.se-container');
                            const editArea = editor.querySelector('.se-text-paragraph');
                            if (editArea) {
                                editArea.innerHTML = arguments[0];
                                editArea.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        `, `${post.content_html}<br><br><p>출처: ${post.cafe_name} - ${post.author}</p>`);
                    }
                } catch (e) {
                    // Classic editor
                    const textarea = await driver.findElement(By.css('textarea[name="content"], #content'));
                    await textarea.click();
                    await textarea.clear();
                    await textarea.sendKeys(post.content_html.replace(/<[^>]*>/g, ''));
                }
                
                await delay(2000);
                
                // 등록 버튼 클릭
                const submitBtn = await driver.findElement(By.css('.btn-write-article, #cafewritebtn, button[type="submit"]'));
                await submitBtn.click();
                
                await delay(3000);
                
                console.log('✅ 게시글 작성 성공!');
                postedPosts.push(post);
                
                await randomDelay(5000, 8000);
                
            } catch (error) {
                console.error(`❌ 포스팅 실패: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error('❌ 포스팅 중 오류:', error.message);
    }
    
    return postedPosts;
}
*/

// Supabase 저장
async function saveToSupabase(posts) {
    if (posts.length === 0) return [];
    
    try {
        // 중복 체크
        const urls = posts.map(p => p.original_url);
        const { data: existing } = await supabase
            .from('naver_cafe_posts')
            .select('original_url')
            .in('original_url', urls);
        
        const existingUrls = new Set(existing?.map(e => e.original_url) || []);
        const newPosts = posts.filter(p => !existingUrls.has(p.original_url));
        
        if (newPosts.length === 0) {
            console.log('💾 모든 게시글이 이미 저장되어 있습니다');
            return [];
        }
        
        // status를 'pending'으로 설정하여 Make.com이 처리할 수 있도록 함
        const postsWithStatus = newPosts.map(post => ({
            ...post,
            status: 'pending',
            created_at: new Date().toISOString()
        }));
        
        const { data, error } = await supabase
            .from('naver_cafe_posts')
            .insert(postsWithStatus)
            .select();
        
        if (error) throw error;
        
        console.log(`💾 ${data.length}개의 새 게시글 저장 완료`);
        return data;
        
    } catch (error) {
        console.error('❌ Supabase 저장 오류:', error);
        return [];
    }
}

// 메인 함수
async function main() {
    console.log('🏨 호텔라이프 전용 Selenium 크롤러 시작 (Make.com 연동)');
    console.log(`🔧 환경: ${IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
    console.log(`🎯 크롤링 대상: ${HOTEL_CAFE.cafeName}`);
    console.log(`💾 저장: Supabase → Make.com이 포스팅 처리`);
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 로그인 정보가 필요합니다.');
        process.exit(1);
    }
    
    // Chrome 옵션 설정
    const options = new chrome.Options();
    
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.excludeSwitches(['enable-automation']);
    options.addArguments('--disable-infobars');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    options.addArguments(`--user-agent=${userAgent}`);
    
    options.setUserPreferences({
        'credentials_enable_service': false,
        'profile.password_manager_enabled': false,
        'excludeSwitches': ['enable-automation'],
        'useAutomationExtension': false
    });
    
    if (HEADLESS) {
        options.addArguments('--headless=new');
    }
    
    let driver;
    const allCrawledPosts = [];
    
    try {
        console.log('🌐 Chrome 브라우저 시작 중...');
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();
        console.log('✅ 브라우저 시작 완료');
        
        // 타임아웃 설정
        await driver.manage().setTimeouts({ 
            implicit: 10000,
            pageLoad: 30000,
            script: 30000 
        });
        
        // JavaScript로 추가 탐지 회피
        await driver.executeScript(`
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en']
            });
            
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {}
            };
        `);
        
        // 로그인
        const loginSuccess = await login(driver);
        if (!loginSuccess) {
            console.error('❌ 로그인 실패로 작업을 중단합니다.');
            process.exit(1);
        }
        
        // 호텔라이프 카페 크롤링
        const crawledPosts = await crawlHotelLife(driver);
        console.log(`\n✅ 총 ${crawledPosts.length}개 게시글 크롤링 완료`);
        
        if (crawledPosts.length > 0) {
            allCrawledPosts.push(...crawledPosts);
            
            // 게시글 저장
            console.log(`\n💾 게시글 저장 중...`);
            const savedPosts = await saveToSupabase(crawledPosts);
            
            // Make.com이 포스팅 처리
            if (savedPosts.length > 0) {
                console.log(`\n✅ ${savedPosts.length}개 게시글이 저장되었습니다.`);
                console.log(`📤 Make.com이 자동으로 포스팅을 처리할 예정입니다.`);
            }
        }
        
    } catch (error) {
        console.error('❌ 작업 중 오류:', error.message);
    } finally {
        if (driver) {
            await driver.quit();
            console.log('🔚 브라우저 종료');
        }
    }
    
    console.log(`\n✨ 크롤링 작업 완료!`);
    console.log(`📊 총 크롤링: ${allCrawledPosts.length}개 게시글`);
    console.log(`💾 Supabase에 저장됨 (status: pending)`);
    console.log(`📤 Make.com이 자동으로 포스팅을 처리합니다`);
}

// 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    main()
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ 실행 실패:', error);
            process.exit(1);
        });
}

export { main as hotelLifeCrawler };