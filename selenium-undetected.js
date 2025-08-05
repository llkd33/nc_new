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

// 카페 설정
const SOURCE_CAFES = {
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

const TARGET_CAFE = {
    url: 'https://cafe.naver.com/atohealing',
    menuId: '7'
};

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

// Undetected 로그인
async function undetectedLogin(driver) {
    console.log('🥷 Undetected 로그인 시작...');
    
    try {
        // 먼저 네이버 메인으로 이동
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
            // 직접 로그인 페이지로 이동
            await driver.get('https://nid.naver.com/nidlogin.login?mode=form&url=https://www.naver.com');
            await delay(3000);
        }
        
        console.log('📝 로그인 정보 입력 중...');
        
        // ID 입력 - 자연스럽게
        const idInput = await driver.findElement(By.id('id'));
        await idInput.click();
        await delay(500);
        
        // 한 글자씩 입력
        for (const char of NAVER_ID) {
            await idInput.sendKeys(char);
            await delay(100 + Math.random() * 200);
        }
        
        await delay(1000);
        
        // Tab 키로 비밀번호 필드로 이동
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
        
        // Enter 키로 로그인
        console.log('🔑 Enter 키로 로그인...');
        await pwInput.sendKeys(Key.ENTER);
        
        // 로그인 처리 대기
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
        const finalUrl = await driver.getCurrentUrl();
        if (!finalUrl.includes('nidlogin') && !finalUrl.includes('login')) {
            console.log('✅ 로그인 성공!');
            return true;
        }
        
        // 네이버 메인으로 가서 다시 확인
        await driver.get('https://www.naver.com');
        await delay(3000);
        
        const isLoggedIn = await driver.executeScript(`
            const logoutBtn = document.querySelector('.MyView-module__link_logout');
            const loginBtn = document.querySelector('.link_login');
            return !!logoutBtn || !loginBtn;
        `);
        
        if (isLoggedIn) {
            console.log('✅ 로그인 성공 확인!');
            return true;
        }
        
        console.error('❌ 로그인 실패');
        
        // 스크린샷 저장
        if (IS_GITHUB_ACTIONS) {
            try {
                const screenshot = await driver.takeScreenshot();
                await fs.writeFile('login-failed-undetected.png', screenshot, 'base64');
                console.log('📸 로그인 실패 스크린샷 저장됨');
            } catch (e) {
                console.log('스크린샷 저장 실패:', e.message);
            }
        }
        
        return false;
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        
        // 오류 스크린샷
        if (IS_GITHUB_ACTIONS) {
            try {
                const screenshot = await driver.takeScreenshot();
                await fs.writeFile('login-error-undetected.png', screenshot, 'base64');
            } catch (e) {
                // 무시
            }
        }
        
        return false;
    }
}

// 카페 게시글 크롤링
async function crawlCafePosts(driver, cafeConfig) {
    const results = [];
    
    try {
        console.log(`📋 ${cafeConfig.cafeName} 크롤링 시작...`);
        
        // 카페 메인으로 이동
        await driver.get(cafeConfig.cafeUrl);
        await delay(3000);
        
        // iframe 찾기 및 전환
        const iframe = await driver.findElement(By.id('cafe_main'));
        await driver.switchTo().frame(iframe);
        await delay(1000);
        
        // 게시판으로 이동
        const boardUrl = `/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}`;
        await driver.get(`https://cafe.naver.com${boardUrl}`);
        await delay(3000);
        
        // 다시 iframe으로 전환
        await driver.switchTo().defaultContent();
        const newIframe = await driver.findElement(By.id('cafe_main'));
        await driver.switchTo().frame(newIframe);
        
        // 게시글 목록 수집
        const posts = await driver.executeScript(() => {
            const results = [];
            const rows = document.querySelectorAll('.article-board tbody tr');
            
            for (const row of rows) {
                if (row.querySelector('.ico-list-notice')) continue;
                
                const articleLink = row.querySelector('.td_article .article');
                const authorElement = row.querySelector('.td_name .m-tcol-c');
                const dateElement = row.querySelector('.td_date');
                
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
        
        // 각 게시글 상세 내용 수집
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            console.log(`📄 [${i+1}/${posts.length}] ${post.title}`);
            
            try {
                // 게시글로 이동
                await driver.get(`${cafeConfig.cafeUrl}${post.href}`);
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
                    cafe_name: cafeConfig.cafeName,
                    board_name: '게시판',
                    title: post.title,
                    author: post.author,
                    created_at: parseKoreanDate(post.date).toISOString(),
                    content_html: content || '<p>내용을 불러올 수 없습니다.</p>',
                    original_url: `${cafeConfig.cafeUrl}${post.href}`
                });
                
            } catch (error) {
                console.error(`❌ 게시글 내용 추출 실패: ${error.message}`);
            }
            
            await randomDelay();
        }
        
    } catch (error) {
        console.error(`❌ ${cafeConfig.cafeName} 크롤링 실패:`, error.message);
    }
    
    await driver.switchTo().defaultContent();
    return results;
}

