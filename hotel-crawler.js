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

// 호텔라이프 카페 설정
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

// 날짜 파싱
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
        await driver.get('https://www.naver.com');
        await delay(3000);
        
        await driver.executeScript(`
            const loginBtn = document.querySelector('.link_login');
            if (loginBtn) loginBtn.click();
        `);
        
        await delay(3000);
        
        const currentUrl = await driver.getCurrentUrl();
        if (!currentUrl.includes('nid.naver.com')) {
            await driver.get('https://nid.naver.com/nidlogin.login');
            await delay(3000);
        }
        
        console.log('📝 로그인 정보 입력 중...');
        
        const idInput = await driver.findElement(By.id('id'));
        await idInput.click();
        await delay(500);
        
        for (const char of NAVER_ID) {
            await idInput.sendKeys(char);
            await delay(100 + Math.random() * 200);
        }
        
        await delay(1000);
        await idInput.sendKeys(Key.TAB);
        await delay(500);
        
        const pwInput = await driver.findElement(By.id('pw'));
        for (const char of NAVER_PASSWORD) {
            await pwInput.sendKeys(char);
            await delay(100 + Math.random() * 200);
        }
        
        await delay(1000);
        
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
        
        console.log('🔑 Enter 키로 로그인...');
        await pwInput.sendKeys(Key.ENTER);
        
        await delay(5000);
        
        try {
            const newDevice = await driver.findElement(By.css('.btn_cancel'));
            await newDevice.click();
            await delay(2000);
        } catch (e) {
            // 팝업이 없을 수 있음
        }
        
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
        return false;
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        return false;
    }
}

