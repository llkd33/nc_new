import { chromium } from 'playwright';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

async function generateCookies() {
    console.log('🍪 네이버 쿠키 생성 스크립트');
    console.log('📌 이 스크립트는 로컬에서만 실행하세요!\n');
    
    const browser = await chromium.launch({
        headless: false, // 브라우저 UI 표시
        args: ['--start-maximized']
    });
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        const page = await context.newPage();
        
        // 네이버 로그인 페이지
        await page.goto('https://nid.naver.com/nidlogin.login');
        
        console.log('👉 브라우저에서 직접 로그인해주세요:');
        console.log('1. 아이디와 비밀번호 입력');
        console.log('2. 캡차가 있으면 해결');
        console.log('3. 로그인 버튼 클릭');
        console.log('4. 로그인이 완료되면 이 콘솔에서 Enter를 누르세요\n');
        
        // 사용자가 Enter를 누를 때까지 대기
        await new Promise(resolve => {
            process.stdin.once('data', resolve);
        });
        
        // 쿠키 가져오기
        const cookies = await context.cookies();
        console.log(`\n✅ ${cookies.length}개의 쿠키를 가져왔습니다.`);
        
        // 파일로 저장
        await fs.writeFile('naver_cookies.json', JSON.stringify(cookies, null, 2));
        console.log('📁 naver_cookies.json 파일로 저장했습니다.');
        
        // Base64 인코딩
        const cookiesBase64 = Buffer.from(JSON.stringify(cookies)).toString('base64');
        
        console.log('\n🔐 GitHub Secrets에 추가할 Base64 쿠키:');
        console.log('=====================================');
        console.log(cookiesBase64);
        console.log('=====================================');
        
        console.log('\n📋 다음 단계:');
        console.log('1. 위의 Base64 문자열을 복사');
        console.log('2. GitHub 저장소 → Settings → Secrets → Actions');
        console.log('3. "New repository secret" 클릭');
        console.log('4. Name: NAVER_COOKIES');
        console.log('5. Value: 복사한 Base64 문자열 붙여넣기');
        console.log('6. "Add secret" 클릭');
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await browser.close();
    }
}

generateCookies();