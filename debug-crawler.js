import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

async function debugCrawl() {
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });

    try {
        const context = await browser.newContext();
        const page = await context.newPage();

        // 네이버 로그인
        console.log('1. 네이버 로그인...');
        await page.goto('https://nid.naver.com/nidlogin.login');
        
        await page.fill('#id', process.env.NAVER_ID);
        await page.fill('#pw', process.env.NAVER_PASSWORD);
        await page.click('.btn_login');
        
        await page.waitForNavigation();
        console.log('✅ 로그인 완료');

        // 카페 접속
        console.log('\n2. 부동산스터디 카페 접속...');
        await page.goto('https://cafe.naver.com/jaegebal');
        await page.waitForTimeout(3000);

        // iframe 접근
        const iframe = await page.waitForSelector('iframe#cafe_main');
        const frame = await iframe.contentFrame();
        
        console.log('✅ iframe 접근 성공');

        // 현재 페이지 정보
        console.log('\n3. 현재 페이지 분석...');
        const frameUrl = frame.url();
        console.log(`Frame URL: ${frameUrl}`);

        // 게시판 링크 찾기
        const menuLinks = await frame.$$eval('a[href*="menuid="]', links => 
            links.map(link => ({
                text: link.textContent.trim(),
                href: link.getAttribute('href')
            }))
        );
        
        console.log('\n발견된 게시판 메뉴:');
        menuLinks.forEach(link => {
            console.log(`- ${link.text}: ${link.href}`);
        });

        // 특정 게시판으로 이동
        console.log('\n4. 게시판 334번으로 이동 시도...');
        const targetLink = await frame.$('a[href*="menuid=334"]');
        if (targetLink) {
            await targetLink.click();
            await page.waitForTimeout(3000);
            console.log('✅ 게시판 이동 완료');
        }

        // 게시글 확인
        console.log('\n5. 게시글 요소 확인...');
        const selectors = [
            '.article-board',
            '.article-board tbody tr',
            '.td_article',
            '.article',
            'table.board-box',
            '#main-area'
        ];

        for (const selector of selectors) {
            const count = await frame.locator(selector).count();
            console.log(`${selector}: ${count}개`);
        }

        // 실제 게시글 데이터 추출 시도
        console.log('\n6. 게시글 데이터 추출...');
        const articles = await frame.$$eval('.article-board tbody tr', rows => {
            return rows.slice(0, 5).map(row => {
                const link = row.querySelector('.td_article .article');
                const author = row.querySelector('.td_name');
                const date = row.querySelector('.td_date');
                
                return {
                    title: link?.textContent?.trim() || 'N/A',
                    author: author?.textContent?.trim() || 'N/A',
                    date: date?.textContent?.trim() || 'N/A',
                    hasLink: !!link,
                    hasAuthor: !!author,
                    hasDate: !!date
                };
            });
        });

        console.log('\n추출된 게시글:');
        articles.forEach((article, i) => {
            console.log(`${i+1}. ${article.title} | ${article.author} | ${article.date}`);
        });

        console.log('\n디버깅 완료. 브라우저를 확인하세요. Enter를 누르면 종료됩니다...');
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });

    } catch (error) {
        console.error('에러:', error);
    } finally {
        await browser.close();
    }
}

debugCrawl();