// 크롤링
async function crawlHotelLife(driver) {
    const results = [];
    
    try {
        console.log(`\n📋 ${HOTEL_CAFE.cafeName} 카페 크롤링 시작...`);
        
        // 먼저 카페 메인으로 이동
        console.log(`📍 카페 메인으로 이동: ${HOTEL_CAFE.cafeUrl}`);
        await driver.get(HOTEL_CAFE.cafeUrl);
        await delay(3000);
        
        // 게시판 직접 접근
        const boardUrl = `https://cafe.naver.com/ArticleList.nhn?search.clubid=${HOTEL_CAFE.clubId}&search.menuid=${HOTEL_CAFE.menuId}&search.boardtype=L`;
        console.log(`📍 게시판 URL: ${boardUrl}`);
        await driver.get(boardUrl);
        await delay(5000);
        
        // 현재 페이지 정보 출력
        const currentUrl = await driver.getCurrentUrl();
        console.log(`📍 현재 URL: ${currentUrl}`);
        
        // iframe 처리를 위한 여러 시도
        let inIframe = false;
        
        // 방법 1: iframe이 있으면 전환
        try {
            const iframes = await driver.findElements(By.tagName('iframe'));
            console.log(`🔍 발견된 iframe 수: ${iframes.length}`);
            
            for (let i = 0; i < iframes.length; i++) {
                try {
                    const id = await iframes[i].getAttribute('id');
                    const name = await iframes[i].getAttribute('name');
                    console.log(`  iframe[${i}] - id: ${id}, name: ${name}`);
                    
                    if (id === 'cafe_main' || name === 'cafe_main') {
                        await driver.switchTo().frame(iframes[i]);
                        inIframe = true;
                        console.log('✅ cafe_main iframe으로 전환');
                        break;
                    }
                } catch (e) {
                    // 무시
                }
            }
        } catch (e) {
            console.log('⚠️ iframe 검색 중 오류:', e.message);
        }
        
        // 게시글 목록 수집 - executeScript 대신 직접 찾기
        console.log('📋 게시글 목록 수집 중...');
        
        let posts = [];
        
        // iframe 내부의 게시글 찾기
        if (inIframe) {
            posts = await driver.executeScript(() => {
                const results = [];
                
                // 다양한 선택자로 게시글 찾기
                const selectors = [
                    '.article-board tbody tr:not(.notice)',
                    '.board-list tbody tr:not(.notice)',
                    '#main-area tbody tr:not(.notice)',
                    'table.board-box tbody tr:not(.notice)',
                    'table tbody tr:not(.notice)'
                ];
                
                let rows = [];
                for (const selector of selectors) {
                    const found = document.querySelectorAll(selector);
                    if (found.length > 0) {
                        rows = found;
                        console.log(`Found rows with selector: ${selector}`);
                        break;
                    }
                }
                
                console.log(`Total rows found: ${rows.length}`);
                
                // 각 행에서 게시글 정보 추출
                for (let i = 0; i < rows.length && results.length < 5; i++) {
                    const row = rows[i];
                    
                    // 게시글 링크 찾기
                    const linkSelectors = [
                        '.article',
                        'a.title',
                        '.td_article a',
                        'td.title a',
                        'a[href*="ArticleRead"]'
                    ];
                    
                    let articleLink = null;
                    for (const selector of linkSelectors) {
                        articleLink = row.querySelector(selector);
                        if (articleLink) break;
                    }
                    
                    if (!articleLink) continue;
                    
                    const title = articleLink.textContent?.trim();
                    const href = articleLink.getAttribute('href');
                    
                    // 작성자 찾기
                    const authorSelectors = ['.m-tcol-c', '.td_name a', '.writer', '.nick'];
                    let author = '';
                    for (const selector of authorSelectors) {
                        const elem = row.querySelector(selector);
                        if (elem) {
                            author = elem.textContent?.trim();
                            break;
                        }
                    }
                    
                    // 날짜 찾기
                    const dateSelectors = ['.td_date', '.date', 'td.date'];
                    let date = '';
                    for (const selector of dateSelectors) {
                        const elem = row.querySelector(selector);
                        if (elem) {
                            date = elem.textContent?.trim();
                            break;
                        }
                    }
                    
                    if (title && href) {
                        results.push({
                            title: title,
                            author: author || '작성자',
                            date: date || new Date().toLocaleDateString('ko-KR'),
                            href: href
                        });
                    }
                }
                
                return results;
            });
        }
        
        console.log(`✅ ${posts.length}개 게시글 목록 수집`);
        
        if (posts.length === 0) {
            console.log('⚠️ iframe 내부에서 게시글을 찾을 수 없습니다. 다른 방법 시도...');
            
            // iframe 없이 직접 찾기 시도
            try {
                await driver.switchTo().defaultContent();
                
                posts = await driver.executeScript(() => {
                    const results = [];
                    const links = document.querySelectorAll('a[href*="ArticleRead"]');
                    
                    for (let i = 0; i < links.length && i < 5; i++) {
                        const link = links[i];
                        results.push({
                            title: link.textContent?.trim() || '제목 없음',
                            author: '작성자',
                            date: new Date().toLocaleDateString('ko-KR'),
                            href: link.getAttribute('href')
                        });
                    }
                    
                    return results;
                });
                
                console.log(`✅ 전체 페이지에서 ${posts.length}개 게시글 발견`);
            } catch (e) {
                console.error('전체 페이지 검색 실패:', e.message);
            }
            
            if (posts.length === 0 && IS_GITHUB_ACTIONS) {
                try {
                    const screenshot = await driver.takeScreenshot();
                    await fs.writeFile('hotel-no-posts.png', screenshot, 'base64');
                    console.log('📸 스크린샷 저장');
                    
                    // 페이지 소스 일부 저장
                    const pageSource = await driver.getPageSource();
                    await fs.writeFile('hotel-page-source.txt', pageSource.substring(0, 5000));
                    console.log('📄 페이지 소스 저장');
                } catch (e) {
                    console.log('디버깅 파일 저장 실패:', e.message);
                }
            }
            
            if (posts.length === 0) {
                return results;
            }
        }
        
        // 각 게시글 상세 내용 수집
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            console.log(`📄 [${i+1}/${posts.length}] ${post.title}`);
            
            try {
                let fullUrl = post.href;
                if (!fullUrl.startsWith('http')) {
                    fullUrl = `https://cafe.naver.com${post.href}`;
                }
                
                await driver.get(fullUrl);
                await delay(3000);
                
                // iframe 재전환 시도
                try {
                    await driver.switchTo().defaultContent();
                    const iframe = await driver.findElement(By.id('cafe_main'));
                    await driver.switchTo().frame(iframe);
                } catch (e) {
                    // iframe이 없을 수 있음
                }
                
                // 컨텐츠 추출
                const content = await driver.executeScript(() => {
                    const selectors = [
                        '.se-main-container',
                        '.ContentRenderer',
                        '#tbody',
                        '.content-area',
                        '#postViewArea',
                        '.post-content'
                    ];
                    
                    for (const selector of selectors) {
                        const element = document.querySelector(selector);
                        if (element) {
                            return element.innerHTML;
                        }
                    }
                    
                    // 못 찾으면 body 전체에서 특정 영역 찾기
                    const bodyText = document.body.innerHTML;
                    const startIdx = bodyText.indexOf('<div class="se-');
                    const endIdx = bodyText.lastIndexOf('</div>');
                    if (startIdx > -1 && endIdx > startIdx) {
                        return bodyText.substring(startIdx, endIdx + 6);
                    }
                    
                    return '';
                });
                
                results.push({
                    cafe_name: HOTEL_CAFE.cafeName,
                    board_name: '게시판',
                    title: post.title,
                    author: post.author,
                    created_at: parseKoreanDate(post.date).toISOString(),
                    content_html: content || '<p>내용을 불러올 수 없습니다.</p>',
                    original_url: fullUrl
                });
                
            } catch (error) {
                console.error(`❌ 게시글 내용 추출 실패: ${error.message}`);
            }
            
            await randomDelay(2000, 3000);
        }
        
    } catch (error) {
        console.error(`❌ ${HOTEL_CAFE.cafeName} 크롤링 실패:`, error.message);
        
        if (IS_GITHUB_ACTIONS) {
            try {
                const screenshot = await driver.takeScreenshot();
                await fs.writeFile('hotel-error.png', screenshot, 'base64');
            } catch (e) {
                // 무시
            }
        }
    }
    
    // iframe에서 나오기
    try {
        await driver.switchTo().defaultContent();
    } catch (e) {
        // 무시
    }
    
    return results;
}

