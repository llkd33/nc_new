import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
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

// iframe 내에서 게시글 크롤링 (Python 코드 방식 적용)
async function crawlInIframe(page, cafeConfig) {
    const results = [];
    
    try {
        // 직접 iframe URL로 이동
        const iframeUrl = `${cafeConfig.cafeUrl}/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}&search.boardtype=L`;
        console.log(`📋 게시판 직접 접근: ${iframeUrl}`);
        
        await page.goto(iframeUrl, { 
            waitUntil: 'domcontentloaded',
            timeout: 30000 
        });
        await delay(3000);
        
        // 로그인 필요 여부 확인
        const needsLogin = await page.evaluate(() => {
            return document.querySelector('.login_require') !== null ||
                   document.querySelector('#login_area') !== null ||
                   window.location.href.includes('login');
        });
        
        if (needsLogin) {
            console.log('⚠️  로그인이 필요한 게시판입니다. 공개 게시글만 수집합니다.');
        }
        
        // 게시글 목록 추출 (여러 선택자 시도)
        const articles = await page.evaluate(() => {
            const results = [];
            
            // 다양한 게시판 형식 지원
            const selectors = [
                '.article-board tbody tr',
                'table.board-box tbody tr',
                '#main-area tbody tr',
                '.list-blog li',
                '.board_list li'
            ];
            
            let rows = [];
            for (const selector of selectors) {
                const elements = document.querySelectorAll(selector);
                if (elements.length > 0) {
                    rows = elements;
                    console.log(`Found articles with selector: ${selector}`);
                    break;
                }
            }
            
            // 최대 10개까지만
            for (let i = 0; i < Math.min(rows.length, 10); i++) {
                const row = rows[i];
                
                // 공지사항 제외
                if (row.classList.contains('notice') || 
                    row.querySelector('.ico-list-notice') ||
                    row.querySelector('[class*="notice"]')) {
                    continue;
                }
                
                // 제목 찾기
                const titleEl = row.querySelector('.article, a.article, .tit a, .board-list a');
                if (!titleEl) continue;
                
                const href = titleEl.getAttribute('href');
                const title = titleEl.textContent.trim();
                
                // 작성자 찾기
                const authorEl = row.querySelector('.td_name a, .p-nick a, .nick, .writer');
                const author = authorEl ? authorEl.textContent.trim() : '작성자';
                
                // 날짜 찾기
                const dateEl = row.querySelector('.td_date, .date, .time');
                const date = dateEl ? dateEl.textContent.trim() : '';
                
                // articleId 추출
                let articleId = null;
                if (href) {
                    const match = href.match(/articleid=(\d+)/);
                    if (match) articleId = match[1];
                }
                
                if (title && (href || articleId)) {
                    results.push({
                        articleId: articleId || `temp_${i}`,
                        title,
                        author,
                        date,
                        href
                    });
                }
            }
            
            return results;
        });
        
        console.log(`✅ ${articles.length}개 게시글 목록 발견`);
        
        // 각 게시글 상세 내용 수집
        for (let i = 0; i < articles.length; i++) {
            const article = articles[i];
            
            try {
                console.log(`📄 [${i+1}/${articles.length}] ${article.title}`);
                
                let articleUrl;
                if (article.href && article.href.startsWith('http')) {
                    articleUrl = article.href;
                } else if (article.articleId && article.articleId !== `temp_${i}`) {
                    articleUrl = `${cafeConfig.cafeUrl}/ArticleRead.nhn?clubid=${cafeConfig.clubId}&articleid=${article.articleId}&boardtype=L`;
                } else if (article.href) {
                    articleUrl = `${cafeConfig.cafeUrl}${article.href}`;
                } else {
                    console.log('    ⚠️  유효한 URL을 찾을 수 없음');
                    continue;
                }
                
                // 새 페이지에서 게시글 열기 (iframe 문제 회피)
                const newPage = await page.context().newPage();
                
                try {
                    await newPage.goto(articleUrl, { 
                        waitUntil: 'domcontentloaded',
                        timeout: 20000 
                    });
                    await delay(2000);
                    
                    // 게시글 내용 추출 (iframe이 있는 경우와 없는 경우 모두 처리)
                    let content = '';
                    let imageUrls = [];
                    
                    // iframe이 있는 경우
                    const frame = newPage.frames().find(f => f.name() === 'cafe_main');
                    if (frame) {
                        content = await frame.evaluate(() => {
                            const selectors = [
                                '.se-main-container',
                                '.ContentRenderer',
                                '#postViewArea',
                                '.NHN_Writeform_Main',
                                '#tbody'
                            ];
                            
                            for (const selector of selectors) {
                                const el = document.querySelector(selector);
                                if (el) return el.innerHTML;
                            }
                            return '';
                        });
                        
                        imageUrls = await frame.evaluate(() => {
                            const images = document.querySelectorAll('img');
                            return Array.from(images)
                                .map(img => img.src)
                                .filter(src => src && !src.includes('cafe_meta') && !src.includes('blank.gif'))
                                .slice(0, 5); // 최대 5개
                        });
                    } else {
                        // iframe이 없는 경우 (직접 접근)
                        content = await newPage.evaluate(() => {
                            const selectors = [
                                '.se-main-container',
                                '.ContentRenderer',
                                '#postViewArea',
                                '.post_cont',
                                'article'
                            ];
                            
                            for (const selector of selectors) {
                                const el = document.querySelector(selector);
                                if (el) return el.innerHTML;
                            }
                            return document.body.innerHTML; // 최후의 수단
                        });
                    }
                    
                    if (content) {
                        results.push({
                            cafe_name: cafeConfig.cafeName,
                            board_name: `게시판${cafeConfig.menuId}`,
                            title: article.title,
                            content_html: content.substring(0, 50000), // 길이 제한
                            author: article.author,
                            created_at: new Date().toISOString(),
                            original_url: articleUrl,
                            image_urls: imageUrls.length > 0 ? imageUrls : null,
                            status: 'pending'
                        });
                        
                        console.log('    ✅ 수집 완료');
                    } else {
                        console.log('    ⚠️  내용을 찾을 수 없음');
                    }
                    
                } catch (error) {
                    console.error(`    ❌ 게시글 수집 실패: ${error.message}`);
                } finally {
                    await newPage.close();
                }
                
                // 봇 감지 회피를 위한 지연
                await delay(2000 + Math.random() * 2000);
                
            } catch (error) {
                console.error(`    ❌ 처리 실패: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ ${cafeConfig.cafeName} 크롤링 실패:`, error.message);
    }
    
    return results;
}

// 메인 크롤링 함수
export async function crawlImproved() {
    console.log('🚀 개선된 네이버 카페 크롤링 시작');
    console.log('📌 Python 크롤러 기법 적용 (iframe 직접 접근)');
    
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled',
            '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
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
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            const posts = await crawlInIframe(page, cafeConfig);
            allResults.push(...posts);
            
            console.log(`✅ ${cafeName}: ${posts.length}개 수집 완료`);
            await delay(3000);
        }
        
        // Supabase에 저장
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
                const { error } = await supabase
                    .from('naver_cafe_posts')
                    .insert(newPosts);
                
                if (error) {
                    console.error('❌ DB 저장 실패:', error.message);
                } else {
                    console.log(`✅ ${newPosts.length}개 새 게시글 저장 완료`);
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
    
    console.log(`\n✅ 크롤링 완료! 총 ${allResults.length}개의 게시글 처리`);
    return allResults;
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlImproved()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}