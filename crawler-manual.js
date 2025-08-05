import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import readline from 'readline';

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

// 사용자 입력 대기
function waitForUserInput(message) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });

    return new Promise(resolve => {
        rl.question(message, () => {
            rl.close();
            resolve();
        });
    });
}

// 수동 로그인 지원
async function manualLogin(page) {
    console.log('🔐 네이버 로그인 (수동 모드)');
    
    try {
        // 로그인 페이지로 이동
        await page.goto('https://nid.naver.com/nidlogin.login', {
            waitUntil: 'domcontentloaded'
        });
        
        // ID/PW 자동 입력
        if (NAVER_ID && NAVER_PASSWORD) {
            await page.waitForSelector('#id', { visible: true });
            await page.fill('#id', NAVER_ID);
            await delay(500);
            await page.fill('#pw', NAVER_PASSWORD);
            
            console.log('✅ ID/PW 입력 완료');
            console.log('⚠️  캡차가 나타나면 직접 해결해주세요!');
            console.log('👉 로그인 버튼을 직접 클릭하세요.');
        }
        
        // GitHub Actions가 아닌 경우에만 수동 대기
        if (process.env.GITHUB_ACTIONS) {
            // GitHub Actions에서는 자동 클릭 시도
            await delay(2000);
            await page.click('.btn_login');
            await page.waitForNavigation({ timeout: 30000 }).catch(() => {});
        } else {
            // 로컬에서는 수동 로그인 대기
            console.log('⏳ 로그인 완료 후 Enter를 누르세요...');
            await waitForUserInput('');
        }
        
        // 로그인 확인
        const currentUrl = page.url();
        const isLoggedIn = !currentUrl.includes('nidlogin');
        
        if (isLoggedIn) {
            console.log('✅ 로그인 성공!');
            
            // 쿠키 저장
            const cookies = await page.context().cookies();
            console.log(`🍪 ${cookies.length}개 쿠키 저장됨`);
            
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

// 게시글 크롤링 (Python 코드 참고)
async function crawlCafeBoard(page, cafeConfig, pageCount = 5) {
    const results = [];
    
    try {
        console.log(`📋 ${cafeConfig.cafeName} 게시판 크롤링 시작...`);
        
        // 게시판 페이지로 이동
        const boardUrl = `${cafeConfig.cafeUrl}?iframe_url=/ArticleList.nhn%3Fsearch.clubid=${cafeConfig.clubId}%26search.menuid=${cafeConfig.menuId}%26search.boardtype=L`;
        await page.goto(boardUrl, { waitUntil: 'networkidle' });
        await delay(2000);
        
        // iframe으로 전환 (Python 코드 방식)
        const frame = page.frames().find(f => f.name() === 'cafe_main');
        if (!frame) {
            throw new Error('cafe_main iframe을 찾을 수 없습니다');
        }
        
        console.log('✅ 게시판 iframe 접근 성공');
        
        // 페이지별로 크롤링
        for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
            console.log(`📄 페이지 ${pageNum}/${pageCount} 크롤링 중...`);
            
            if (pageNum > 1) {
                // 페이지 이동
                const pageUrl = `/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}&search.boardtype=L&search.page=${pageNum}`;
                await frame.goto(pageUrl, { waitUntil: 'networkidle' });
                await delay(2000);
            }
            
            // 게시글 목록 추출
            const articles = await frame.evaluate(() => {
                const rows = document.querySelectorAll('.article-board tbody tr');
                const articleList = [];
                
                for (const row of rows) {
                    // 공지사항 제외
                    if (row.querySelector('.ico-list-notice')) continue;
                    
                    const titleEl = row.querySelector('.article');
                    const authorEl = row.querySelector('.td_name a');
                    const dateEl = row.querySelector('.td_date');
                    
                    if (titleEl) {
                        const href = titleEl.getAttribute('href');
                        const articleId = href?.match(/articleid=(\d+)/)?.[1];
                        
                        if (articleId) {
                            articleList.push({
                                articleId,
                                title: titleEl.textContent.trim(),
                                author: authorEl?.textContent.trim() || '작성자',
                                date: dateEl?.textContent.trim() || '',
                                href
                            });
                        }
                    }
                }
                
                return articleList;
            });
            
            console.log(`  - ${articles.length}개 게시글 발견`);
            
            // 각 게시글 상세 내용 수집
            for (const article of articles) {
                try {
                    // 게시글 페이지로 이동
                    await frame.goto(`/ArticleRead.nhn?clubid=${cafeConfig.clubId}&articleid=${article.articleId}&boardtype=L`, {
                        waitUntil: 'networkidle'
                    });
                    await delay(1500);
                    
                    // 게시글 내용 추출
                    const content = await frame.evaluate(() => {
                        // 여러 선택자 시도
                        const selectors = [
                            '.se-main-container',
                            '.ContentRenderer',
                            '#tbody',
                            '#postViewArea'
                        ];
                        
                        for (const selector of selectors) {
                            const el = document.querySelector(selector);
                            if (el) {
                                // 텍스트 전처리 (Python 코드 참고)
                                const html = el.innerHTML
                                    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
                                    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
                                return html;
                            }
                        }
                        return '';
                    });
                    
                    // 이미지 URL 추출
                    const imageUrls = await frame.evaluate(() => {
                        const images = document.querySelectorAll('img');
                        return Array.from(images)
                            .map(img => img.src)
                            .filter(src => src && !src.includes('cafe_meta') && !src.includes('blank.gif'));
                    });
                    
                    results.push({
                        cafe_name: cafeConfig.cafeName,
                        board_name: `게시판${cafeConfig.menuId}`,
                        title: article.title,
                        content_html: content,
                        author: article.author,
                        created_at: new Date().toISOString(),
                        original_url: `${cafeConfig.cafeUrl}/${article.articleId}`,
                        image_urls: imageUrls.length > 0 ? imageUrls : null,
                        status: 'pending'
                    });
                    
                    console.log(`    ✓ ${article.title}`);
                    
                } catch (error) {
                    console.error(`    ✗ 게시글 수집 실패: ${error.message}`);
                }
                
                // 봇 감지 회피를 위한 랜덤 지연
                await delay(1000 + Math.random() * 2000);
            }
        }
        
    } catch (error) {
        console.error(`❌ ${cafeConfig.cafeName} 크롤링 실패:`, error.message);
    }
    
    return results;
}

// 메인 크롤링 함수
export async function crawlWithManualLogin() {
    console.log('🚀 네이버 카페 크롤링 (수동 로그인 모드)');
    console.log('📌 Python 크롤러 방식 적용');
    
    const browser = await chromium.launch({
        headless: false, // 로컬에서는 GUI 모드
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--start-maximized'
        ]
    });
    
    const allResults = [];
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul'
        });
        
        const page = await context.newPage();
        
        // 수동 로그인
        const loginSuccess = await manualLogin(page);
        if (!loginSuccess) {
            throw new Error('로그인 실패');
        }
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            const posts = await crawlCafeBoard(page, cafeConfig, 2); // 2페이지씩
            allResults.push(...posts);
            
            console.log(`✅ ${cafeName}: ${posts.length}개 수집 완료`);
            await delay(3000);
        }
        
        // Supabase에 저장 (배치 처리)
        if (allResults.length > 0) {
            console.log(`\n💾 총 ${allResults.length}개 게시글 저장 중...`);
            
            // 중복 체크
            const urls = allResults.map(p => p.original_url);
            const { data: existing } = await supabase
                .from('naver_cafe_posts')
                .select('original_url')
                .in('original_url', urls);
            
            const existingUrls = new Set(existing?.map(e => e.original_url) || []);
            const newPosts = allResults.filter(p => !existingUrls.has(p.original_url));
            
            if (newPosts.length > 0) {
                // 100개씩 배치 처리 (Python 코드 참고)
                for (let i = 0; i < newPosts.length; i += 100) {
                    const batch = newPosts.slice(i, i + 100);
                    const { error } = await supabase
                        .from('naver_cafe_posts')
                        .insert(batch);
                    
                    if (error) {
                        console.error(`❌ 배치 ${i/100 + 1} 저장 실패:`, error.message);
                    } else {
                        console.log(`✅ 배치 ${i/100 + 1} (${batch.length}개) 저장 완료`);
                    }
                }
            } else {
                console.log('ℹ️  모든 게시글이 이미 저장되어 있습니다');
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
    crawlWithManualLogin()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}