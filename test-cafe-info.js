import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

async function findCafeInfo() {
    const browser = await chromium.launch({ headless: false });
    const page = await browser.newPage();
    
    console.log('네이버 카페 정보 찾기\n');
    
    // 로그인
    await page.goto('https://nid.naver.com/nidlogin.login');
    await page.evaluate(({ id, pw }) => {
        document.getElementsByName('id')[0].value = id;
        document.getElementsByName('pw')[0].value = pw;
    }, { id: process.env.NAVER_ID, pw: process.env.NAVER_PASSWORD });
    
    await page.click('#log\\.login');
    await page.waitForNavigation();
    
    // 테스트할 카페들
    const cafes = [
        { name: '부동산스터디', url: 'https://cafe.naver.com/jaegebal' },
        { name: '부린이집', url: 'https://cafe.naver.com/burini' }
    ];
    
    for (const cafe of cafes) {
        console.log(`\n━━━ ${cafe.name} ━━━`);
        await page.goto(cafe.url);
        await page.waitForTimeout(2000);
        
        const frame = await page.frame('cafe_main');
        if (!frame) continue;
        
        // 카페 정보 추출
        const cafeInfo = await frame.evaluate(() => {
            // URL에서 clubId 추출
            const clubId = window.location.href.match(/clubid=(\d+)/)?.[1] || 
                          document.querySelector('input[name="clubid"]')?.value;
            
            // 게시판 메뉴 목록
            const menus = [];
            document.querySelectorAll('a[href*="menuid="]').forEach(link => {
                const href = link.getAttribute('href');
                const menuId = href.match(/menuid=(\d+)/)?.[1];
                const menuName = link.textContent.trim();
                
                if (menuId && !menus.find(m => m.id === menuId)) {
                    menus.push({ id: menuId, name: menuName });
                }
            });
            
            return { clubId, menus };
        });
        
        console.log(`Club ID: ${cafeInfo.clubId}`);
        console.log('게시판 목록:');
        cafeInfo.menus.slice(0, 10).forEach(menu => {
            console.log(`  - ${menu.name} (menuId: ${menu.id})`);
        });
    }
    
    console.log('\n브라우저를 확인하세요. Enter를 누르면 종료됩니다...');
    await new Promise(resolve => process.stdin.once('data', resolve));
    await browser.close();
}

findCafeInfo().catch(console.error);