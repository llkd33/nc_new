import { createClient } from '@supabase/supabase-js';
import { Builder, By, until, Key } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';
import { execSync } from 'child_process';
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

// 타겟 카페 설정 (포스팅할 카페)
const TARGET_CAFE = {
    url: 'https://cafe.naver.com/atohealing',
    menuId: '7' // 자유게시판
};

// 크롤링할 카페 설정
const SOURCE_CAFES = {
    '호텔라이프': {
        clubId: '18786605',
        menuId: '105',
        cafeName: '호텔라이프',
        cafeUrl: 'https://cafe.naver.com/hotellife'
    }
};

// 설정
const CONFIG = {
    POSTS_PER_CAFE: 5,
    CRAWL_PERIOD_DAYS: 7,
    POST_DELAY: 3000,
    REQUEST_DELAY: 2000
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

// Selenium 로그인 함수
async function seleniumLogin(driver) {
    console.log('🔐 Selenium 로그인 시작...');
    
    try {
        // 로그인 페이지로 이동
        await driver.get('https://nid.naver.com/nidlogin.login');
        await delay(3000);
        
        // JavaScript로 직접 값 입력
        console.log('📝 로그인 정보 입력 중...');
        
        // ID 입력
        await driver.executeScript(`
            document.getElementById('id').value = arguments[0];
            document.getElementById('id').dispatchEvent(new Event('input', { bubbles: true }));
        `, NAVER_ID);
        
        await randomDelay(1000, 2000);
        
        // 비밀번호 입력
        await driver.executeScript(`
            document.getElementById('pw').value = arguments[0];
            document.getElementById('pw').dispatchEvent(new Event('input', { bubbles: true }));
        `, NAVER_PASSWORD);
        
        await randomDelay(1000, 2000);
        
        // 로그인 유지 해제
        await driver.executeScript(`
            const keepLogin = document.getElementById('keep');
            if (keepLogin && keepLogin.checked) {
                keepLogin.click();
            }
        `);
        
        // 로그인 버튼 클릭
        console.log('🔄 로그인 버튼 클릭...');
        await driver.executeScript(`
            const loginBtn = document.querySelector('#log\\\\.login') || 
                           document.querySelector('button[type="submit"]');
            if (loginBtn) loginBtn.click();
        `);
        
        // 로그인 처리 대기
        await delay(5000);
        
        // 기기 등록 팝업 처리
        try {
            await driver.executeScript(`
                const cancelBtn = document.querySelector('span.btn_cancel');
                if (cancelBtn) cancelBtn.click();
            `);
            await delay(2000);
        } catch (e) {
            // 팝업이 없을 수 있음
        }
        
        // 로그인 성공 확인
        await driver.get('https://www.naver.com');
        await delay(3000);
        
        const isLoggedIn = await driver.executeScript(`
            const logoutBtn = document.querySelector('.MyView-module__link_logout');
            return !!logoutBtn;
        `);
        
        if (isLoggedIn) {
            console.log('✅ 로그인 성공!');
            return true;
        } else {
            console.error('❌ 로그인 실패');
            return false;
        }
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
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
        
        // iframe 전환
        const iframe = await driver.findElement(By.id('cafe_main'));
        await driver.switchTo().frame(iframe);
        
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
                await driver.executeScript(`
                    const titleInput = document.querySelector('input[name="title"]') || 
                                     document.querySelector('#subject');
                    if (titleInput) {
                        titleInput.value = arguments[0];
                        titleInput.dispatchEvent(new Event('input', { bubbles: true }));
                    }
                `, titleWithSource);
                
                await delay(1000);
                
                // 에디터 타입 확인 및 내용 입력
                const editorType = await driver.executeScript(() => {
                    if (document.querySelector('.se-container')) return 'smart3';
                    if (document.querySelector('.se2_input_area')) return 'smart2';
                    if (document.querySelector('#content')) return 'classic';
                    return 'unknown';
                });
                
                console.log(`📝 에디터 타입: ${editorType}`);
                
                // 출처 추가된 내용
                const contentWithSource = `
                    ${post.content_html}
                    <br><br>
                    <p style="color: #888; font-size: 12px;">
                        출처: ${post.cafe_name} - ${post.author}<br>
                        원문: <a href="${post.original_url}" target="_blank">${post.original_url}</a>
                    </p>
                `;
                
                if (editorType === 'smart3') {
                    // Smart Editor 3.0
                    await driver.executeScript(`
                        const editor = document.querySelector('.se-container');
                        if (editor) {
                            const editArea = editor.querySelector('.se-text-paragraph');
                            if (editArea) {
                                editArea.innerHTML = arguments[0];
                                editArea.dispatchEvent(new Event('input', { bubbles: true }));
                            }
                        }
                    `, contentWithSource);
                } else if (editorType === 'smart2') {
                    // Smart Editor 2.0
                    await driver.executeScript(`
                        const iframe = document.querySelector('iframe.se2_input_area');
                        if (iframe && iframe.contentDocument) {
                            iframe.contentDocument.body.innerHTML = arguments[0];
                        }
                    `, contentWithSource);
                } else {
                    // Classic editor
                    await driver.executeScript(`
                        const textarea = document.querySelector('#content') || 
                                       document.querySelector('textarea[name="content"]');
                        if (textarea) {
                            textarea.value = arguments[0];
                            textarea.dispatchEvent(new Event('input', { bubbles: true }));
                        }
                    `, contentWithSource.replace(/<[^>]*>/g, ''));
                }
                
                await delay(2000);
                
                // 등록 버튼 클릭
                console.log('📤 등록 버튼 클릭...');
                await driver.executeScript(`
                    const submitBtn = document.querySelector('.btn-write-article') ||
                                    document.querySelector('#cafewritebtn') ||
                                    document.querySelector('button[type="submit"]') ||
                                    document.querySelector('.BaseButton--primary');
                    if (submitBtn) {
                        submitBtn.click();
                    }
                `);
                
                await delay(3000);
                
                // 성공 확인
                await driver.switchTo().defaultContent();
                const currentUrl = await driver.getCurrentUrl();
                
                if (!currentUrl.includes('Write')) {
                    console.log('✅ 게시글 작성 성공!');
                    postedPosts.push({
                        ...post,
                        posted_at: new Date().toISOString(),
                        target_cafe: TARGET_CAFE.url
                    });
                } else {
                    console.error('❌ 게시글 작성 실패');
                }
                
                // 다음 포스팅 전 대기
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

// Supabase 저장 및 업데이트
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

async function updatePostedStatus(postedPosts) {
    if (postedPosts.length === 0) return;
    
    try {
        const urls = postedPosts.map(p => p.original_url);
        const { error } = await supabase
            .from('naver_cafe_posts')
            .update({ 
                status: 'posted',
                posted_at: new Date().toISOString()
            })
            .in('original_url', urls);
        
        if (error) throw error;
        
        console.log(`✅ ${postedPosts.length}개 게시글 상태 업데이트 완료`);
        
    } catch (error) {
        console.error('❌ 상태 업데이트 오류:', error);
    }
}

// 메인 함수
async function main(mode = 'all') {
    console.log('🚀 Selenium 올인원 크롤러 & 포스터 시작');
    console.log(`📋 모드: ${mode} (all/crawl/post)`);
    console.log(`🔧 환경: ${IS_GITHUB_ACTIONS ? 'GitHub Actions' : 'Local'}`);
    console.log(`👤 계정: ${NAVER_ID ? NAVER_ID.substring(0, 3) + '***' : 'Not Set'}`);
    
    // 환경변수 체크
    if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
        console.error('❌ Supabase 설정이 필요합니다.');
        console.error(`SUPABASE_URL: ${SUPABASE_URL ? 'Set' : 'Not Set'}`);
        console.error(`SUPABASE_ANON_KEY: ${SUPABASE_ANON_KEY ? 'Set' : 'Not Set'}`);
        process.exit(1);
    }
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 로그인 정보가 필요합니다.');
        console.error(`NAVER_ID: ${NAVER_ID ? 'Set' : 'Not Set'}`);
        console.error(`NAVER_PASSWORD: ${NAVER_PASSWORD ? 'Set' : 'Not Set'}`);
        process.exit(1);
    }
    
    // Chrome 및 ChromeDriver 확인
    try {
        const chromeVersion = execSync('google-chrome --version').toString().trim();
        console.log(`🔍 Chrome 버전: ${chromeVersion}`);
    } catch (e) {
        console.error('⚠️ Chrome이 설치되어 있지 않습니다.');
    }
    
    // Chrome 옵션 설정
    const options = new chrome.Options();
    
    // 봇 감지 우회 옵션
    options.addArguments('--disable-blink-features=AutomationControlled');
    options.addArguments('--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    options.excludeSwitches(['enable-automation']);
    options.addArguments('--disable-infobars');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--disable-gpu');
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--window-size=1920,1080');
    
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
    } catch (error) {
        console.error('❌ 브라우저 시작 실패:', error.message);
        console.error('Chrome 설치 확인이 필요합니다.');
        process.exit(1);
    }
    
    try {
        // 타임아웃 설정
        await driver.manage().setTimeouts({ 
            implicit: 10000,
            pageLoad: 30000,
            script: 30000 
        });
        
        // webdriver 속성 제거
        await driver.executeScript(`
            Object.defineProperty(navigator, 'webdriver', {
                get: () => undefined
            });
        `);
        
        // 로그인
        const loginSuccess = await seleniumLogin(driver);
        if (!loginSuccess) {
            console.error('❌ 로그인 실패로 작업을 중단합니다.');
            process.exit(1);
        }
        
        // 크롤링 모드인 경우에만 크롤링 수행
        if (mode === 'all' || mode === 'crawl') {
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
        }
        
        // 크롤링한 게시글 저장
        if (allCrawledPosts.length > 0 && (mode === 'all' || mode === 'crawl')) {
            console.log(`\n💾 총 ${allCrawledPosts.length}개 게시글 저장 중...`);
            const savedPosts = await saveToSupabase(allCrawledPosts);
            
            // 포스팅 모드인 경우
            if (savedPosts.length > 0 && (mode === 'all' || mode === 'post')) {
                console.log(`\n📤 ${savedPosts.length}개 게시글 포스팅 시작...`);
                allPostedPosts = await postToCafe(driver, savedPosts);
                
                // 포스팅 상태 업데이트
                if (allPostedPosts.length > 0) {
                    await updatePostedStatus(allPostedPosts);
                }
            }
        }
        
        // post 모드인 경우 기존 pending 게시글 포스팅
        if (mode === 'post' && allCrawledPosts.length === 0) {
            console.log('\n📋 기존 pending 게시글 조회 중...');
            const { data: pendingPosts } = await supabase
                .from('naver_cafe_posts')
                .select('*')
                .eq('status', 'pending')
                .order('created_at', { ascending: true })
                .limit(10);
            
            if (pendingPosts && pendingPosts.length > 0) {
                console.log(`📤 ${pendingPosts.length}개 pending 게시글 포스팅...`);
                allPostedPosts = await postToCafe(driver, pendingPosts);
                
                if (allPostedPosts.length > 0) {
                    await updatePostedStatus(allPostedPosts);
                }
            }
        }
        
    } catch (error) {
        console.error('❌ 작업 중 오류:', error.message);
        console.error('상세 오류:', error);
    } finally {
        if (driver) {
            try {
                await driver.quit();
                console.log('🔚 브라우저 종료');
            } catch (e) {
                console.error('브라우저 종료 중 오류:', e.message);
            }
        }
    }
    
    console.log(`\n✨ 작업 완료!`);
    console.log(`📊 크롤링: ${allCrawledPosts.length}개`);
    console.log(`📤 포스팅: ${allPostedPosts.length}개`);
    
    return {
        crawled: allCrawledPosts.length,
        posted: allPostedPosts.length
    };
}

// 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    // 명령줄 인자로 모드 받기
    const mode = process.argv[2] || 'all';
    main(mode)
        .then(() => process.exit(0))
        .catch(error => {
            console.error('❌ 실행 실패:', error);
            process.exit(1);
        });
}

export { main as seleniumAllInOne };