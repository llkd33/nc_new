import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TARGET_CAFES = [
    { 
        cafeName: '부동산스터디', 
        cafeUrl: 'https://cafe.naver.com/jaegebal',
        boardUrl: 'https://cafe.naver.com/jaegebal?iframe_url=/ArticleList.nhn%3Fsearch.clubid=10322296%26search.menuid=334%26search.boardtype=L'
    },
    {
        cafeName: '부린이집',
        cafeUrl: 'https://cafe.naver.com/burini',
        boardUrl: 'https://cafe.naver.com/burini?iframe_url=/ArticleList.nhn%3Fsearch.clubid=29738397%26search.menuid=12%26search.boardtype=L'
    }
];

async function crawlNaverCafe(cafeInfo, limit = 5) {
    const browser = await chromium.launch({
        headless: false, // 디버깅을 위해 false로 설정
        args: ['--disable-blink-features=AutomationControlled']
    });

    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            viewport: { width: 1920, height: 1080 }
        });

        const page = await context.newPage();
        
        console.log(`${cafeInfo.cafeName} 게시판 접속 중...`);
        await page.goto(cafeInfo.boardUrl, { 
            waitUntil: 'networkidle',
            timeout: 60000 
        });

        // 잠시 대기
        await page.waitForTimeout(3000);

        // iframe 찾기
        const iframeElement = await page.$('iframe#cafe_main');
        if (!iframeElement) {
            console.log('iframe을 찾을 수 없습니다. 직접 게시글 목록을 찾습니다.');
            
            // iframe 없이 직접 시도
            const articles = await page.$$eval('.article-board .article', (elements, limit) => {
                return elements.slice(0, limit).map(el => {
                    const link = el.querySelector('a');
                    const title = link?.textContent?.trim() || '';
                    const href = link?.getAttribute('href') || '';
                    return { title, href };
                });
            }, limit);

            console.log(`찾은 게시글 수: ${articles.length}`);
            return [];
        }

        // iframe 내용 접근
        const frame = await iframeElement.contentFrame();
        if (!frame) {
            console.log('iframe 내용에 접근할 수 없습니다.');
            return [];
        }

        // 게시글 목록 대기
        await frame.waitForSelector('.article-board', { timeout: 10000 });

        // 게시글 정보 수집
        const posts = await frame.$$eval('.article-board tbody tr', (rows, limit) => {
            const results = [];
            let count = 0;
            
            for (const row of rows) {
                if (count >= limit) break;
                
                // 공지사항 제외
                const isNotice = row.querySelector('.td_article .ico-list-notice');
                if (isNotice) continue;
                
                const articleLink = row.querySelector('.td_article .article');
                const authorLink = row.querySelector('.td_name .p-nick a');
                const dateElement = row.querySelector('.td_date');
                
                if (articleLink && authorLink && dateElement) {
                    const href = articleLink.getAttribute('href');
                    const articleId = href?.match(/articleid=(\d+)/)?.[1];
                    
                    results.push({
                        title: articleLink.textContent?.trim(),
                        author: authorLink.textContent?.trim(),
                        date: dateElement.textContent?.trim(),
                        articleId: articleId,
                        href: href
                    });
                    count++;
                }
            }
            
            return results;
        }, limit);

        console.log(`${cafeInfo.cafeName}에서 ${posts.length}개 게시글 발견`);

        const crawledPosts = [];
        
        // 각 게시글 상세 내용 수집
        for (const post of posts) {
            const articleUrl = `https://cafe.naver.com${post.href}`;
            
            console.log(`게시글 수집 중: ${post.title}`);
            await page.goto(articleUrl, { waitUntil: 'networkidle' });
            await page.waitForTimeout(2000);
            
            const contentFrame = await page.$('iframe#cafe_main');
            if (!contentFrame) continue;
            
            const cFrame = await contentFrame.contentFrame();
            if (!cFrame) continue;

            try {
                // 게시글 내용 추출
                const content = await cFrame.evaluate(() => {
                    const contentElement = document.querySelector('.se-main-container') || 
                                         document.querySelector('.content') ||
                                         document.querySelector('#postViewArea') ||
                                         document.querySelector('.post-content');
                    
                    if (contentElement) {
                        // 이미지 URL 수정
                        const images = contentElement.querySelectorAll('img');
                        images.forEach(img => {
                            const src = img.getAttribute('src');
                            if (src && !src.startsWith('http')) {
                                img.setAttribute('src', 'https://cafe.naver.com' + src);
                            }
                        });
                        
                        return contentElement.innerHTML;
                    }
                    return '';
                });

                const dateObj = parseKoreanDate(post.date);
                
                crawledPosts.push({
                    cafe_name: cafeInfo.cafeName,
                    board_name: '자유게시판',
                    title: post.title,
                    author: post.author,
                    created_at: dateObj.toISOString(),
                    content_html: content || '<p>내용을 불러올 수 없습니다.</p>',
                    original_url: articleUrl
                });
                
            } catch (error) {
                console.error(`게시글 내용 추출 실패: ${post.title}`, error.message);
            }
            
            // 다음 게시글로 넘어가기 전 대기
            await page.waitForTimeout(2000 + Math.random() * 1000);
        }

        return crawledPosts;
        
    } catch (error) {
        console.error(`크롤링 오류: ${cafeInfo.cafeName}`, error);
        return [];
    } finally {
        await browser.close();
    }
}

