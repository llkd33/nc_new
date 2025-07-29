import { createClient } from '@supabase/supabase-js';
import puppeteer from 'puppeteer';
import crypto from 'crypto';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const TARGET_CAFES = [
    { 
        cafeName: '부동산스터디', 
        cafeUrl: 'https://cafe.naver.com/jaegebal',
        boardUrl: 'https://cafe.naver.com/ArticleList.nhn?search.clubid=10322296&search.menuid=334&search.boardtype=L'
    },
    {
        cafeName: '부린이집',
        cafeUrl: 'https://cafe.naver.com/burini',
        boardUrl: 'https://cafe.naver.com/ArticleList.nhn?search.clubid=29738397&search.menuid=12&search.boardtype=L'
    }
];

async function crawlNaverCafe(cafeInfo, limit = 5) {
    const browser = await puppeteer.launch({
        headless: true,
        args: [
            '--no-sandbox', 
            '--disable-setuid-sandbox',
            '--disable-dev-shm-usage',
            '--disable-gpu'
        ]
    });

    try {
        const page = await browser.newPage();
        await page.setViewport({ width: 1920, height: 1080 });
        
        await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36');
        
        await page.goto(cafeInfo.boardUrl, { 
            waitUntil: 'networkidle2',
            timeout: 30000 
        });

        await page.waitForSelector('iframe#cafe_main', { timeout: 10000 });
        
        const frame = page.frames().find(f => f.name() === 'cafe_main');
        if (!frame) throw new Error('메인 프레임을 찾을 수 없습니다');

        await frame.waitForSelector('.article-board', { timeout: 10000 });

        const posts = await frame.evaluate((limit) => {
            const articles = document.querySelectorAll('.article-board .td_article');
            const results = [];
            
            for (let i = 0; i < Math.min(articles.length, limit); i++) {
                const article = articles[i];
                const titleElement = article.querySelector('.article');
                const authorElement = article.querySelector('.p-nick a');
                const dateElement = article.querySelector('.td_date');
                
                if (titleElement && authorElement && dateElement) {
                    const href = titleElement.getAttribute('href');
                    const articleId = href.match(/articleid=(\d+)/)?.[1];
                    
                    results.push({
                        title: titleElement.textContent.trim(),
                        author: authorElement.textContent.trim(),
                        date: dateElement.textContent.trim(),
                        articleId: articleId,
                        href: href
                    });
                }
            }
            
            return results;
        }, limit);

        const crawledPosts = [];
        
        for (const post of posts) {
            const articleUrl = `https://cafe.naver.com${post.href}`;
            
            await page.goto(articleUrl, { waitUntil: 'networkidle2' });
            await page.waitForSelector('iframe#cafe_main', { timeout: 10000 });
            
            const contentFrame = page.frames().find(f => f.name() === 'cafe_main');
            if (!contentFrame) continue;

            try {
                await contentFrame.waitForSelector('.se-main-container, .ContentRenderer', { timeout: 5000 });
                
                const content = await contentFrame.evaluate(() => {
                    const contentElement = document.querySelector('.se-main-container') || 
                                         document.querySelector('.ContentRenderer') ||
                                         document.querySelector('#tbody');
                    
                    if (contentElement) {
                        const images = contentElement.querySelectorAll('img');
                        images.forEach(img => {
                            if (img.src && !img.src.startsWith('http')) {
                                img.src = 'https://cafe.naver.com' + img.src;
                            }
                        });
                        
                        return contentElement.innerHTML;
                    }
                    return '';
                });

                const dateObj = parseKoreanDate(post.date);
                
                crawledPosts.push({
                    cafe_name: cafeInfo.cafeName,
                    board_name: '자유게시판',
                    title: post.title,
                    author: post.author,
                    created_at: dateObj.toISOString(),
                    content_html: content,
                    original_url: articleUrl
                });
                
            } catch (error) {
                console.error(`게시글 내용 크롤링 실패: ${post.title}`, error);
            }
            
            await new Promise(resolve => setTimeout(resolve, 1000 + Math.random() * 2000));
        }

        return crawledPosts;
        
    } finally {
        await browser.close();
    }
}

function parseKoreanDate(dateStr) {
    const now = new Date();
    
    if (dateStr.includes(':')) {
        const [hours, minutes] = dateStr.split(':').map(Number);
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }
    
    if (dateStr.includes('.')) {
        const parts = dateStr.split('.');
        if (parts.length === 2) {
            const [month, day] = parts.map(Number);
            const date = new Date(now.getFullYear(), month - 1, day);
            if (date > now) {
                date.setFullYear(date.getFullYear() - 1);
            }
            return date;
        } else if (parts.length === 3) {
            const [year, month, day] = parts.map(Number);
            return new Date(2000 + year, month - 1, day);
        }
    }
    
    return now;
}

async function saveToSupabase(posts) {
    try {
        const existingUrls = posts.map(p => p.original_url);
        const { data: existing } = await supabase
            .from('naver_cafe_posts')
            .select('original_url')
            .in('original_url', existingUrls);
        
        const existingUrlSet = new Set(existing?.map(e => e.original_url) || []);
        const newPosts = posts.filter(p => !existingUrlSet.has(p.original_url));
        
        if (newPosts.length === 0) {
            console.log('새로운 게시글이 없습니다.');
            return [];
        }
        
        const { data, error } = await supabase
            .from('naver_cafe_posts')
            .insert(newPosts)
            .select();
            
        if (error) throw error;
        
        console.log(`${data.length}개의 새 게시글이 저장되었습니다.`);
        
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
            } catch (webhookError) {
                console.error('Make.com Webhook 호출 실패:', webhookError);
            }
        }
        
        return data;
        
    } catch (error) {
        console.error('Supabase 저장 오류:', error);
        throw error;
    }
}

export async function crawlAllCafes() {
    const allResults = [];
    
    for (const cafeInfo of TARGET_CAFES) {
        console.log(`크롤링 시작: ${cafeInfo.cafeName}`);
        
        try {
            const posts = await crawlNaverCafe(cafeInfo);
            const saved = await saveToSupabase(posts);
            allResults.push(...saved);
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error(`${cafeInfo.cafeName} 크롤링 실패:`, error);
        }
    }
    
    return allResults;
}

if (import.meta.url === `file://${process.argv[1]}`) {
    crawlAllCafes()
        .then(results => {
            console.log(`총 ${results.length}개의 게시글이 처리되었습니다.`);
            process.exit(0);
        })
        .catch(error => {
            console.error('크롤링 중 오류 발생:', error);
            process.exit(1);
        });
}