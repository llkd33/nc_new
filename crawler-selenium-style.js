import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

// Supabase 클라이언트
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

class NaverCafeCrawler {
    constructor(cafeName, clubId, menuId, periodDays = 7, debugMode = false) {
        this.cafeName = cafeName;
        this.clubId = clubId;
        this.menuId = menuId;
        this.periodDays = periodDays;
        this.debugMode = debugMode;
        this.baseUrl = `https://cafe.naver.com/${cafeName}`;
        this.targetDate = new Date();
        this.targetDate.setDate(this.targetDate.getDate() - periodDays);
        this.browser = null;
        this.page = null;
    }

    async setupBrowser() {
        this.browser = await chromium.launch({
            headless: !this.debugMode,
            args: [
                '--ignore-certificate-errors',
                '--ignore-ssl-errors',
                '--no-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--window-size=1920,1080'
            ]
        });
        
        const context = await this.browser.newContext({
            viewport: { width: 1920, height: 1080 },
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36'
        });
        
        this.page = await context.newPage();
    }

    async login(id, password) {
        try {
            console.log("🔐 로그인 시도 중...");
            await this.page.goto("https://nid.naver.com/nidlogin.login");
            await this.page.waitForTimeout(2000);

            if (this.debugMode) {
                console.log("디버그 모드: 수동 로그인을 위해 대기 중...");
                console.log("로그인을 완료한 후 Enter 키를 눌러주세요...");
                await new Promise(resolve => process.stdin.once('data', resolve));
            } else {
                // 자동 로그인
                await this.page.evaluate(({ id, pw }) => {
                    document.getElementsByName('id')[0].value = id;
                    document.getElementsByName('pw')[0].value = pw;
                }, { id, pw: password });
                
                await this.page.click('#log\\.login');
                await this.page.waitForNavigation({ timeout: 30000 });
            }

            console.log("✅ 로그인 완료");
            return true;
        } catch (error) {
            console.error("❌ 로그인 실패:", error);
            return false;
        }
    }

    parseDate(dateStr) {
        const now = new Date();
        
        if (!dateStr) return null;
        
        // HH:MM 형식 (오늘)
        if (dateStr.includes(':')) {
            const [hour, minute] = dateStr.split(':').map(Number);
            const date = new Date(now);
            date.setHours(hour, minute, 0, 0);
            return date;
        }
        
        // YYYY.MM.DD 형식
        const cleanDateStr = dateStr.replace(/\./g, '-').replace(/-$/, '');
        try {
            return new Date(cleanDateStr);
        } catch {
            return null;
        }
    }

    async getArticleContent(articleId) {
        try {
            const articleUrl = `${this.baseUrl}/ArticleRead.nhn?clubid=${this.clubId}&articleid=${articleId}&boardtype=L`;
            await this.page.goto(articleUrl);
            await this.page.waitForTimeout(2000);

            // iframe으로 전환
            const frame = await this.page.frame('cafe_main');
            if (!frame) return null;

            // 본문 내용 추출
            const content = await frame.evaluate(() => {
                const selectors = [
                    '.se-main-container',
                    '.article_container',
                    '.ContentRenderer',
                    '#postViewArea'
                ];
                
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        // 이미지 URL 수정
                        element.querySelectorAll('img').forEach(img => {
                            const src = img.getAttribute('src');
                            if (src && !src.startsWith('http')) {
                                img.setAttribute('src', 'https://cafe.naver.com' + src);
                            }
                        });
                        return element.innerHTML;
                    }
                }
                return null;
            });