function parseKoreanDate(dateStr) {
    const now = new Date();
    
    // "HH:mm" 형식 (오늘)
    if (dateStr.includes(':')) {
        const [hours, minutes] = dateStr.split(':').map(Number);
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }
    
    // "MM.dd" 또는 "YY.MM.dd" 형식
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

async function saveToSupabase(posts) {
    try {
        if (posts.length === 0) {
            console.log('저장할 게시글이 없습니다.');
            return [];
        }

        const existingUrls = posts.map(p => p.original_url);
        const { data: existing } = await supabase
            .from('naver_cafe_posts')
            .select('original_url')
            .in('original_url', existingUrls);
        
        const existingUrlSet = new Set(existing?.map(e => e.original_url) || []);
        const newPosts = posts.filter(p => !existingUrlSet.has(p.original_url));
        
        if (newPosts.length === 0) {
            console.log('모든 게시글이 이미 저장되어 있습니다.');
            return [];
        }
        
        const { data, error } = await supabase
            .from('naver_cafe_posts')
            .insert(newPosts)
            .select();
            
        if (error) throw error;
        
        console.log(`✅ ${data.length}개의 새 게시글이 Supabase에 저장되었습니다.`);
        
        // Make.com Webhook 호출
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
                console.log(`✅ Make.com Webhook 호출 성공 (상태: ${response.status})`);
            } catch (webhookError) {
                console.error('❌ Make.com Webhook 호출 실패:', webhookError.message);
            }
        }
        
        return data;
        
    } catch (error) {
        console.error('❌ Supabase 저장 오류:', error);
        throw error;
    }
}

export async function crawlAllCafes() {
    console.log('🚀 네이버 카페 크롤링 시작...\n');
    const allResults = [];
    
    for (const cafeInfo of TARGET_CAFES) {
        console.log(`📝 크롤링 시작: ${cafeInfo.cafeName}`);
        
        try {
            const posts = await crawlNaverCafe(cafeInfo);
            console.log(`   수집된 게시글: ${posts.length}개`);
            
            if (posts.length > 0) {
                const saved = await saveToSupabase(posts);
                allResults.push(...saved);
            }
            
            // 다음 카페로 넘어가기 전 대기
            await new Promise(resolve => setTimeout(resolve, 5000));
            
        } catch (error) {
            console.error(`❌ ${cafeInfo.cafeName} 크롤링 실패:`, error.message);
        }
        
        console.log(''); // 빈 줄 추가
    }
    
    return allResults;
}

// 직접 실행 시
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlAllCafes()
        .then(results => {
            console.log(`\n✅ 크롤링 완료! 총 ${results.length}개의 새 게시글이 처리되었습니다.`);
            process.exit(0);
        })
        .catch(error => {
            console.error('\n❌ 크롤링 중 오류 발생:', error);
            process.exit(1);
        });
}