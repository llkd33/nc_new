import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

// 글을 올릴 내 카페 정보
const MY_CAFE = {
    url: 'https://cafe.naver.com/YOUR_CAFE_ID', // 여기에 내 카페 ID
    menuId: 'YOUR_MENU_ID' // 게시판 ID
};

async function postToNaverCafe(postData) {
    const browser = await chromium.launch({ 
        headless: false // 디버깅을 위해 브라우저 표시
    });
    
    try {
        const page = await browser.newPage();
        
        // 1. 네이버 로그인
        console.log('🔐 네이버 로그인...');
        await page.goto('https://nid.naver.com/nidlogin.login');
        await page.evaluate(({ id, pw }) => {
            document.getElementsByName('id')[0].value = id;
            document.getElementsByName('pw')[0].value = pw;
        }, { id: process.env.NAVER_ID, pw: process.env.NAVER_PASSWORD });
        
        await page.click('#log\\.login');
        await page.waitForNavigation();
        
        // 2. 내 카페로 이동
        console.log('📝 카페 글쓰기 페이지로 이동...');
        await page.goto(MY_CAFE.url);
        await page.waitForTimeout(2000);
        
        // 3. iframe 찾기
        const frame = await page.frame('cafe_main');
        if (!frame) throw new Error('카페 iframe을 찾을 수 없습니다');
        
        // 4. 글쓰기 버튼 클릭
        const writeUrl = `/ArticleWrite.nhn?m=write&clubid=${MY_CAFE.clubId}&menuid=${MY_CAFE.menuId}`;
        await frame.goto(writeUrl);
        await frame.waitForTimeout(2000);
        
        // 5. 제목 입력
        console.log('✏️ 게시글 작성 중...');
        await frame.fill('input[name="subject"]', postData.title);
        
        // 6. 내용 입력 (에디터 타입에 따라 다름)
        // SmartEditor 2.0
        const editorFrame = frame.childFrames()[0];
        if (editorFrame) {
            await editorFrame.click('body');
            await editorFrame.type('body', postData.content);
        } else {
            // 일반 textarea
            await frame.fill('textarea[name="content"]', postData.content);
        }
        
        // 7. 등록 버튼 클릭
        await frame.click('.btn_write');
        await page.waitForTimeout(3000);
        
        console.log('✅ 게시글 작성 완료!');
        
        // 8. Supabase 상태 업데이트
        await supabase
            .from('naver_cafe_posts')
            .update({ status: 'uploaded' })
            .eq('id', postData.id);
            
        return true;
        
    } catch (error) {
        console.error('❌ 글쓰기 실패:', error);
        return false;
    } finally {
        await browser.close();
    }
}

// 대기 중인 게시글 가져와서 업로드
async function uploadPendingPosts() {
    // pending 게시글 조회
    const { data: posts } = await supabase
        .from('naver_cafe_posts')
        .select('*')
        .eq('status', 'pending')
        .limit(1);
    
    if (!posts || posts.length === 0) {
        console.log('업로드할 게시글이 없습니다.');
        return;
    }
    
    for (const post of posts) {
        console.log(`\n📋 업로드 시작: ${post.title}`);
        
        const postData = {
            id: post.id,
            title: `[자동] ${post.title}`,
            content: post.content_html
        };
        
        const success = await postToNaverCafe(postData);
        
        if (success) {
            console.log('✅ 업로드 성공');
        } else {
            console.log('❌ 업로드 실패');
            
            // 실패 상태 업데이트
            await supabase
                .from('naver_cafe_posts')
                .update({ status: 'failed' })
                .eq('id', post.id);
        }
        
        // 다음 게시글 전에 대기
        await new Promise(resolve => setTimeout(resolve, 5000));
    }
}

// 실행
if (import.meta.url === `file://${process.argv[1]}`) {
    uploadPendingPosts()
        .then(() => console.log('\n✅ 모든 작업 완료'))
        .catch(console.error);
}