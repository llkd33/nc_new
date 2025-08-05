import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

// 환경변수
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
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

const CRAWL_CONFIG = {
    POSTS_PER_CAFE: parseInt(process.env.POSTS_PER_CAFE) || 5,
    REQUEST_DELAY: parseInt(process.env.REQUEST_DELAY) || 2000,
    CRAWL_PERIOD_DAYS: parseInt(process.env.CRAWL_PERIOD_DAYS) || 7
};

// 헬퍼 함수
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomDelay(min = 1000, max = 3000) {
    const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(delayTime);
}

// 날짜 파싱
function parseRelativeDate(dateStr) {
    const now = new Date();
    
    if (dateStr.includes('분 전')) {
        const minutes = parseInt(dateStr.match(/\d+/)[0]);
        return new Date(now.getTime() - minutes * 60000);
    } else if (dateStr.includes('시간 전')) {
        const hours = parseInt(dateStr.match(/\d+/)[0]);
        return new Date(now.getTime() - hours * 3600000);
    } else if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length === 2) {
            const currentYear = now.getFullYear();
            return new Date(`${currentYear}.${dateStr}`);
        }
        return new Date(dateStr);
    }
    
    return new Date(dateStr);
}

// 공개 게시글만 크롤링
async function crawlPublicPosts(page, cafeName, cafeConfig) {
    const results = [];
    
    try {
        // 카페 메인 페이지로 이동
        console.log(`📍 ${cafeName} 접속 중...`);
        await page.goto(cafeConfig.cafeUrl, { 
            waitUntil: 'networkidle',
            timeout: 30000 
        });
        
        // iframe 찾기
        let iframeElement;
        try {
            iframeElement = await page.waitForSelector('iframe#cafe_main', { timeout: 5000 });
        } catch (e) {
            iframeElement = await page.waitForSelector('iframe[name="cafe_main"]', { timeout: 5000 });
        }
        
        const frame = await iframeElement.contentFrame();
        if (!frame) {
            throw new Error('게시판 iframe에 접근할 수 없습니다');
        }
        
        // 게시판으로 직접 이동
        const boardUrl = `/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${cafeConfig.menuId}&search.boardtype=L`;
        await frame.goto(boardUrl, { waitUntil: 'networkidle' });
        await randomDelay(2000, 3000);
        
        // 게시글 목록 수집
        const posts = await frame.evaluate((limit) => {
            const results = [];
            const rows = document.querySelectorAll('.article-board tbody tr, table.board-box tbody tr');
            
            for (let i = 0; i < rows.length && results.length < limit; i++) {
                const row = rows[i];
                
                // 공지사항 제외
                if (row.querySelector('.ico-list-notice')) continue;
                
                const titleElement = row.querySelector('.article, a.article');
                const authorElement = row.querySelector('.td_name a, .p-nick a');
                const dateElement = row.querySelector('.td_date');
                
                if (titleElement && authorElement && dateElement) {
                    const href = titleElement.getAttribute('href');
                    const articleId = href?.match(/articleid=(\d+)/)?.[1];
                    
                    if (articleId) {
                        results.push({
                            articleId,
                            title: titleElement.textContent?.trim(),
                            author: authorElement.textContent?.trim(),
                            date: dateElement.textContent?.trim(),
                            href
                        });
                    }
                }
            }
            
            return results;
        }, CRAWL_CONFIG.POSTS_PER_CAFE);
        
        console.log(`✅ ${posts.length}개 게시글 발견`);
        
        // 각 게시글 상세 내용 수집
        for (const post of posts) {
            try {
                console.log(`  📄 수집 중: ${post.title}`);
                
                // 게시글 페이지로 이동
                await frame.goto(`/ArticleRead.nhn?clubid=${cafeConfig.clubId}&articleid=${post.articleId}&boardtype=L`);
                await randomDelay(1500, 2500);
                
                // 공개 게시글인지 확인
                const isPublic = await frame.evaluate(() => {
                    // 로그인 요구 메시지가 있으면 비공개
                    const loginRequired = document.querySelector('.login_require');
                    const errorMsg = document.querySelector('.error_content');
                    return !loginRequired && !errorMsg;
                });
                
                if (!isPublic) {
                    console.log(`    ⚠️ 비공개 게시글 - 건너뜀`);
                    continue;
                }
                
                // 게시글 내용 추출
                const content = await frame.evaluate(() => {
                    const contentElement = document.querySelector('.se-main-container, .ContentRenderer, #postViewArea');
                    return contentElement ? contentElement.innerHTML : '';
                });
                
                // 이미지 URL 추출
                const imageUrls = await frame.evaluate(() => {
                    const images = document.querySelectorAll('.se-image-resource img, .ContentRenderer img, #postViewArea img');
                    return Array.from(images)
                        .map(img => img.src)
                        .filter(src => src && !src.includes('cafe_meta'));
                });
                
                const postData = {
                    cafe_name: cafeName,
                    board_name: `게시판${cafeConfig.menuId}`,
                    title: post.title,
                    content_html: content,
                    author: post.author,
                    created_at: parseRelativeDate(post.date).toISOString(),
                    original_url: `${cafeConfig.cafeUrl}/${post.articleId}`,
                    image_urls: imageUrls.length > 0 ? imageUrls : null,
                    status: 'pending'
                };
                
                results.push(postData);
                
            } catch (error) {
                console.error(`    ❌ 게시글 수집 실패: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ ${cafeName} 크롤링 실패:`, error.message);
    }
    
    return results;
}

// 메인 크롤링 함수
export async function crawlPublicCafes() {
    console.log('🚀 네이버 카페 공개 게시글 크롤링 시작');
    console.log(`⚙️  설정: ${CRAWL_CONFIG.POSTS_PER_CAFE}개씩, 최근 ${CRAWL_CONFIG.CRAWL_PERIOD_DAYS}일`);
    console.log('🌐 로그인 없이 공개 게시글만 수집합니다');
    
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            '--disable-blink-features=AutomationControlled',
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });
    
    const allResults = [];
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1280, height: 720 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        const page = await context.newPage();
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📍 ${cafeName} 크롤링 시작`);
            
            try {
                const posts = await crawlPublicPosts(page, cafeName, cafeConfig);
                allResults.push(...posts);
                console.log(`✅ ${cafeName}: ${posts.length}개 수집 완료`);
                
                await randomDelay(2000, 3000);
            } catch (error) {
                console.error(`❌ ${cafeName} 크롤링 실패:`, error.message);
            }
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

// 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlPublicCafes()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}