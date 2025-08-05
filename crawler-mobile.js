import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';

dotenv.config();

// 환경변수
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const NAVER_ID = process.env.NAVER_ID;
const NAVER_PASSWORD = process.env.NAVER_PASSWORD;
const HEADLESS = process.env.HEADLESS !== 'false';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 카페 설정 (모바일 URL)
const CAFE_CONFIG = {
    '부동산스터디': {
        cafeId: 'jaegebal',
        menuId: '334',
        cafeName: '부동산스터디',
        mobileUrl: 'https://m.cafe.naver.com/jaegebal'
    },
    '부린이집': {
        cafeId: 'burini',
        menuId: '12',
        cafeName: '부린이집',
        mobileUrl: 'https://m.cafe.naver.com/burini'
    }
};

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function randomDelay(min = 1000, max = 3000) {
    const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(delayTime);
}

// 모바일 네이버 로그인
async function mobileLogin(page) {
    console.log('📱 모바일 네이버 로그인 시도...');
    
    try {
        // 모바일 로그인 페이지
        await page.goto('https://nid.naver.com/nidlogin.login?mode=form&url=https%3A%2F%2Fm.naver.com', {
            waitUntil: 'domcontentloaded'
        });
        
        await page.waitForSelector('#id', { visible: true });
        await randomDelay(2000, 3000);
        
        // 아이디 입력
        await page.fill('#id', NAVER_ID);
        await randomDelay(1000, 2000);
        
        // 비밀번호 입력
        await page.fill('#pw', NAVER_PASSWORD);
        await randomDelay(1000, 2000);
        
        // 로그인 버튼 클릭
        await Promise.all([
            page.waitForNavigation({ timeout: 30000 }).catch(() => {}),
            page.click('.btn_login')
        ]);
        
        await randomDelay(3000, 5000);
        
        // 로그인 확인
        const currentUrl = page.url();
        const isLoggedIn = !currentUrl.includes('nidlogin');
        
        if (isLoggedIn) {
            console.log('✅ 모바일 로그인 성공');
            return true;
        } else {
            console.log('❌ 모바일 로그인 실패');
            return false;
        }
        
    } catch (error) {
        console.error('❌ 로그인 중 오류:', error.message);
        return false;
    }
}

// 모바일 카페 크롤링
async function crawlMobileCafe(page, cafeConfig) {
    const results = [];
    
    try {
        // 모바일 카페 게시판으로 이동
        const boardUrl = `${cafeConfig.mobileUrl}/ArticleList.nhn?search.clubid=${cafeConfig.cafeId}&search.menuid=${cafeConfig.menuId}`;
        console.log(`📱 모바일 게시판 접속: ${boardUrl}`);
        
        await page.goto(boardUrl, { waitUntil: 'networkidle' });
        await randomDelay(2000, 3000);
        
        // 게시글 목록 수집
        const posts = await page.evaluate(() => {
            const postElements = document.querySelectorAll('.board_list li');
            const postList = [];
            
            for (let i = 0; i < Math.min(postElements.length, 5); i++) {
                const post = postElements[i];
                const titleEl = post.querySelector('.tit');
                const authorEl = post.querySelector('.nick');
                const dateEl = post.querySelector('.time');
                
                if (titleEl) {
                    const href = titleEl.getAttribute('href');
                    postList.push({
                        title: titleEl.textContent.trim(),
                        author: authorEl?.textContent.trim() || '작성자',
                        date: dateEl?.textContent.trim() || '',
                        href: href
                    });
                }
            }
            
            return postList;
        });
        
        console.log(`✅ ${posts.length}개 게시글 발견`);
        
        // 각 게시글 상세 내용 수집
        for (const post of posts) {
            try {
                console.log(`📄 수집 중: ${post.title}`);
                
                const articleUrl = `https://m.cafe.naver.com${post.href}`;
                await page.goto(articleUrl, { waitUntil: 'networkidle' });
                await randomDelay(1500, 2500);
                
                // 모바일 게시글 내용 추출
                const content = await page.evaluate(() => {
                    const contentEl = document.querySelector('.post_cont, .se-main-container, #postContent');
                    return contentEl ? contentEl.innerHTML : '';
                });
                
                results.push({
                    cafe_name: cafeConfig.cafeName,
                    board_name: `게시판${cafeConfig.menuId}`,
                    title: post.title,
                    content_html: content,
                    author: post.author,
                    created_at: new Date().toISOString(), // 날짜 파싱 필요
                    original_url: articleUrl.replace('m.cafe.naver.com', 'cafe.naver.com'),
                    status: 'pending'
                });
                
                await randomDelay();
                
            } catch (error) {
                console.error(`❌ 게시글 수집 실패: ${error.message}`);
            }
        }
        
    } catch (error) {
        console.error(`❌ ${cafeConfig.cafeName} 크롤링 실패:`, error.message);
    }
    
    return results;
}

// 메인 함수
export async function crawlMobileCafes() {
    console.log('📱 네이버 카페 모바일 크롤링 시작');
    console.log('📱 모바일 버전으로 봇 감지 회피 시도');
    
    const browser = await chromium.launch({
        headless: HEADLESS,
        args: [
            '--no-sandbox',
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage'
        ]
    });
    
    const allResults = [];
    
    try {
        // 모바일 디바이스 에뮬레이션
        const context = await browser.newContext({
            ...chromium.devices['iPhone 13'],
            locale: 'ko-KR',
            timezoneId: 'Asia/Seoul'
        });
        
        const page = await context.newPage();
        
        // 로그인 시도
        if (NAVER_ID && NAVER_PASSWORD) {
            const loginSuccess = await mobileLogin(page);
            if (!loginSuccess) {
                console.log('⚠️  로그인 실패, 공개 게시글만 크롤링합니다.');
            }
        }
        
        // 각 카페 크롤링
        for (const [cafeName, cafeConfig] of Object.entries(CAFE_CONFIG)) {
            console.log(`\n📱 ${cafeName} 크롤링 시작`);
            
            const posts = await crawlMobileCafe(page, cafeConfig);
            allResults.push(...posts);
            
            console.log(`✅ ${cafeName}: ${posts.length}개 수집 완료`);
            await randomDelay(3000, 5000);
        }
        
        // Supabase에 저장
        if (allResults.length > 0) {
            console.log(`\n💾 총 ${allResults.length}개 게시글 저장 중...`);
            
            const { error } = await supabase
                .from('naver_cafe_posts')
                .insert(allResults);
            
            if (error) {
                console.error('❌ DB 저장 실패:', error.message);
            } else {
                console.log('✅ DB 저장 완료');
            }
        }
        
    } catch (error) {
        console.error('❌ 크롤링 중 오류:', error.message);
    } finally {
        await browser.close();
    }
    
    console.log(`\n✅ 크롤링 완료! 총 ${allResults.length}개의 새 게시글 처리`);
    return allResults;
}

// 직접 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    crawlMobileCafes()
        .then(() => process.exit(0))
        .catch(error => {
            console.error(error);
            process.exit(1);
        });
}