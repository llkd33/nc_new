import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import dotenv from 'dotenv';
import fs from 'fs/promises';

dotenv.config();

// 환경변수
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;
const NAVER_ID = process.env.NAVER_ID;
const NAVER_PASSWORD = process.env.NAVER_PASSWORD;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 카페 설정 - 실제 작동하는 카페로 변경
const CAFE_CONFIG = {
    '부동산스터디': {
        clubId: '12730407',
        menuIds: ['84', '290', '100'],  // 여러 게시판
        cafeName: '부동산스터디',
        cafeUrl: 'https://cafe.naver.com/jaegebal'
    }
};

// 헬퍼 함수
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const randomDelay = () => delay(1000 + Math.random() * 2000);

function parseKoreanDate(dateStr) {
    const now = new Date();
    
    if (!dateStr) return now;
    
    // "5분전", "1시간전" 형식
    if (dateStr.includes('분전') || dateStr.includes('시간전')) {
        return now;
    }
    
    // "12:34" 형식 (오늘)
    if (dateStr.match(/^\d{1,2}:\d{2}$/)) {
        const [hours, minutes] = dateStr.split(':').map(Number);
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }
    
    // "01.23" 형식
    if (dateStr.match(/^\d{2}\.\d{2}$/)) {
        const [month, day] = dateStr.split('.').map(Number);
        return new Date(now.getFullYear(), month - 1, day);
    }
    
    return now;
}

// 쿠키 관리
async function saveCookies(page) {
    try {
        const cookies = await page.context().cookies();
        await fs.writeFile('naver_cookies.json', JSON.stringify(cookies, null, 2));
        console.log('✅ 쿠키 저장됨');
    } catch (error) {
        console.error('쿠키 저장 실패:', error);
    }
}

async function loadCookies(context) {
    try {
        const cookieData = await fs.readFile('naver_cookies.json', 'utf-8');
        const cookies = JSON.parse(cookieData);
        await context.addCookies(cookies);
        console.log('✅ 쿠키 로드됨');
        return true;
    } catch {
        return false;
    }
}

// 네이버 로그인
async function loginToNaver(page) {
    console.log('🔐 네이버 로그인 중...');
    
    await page.goto('https://nid.naver.com/nidlogin.login');
    await delay(2000);
    
    // 로봇이 아닙니다 체크
    await page.evaluate(() => {
        Object.defineProperty(navigator, 'webdriver', {
            get: () => false
        });
    });
    
    await page.fill('#id', NAVER_ID);
    await delay(500);
    await page.fill('#pw', NAVER_PASSWORD);
    await delay(500);
    
    await page.click('.btn_login');
    await page.waitForNavigation({ timeout: 30000 });
    
    const isLoggedIn = !page.url().includes('nidlogin');
    if (isLoggedIn) {
        console.log('✅ 로그인 성공');
        await saveCookies(page);
    }
    
    return isLoggedIn;
}