            return content;
        } catch (error) {
            console.error("내용 추출 에러:", error);
            return null;
        }
    }

    async crawlArticles() {
        const articles = [];
        let page = 1;
        let continueCrawling = true;

        while (continueCrawling) {
            try {
                console.log(`\n📄 페이지 ${page} 크롤링 중...`);

                // 게시글 목록 페이지 접속
                const pageUrl = `${this.baseUrl}?iframe_url=/ArticleList.nhn?search.clubid=${this.clubId}&search.menuid=${this.menuId}&search.boardtype=L&search.page=${page}`;
                await this.page.goto(pageUrl);
                await this.page.waitForTimeout(2000);

                // iframe으로 전환
                const frame = await this.page.frame('cafe_main');
                if (!frame) {
                    console.error("iframe을 찾을 수 없습니다");
                    break;
                }

                // 게시글 목록 추출
                const articleRows = await frame.evaluate(() => {
                    const rows = [];
                    const allTrs = document.querySelectorAll('div.article-board > table > tbody > tr');
                    
                    for (const tr of allTrs) {
                        // 상단 고정 공지 제외
                        const upperArticle = tr.closest('#upperArticleList');
                        if (upperArticle) continue;
                        
                        // board-notice 클래스 제외
                        if (tr.classList.contains('board-notice')) continue;
                        
                        const titleElement = tr.querySelector('a.article');
                        const dateElement = tr.querySelector('.td_date');
                        const viewElement = tr.querySelector('.td_view');
                        
                        if (titleElement && dateElement) {
                            const href = titleElement.getAttribute('href');
                            const articleId = href.match(/articleid=(\d+)/)?.[1];
                            
                            rows.push({
                                title: titleElement.textContent.trim(),
                                articleId: articleId,
                                date: dateElement.textContent.trim(),
                                views: viewElement ? viewElement.textContent.trim() : '0',
                                href: href
                            });
                        }
                    }
                    
                    return rows;
                });

                console.log(`✅ 발견된 일반 게시글 수: ${articleRows.length}`);

                if (articleRows.length === 0) {
                    console.log("더 이상 게시글이 없습니다.");
                    break;
                }

                let foundArticles = false;
                
                for (const row of articleRows) {
                    try {
                        const postDate = this.parseDate(row.date);
                        if (!postDate) continue;

                        // 기간 체크
                        if (postDate < this.targetDate) {
                            console.log(`⏭️  기간 초과: ${row.date}`);
                            continueCrawling = false;
                            break;
                        }

                        // 게시글 상세 내용
                        console.log(`📖 게시글 추출 중: ${row.title}`);
                        const content = await this.getArticleContent(row.articleId);

                        articles.push({
                            cafe_name: this.cafeName,
                            board_name: `게시판${this.menuId}`,
                            title: row.title,
                            author: 'Unknown', // Selenium 코드에도 작성자 추출이 없음
                            created_at: postDate.toISOString(),
                            content_html: content || '',
                            original_url: `${this.baseUrl}/ArticleRead.nhn?clubid=${this.clubId}&articleid=${row.articleId}`,
                            views: row.views,
                            article_id: row.articleId
                        });

                        foundArticles = true;
                        console.log(`✅ 게시글 추출 완료: ${row.title} (${row.date}, 조회수: ${row.views})`);

                    } catch (error) {
                        console.error("게시글 처리 중 에러:", error);
                        continue;
                    }
                }

                if (!foundArticles) {
                    console.log("이 페이지에서 추출할 게시글이 없습니다.");
                    break;
                }

                page++;
                await this.page.waitForTimeout(1000);

            } catch (error) {
                console.error("페이지 처리 중 에러:", error);
                if (this.debugMode) {
                    console.error("상세 에러:", error);
                    console.error("현재 URL:", this.page.url());
                }
                break;
            }
        }

        return articles;
    }

    async saveToSupabase(articles) {
        if (!articles || articles.length === 0) {
            console.log("💾 저장할 게시글이 없습니다.");
            return;
        }

        try {
            // 중복 체크
            const urls = articles.map(a => a.original_url);
            const { data: existing } = await supabase
                .from('naver_cafe_posts')
                .select('original_url')
                .in('original_url', urls);

            const existingUrls = new Set(existing?.map(e => e.original_url) || []);
            const newArticles = articles.filter(a => !existingUrls.has(a.original_url));

            if (newArticles.length === 0) {
                console.log("💾 모든 게시글이 이미 저장되어 있습니다.");
                return;
            }

            // 저장
            const { data, error } = await supabase
                .from('naver_cafe_posts')
                .insert(newArticles)
                .select();

            if (error) throw error;

            console.log(`💾 ${data.length}개의 새 게시글이 Supabase에 저장되었습니다.`);

            // Make.com Webhook 호출
            if (process.env.MAKE_WEBHOOK_URL && data.length > 0) {
                try {
                    const response = await fetch(process.env.MAKE_WEBHOOK_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            event: 'new_posts',
                            count: data.length,
                            posts: data
                        })
                    });
                    console.log(`🔔 Make.com Webhook 호출 성공 (${response.status})`);
                } catch (webhookError) {
                    console.error("Webhook 호출 실패:", webhookError);
                }
            }

        } catch (error) {
            console.error("❌ Supabase 저장 에러:", error);
        }
    }

    async close() {
        if (this.debugMode) {
            console.log("크롤러를 종료하려면 Enter 키를 눌러주세요...");
            await new Promise(resolve => process.stdin.once('data', resolve));
        }
        if (this.browser) {
            await this.browser.close();
        }
    }
}

// 메인 실행 함수
async function main() {
    console.log('🚀 네이버 카페 크롤러 시작 (Selenium 스타일)\n');

    // 카페 설정
    const cafes = [
        {
            name: 'jaegebal',
            clubId: '12730407',
            menuId: '84',
            displayName: '부동산스터디'
        }
    ];

    const allArticles = [];

    for (const cafe of cafes) {
        console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
        console.log(`📍 ${cafe.displayName} 크롤링 시작`);
        console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

        const crawler = new NaverCafeCrawler(
            cafe.name,
            cafe.clubId,
            cafe.menuId,
            parseInt(process.env.CRAWL_PERIOD_DAYS) || 7,
            process.env.DEBUG_MODE === 'true'
        );

        try {
            await crawler.setupBrowser();
            
            // 로그인
            const loginSuccess = await crawler.login(
                process.env.NAVER_ID,
                process.env.NAVER_PASSWORD
            );

            if (!loginSuccess) {
                console.error("로그인 실패로 크롤링을 중단합니다.");
                continue;
            }

            // 크롤링 실행
            const articles = await crawler.crawlArticles();
            console.log(`\n✅ ${cafe.displayName}에서 총 ${articles.length}개 게시글 수집 완료`);

            // Supabase 저장
            await crawler.saveToSupabase(articles);
            
            allArticles.push(...articles);

        } catch (error) {
            console.error(`❌ ${cafe.displayName} 크롤링 중 오류:`, error);
        } finally {
            await crawler.close();
        }
    }

    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`✅ 전체 크롤링 완료! 총 ${allArticles.length}개 게시글 처리`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

// 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}