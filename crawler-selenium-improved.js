import { createClient } from '@supabase/supabase-js';
import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import dotenv from 'dotenv';
import clipboardy from 'clipboardy';
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

// 설정
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

const CRAWL_CONFIG = {
    POSTS_PER_CAFE: 5,
    REQUEST_DELAY: 2000,
    CRAWL_PERIOD_DAYS: 7
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

// 개선된 Selenium 로그인 - 클립보드 방식
async function improvedSeleniumLogin(driver) {
    console.log('🚀 개선된 Selenium 로그인 시작 (클립보드 방식)...');
    
    try {
        // 로그인 페이지로 이동
        await driver.get('https://nid.naver.com/nidlogin.login');
        await delay(3000);
        
        // ID 입력 - 클립보드 방식
        console.log('📋 ID를 클립보드로 입력 중...');
        const idInput = await driver.findElement(By.id('id'));
        await idInput.click();
        await delay(500);
        
        // 클립보드에 ID 복사
        await clipboardy.write(NAVER_ID);
        
        // Ctrl+V로 붙여넣기
        await idInput.sendKeys(Key.chord(Key.CONTROL, 'v'));
        await randomDelay(1000, 2000);
        
        // 비밀번호 입력 - 클립보드 방식
        console.log('📋 비밀번호를 클립보드로 입력 중...');
        const pwInput = await driver.findElement(By.id('pw'));
        await pwInput.click();
        await delay(500);
        
        // 클립보드에 비밀번호 복사
        await clipboardy.write(NAVER_PASSWORD);
        
        // Ctrl+V로 붙여넣기
        await pwInput.sendKeys(Key.chord(Key.CONTROL, 'v'));
        await randomDelay(1000, 2000);
        
        // 로그인 유지 체크 해제
        try {
            const keepLogin = await driver.findElement(By.id('keep'));
            const isChecked = await keepLogin.isSelected();
            if (isChecked) {
                await keepLogin.click();
                console.log('✅ 로그인 유지 해제');
            }
        } catch (e) {
            // 로그인 유지 옵션이 없을 수 있음
        }
        
        // 로그인 버튼 클릭
        console.log('🔄 로그인 버튼 클릭...');
        const loginBtn = await driver.findElement(By.id('log.login'));
        await loginBtn.click();
        
        // 로그인 처리 대기
        await delay(5000);
        
        // 기기 등록 팝업 처리
        try {
            const cancelBtn = await driver.findElement(By.css('span.btn_cancel'));
            if (cancelBtn) {
                console.log('🚫 기기 등록 팝업 취소...');
                await cancelBtn.click();
                await delay(2000);
            }
        } catch (e) {
            // 팝업이 없을 수 있음
        }
        
        // 로그인 성공 확인
        const currentUrl = await driver.getCurrentUrl();
        if (!currentUrl.includes('nidlogin') && !currentUrl.includes('login')) {
            console.log('✅ 로그인 성공!');
            
            // 쿠키 저장
            const cookies = await driver.manage().getCookies();
            await fs.writeFile('selenium_cookies.json', JSON.stringify(cookies, null, 2));
            console.log('🍪 쿠키 저장 완료');
            
            return true;
        } else {
            // 네이버 메인으로 이동해서 다시 확인
            await driver.get('https://www.naver.com');
            await delay(3000);
            
            // 로그아웃 버튼 확인
            try {
                await driver.findElement(By.css('.MyView-module__link_logout'));
                console.log('✅ 로그인 성공 확인!');
                return true;
            } catch (e) {
                console.error('❌ 로그인 실패');
                
                // 스크린샷 저장
                if (IS_GITHUB_ACTIONS) {
                    const screenshot = await driver.takeScreenshot();
                    await fs.writeFile('selenium-login-failed.png', screenshot, 'base64');
                }
                
                return false;
            }
        }
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        
        // 스크린샷 저장
        if (IS_GITHUB_ACTIONS) {
            try {
                const screenshot = await driver.takeScreenshot();
                await fs.writeFile('selenium-login-error.png', screenshot, 'base64');
            } catch (e) {
                // 무시
            }
        }
        
        return false;
    }
}

// 카페 게시글 크롤링
async function crawlCafePostsSelenium(driver, cafeConfig) {
    const results = [];
    
    try {
        console.log(`📋 ${cafeConfig.cafeName} 게시판 접속...`);
        
        // 카페 메인으로 이동
        await driver.get(cafeConfig.cafeUrl);
        await delay(3000);
        
        // iframe 전환
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
                // 공지사항 제외
                if (row.querySelector('.ico-list-notice')) continue;
                
                const articleLink = row.querySelector('.td_article .article');
                const authorElement = row.querySelector('.td_name .m-tcol-c') || row.querySelector('.td_name a');
                const dateElement = row.querySelector('.td_date');
                
                if (articleLink && authorElement && dateElement) {
                    results.push({
                        title: articleLink.textContent?.trim(),
                        author: authorElement.textContent?.trim(),
                        date: dateElement.textContent?.trim(),
                        href: articleLink.getAttribute('href')
                    });
                }
                
                if (results.length >= 5) break; // POSTS_PER_CAFE
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
                    const selectors = [
                        '.se-main-container',
                        '.ContentRenderer',
                        '#tbody',
                        '.content-area'
                    ];
                    
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            return element.innerHTML;
                        }
                    }
                    return '';
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
    
    // 기본 프레임으로 복귀
    await driver.switchTo().defaultContent();
    
    return results;
}

// Supabase 저장
async function saveToSupabase(posts) {
    if (posts.length === 0) {
        console.log('💾 저장할 게시글이 없습니다');
        return [];
    }
    
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
    console.log('🚀 개선된 Selenium 크롤러 시작 (클립보드 방식)');
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 로그인 정보가 필요합니다.');
        process.exit(1);
    }
    
    // Chrome 옵션 설정
    const options = new chrome.Options();
    
    // 기본 옵션
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--window-size=1920,1080');
    options.addArguments('--start-maximized');
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // GitHub Actions에서는 헤드리스 모드
    if (HEADLESS) {
        options.addArguments('--headless=new');
    }
    
    // 추가 설정
    options.setPageLoadStrategy('normal');
    options.excludeSwitches(['enable-automation']);
    options.addArguments('--disable-web-security');
    options.addArguments('--disable-features=IsolateOrigins,site-per-process');
    
    const driver = await new Builder()
        .forBrowser('chrome')
        .setChromeOptions(options)
        .build();
    
    const allResults = [];
    
    try {
        // 타임아웃 설정
        await driver.manage().setTimeouts({ 
            implicit: 10000,
            pageLoad: 30000,
            script: 30000 
        });
        
        // 로그인
        const loginSuccess = await improvedSeleniumLogin(driver);
        
        if (!loginSuccess) {
            console.error('❌ 로그인 실패로 크롤링을 중단합니다.');
            process.exit(1);
        }
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            try {
                const posts = await crawlCafePostsSelenium(driver, cafeConfig);
                console.log(`✅ ${posts.length}개 게시글 수집 완료`);
                
                if (posts.length > 0) {
                    const saved = await saveToSupabase(posts);
                    allResults.push(...saved);
                }
                
                await randomDelay(3000, 5000);
                
            } catch (error) {
                console.error(`❌ ${cafeName} 크롤링 실패:`, error.message);
            }
        }
        
    } catch (error) {
        console.error('❌ 크롤링 중 오류:', error);
    } finally {
        await driver.quit();
    }
    
    console.log(`\n✅ 크롤링 완료! 총 ${allResults.length}개의 새 게시글 처리`);
    return allResults;
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

export { main as crawlWithSeleniumImproved };