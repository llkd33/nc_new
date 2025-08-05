import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// 📌 환경변수: Supabase & Naver 로그인
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const POST_ID = process.env.POST_ID; // Make.com → GitHub → 전달된 post_id
const CAFE_INFO = {
  name: 'atohealing',
  clubId: '25447805',
  menuId: '5'
};

async function postToNaverCafe() {
  let targetPost;
  
  if (POST_ID) {
    // POST_ID가 지정된 경우 해당 게시글 조회
    console.log(`📋 지정된 게시글 ID: ${POST_ID}`);
    const { data: post, error } = await supabase
      .from('naver_cafe_posts')
      .select('*')
      .eq('id', POST_ID)
      .single();
    
    if (error || !post) {
      console.error('❌ 지정된 게시글을 찾을 수 없습니다:', error?.message);
      return;
    }
    targetPost = post;
  } else {
    // POST_ID가 없으면 pending 상태의 첫 번째 게시글 조회
    console.log('🔍 pending 상태의 게시글을 찾는 중...');
    const { data: posts, error } = await supabase
      .from('naver_cafe_posts')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(1);
    
    if (error || !posts || posts.length === 0) {
      console.log('ℹ️ 업로드할 게시글이 없습니다.');
      return;
    }
    targetPost = posts[0];
  }

  const post = targetPost;

  console.log(`📋 업로드 시작: ${post.title}`);

  const browser = await chromium.launch({
    headless: false,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // 2. 네이버 로그인
    console.log('🔐 네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login');
    await page.waitForSelector('#id', { state: 'visible' });

    await page.fill('#id', process.env.NAVER_ID);
    await page.fill('#pw', process.env.NAVER_PASSWORD);
    await page.click('.btn_login');

    await page.waitForNavigation({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 3. 글쓰기 페이지 이동
    const writeUrl = `https://cafe.naver.com/ArticleWrite.nhn?m=write&clubid=${CAFE_INFO.clubId}&menuid=${CAFE_INFO.menuId}`;
    await page.goto(writeUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(3000);

    // 4. iframe 찾기
    const cafeFrame = page
      .frames()
      .find((f) => f.name() === 'cafe_main' || f.url().includes('ArticleWrite'));

    if (!cafeFrame) {
      console.error('❌ cafe_main iframe을 찾을 수 없습니다.');
      return;
    }

    // 5. 제목 입력
    await cafeFrame.waitForSelector('input[name="subject"]', { timeout: 5000 });
    await cafeFrame.fill('input[name="subject"]', `[자동] ${post.title}`);
    console.log('✅ 제목 입력 완료');

    // 6. 이미지 URL 추출 (content_html 또는 image_urls 필드에서)
    let imageUrls = [];
    
    // 방법 1: content_html에서 img 태그 추출
    if (post.content_html) {
      const imgMatches = post.content_html.match(/<img[^>]+src="([^">]+)"/g);
      if (imgMatches) {
        imageUrls = imgMatches
          .map(tag => {
            const match = tag.match(/src="([^">]+)"/);
            return match && match[1];
          })
          .filter(Boolean);
      }
    }
    
    // 방법 2: image_urls 필드가 있다면 그것도 추가
    if (post.image_urls && Array.isArray(post.image_urls)) {
      imageUrls = [...imageUrls, ...post.image_urls];
    }
    
    // 중복 제거
    imageUrls = [...new Set(imageUrls)];
    
    if (imageUrls.length > 0) {
      console.log(`🖼️ ${imageUrls.length}개의 이미지 발견`);
    }

    // 7. 본문 텍스트 추출 (이미지 태그 제외)
    const textContent = post.content_html
      .replace(/<img[^>]*>/g, '') // 이미지 태그 제거
      .replace(/<[^>]*>/g, '') // 나머지 HTML 태그 제거
      .replace(/&nbsp;/g, ' ')
      .replace(/\n\n+/g, '\n\n')
      .trim();

    // 8. SmartEditor에 내용 및 이미지 입력
    const editorFrames = cafeFrame.childFrames();
    let contentEntered = false;

    if (editorFrames.length > 0) {
      try {
        const editorFrame = editorFrames[0];
        const body = await editorFrame.waitForSelector('body', { timeout: 3000 });
        await body.click();
        
        // 텍스트와 이미지를 혼합하여 입력
        if (imageUrls.length > 0) {
          console.log('🖋️ 텍스트와 이미지 혼합 입력 시작');
          
          // DOM 조작으로 내용 삽입
          await editorFrame.evaluate((text, images) => {
            // 기존 내용 초기화
            document.body.innerHTML = '';
            
            // 텍스트를 단락별로 분리
            const paragraphs = text.split('\n\n').filter(p => p.trim());
            
            // 텍스트와 이미지를 적절히 배치
            paragraphs.forEach((paragraph, index) => {
              // 텍스트 단락 추가
              const p = document.createElement('p');
              p.innerText = paragraph;
              document.body.appendChild(p);
              
              // 2-3개 단락마다 이미지 삽입 (이미지가 있다면)
              if (images.length > 0 && (index + 1) % 3 === 0) {
                const imageIndex = Math.floor((index + 1) / 3 - 1);
                if (imageIndex < images.length) {
                  const img = document.createElement('img');
                  img.src = images[imageIndex];
                  img.style.maxWidth = '100%';
                  img.style.height = 'auto';
                  img.style.display = 'block';
                  img.style.margin = '20px auto';
                  
                  const imgWrapper = document.createElement('div');
                  imgWrapper.style.textAlign = 'center';
                  imgWrapper.appendChild(img);
                  document.body.appendChild(imgWrapper);
                }
              }
            });
            
            // 남은 이미지들을 마지막에 추가
            const insertedImageCount = Math.floor(paragraphs.length / 3);
            if (insertedImageCount < images.length) {
              const remainingImages = images.slice(insertedImageCount);
              
              // 구분선 추가
              const hr = document.createElement('hr');
              hr.style.margin = '30px 0';
              document.body.appendChild(hr);
              
              // 이미지 갤러리 스타일로 추가
              remainingImages.forEach(imageUrl => {
                const img = document.createElement('img');
                img.src = imageUrl;
                img.style.maxWidth = '100%';
                img.style.height = 'auto';
                img.style.display = 'block';
                img.style.margin = '15px auto';
                
                const imgWrapper = document.createElement('div');
                imgWrapper.style.textAlign = 'center';
                imgWrapper.appendChild(img);
                document.body.appendChild(imgWrapper);
              });
            }
            
          }, textContent, imageUrls);
          
          console.log('✅ SmartEditor 내용 및 이미지 입력 완료');
        } else {
          // 이미지가 없으면 텍스트만 입력
          console.log('🖋️ 텍스트 입력 시작');
          await editorFrame.keyboard.type(textContent);
          console.log('✅ SmartEditor 텍스트 입력 완료');
        }
        
        contentEntered = true;
      } catch (e) {
        console.log('⚠️ SmartEditor 입력 실패, textarea 시도:', e.message);
      }
    }

    // 9. SmartEditor 실패 시 textarea 폴백 (텍스트만)
    if (!contentEntered) {
      try {
        await cafeFrame.waitForSelector('textarea[name="content"]', { timeout: 3000 });
        
        // textarea에는 텍스트만 입력 (이미지 URL은 텍스트로 추가)
        let fallbackContent = textContent;
        if (imageUrls.length > 0) {
          fallbackContent += '\n\n--- 첨부 이미지 ---\n';
          imageUrls.forEach((url, idx) => {
            fallbackContent += `\n[이미지 ${idx + 1}] ${url}`;
          });
        }
        
        await cafeFrame.fill('textarea[name="content"]', fallbackContent);
        console.log('✅ textarea 내용 입력 완료 (폴백 모드)');
      } catch (e) {
        console.error('❌ 내용 입력 실패:', e.message);
        return;
      }
    }

    // 10. 등록 버튼 클릭
    console.log('등록 버튼 찾는 중...');
    await page.waitForTimeout(1000);

    const buttonClicked = await cafeFrame.evaluate(() => {
      const buttons = document.querySelectorAll('a, button');
      for (const btn of buttons) {
        if (btn.textContent.includes('등록') || btn.textContent.includes('확인')) {
          btn.click();
          return true;
        }
      }
      return false;
    });

    if (!buttonClicked) {
      console.error('❌ 등록 버튼을 찾을 수 없습니다.');
      return;
    }

    await page.waitForTimeout(3000);

    // 11. Supabase 상태 업데이트
    await supabase
      .from('naver_cafe_posts')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString()
      })
      .eq('id', POST_ID);

    console.log('✅ 게시글 업로드 완료');
    
    if (imageUrls.length > 0) {
      console.log(`📸 업로드된 이미지 수: ${imageUrls.length}`);
    }

  } catch (err) {
    console.error('❌ 오류 발생:', err.message);

    // 실패시 Supabase status = error 처리
    await supabase
      .from('naver_cafe_posts')
      .update({ 
        status: 'error',
        error_message: err.message 
      })
      .eq('id', POST_ID);
  } finally {
    await browser.close();
  }
}

console.log('🚀 네이버 카페 자동 업로드 시작');
console.log('📍 이미지 자동 첨부 기능 포함');
postToNaverCafe().then(() => console.log('✅ 프로그램 종료'));