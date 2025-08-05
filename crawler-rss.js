import { createClient } from '@supabase/supabase-js';
import Parser from 'rss-parser';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const parser = new Parser({
    customFields: {
        item: ['description', 'content:encoded', 'dc:creator']
    }
});

// RSS 피드 URL (카페별로 다를 수 있음)
const RSS_FEEDS = {
    '부동산스터디': 'https://cafe.naver.com/ArticleListFeed.nhn?search.clubid=10322296&search.menuid=334',
    '부린이집': 'https://cafe.naver.com/ArticleListFeed.nhn?search.clubid=29738397&search.menuid=12'
};

async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function crawlCafeRSS(cafeName, rssUrl) {
    console.log(`📡 ${cafeName} RSS 피드 크롤링 시작...`);
    
    try {
        const feed = await parser.parseURL(rssUrl);
        console.log(`✅ ${feed.items.length}개 게시글 발견`);
        
        const browser = await chromium.launch({
            headless: true,
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const results = [];
        
        try {
            const page = await browser.newPage();
            
            for (let i = 0; i < Math.min(feed.items.length, 5); i++) {
                const item = feed.items[i];
                console.log(`📄 [${i+1}/5] ${item.title}`);
                
                try {
                    // 게시글 페이지 방문하여 전체 내용 가져오기
                    await page.goto(item.link, { waitUntil: 'networkidle' });
                    await delay(2000);
                    
                    // iframe 내용 추출
                    let content = '';
                    try {
                        const frame = page.frames().find(f => f.name() === 'cafe_main');
                        if (frame) {
                            content = await frame.evaluate(() => {
                                const contentEl = document.querySelector('.se-main-container, .ContentRenderer, #postViewArea');
                                return contentEl ? contentEl.innerHTML : '';
                            });
                        }
                    } catch (e) {
                        console.log('⚠️  iframe 접근 실패, 기본 내용 사용');
                        content = item.contentSnippet || item.content || '';
                    }
                    
                    results.push({
                        cafe_name: cafeName,
                        board_name: '게시판',
                        title: item.title,
                        content_html: content || item.content || item.contentSnippet,
                        author: item.creator || item['dc:creator'] || '작성자',
                        created_at: new Date(item.pubDate || item.isoDate).toISOString(),
                        original_url: item.link,
                        status: 'pending'
                    });
                    
                    await delay(1000);
                    
                } catch (error) {
                    console.error(`❌ 게시글 상세 크롤링 실패: ${error.message}`);
                }
            }
            
            return results;
            
        } finally {
            await browser.close();
        }
        
    } catch (error) {
        console.error(`❌ ${cafeName} RSS 크롤링 실패:`, error.message);
        return [];
    }
}

export async function crawlCafesViaRSS() {
    console.log('🚀 네이버 카페 RSS 크롤링 시작');
    console.log('📡 로그인 없이 RSS 피드 사용');
    
    const allResults = [];
    
    for (const [cafeName, rssUrl] of Object.entries(RSS_FEEDS)) {
        const posts = await crawlCafeRSS(cafeName, rssUrl);
        allResults.push(...posts);
        await delay(2000);
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
    
    console.log(`\n✅ 크롤링 완료! 총 ${allResults.length}개의 새 게시글 처리`);
    return allResults;
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlCafesViaRSS()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}