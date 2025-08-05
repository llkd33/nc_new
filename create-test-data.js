import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

async function createTestData() {
  console.log('🧪 테스트 데이터 생성 중...');

  // 오늘 날짜로 테스트 게시글 생성
  const testPosts = [
    {
      cafe_name: '테스트카페',
      board_name: '테스트게시판',
      title: '[테스트] GitHub Actions 테스트 게시글 1',
      content_html: '<p>이것은 GitHub Actions 테스트를 위한 첫 번째 게시글입니다.</p><p>자동 업로드가 잘 작동하는지 확인합니다.</p>',
      author: '테스트작성자',
      created_at: new Date().toISOString(),
      original_url: 'https://cafe.naver.com/test/1',
      status: 'pending'
    },
    {
      cafe_name: '테스트카페',
      board_name: '테스트게시판', 
      title: '[테스트] 이미지 포함 테스트 게시글 2',
      content_html: '<p>이미지가 포함된 테스트 게시글입니다.</p><img src="https://via.placeholder.com/600x400" alt="테스트 이미지"><p>이미지가 잘 업로드되는지 확인합니다.</p>',
      author: '테스트작성자',
      created_at: new Date().toISOString(),
      original_url: 'https://cafe.naver.com/test/2',
      status: 'pending',
      image_urls: ['https://via.placeholder.com/600x400']
    },
    {
      cafe_name: '테스트카페',
      board_name: '테스트게시판',
      title: '[테스트] 긴 내용 테스트 게시글 3',
      content_html: `<p>이것은 긴 내용을 테스트하기 위한 게시글입니다.</p>
        <p>여러 단락으로 구성되어 있습니다.</p>
        <p>첫 번째 단락입니다. 여기에는 일반적인 텍스트가 들어갑니다.</p>
        <p>두 번째 단락입니다. 조금 더 긴 내용을 포함하고 있습니다.</p>
        <p>세 번째 단락입니다. 이렇게 여러 단락이 있을 때도 잘 작동하는지 확인합니다.</p>
        <p>네 번째 단락입니다. 마지막으로 한 번 더 확인합니다.</p>`,
      author: '테스트작성자',
      created_at: new Date().toISOString(),
      original_url: 'https://cafe.naver.com/test/3',
      status: 'pending'
    }
  ];

  try {
    const { data, error } = await supabase
      .from('naver_cafe_posts')
      .insert(testPosts)
      .select();

    if (error) {
      console.error('❌ 에러:', error);
      return;
    }

    console.log('✅ 테스트 데이터 생성 완료!');
    console.log(`📋 생성된 게시글 수: ${data.length}`);
    data.forEach((post, index) => {
      console.log(`  ${index + 1}. ${post.title} (ID: ${post.id})`);
    });

  } catch (err) {
    console.error('❌ 오류 발생:', err.message);
  }
}

// 실행
createTestData();