import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

class OptimizedNaverCrawler {
    constructor(cafeName, clubId, menuId) {
        this.cafeName = cafeName;
        this.clubId = clubId;
        this.menuId = menuId;
        this.baseUrl = `https://cafe.naver.com/${cafeName}`;
        this.periodDays = parseInt(process.env.CRAWL_PERIOD_DAYS) || 7;
        this.postsPerPage = parseInt(process.env.POSTS_PER_CAFE) || 5;
        this.targetDate = new Date();
        this.targetDate.setDate(this.targetDate.getDate() - this.periodDays);
    }

    async init() {
        this.browser = await chromium.launch({
            headless: process.env.HEADLESS !== 'false',
            args: ['--no-sandbox', '--disable-dev-shm-usage']
        });
        
        const context = await this.browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        this.page = await context.newPage();
    }

    async login() {
        console.log("🔐 네이버 로그인...");
        await this.page.goto("https://nid.naver.com/nidlogin.login");
        await this.page.waitForTimeout(1000);

        // 로그인 폼 채우기
        await this.page.evaluate(({ id, pw }) => {
            document.getElementsByName('id')[0].value = id;
            document.getElementsByName('pw')[0].value = pw;
        }, { id: process.env.NAVER_ID, pw: process.env.NAVER_PASSWORD });
        
        await this.page.click('#log\\.login');
        await this.page.waitForNavigation({ timeout: 30000 });
        
        console.log("✅ 로그인 완료");
        return true;
    }

    parseDate(dateStr) {
        const now = new Date();
        
        // 시간 형식 (오늘)
        if (dateStr.includes(':')) {
            const [hour, minute] = dateStr.split(':').map(Number);
            const date = new Date(now);
            date.setHours(hour, minute, 0, 0);
            return date;
        }
        
        // 날짜 형식
        if (dateStr.includes('.')) {
            const cleanDateStr = dateStr.replace(/\./g, '-').replace(/-$/, '');
            try {
                return new Date(cleanDateStr);
            } catch {
                return now;
            }
        }
        
        return now;
    }

    async crawlPage(pageNum) {
        const pageUrl = `${this.baseUrl}?iframe_url=/ArticleList.nhn?search.clubid=${this.clubId}&search.menuid=${this.menuId}&search.boardtype=L&search.page=${pageNum}`;
        await this.page.goto(pageUrl);
        await this.page.waitForTimeout(2000);

        // iframe 가져오기
        const frame = await this.page.frame('cafe_main');
        if (!frame) return { articles: [], hasMore: false };

        // 게시글 목록 추출 (콘텐츠 없이 먼저)
        const articleList = await frame.evaluate(() => {
            const rows = [];
            const allTrs = document.querySelectorAll('div.article-board > table > tbody > tr');
            
            for (const tr of allTrs) {
                // 공지사항 제외
                if (tr.closest('#upperArticleList') || tr.classList.contains('board-notice')) continue;
                
                const titleElement = tr.querySelector('a.article');
                const dateElement = tr.querySelector('.td_date');
                
                if (titleElement && dateElement) {
                    const href = titleElement.getAttribute('href');
                    const articleId = href.match(/articleid=(\d+)/)?.[1];
                    
                    rows.push({
                        title: titleElement.textContent.trim(),
                        articleId: articleId,
                        date: dateElement.textContent.trim(),
                        href: href
                    });
                }
            }
            
            return rows;
        });

        const articles = [];
        let hasMore = true;

        // 필요한 게시글만 내용 수집
        for (let i = 0; i < Math.min(articleList.length, this.postsPerPage); i++) {
            const article = articleList[i];
            const postDate = this.parseDate(article.date);
            
            // 기간 체크
            if (postDate < this.targetDate) {
                hasMore = false;
                break;
            }

            console.log(`📄 ${article.title}`);
            
            // 간단한 방법으로 내용 추출 (새 페이지 대신 iframe 내 네비게이션)
            const content = await this.getArticleContent(frame, article.articleId);
            
            articles.push({
                cafe_name: this.cafeName,
                board_name: `게시판${this.menuId}`,
                title: article.title,
                author: 'Unknown',
                created_at: postDate.toISOString(),
                content_html: content || '<p>내용 없음</p>',
                original_url: `${this.baseUrl}/ArticleRead.nhn?clubid=${this.clubId}&articleid=${article.articleId}`
            });
        }

        return { articles, hasMore };
    }

    async getArticleContent(frame, articleId) {
        try {
            // iframe 내에서 직접 이동
            await frame.goto(`/ArticleRead.nhn?clubid=${this.clubId}&articleid=${articleId}&boardtype=L`);
            await frame.waitForTimeout(1000);

            const content = await frame.evaluate(() => {
                const selectors = ['.se-main-container', '.ContentRenderer', '#postViewArea'];
                for (const sel of selectors) {
                    const el = document.querySelector(sel);
                    if (el) {
                        // 간단한 텍스트만 추출
                        return el.textContent.substring(0, 500) + '...';
                    }
                }
                return '';
            });

            // 목록으로 돌아가기
            await frame.goBack();
            await frame.waitForTimeout(500);
            
            return content;
        } catch {
            return '';
        }
    }

    async crawl() {
        const allArticles = [];
        let pageNum = 1;
        let hasMore = true;
        
        console.log(`\n📍 ${this.cafeName} 크롤링 시작 (최근 ${this.periodDays}일)`);

        while (hasMore && pageNum <= 5) { // 최대 5페이지
            console.log(`\n페이지 ${pageNum}...`);
            const { articles, hasMore: more } = await this.crawlPage(pageNum);
            
            allArticles.push(...articles);
            hasMore = more;
            pageNum++;
            
            if (articles.length === 0) break;
        }

        console.log(`\n✅ 총 ${allArticles.length}개 게시글 수집`);
        return allArticles;
    }

    async saveToSupabase(articles) {
        if (!articles.length) return;

        try {
            // 각 게시글 개별 저장 (중복 무시)
            let savedCount = 0;
            
            for (const article of articles) {
                try {
                    const { data, error } = await supabase
                        .from('naver_cafe_posts')
                        .insert(article)
                        .select();
                    
                    if (!error) {
                        savedCount++;
                    }
                } catch (e) {
                    // 중복은 무시
                    if (e.code !== '23505') {
                        console.error('저장 오류:', e);
                    }
                }
            }
            
            console.log(`💾 ${savedCount}개의 새 게시글 저장됨`);

            // Webhook
            if (process.env.MAKE_WEBHOOK_URL && savedCount > 0) {
                await fetch(process.env.MAKE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'new_posts',
                        count: savedCount,
                        posts: articles.slice(0, savedCount)
                    })
                });
                console.log('🔔 Make.com Webhook 호출됨');
            }

        } catch (error) {
            console.error("❌ 저장 오류:", error);
        }
    }

    async close() {
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// 메인 실행
async function main() {
    console.log('🚀 최적화된 네이버 카페 크롤러\n');

    const cafes = [
        { name: 'jaegebal', clubId: '12730407', menuId: '84', displayName: '부동산스터디' }
    ];

    for (const cafe of cafes) {
        const crawler = new OptimizedNaverCrawler(cafe.name, cafe.clubId, cafe.menuId);
        
        try {
            await crawler.init();
            await crawler.login();
            
            const articles = await crawler.crawl();
            await crawler.saveToSupabase(articles);
            
        } catch (error) {
            console.error(`❌ 오류:`, error.message);
        } finally {
            await crawler.close();
        }
    }
    
    console.log('\n✅ 모든 작업 완료!');
}

if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}