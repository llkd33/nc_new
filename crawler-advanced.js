import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

dotenv.config();

// 환경변수
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const NAVER_ID = process.env.NAVER_ID;
const NAVER_PASSWORD = process.env.NAVER_PASSWORD;
const DEBUG_MODE = process.env.DEBUG_MODE === 'true';
const HEADLESS = process.env.HEADLESS !== 'false';

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
    POSTS_PER_CAFE: parseInt(process.env.POSTS_PER_CAFE) || 5,
    REQUEST_DELAY: parseInt(process.env.REQUEST_DELAY) || 2000,
    CRAWL_PERIOD_DAYS: parseInt(process.env.CRAWL_PERIOD_DAYS) || 7,
    MAX_RETRIES: 3,
    COOKIE_FILE: 'naver_cookies.json'
};

// 헬퍼 함수들
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

function shouldCrawlPost(postDate, periodDays) {
    const crawlDate = new Date();
    crawlDate.setDate(crawlDate.getDate() - periodDays);
    
    const postDateObj = parseKoreanDate(postDate);
    return postDateObj >= crawlDate;
}

// 쿠키 관리
async function saveCookies(page) {
    try {
        const cookies = await page.context().cookies();
        await fs.writeFile(CRAWL_CONFIG.COOKIE_FILE, JSON.stringify(cookies, null, 2));
        console.log('✅ 쿠키 저장 완료');
    } catch (error) {
        console.error('쿠키 저장 실패:', error);
    }
}

async function loadCookies(context) {
    try {
        const cookieData = await fs.readFile(CRAWL_CONFIG.COOKIE_FILE, 'utf-8');
        const cookies = JSON.parse(cookieData);
        await context.addCookies(cookies);
        console.log('✅ 쿠키 로드 완료');
        return true;
    } catch (error) {
        console.log('⚠️  저장된 쿠키 없음');
        return false;
    }
}

// 네이버 로그인
async function loginToNaver(page) {
    console.log('🔐 네이버 로그인 시도...');
    
    try {
        // 로그인 페이지로 이동
        await page.goto('https://nid.naver.com/nidlogin.login', {
            waitUntil: 'domcontentloaded',
            timeout: 60000
        });
        
        // 페이지 로드 대기
        await page.waitForSelector('#id', { visible: true, timeout: 10000 });
        await randomDelay(2000, 3000);
        
        // 아이디 입력 - 더 자연스럽게
        const idInput = await page.$('#id');
        await idInput.click();
        await randomDelay(500, 1000);
        
        // 한 글자씩 천천히 입력
        for (const char of NAVER_ID) {
            await page.keyboard.type(char);
            await randomDelay(100, 300);
        }
        
        await randomDelay(1000, 2000);
        
        // 비밀번호 입력
        const pwInput = await page.$('#pw');
        await pwInput.click();
        await randomDelay(500, 1000);
        
        // 비밀번호도 천천히 입력
        for (const char of NAVER_PASSWORD) {
            await page.keyboard.type(char);
            await randomDelay(100, 300);
        }
        
        await randomDelay(1000, 2000);
        
        // 로그인 유지 체크 해제 (있는 경우)
        try {
            const keepLogin = await page.$('#keep');
            if (keepLogin) {
                const isChecked = await page.evaluate(el => el.checked, keepLogin);
                if (isChecked) {
                    await keepLogin.click();
                }
            }
        } catch (e) {
            // 로그인 유지 옵션이 없을 수 있음
        }
        
        // 로그인 버튼 클릭
        console.log('🔄 로그인 버튼 클릭...');
        await Promise.all([
            page.waitForNavigation({ 
                waitUntil: 'networkidle', 
                timeout: 60000 
            }).catch(e => console.log('Navigation timeout - continuing...')),
            page.click('.btn_login')
        ]);
        
        // 잠시 대기
        await randomDelay(3000, 5000);
        
        // 로그인 성공 확인 - 여러 방법으로 시도
        let isLoggedIn = false;
        
        // 방법 1: URL 확인
        const currentUrl = page.url();
        if (!currentUrl.includes('nidlogin') && !currentUrl.includes('login')) {
            isLoggedIn = true;
        }
        
        // 방법 2: 로그인 후 리다이렉트 확인
        if (!isLoggedIn) {
            try {
                await page.goto('https://naver.com', { waitUntil: 'domcontentloaded' });
                await page.waitForSelector('body', { timeout: 5000 });
                
                // 로그아웃 버튼이 있는지 확인
                const hasLogoutBtn = await page.evaluate(() => {
                    return document.querySelector('.link_logout') !== null || 
                           document.querySelector('[class*="logout"]') !== null ||
                           document.querySelector('.MyView-module__link_logout') !== null;
                });
                
                if (hasLogoutBtn) {
                    isLoggedIn = true;
                }
            } catch (e) {
                console.log('로그인 확인 중 오류:', e.message);
            }
        }
        
        if (isLoggedIn) {
            console.log('✅ 로그인 성공');
            await saveCookies(page);
            return true;
        } else {
            console.error('❌ 로그인 실패 - 캡차 또는 보안 문자가 필요할 수 있습니다');
            
            // 디버그용 스크린샷 (GitHub Actions에서)
            if (process.env.GITHUB_ACTIONS) {
                try {
                    await page.screenshot({ 
                        path: 'login-failed.png',
                        fullPage: true 
                    });
                    console.log('📸 로그인 실패 스크린샷 저장됨');
                } catch (e) {
                    console.log('스크린샷 저장 실패:', e.message);
                }
            }
            
            return false;
        }
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        
        // 디버그용 스크린샷
        if (process.env.GITHUB_ACTIONS) {
            try {
                await page.screenshot({ 
                    path: 'login-error.png',
                    fullPage: true 
                });
            } catch (e) {
                // 무시
            }
        }
        
        return false;
    }
}

