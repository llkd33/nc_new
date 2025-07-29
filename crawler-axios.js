import { createClient } from '@supabase/supabase-js';
import axios from 'axios';
import * as cheerio from 'cheerio';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 네이버 카페 API 엔드포인트 사용
const TARGET_CAFES = [
    { 
        cafeName: '부동산스터디', 
        clubId: '10322296',
        menuId: '334'
    },
    {
        cafeName: '부린이집',
        clubId: '29738397',
        menuId: '12'
    }
];

async function fetchCafeArticles(cafeInfo, limit = 5) {
    try {
        // 네이버 카페 게시글 목록 API
        const listUrl = `https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/${cafeInfo.clubId}/menus/${cafeInfo.menuId}/articles`;
        
        const response = await axios.get(listUrl, {
            params: {
                query: '',
                page: 1,
                size: limit,
                sortBy: 0
            },
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                'Referer': 'https://cafe.naver.com'
            }
        });

        if (response.data && response.data.message && response.data.message.result) {
            const articles = response.data.message.result.articleList;
            const crawledPosts = [];

            for (const article of articles) {
                const articleUrl = `https://cafe.naver.com/ca-fe/cafes/${cafeInfo.clubId}/articles/${article.articleId}`;
                
                // 게시글 상세 내용 가져오기
                try {
                    const detailResponse = await axios.get(
                        `https://apis.naver.com/cafe-web/cafe-articleapi/v2/cafes/${cafeInfo.clubId}/articles/${article.articleId}`,
                        {
                            headers: {
                                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
                                'Referer': articleUrl
                            }
                        }
                    );

                    if (detailResponse.data && detailResponse.data.message && detailResponse.data.message.result) {
                        const detail = detailResponse.data.message.result.article;
                        
                        crawledPosts.push({
                            cafe_name: cafeInfo.cafeName,
                            board_name: article.menu.menuName || '게시판',
                            title: article.subject,
                            author: article.writer.nick,
                            created_at: new Date(article.writeDate).toISOString(),
                            content_html: detail.contentHtml || detail.content || '',
                            original_url: articleUrl
                        });
                    }
                } catch (detailError) {
                    console.error(`게시글 상세 조회 실패: ${article.subject}`, detailError.message);
                }

                // API 부하 방지를 위한 딜레이
                await new Promise(resolve => setTimeout(resolve, 1000));
            }

            return crawledPosts;
        }

        return [];

    } catch (error) {
        console.error(`카페 게시글 조회 실패: ${cafeInfo.cafeName}`, error.message);
        return [];
    }
}

async function saveToSupabase(posts) {
    try {
        if (posts.length === 0) {
            console.log('저장할 게시글이 없습니다.');
            return [];
        }

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
                console.log('Make.com Webhook 호출 성공');
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

async function crawlAllCafes() {
    const allResults = [];
    
    for (const cafeInfo of TARGET_CAFES) {
        console.log(`크롤링 시작: ${cafeInfo.cafeName}`);
        
        try {
            const posts = await fetchCafeArticles(cafeInfo);
            console.log(`${cafeInfo.cafeName}에서 ${posts.length}개 게시글 수집`);
            
            const saved = await saveToSupabase(posts);
            allResults.push(...saved);
            
            await new Promise(resolve => setTimeout(resolve, 3000));
            
        } catch (error) {
            console.error(`${cafeInfo.cafeName} 크롤링 실패:`, error);
        }
    }
    
    return allResults;
}

// 실행
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