// 카페에 게시글 포스팅
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
                
                // 내용 입력 - 에디터 타입에 따라
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
        
        // 저장
        const { data, error } = await supabase
            .from('naver_cafe_posts')
            .insert(newPosts)
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
    console.log('🥷 Undetected Selenium 크롤러 시작');
    console.log(`🔧 환경: ${IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 로그인 정보가 필요합니다.');
        process.exit(1);
    }
    
    // Chrome 옵션 설정 - 탐지 회피
    const options = new chrome.Options();
    
    // 필수 옵션
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.excludeSwitches(['enable-automation']);
    options.addArguments('--disable-infobars');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    
    // User Agent 설정
    const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
    options.addArguments(`--user-agent=${userAgent}`);
    
    // 추가 탐지 회피
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
    let allPostedPosts = [];
    
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
            // webdriver 속성 제거
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // plugins 추가
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // 언어 설정
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en']
            });
            
            // Chrome 속성
            window.chrome = {
                runtime: {},
                loadTimes: function() {},
                csi: function() {}
            };
        `);
        
        // 로그인
        const loginSuccess = await undetectedLogin(driver);
        if (!loginSuccess) {
            console.error('❌ 로그인 실패로 작업을 중단합니다.');
            process.exit(1);
        }
        
        // 각 카페에서 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(SOURCE_CAFES)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            try {
                const posts = await crawlCafePosts(driver, cafeConfig);
                console.log(`✅ ${posts.length}개 게시글 크롤링 완료`);
                
                if (posts.length > 0) {
                    allCrawledPosts.push(...posts);
                }
                
                await randomDelay(3000, 5000);
                
            } catch (error) {
                console.error(`❌ ${cafeName} 크롤링 실패:`, error.message);
            }
        }
        
        // 크롤링한 게시글 저장
        if (allCrawledPosts.length > 0) {
            console.log(`\n💾 총 ${allCrawledPosts.length}개 게시글 저장 중...`);
            const savedPosts = await saveToSupabase(allCrawledPosts);
            
            // 포스팅
            if (savedPosts.length > 0) {
                console.log(`\n📤 ${savedPosts.length}개 게시글 포스팅 시작...`);
                allPostedPosts = await postToCafe(driver, savedPosts);
                
                // 포스팅 상태 업데이트
                if (allPostedPosts.length > 0) {
                    const urls = allPostedPosts.map(p => p.original_url);
                    await supabase
                        .from('naver_cafe_posts')
                        .update({ status: 'posted', posted_at: new Date().toISOString() })
                        .in('original_url', urls);
                }
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
    
    console.log(`\n✨ 작업 완료!`);
    console.log(`📊 크롤링: ${allCrawledPosts.length}개`);
    console.log(`📤 포스팅: ${allPostedPosts.length}개`);
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

export { main as undetectedSelenium };