// 카페 크롤링 메인 함수
async function crawlCafe(page, cafeConfig) {
    const results = [];
    
    console.log(`\n📍 ${cafeConfig.cafeName} 크롤링 시작`);
    
    // 카페 메인 페이지 접속
    await page.goto(cafeConfig.cafeUrl);
    await delay(3000);
    
    // iframe 찾기
    const iframe = await page.$('iframe#cafe_main');
    if (!iframe) {
        console.error('iframe을 찾을 수 없습니다');
        return results;
    }
    
    const frame = await iframe.contentFrame();
    
    // 각 게시판 크롤링
    for (const menuId of cafeConfig.menuIds) {
        console.log(`\n📋 게시판 ${menuId} 크롤링...`);
        
        try {
            // 게시판으로 이동
            const menuLink = await frame.$(`a[href*="menuid=${menuId}"]`);
            if (menuLink) {
                await menuLink.click();
                await delay(3000);
            } else {
                // 직접 URL 이동
                await frame.goto(`/ArticleList.nhn?search.clubid=${cafeConfig.clubId}&search.menuid=${menuId}`);
                await delay(3000);
            }
            
            // 게시글 수집
            const posts = await frame.evaluate(() => {
                const rows = document.querySelectorAll('.article-board tbody tr');
                const results = [];
                
                for (let i = 0; i < Math.min(rows.length, 5); i++) {
                    const row = rows[i];
                    
                    // 공지사항 스킵
                    if (row.querySelector('.ico-list-notice')) continue;
                    
                    const titleEl = row.querySelector('.td_article .article');
                    const authorEl = row.querySelector('.td_name');
                    const dateEl = row.querySelector('.td_date');
                    
                    if (titleEl && authorEl && dateEl) {
                        // 작성자명 추출 (태그 안의 텍스트)
                        let author = authorEl.textContent.trim();
                        const authorLink = authorEl.querySelector('a');
                        if (authorLink) {
                            author = authorLink.textContent.trim();
                        }
                        
                        results.push({
                            title: titleEl.textContent.trim(),
                            author: author,
                            date: dateEl.textContent.trim(),
                            href: titleEl.getAttribute('href')
                        });
                    }
                }
                
                return results;
            });
            
            console.log(`✅ ${posts.length}개 게시글 발견`);
            
            // 각 게시글 상세 내용 수집
            for (const post of posts) {
                if (!post.href) continue;
                
                console.log(`📄 "${post.title}" 내용 수집 중...`);
                
                try {
                    await frame.goto(post.href);
                    await delay(2000);
                    
                    // 내용 추출
                    const content = await frame.evaluate(() => {
                        const selectors = [
                            '.se-main-container',
                            '.ContentRenderer',
                            '#tbody',
                            '.post_article',
                            '#postViewArea'
                        ];
                        
                        for (const selector of selectors) {
                            const el = document.querySelector(selector);
                            if (el) {
                                // 이미지 URL 절대경로 변환
                                el.querySelectorAll('img').forEach(img => {
                                    const src = img.getAttribute('src');
                                    if (src && !src.startsWith('http')) {
                                        img.setAttribute('src', 'https://cafe.naver.com' + src);
                                    }
                                });
                                return el.innerHTML;
                            }
                        }
                        
                        return document.body.innerHTML; // 최후의 수단
                    });
                    
                    results.push({
                        cafe_name: cafeConfig.cafeName,
                        board_name: `게시판${menuId}`,
                        title: post.title,
                        author: post.author,
                        created_at: parseKoreanDate(post.date).toISOString(),
                        content_html: content || '',
                        original_url: `${cafeConfig.cafeUrl}${post.href}`
                    });
                    
                    // 뒤로가기
                    await page.goBack();
                    await delay(1500);
                    
                } catch (error) {
                    console.error(`내용 수집 실패: ${error.message}`);
                }
                
                await randomDelay();
            }
            
        } catch (error) {
            console.error(`게시판 ${menuId} 크롤링 실패:`, error.message);
        }
    }
    
    return results;
}

// Supabase 저장
async function saveToSupabase(posts) {
    if (posts.length === 0) return [];
    
    try {
        // 중복 체크
        const urls = posts.map(p => p.original_url);
        const { data: existing } = await supabase
            .from('naver_cafe_posts')
            .select('original_url')
            .in('original_url', urls);
        
        const existingUrls = new Set(existing?.map(e => e.original_url) || []);
        const newPosts = posts.filter(p => !existingUrls.has(p.original_url));
        
        if (newPosts.length === 0) {
            console.log('💾 모든 게시글이 이미 저장되어 있습니다');
            return [];
        }
        
        const { data, error } = await supabase
            .from('naver_cafe_posts')
            .insert(newPosts)
            .select();
        
        if (error) throw error;
        
        console.log(`💾 ${data.length}개의 새 게시글 저장됨`);
        
        // Webhook 호출
        if (MAKE_WEBHOOK_URL && data.length > 0) {
            try {
                await fetch(MAKE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'new_posts',
                        count: data.length,
                        posts: data
                    })
                });
                console.log('🔔 Make.com Webhook 호출됨');
            } catch (error) {
                console.error('Webhook 오류:', error.message);
            }
        }
        
        return data;
        
    } catch (error) {
        console.error('💾 저장 오류:', error);
        return [];
    }
}

// 메인 실행 함수
async function main() {
    console.log('🚀 네이버 카페 크롤러 시작\n');
    
    if (!NAVER_ID || !NAVER_PASSWORD) {
        console.error('❌ 네이버 계정 정보가 없습니다');
        return;
    }
    
    const browser = await chromium.launch({
        headless: process.env.HEADLESS !== 'false',
        args: ['--disable-blink-features=AutomationControlled']
    });
    
    try {
        const context = await browser.newContext({
            userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        });
        
        const page = await context.newPage();
        
        // 쿠키 로드 또는 로그인
        const hasStoredCookies = await loadCookies(context);
        if (!hasStoredCookies) {
            const success = await loginToNaver(page);
            if (!success) {
                throw new Error('로그인 실패');
            }
        }
        
        // 각 카페 크롤링
        const allResults = [];
        
        for (const [name, config] of Object.entries(CAFE_CONFIG)) {
            const posts = await crawlCafe(page, config);
            allResults.push(...posts);
        }
        
        console.log(`\n📊 총 ${allResults.length}개 게시글 수집됨`);
        
        // Supabase 저장
        if (allResults.length > 0) {
            await saveToSupabase(allResults);
        }
        
    } catch (error) {
        console.error('❌ 오류:', error);
    } finally {
        await browser.close();
    }
    
    console.log('\n✅ 크롤링 완료!');
}

// 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}