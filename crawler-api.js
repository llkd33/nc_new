import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 카페 검색 설정
const SEARCH_CONFIG = {
    '부동산스터디': {
        cafeName: '부동산스터디',
        searchQuery: 'site:cafe.naver.com/jaegebal',
        cafeUrl: 'https://cafe.naver.com/jaegebal'
    },
    '부린이집': {
        cafeName: '부린이집',
        searchQuery: 'site:cafe.naver.com/burini',
        cafeUrl: 'https://cafe.naver.com/burini'
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 네이버 검색을 통한 카페 게시글 수집
async function searchCafePosts(page, searchConfig) {
    const results = [];
    
    try {
        // 네이버 검색 사용
        const searchUrl = `https://search.naver.com/search.naver?where=article&query=${encodeURIComponent(searchConfig.searchQuery)}&sort=date`;
        console.log(`🔍 검색 중: ${searchConfig.searchQuery}`);
        
        await page.goto(searchUrl, { waitUntil: 'networkidle' });
        await delay(2000);
        
        // 검색 결과에서 최근 게시글 추출
        const searchResults = await page.evaluate(() => {
            const items = document.querySelectorAll('.total_area');
            const results = [];
            
            for (let i = 0; i < Math.min(items.length, 5); i++) {
                const item = items[i];
                const titleEl = item.querySelector('.total_tit');
                const linkEl = item.querySelector('a');
                const descEl = item.querySelector('.total_dsc');
                const dateEl = item.querySelector('.sub_time');
                
                if (titleEl && linkEl) {
                    results.push({
                        title: titleEl.textContent.trim(),
                        url: linkEl.href,
                        description: descEl?.textContent.trim() || '',
                        date: dateEl?.textContent.trim() || ''
                    });
                }
            }
            
            return results;
        });
        
        console.log(`✅ ${searchResults.length}개 검색 결과 발견`);
        
        // 각 게시글 상세 내용 크롤링
        for (const result of searchResults) {
            try {
                console.log(`📄 수집 중: ${result.title}`);
                
                // 게시글 페이지 방문
                await page.goto(result.url, { waitUntil: 'networkidle' });
                await delay(2000);
                
                // iframe으로 이동
                const frame = page.frames().find(f => f.name() === 'cafe_main');
                if (!frame) {
                    console.log('⚠️  iframe을 찾을 수 없음');
                    continue;
                }
                
                // 게시글 내용 추출
                const content = await frame.evaluate(() => {
                    const contentEl = document.querySelector('.se-main-container, .ContentRenderer, #postViewArea, .NHN_Writeform_Main');
                    return contentEl ? contentEl.innerHTML : '';
                });
                
                // 작성자 정보 추출
                const author = await frame.evaluate(() => {
                    const authorEl = document.querySelector('.nick_box, .p-nick, .writer');
                    return authorEl ? authorEl.textContent.trim() : '작성자';
                });
                
                results.push({
                    cafe_name: searchConfig.cafeName,
                    board_name: '게시판',
                    title: result.title,
                    content_html: content || result.description,
                    author: author,
                    created_at: new Date().toISOString(), // 실제 날짜 파싱 필요
                    original_url: result.url,
                    status: 'pending'
                });
                
                await delay(1500);
                
            } catch (error) {
                console.error(`❌ 게시글 상세 수집 실패: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ ${searchConfig.cafeName} 검색 실패:`, error.message);
    }
    
    return results;
}

// 메인 함수
export async function crawlViaSearch() {
    console.log('🔍 네이버 검색을 통한 카페 크롤링 시작');
    console.log('🌐 로그인 없이 공개 게시글 수집');
    
    const browser = await chromium.launch({
        headless: true,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });
    
    const allResults = [];
    
    try {
        const page = await browser.newPage();
        
        // User-Agent 설정
        await page.setExtraHTTPHeaders({
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
        });
        
        // 각 카페 검색 및 크롤링
        for (const [cafeName, searchConfig] of Object.entries(SEARCH_CONFIG)) {
            console.log(`\n🔍 ${cafeName} 검색 시작`);
            
            const posts = await searchCafePosts(page, searchConfig);
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
    crawlViaSearch()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}