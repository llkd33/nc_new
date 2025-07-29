import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

async function testCafeStructure() {
    const browser = await chromium.launch({
        headless: false,
        args: ['--disable-blink-features=AutomationControlled']
    });

    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();

        // 부동산스터디 카페 직접 접속
        console.log('1. 부동산스터디 카페 메인 페이지 접속...');
        await page.goto('https://cafe.naver.com/jaegebal');
        await page.waitForTimeout(3000);

        // 스크린샷
        await page.screenshot({ path: 'cafe-main-structure.png' });
        
        // iframe 확인
        const frames = page.frames();
        console.log(`발견된 프레임 수: ${frames.length}`);
        frames.forEach(frame => {
            console.log(`- Frame: ${frame.name() || frame.url()}`);
        });

        // 다양한 선택자 테스트
        const selectors = [
            'iframe#cafe_main',
            'iframe[name="cafe_main"]',
            '#cafe_main',
            'iframe',
            '.cafe-body-wrapper'
        ];

        for (const selector of selectors) {
            const element = await page.$(selector);
            console.log(`선택자 '${selector}': ${element ? '존재' : '없음'}`);
        }

        // 게시판 직접 URL 테스트
        console.log('\n2. 게시판 직접 URL 접속...');
        await page.goto('https://cafe.naver.com/ArticleList.nhn?search.clubid=10322296&search.menuid=334');
        await page.waitForTimeout(3000);

        await page.screenshot({ path: 'board-direct-url.png' });

        // 게시글 확인
        const articleSelectors = [
            '.article-board',
            '.article',
            'table.board-box',
            '.list-blog',
            '.td_article'
        ];

        console.log('\n게시글 관련 요소:');
        for (const selector of articleSelectors) {
            const count = await page.locator(selector).count();
            console.log(`선택자 '${selector}': ${count}개`);
        }

        console.log('\n브라우저를 열어둡니다. 수동으로 확인 후 Enter를 누르세요...');
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });

    } catch (error) {
        console.error('오류:', error);
    } finally {
        await browser.close();
    }
}

console.log('네이버 카페 구조 테스트 시작...\n');
testCafeStructure();