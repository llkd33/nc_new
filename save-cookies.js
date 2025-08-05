import { chromium } from 'playwright';
import fs from 'fs/promises';
import dotenv from 'dotenv';

dotenv.config();

const NAVER_ID = process.env.NAVER_ID;
const NAVER_PASSWORD = process.env.NAVER_PASSWORD;

async function saveCookiesLocally() {
    console.log('🍪 네이버 로그인 후 쿠키 저장 스크립트');
    console.log('⚠️  이 스크립트는 로컬에서만 실행하세요!');
    console.log('📌 캡차가 나타나면 수동으로 해결해주세요.');
    
    const browser = await chromium.launch({
        headless: false, // GUI 모드로 실행
        args: ['--start-maximized']
    });
    
    try {
        const context = await browser.newContext({
            viewport: { width: 1920, height: 1080 }
        });
        
        const page = await context.newPage();
        
        // 네이버 로그인 페이지로 이동
        await page.goto('https://nid.naver.com/nidlogin.login');
        
        // 아이디/비밀번호 입력
        await page.fill('#id', NAVER_ID);
        await page.fill('#pw', NAVER_PASSWORD);
        
        console.log('🔐 로그인 정보를 입력했습니다.');
        console.log('👉 캡차가 나타나면 직접 해결한 후 로그인 버튼을 클릭하세요.');
        console.log('⏳ 로그인 완료를 기다리는 중...');
        
        // 로그인 완료 대기 (수동 작업 포함)
        await page.waitForNavigation({
            url: url => !url.includes('nidlogin'),
            timeout: 300000 // 5분 대기
        });
        
        console.log('✅ 로그인 성공!');
        
        // 쿠키 저장
        const cookies = await context.cookies();
        await fs.writeFile('naver_cookies.json', JSON.stringify(cookies, null, 2));
        
        console.log('🍪 쿠키가 naver_cookies.json에 저장되었습니다.');
        console.log('📤 이 파일을 GitHub Secrets에 NAVER_COOKIES로 저장하세요.');
        
        // Base64 인코딩
        const cookiesBase64 = Buffer.from(JSON.stringify(cookies)).toString('base64');
        console.log('\n📋 아래 Base64 인코딩된 쿠키를 복사하세요:');
        console.log('----------------------------------------');
        console.log(cookiesBase64);
        console.log('----------------------------------------');
        
    } catch (error) {
        console.error('❌ 오류:', error.message);
    } finally {
        await browser.close();
    }
}

saveCookiesLocally();