// 카페 게시글 크롤링
async function crawlCafePosts(page, cafeConfig) {
    const results = [];
    
    try {
        // 게시판 페이지로 이동 - 새로운 URL 구조
        console.log(`📋 ${cafeConfig.cafeName} 게시판 접속...`);
        
        // 먼저 카페 메인 페이지로 이동
        await page.goto(cafeConfig.cafeUrl, { waitUntil: 'networkidle' });
        await randomDelay(2000, 3000);
        
        // iframe 찾기
        let iframeElement;
        try {
            iframeElement = await page.waitForSelector('iframe#cafe_main', { timeout: 5000 });
        } catch (e) {
            // 대체 선택자 시도
            iframeElement = await page.waitForSelector('iframe[name="cafe_main"]', { timeout: 5000 });
        }
        
        const frame = await iframeElement.contentFrame();
        
        if (!frame) {
            throw new Error('게시판 iframe에 접근할 수 없습니다');
        }
        
        // 게시판으로 이동 - iframe 내에서 클릭
        console.log(`📋 게시판 메뉴 찾는 중...`);
        
        // 게시판 메뉴 클릭 시도
        try {
            // menuId를 사용하여 게시판 링크 찾기
            const menuLink = await frame.$(`a[href*="menuid=${cafeConfig.menuId}"]`);
            if (menuLink) {
                await menuLink.click();
                await randomDelay(2000, 3000);
            } else {
                // 직접 URL로 이동
                await frame.goto(`/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}`, { waitUntil: 'networkidle' });
                await randomDelay(2000, 3000);
            }
        } catch (e) {
            console.log('⚠️  게시판 메뉴 클릭 실패, 직접 이동 시도');
        }
        
        // 게시글 목록 대기 - 다양한 선택자 시도
        let articleSelector = null;
        const possibleSelectors = ['.article-board', 'table.board-box', '.list-blog tbody', '#main-area'];
        
        for (const selector of possibleSelectors) {
            try {
                await frame.waitForSelector(selector, { timeout: 3000 });
                articleSelector = selector;
                console.log(`✅ 게시글 목록 발견: ${selector}`);
                break;
            } catch (e) {
                continue;
            }
        }
        
        if (!articleSelector) {
            throw new Error('게시글 목록을 찾을 수 없습니다');
        }
        
        // 게시글 정보 수집
        const posts = await frame.evaluate((selector, limit) => {
            const results = [];
            let count = 0;
            
            // 선택자에 따라 다른 파싱 로직
            if (selector === '.article-board') {
                const rows = document.querySelectorAll('.article-board tbody tr');
                for (const row of rows) {
                    if (count >= limit) break;
                    
                    // 공지사항 제외
                    if (row.querySelector('.ico-list-notice')) continue;
                    
                    const articleLink = row.querySelector('.td_article .article');
                    const authorElement = row.querySelector('.td_name .m-tcol-c') || row.querySelector('.td_name a');
                    const dateElement = row.querySelector('.td_date');
                    
                    if (articleLink && authorElement && dateElement) {
                        const href = articleLink.getAttribute('href');
                        results.push({
                            title: articleLink.textContent?.trim(),
                            author: authorElement.textContent?.trim(),
                            date: dateElement.textContent?.trim(),
                            href: href
                        });
                        count++;
                    }
                }
            } else if (selector.includes('board-box')) {
                const rows = document.querySelectorAll('table.board-box tbody tr');
                for (const row of rows) {
                    if (count >= limit) break;
                    
                    const articleLink = row.querySelector('a.article');
                    const authorElement = row.querySelector('.p-nick a');
                    const dateElement = row.querySelector('.td_date');
                    
                    if (articleLink && authorElement && dateElement) {
                        const href = articleLink.getAttribute('href');
                        results.push({
                            title: articleLink.textContent?.trim(),
                            author: authorElement.textContent?.trim(),
                            date: dateElement.textContent?.trim(),
                            href: href
                        });
                        count++;
                    }
                }
            }
            
            return results;
        }, articleSelector, CRAWL_CONFIG.POSTS_PER_CAFE);
        
        console.log(`✅ ${posts.length}개 게시글 목록 수집`);
        
        // 각 게시글 상세 내용 수집
        for (let i = 0; i < posts.length; i++) {
            const post = posts[i];
            
            // 날짜 필터링
            if (!shouldCrawlPost(post.date, CRAWL_CONFIG.CRAWL_PERIOD_DAYS)) {
                console.log(`⏭️  오래된 게시글 스킵: ${post.title}`);
                continue;
            }
            
            console.log(`📄 [${i+1}/${posts.length}] ${post.title}`);
            
            try {
                // 게시글 페이지로 이동
                const articleUrl = `${cafeConfig.cafeUrl}${post.href}`;
                await page.goto(articleUrl, { waitUntil: 'networkidle' });
                await randomDelay(1000, 2000);
                
                // iframe 접근
                const contentFrame = await page.waitForSelector('iframe#cafe_main', { timeout: 5000 });
                const cFrame = await contentFrame.contentFrame();
                
                if (!cFrame) continue;
                
                // 컨텐츠 추출
                const content = await cFrame.evaluate(() => {
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
                            // 스크립트와 스타일 제거
                            const cloned = element.cloneNode(true);
                            cloned.querySelectorAll('script, style').forEach(el => el.remove());
                            
                            // 이미지 URL 수정
                            cloned.querySelectorAll('img').forEach(img => {
                                const src = img.getAttribute('src');
                                if (src && !src.startsWith('http')) {
                                    img.setAttribute('src', 'https://cafe.naver.com' + src);
                                }
                            });
                            
                            return cloned.innerHTML;
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
                    original_url: articleUrl
                });
                
            } catch (error) {
                console.error(`❌ 게시글 내용 추출 실패: ${error.message}`);
            }
            
            await randomDelay();
        }
        
    } catch (error) {
        console.error(`❌ ${cafeConfig.cafeName} 크롤링 실패:`, error.message);
    }
    
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
        
        // Webhook 호출
        if (MAKE_WEBHOOK_URL && data.length > 0) {
            try {
                const response = await fetch(MAKE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'new_posts',
                        count: data.length,
                        posts: data
                    })
                });
                console.log(`🔔 Make.com Webhook 호출 (${response.status})`);
            } catch (error) {
                console.error('❌ Webhook 호출 실패:', error.message);
            }
        }
        
        return data;
        
    } catch (error) {
        console.error('❌ Supabase 저장 오류:', error);
        return [];
    }
}

