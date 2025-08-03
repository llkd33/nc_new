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
  if (!POST_ID) {
    console.log('❌ POST_ID 환경변수가 없습니다. 종료합니다.');
    return;
  }

  // 1. Supabase에서 해당 post_id의 게시글 조회
  const { data: post, error } = await supabase
    .from('naver_cafe_posts')
    .select('*')
    .eq('id', POST_ID)
    .single();

  if (error || !post) {
    console.error('❌ 게시글을 조회할 수 없습니다:', error?.message);
    return;
  }

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

    // 6. 본문 내용 입력
    const textContent = post.content_html
      .replace(/<[^>]*>/g, '') // HTML 태그 제거
      .replace(/&nbsp;/g, ' ')
      .replace(/\n\n+/g, '\n\n')
      .trim();

    const editorFrames = cafeFrame.childFrames();
    let contentEntered = false;

    if (editorFrames.length > 0) {
      try {
        const editorFrame = editorFrames[0];
        const body = await editorFrame.waitForSelector('body', { timeout: 3000 });
        await body.click();
        await editorFrame.keyboard.type(textContent);
        console.log('✅ SmartEditor 내용 입력 완료');
        contentEntered = true;
      } catch {
        console.log('⚠️ SmartEditor 입력 실패, textarea 시도');
      }
    }

    if (!contentEntered) {
      try {
        await cafeFrame.waitForSelector('textarea[name="content"]', { timeout: 3000 });
        await cafeFrame.fill('textarea[name="content"]', textContent);
        console.log('✅ textarea 내용 입력 완료');
      } catch (e) {
        console.error('❌ 내용 입력 실패:', e.message);
        return;
      }
    }

    // 7. 등록 버튼 클릭
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

    // 8. Supabase 상태 업데이트
    await supabase
      .from('naver_cafe_posts')
      .update({
        status: 'uploaded',
        uploaded_at: new Date().toISOString()
      })
      .eq('id', POST_ID);

    console.log('✅ 게시글 업로드 완료');

  } catch (err) {
    console.error('❌ 오류 발생:', err.message);

    // 실패시 Supabase status = error 처리
    await supabase
      .from('naver_cafe_posts')
      .update({ status: 'error' })
      .eq('id', POST_ID);
  } finally {
    await browser.close();
  }
}

console.log('🚀 네이버 카페 자동 업로드 시작');
postToNaverCafe().then(() => console.log('✅ 프로그램 종료'));