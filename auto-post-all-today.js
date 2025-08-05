import { chromium } from 'playwright';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

// 📌 환경변수: Supabase & Naver 로그인
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

const CAFE_INFO = {
  name: 'atohealing',
  clubId: '25447805',
  menuId: '5'
};

// 오늘 날짜 가져오기 (KST 기준)
function getTodayKST() {
  const now = new Date();
  const kstOffset = 9 * 60; // KST는 UTC+9
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const kstTime = new Date(utcTime + (kstOffset * 60000));
  
  return {
    start: new Date(kstTime.getFullYear(), kstTime.getMonth(), kstTime.getDate()),
    end: new Date(kstTime.getFullYear(), kstTime.getMonth(), kstTime.getDate() + 1)
  };
}

async function postAllTodayToNaverCafe() {
  const today = getTodayKST();
  
  // 오늘 크롤링한 pending 게시글 모두 조회
  console.log(`📅 오늘 날짜: ${today.start.toLocaleDateString('ko-KR')}`);
  const { data: posts, error } = await supabase
    .from('naver_cafe_posts')
    .select('*')
    .eq('status', 'pending')
    .gte('created_at', today.start.toISOString())
    .lt('created_at', today.end.toISOString())
    .order('created_at', { ascending: true });

  if (error || !posts || posts.length === 0) {
    console.log('ℹ️ 오늘 업로드할 게시글이 없습니다.');
    return;
  }

  console.log(`📋 총 ${posts.length}개의 게시글을 업로드합니다.`);

  const browser = await chromium.launch({
    headless: process.env.HEADLESS === 'true',
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  let successCount = 0;
  let failCount = 0;

  try {
    const context = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    });

    const page = await context.newPage();

    // 네이버 로그인 (한 번만)
    console.log('🔐 네이버 로그인...');
    await page.goto('https://nid.naver.com/nidlogin.login');
    await page.waitForSelector('#id', { state: 'visible' });

    await page.fill('#id', process.env.NAVER_ID);
    await page.fill('#pw', process.env.NAVER_PASSWORD);
    await page.click('.btn_login');

    await page.waitForNavigation({ waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);

    // 각 게시글 업로드
    for (const [index, post] of posts.entries()) {
      console.log(`\n📝 [${index + 1}/${posts.length}] ${post.title}`);
      
      try {
        // 글쓰기 페이지 이동
        const writeUrl = `https://cafe.naver.com/ArticleWrite.nhn?m=write&clubid=${CAFE_INFO.clubId}&menuid=${CAFE_INFO.menuId}`;
        await page.goto(writeUrl, { waitUntil: 'networkidle' });
        await page.waitForTimeout(3000);

        // iframe 찾기
        const cafeFrame = page
          .frames()
          .find((f) => f.name() === 'cafe_main' || f.url().includes('ArticleWrite'));

        if (!cafeFrame) {
          throw new Error('cafe_main iframe을 찾을 수 없습니다.');
        }

        // 제목 입력
        await cafeFrame.waitForSelector('input[name="subject"]', { timeout: 5000 });
        await cafeFrame.fill('input[name="subject"]', `[자동] ${post.title}`);

        // 이미지 URL 추출
        let imageUrls = [];
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
        if (post.image_urls && Array.isArray(post.image_urls)) {
          imageUrls = [...imageUrls, ...post.image_urls];
        }
        imageUrls = [...new Set(imageUrls)];

        // 본문 텍스트 추출
        const textContent = post.content_html
          .replace(/<img[^>]*>/g, '')
          .replace(/<[^>]*>/g, '')
          .replace(/&nbsp;/g, ' ')
          .replace(/\n\n+/g, '\n\n')
          .trim();

        // SmartEditor에 내용 및 이미지 입력
        const editorFrames = cafeFrame.childFrames();
        let contentEntered = false;

        if (editorFrames.length > 0) {
          try {
            const editorFrame = editorFrames[0];
            const body = await editorFrame.waitForSelector('body', { timeout: 3000 });
            await body.click();
            
            if (imageUrls.length > 0) {
              await editorFrame.evaluate((text, images) => {
                document.body.innerHTML = '';
                const paragraphs = text.split('\n\n').filter(p => p.trim());
                
                paragraphs.forEach((paragraph, index) => {
                  const p = document.createElement('p');
                  p.innerText = paragraph;
                  document.body.appendChild(p);
                  
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
                
                const insertedImageCount = Math.floor(paragraphs.length / 3);
                if (insertedImageCount < images.length) {
                  const remainingImages = images.slice(insertedImageCount);
                  const hr = document.createElement('hr');
                  hr.style.margin = '30px 0';
                  document.body.appendChild(hr);
                  
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
            } else {
              await editorFrame.keyboard.type(textContent);
            }
            contentEntered = true;
          } catch {
            console.log('⚠️ SmartEditor 입력 실패, textarea 시도');
          }
        }

        if (!contentEntered) {
          await cafeFrame.waitForSelector('textarea[name="content"]', { timeout: 3000 });
          let fallbackContent = textContent;
          if (imageUrls.length > 0) {
            fallbackContent += '\n\n--- 첨부 이미지 ---\n';
            imageUrls.forEach((url, idx) => {
              fallbackContent += `\n[이미지 ${idx + 1}] ${url}`;
            });
          }
          await cafeFrame.fill('textarea[name="content"]', fallbackContent);
        }

        // 등록 버튼 클릭
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
          throw new Error('등록 버튼을 찾을 수 없습니다.');
        }

        await page.waitForTimeout(3000);

        // Supabase 상태 업데이트
        await supabase
          .from('naver_cafe_posts')
          .update({
            status: 'uploaded',
            uploaded_at: new Date().toISOString()
          })
          .eq('id', post.id);

        console.log(`✅ 업로드 완료`);
        successCount++;

        // 다음 게시글까지 30초 대기 (서버 부하 방지)
        if (index < posts.length - 1) {
          console.log('⏳ 다음 게시글까지 30초 대기...');
          await page.waitForTimeout(30000);
        }

      } catch (err) {
        console.error(`❌ 업로드 실패: ${err.message}`);
        failCount++;

        // 실패시 Supabase status = error 처리
        await supabase
          .from('naver_cafe_posts')
          .update({ 
            status: 'error',
            error_message: err.message 
          })
          .eq('id', post.id);
      }
    }

  } catch (err) {
    console.error('❌ 전체 프로세스 오류:', err.message);
  } finally {
    await browser.close();
    
    // 최종 결과 출력
    console.log('\n📊 업로드 결과:');
    console.log(`✅ 성공: ${successCount}개`);
    console.log(`❌ 실패: ${failCount}개`);
    console.log(`📋 전체: ${posts.length}개`);
  }
}

console.log('🚀 네이버 카페 오늘자 게시글 일괄 업로드 시작');
console.log('📍 이미지 자동 첨부 기능 포함');
postAllTodayToNaverCafe().then(() => console.log('✅ 프로그램 종료'));