// 포스팅 기능 제거 - Make.com이 처리

// Supabase 저장
async function saveToSupabase(posts) {
    if (posts.length === 0) return [];
    
    try {
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
        
        console.log(`💾 ${data.length}개의 새 게시글 저장 완료 (Make.com이 처리 예정)`);
        return data;
        
    } catch (error) {
        console.error('❌ Supabase 저장 오류:', error);
        return [];
    }
}

// 메인 함수
async function main() {
    console.log('🏨 호텔 카페 크롤러 v2.0 (Make.com 연동)');
    console.log(`🔧 환경: ${IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
    console.log(`🎯 크롤링 대상: ${HOTEL_CAFE.cafeName}`);
    console.log(`💾 저장: Supabase → Make.com이 포스팅 처리`);
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 로그인 정보가 필요합니다.');
        process.exit(1);
    }
    
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
        
        await driver.manage().setTimeouts({ 
            implicit: 10000,
            pageLoad: 30000,
            script: 30000 
        });
        
        await driver.executeScript(`
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        `);
        
        const loginSuccess = await login(driver);
        if (!loginSuccess) {
            console.error('❌ 로그인 실패로 작업을 중단합니다.');
            process.exit(1);
        }
        
        const crawledPosts = await crawlHotelLife(driver);
        console.log(`\n✅ 총 ${crawledPosts.length}개 게시글 크롤링 완료`);
        
        if (crawledPosts.length > 0) {
            allCrawledPosts.push(...crawledPosts);
            
            console.log(`\n💾 게시글 Supabase에 저장 중...`);
            const savedPosts = await saveToSupabase(crawledPosts);
            
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

export { main as hotelCrawler };