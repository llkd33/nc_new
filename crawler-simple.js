import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

async function testCrawl() {
    console.log('Puppeteer 테스트 시작...');
    
    try {
        const browser = await puppeteer.launch({
            headless: false, // 디버깅을 위해 브라우저 UI 표시
            args: ['--no-sandbox', '--disable-setuid-sandbox']
        });
        
        const page = await browser.newPage();
        await page.goto('https://www.google.com');
        console.log('Google 페이지 로드 성공!');
        
        // 네이버 카페 테스트
        await page.goto('https://cafe.naver.com/jaegebal');
        console.log('네이버 카페 페이지 로드 성공!');
        
        await browser.close();
        console.log('브라우저 정상 종료');
        
    } catch (error) {
        console.error('Puppeteer 오류:', error);
    }
}

// 먼저 Puppeteer가 정상 작동하는지 테스트
testCrawl().then(() => {
    console.log('테스트 완료');
});