// 메인 크롤링 함수
export async function crawlAllCafes() {
    console.log('🚀 네이버 카페 크롤링 시작');
    console.log(`⚙️  설정: ${CRAWL_CONFIG.POSTS_PER_CAFE}개씩, 최근 ${CRAWL_CONFIG.CRAWL_PERIOD_DAYS}일`);
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 계정 정보가 없습니다. 환경변수를 확인하세요.');
        return [];
    }
    
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu',
            '--disable-web-security',
            '--disable-features=IsolateOrigins,site-per-process',
            '--disable-site-isolation-trials',
            '--disable-accelerated-2d-canvas',
            '--window-size=1920,1080',
            '--start-maximized',
            '--enable-features=NetworkService,NetworkServiceInProcess',
            '--disable-features=VizDisplayCompositor',
            '--force-color-profile=srgb'
        ]
    });
    
    const allResults = [];
    
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 },
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul',
            permissions: ['geolocation'],
            extraHTTPHeaders: {
                'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                'Accept-Encoding': 'gzip, deflate, br',
                'Connection': 'keep-alive',
                'Upgrade-Insecure-Requests': '1'
            }
        });
        
        // 봇 감지 우회 설정 - context 레벨에서 설정
        await context.addInitScript(() => {
            // webdriver 속성 제거
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
            
            // Chrome 자동화 플래그 제거
            Object.defineProperty(navigator, 'plugins', {
                get: () => [1, 2, 3, 4, 5]
            });
            
            // 언어 설정
            Object.defineProperty(navigator, 'languages', {
                get: () => ['ko-KR', 'ko', 'en-US', 'en']
            });
            
            // 권한 API 오버라이드
            if (window.navigator.permissions) {
                const originalQuery = window.navigator.permissions.query;
                window.navigator.permissions.query = (parameters) => (
                    parameters.name === 'notifications' ?
                        Promise.resolve({ state: Notification.permission }) :
                        originalQuery(parameters)
                );
            }
            
            // Chrome 드라이버 확인 우회
            window.chrome = {
                runtime: {}
            };
            
            // Notification 권한
            Object.defineProperty(navigator, 'permissions', {
                get: () => ({
                    query: () => Promise.resolve({ state: 'granted' })
                })
            });
        });
        
        const page = await context.newPage();
        
        // 디버그 모드
        if (DEBUG_MODE) {
            page.on('console', msg => console.log('Browser:', msg.text()));
            page.on('pageerror', error => console.log('Page error:', error.message));
        }
        
        // 쿠키 로드 시도
        const hasStoredCookies = await loadCookies(context);
        
        // 로그인 체크
        if (!hasStoredCookies) {
            const loginSuccess = await loginToNaver(page);
            if (!loginSuccess) {
                throw new Error('네이버 로그인 실패');
            }
        } else {
            // 쿠키로 로그인 상태 확인
            await page.goto('https://naver.com');
            const isLoggedIn = await page.evaluate(() => {
                return document.querySelector('.link_login') === null;
            });
            
            if (!isLoggedIn) {
                console.log('⚠️  쿠키 만료, 재로그인 필요');
                const loginSuccess = await loginToNaver(page);
                if (!loginSuccess) {
                    throw new Error('네이버 로그인 실패');
                }
            }
        }
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            try {
                const posts = await crawlCafePosts(page, cafeConfig);
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
        await browser.close();
    }
    
    return allResults;
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlAllCafes()
        .then(results => {
            console.log(`\n✅ 크롤링 완료! 총 ${results.length}개의 새 게시글 처리`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ 크롤링 실패:', error);
            process.exit(1);
        });
}