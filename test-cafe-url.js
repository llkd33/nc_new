import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

async function testCafeAccess() {
    const browser = await puppeteer.launch({
        headless: false, // 브라우저 UI 표시
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    try {
        const page = await browser.newPage();
        
        // 네이버 카페 직접 접속
        console.log('네이버 카페 접속 시도...');
        await page.goto('https://cafe.naver.com/jaegebal', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        // 스크린샷 저장
        await page.screenshot({ path: 'cafe-main.png' });
        console.log('스크린샷 저장: cafe-main.png');
        
        // iframe 확인
        const frames = await page.frames();
        console.log(`발견된 프레임 수: ${frames.length}`);
        frames.forEach((frame, index) => {
            console.log(`프레임 ${index}: ${frame.name() || 'unnamed'}`);
        });
        
        // 게시판 목록 페이지로 이동
        console.log('\n게시판 페이지 접속...');
        await page.goto('https://cafe.naver.com/jaegebal?iframe_url=/ArticleList.nhn%3Fsearch.clubid=10322296%26search.menuid=334%26search.boardtype=L', {
            waitUntil: 'networkidle2',
            timeout: 60000
        });
        
        await page.screenshot({ path: 'cafe-board.png' });
        console.log('게시판 스크린샷 저장: cafe-board.png');
        
        // 선택자 테스트
        const selectors = [
            'iframe#cafe_main',
            'iframe[name="cafe_main"]',
            '.article-board',
            '#main-area'
        ];
        
        for (const selector of selectors) {
            try {
                const element = await page.$(selector);
                console.log(`선택자 ${selector}: ${element ? '발견됨' : '없음'}`);
            } catch (e) {
                console.log(`선택자 ${selector}: 오류`);
            }
        }
        
        console.log('\n10초 대기 후 종료...');
        await new Promise(resolve => setTimeout(resolve, 10000));
        
    } catch (error) {
        console.error('오류 발생:', error);
    } finally {
        await browser.close();
    }
}

testCafeAccess();