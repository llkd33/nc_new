import { Builder } from 'selenium-webdriver';
import chrome from 'selenium-webdriver/chrome.js';

async function testSelenium() {
    console.log('🧪 Selenium 테스트 시작');
    console.log('환경변수 확인:');
    console.log(`- GITHUB_ACTIONS: ${process.env.GITHUB_ACTIONS}`);
    console.log(`- HEADLESS: ${process.env.HEADLESS}`);
    
    const options = new chrome.Options();
    options.addArguments('--no-sandbox');
    options.addArguments('--disable-setuid-sandbox');
    options.addArguments('--disable-dev-shm-usage');
    options.addArguments('--headless=new');
    
    let driver;
    
    try {
        console.log('🌐 Chrome 드라이버 생성 중...');
        driver = await new Builder()
            .forBrowser('chrome')
            .setChromeOptions(options)
            .build();
        
        console.log('✅ 드라이버 생성 성공!');
        
        console.log('📄 Google 접속 테스트...');
        await driver.get('https://www.google.com');
        
        const title = await driver.getTitle();
        console.log(`✅ 페이지 제목: ${title}`);
        
        console.log('🎉 Selenium 테스트 성공!');
        
    } catch (error) {
        console.error('❌ 테스트 실패:', error.message);
        console.error('상세 오류:', error);
        process.exit(1);
    } finally {
        if (driver) {
            await driver.quit();
            console.log('🔚 드라이버 종료');
        }
    }
}

testSelenium();