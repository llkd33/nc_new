import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 직접 URL로 접근 (로그인 불필요한 공개 게시글)
const DIRECT_URLS = {
    '부동산스터디': [
        'https://cafe.naver.com/jaegebal?iframe_url=/ArticleList.nhn%3Fsearch.clubid=10322296%26search.menuid=334',
        'https://cafe.naver.com/jaegebal/334'
    ],
    '부린이집': [
        'https://cafe.naver.com/burini?iframe_url=/ArticleList.nhn%3Fsearch.clubid=29738397%26search.menuid=12',
        'https://cafe.naver.com/burini/12'
    ]
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 직접 URL 접근 방식
async function crawlDirectUrls(page, cafeName, urls) {
    console.log(`🎯 ${cafeName} 직접 URL 크롤링 시작...`);
    
    for (const url of urls) {
        try {
            console.log(`📍 시도 중: ${url}`);
            await page.goto(url, { 
                waitUntil: 'domcontentloaded',
                timeout: 30000 
            });
            
            await delay(3000);
            
            // 여러 방법으로 iframe 찾기
            let frame = null;
            
            // 방법 1: ID로 찾기
            try {
                const frameElement = await page.$('#cafe_main');
                if (frameElement) {
                    frame = await frameElement.contentFrame();
                }
            } catch (e) {}
            
            // 방법 2: name으로 찾기
            if (!frame) {
                frame = page.frames().find(f => f.name() === 'cafe_main');
            }
            
            // 방법 3: URL 패턴으로 찾기
            if (!frame) {
                frame = page.frames().find(f => f.url().includes('ArticleList.nhn'));
            }
            
            if (frame) {
                console.log('✅ 게시판 접근 성공');
                
                // 게시글 목록 추출
                const posts = await frame.evaluate(() => {
                    const results = [];
                    
                    // 여러 선택자 시도
                    const selectors = [
                        '.article-board tbody tr',
                        '.board-box tbody tr',
                        '#main-area tbody tr',
                        '.list-blog li'
                    ];
                    
                    let rows = [];
                    for (const selector of selectors) {
                        rows = document.querySelectorAll(selector);
                        if (rows.length > 0) break;
                    }
                    
                    for (let i = 0; i < Math.min(rows.length, 5); i++) {
                        const row = rows[i];
                        
                        // 공지사항 제외
                        if (row.querySelector('.ico-list-notice')) continue;
                        
                        const titleEl = row.querySelector('.article, a.article, .tit a');
                        const authorEl = row.querySelector('.td_name a, .p-nick a, .nick a');
                        const dateEl = row.querySelector('.td_date, .date');
                        
                        if (titleEl) {
                            const href = titleEl.getAttribute('href');
                            results.push({
                                title: titleEl.textContent.trim(),
                                author: authorEl?.textContent.trim() || '작성자',
                                date: dateEl?.textContent.trim() || new Date().toLocaleDateString(),
                                href: href
                            });
                        }
                    }
                    
                    return results;
                });
                
                if (posts.length > 0) {
                    console.log(`✅ ${posts.length}개 게시글 발견`);
                    
                    const results = [];
                    
                    // 게시글 내용 수집
                    for (const post of posts) {
                        try {
                            const articleUrl = `https://cafe.naver.com${post.href}`;
                            console.log(`📄 수집 중: ${post.title}`);
                            
                            await page.goto(articleUrl, { waitUntil: 'networkidle' });
                            await delay(2000);
                            
                            // 다시 iframe 찾기
                            const contentFrame = page.frames().find(f => 
                                f.name() === 'cafe_main' || 
                                f.url().includes('ArticleRead.nhn')
                            );
                            
                            if (contentFrame) {
                                const content = await contentFrame.evaluate(() => {
                                    const selectors = [
                                        '.se-main-container',
                                        '.ContentRenderer',
                                        '#postViewArea',
                                        '.post_cont',
                                        '#tbody'
                                    ];
                                    
                                    for (const selector of selectors) {
                                        const el = document.querySelector(selector);
                                        if (el) return el.innerHTML;
                                    }
                                    
                                    return '';
                                });
                                
                                results.push({
                                    cafe_name: cafeName,
                                    board_name: '게시판',
                                    title: post.title,
                                    content_html: content || '<p>내용을 불러올 수 없습니다.</p>',
                                    author: post.author,
                                    created_at: new Date().toISOString(),
                                    original_url: articleUrl,
                                    status: 'pending'
                                });
                            }
                            
                            await delay(1500);
                            
                        } catch (error) {
                            console.error(`❌ 게시글 수집 실패: ${error.message}`);
                        }
                    }
                    
                    return results;
                }
            }
            
        } catch (error) {
            console.error(`❌ URL 접근 실패: ${error.message}`);
        }
    }
    
    return [];
}

// 메인 함수
export async function crawlDirect() {
    console.log('🎯 직접 URL 방식 크롤링 시작');
    console.log('🌐 로그인 없이 직접 접근');
    
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-blink-features=AutomationControlled'
        ]
    });
    
    const allResults = [];
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        const page = await context.newPage();
        
        // 각 카페 크롤링
        for (const [cafeName, urls] of Object.entries(DIRECT_URLS)) {
            console.log(`\n🎯 ${cafeName} 크롤링 시작`);
            
            const posts = await crawlDirectUrls(page, cafeName, urls);
            if (posts && posts.length > 0) {
                allResults.push(...posts);
                console.log(`✅ ${cafeName}: ${posts.length}개 수집 완료`);
            } else {
                console.log(`⚠️  ${cafeName}: 게시글을 찾을 수 없음`);
            }
            
            await delay(3000);
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
    
    console.log(`\n✅ 크롤링 완료! 총 ${allResults.length}개의 게시글 처리`);
    return allResults;
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlDirect()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}