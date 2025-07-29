import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

async function testSelectors() {
    const browser = await chromium.launch({ headless: false });
    const context = await browser.newContext();
    const page = await context.newPage();

    // 로그인
    await page.goto('https://nid.naver.com/nidlogin.login');
    await page.fill('#id', process.env.NAVER_ID);
    await page.fill('#pw', process.env.NAVER_PASSWORD);
    await page.click('.btn_login');
    await page.waitForNavigation();

    // 카페 접속
    await page.goto('https://cafe.naver.com/jaegebal');
    await page.waitForTimeout(2000);

    const iframe = await page.waitForSelector('iframe#cafe_main');
    const frame = await iframe.contentFrame();

    // 게시판으로 이동
    const menuLink = await frame.$('a[href*="menuid=84"]');
    if (menuLink) {
        await menuLink.click();
        await page.waitForTimeout(3000);
    }

    // HTML 구조 분석
    const sampleRow = await frame.$eval('.article-board tbody tr:nth-child(5)', el => el.outerHTML);
    console.log('샘플 행 HTML:');
    console.log(sampleRow);

    // 선택자 테스트
    const testData = await frame.evaluate(() => {
        const row = document.querySelector('.article-board tbody tr:nth-child(5)');
        if (!row) return null;

        return {
            titleSelectors: {
                '.td_article .article': row.querySelector('.td_article .article')?.textContent,
                '.td_article a': row.querySelector('.td_article a')?.textContent,
                '.board-list .inner_list': row.querySelector('.board-list .inner_list')?.textContent
            },
            authorSelectors: {
                '.td_name .m-tcol-c': row.querySelector('.td_name .m-tcol-c')?.textContent,
                '.td_name a': row.querySelector('.td_name a')?.textContent,
                '.td_name': row.querySelector('.td_name')?.textContent,
                '.p-nick': row.querySelector('.p-nick')?.textContent
            },
            dateSelectors: {
                '.td_date': row.querySelector('.td_date')?.textContent,
                '.td_date:last-child': row.querySelector('.td_date:last-child')?.textContent
            }
        };
    });

    console.log('\n선택자 테스트 결과:');
    console.log(JSON.stringify(testData, null, 2));

    await browser.close();
}

testSelectors();