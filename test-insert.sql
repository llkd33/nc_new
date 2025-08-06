INSERT INTO naver_cafe_posts (
  cafe_name, 
  board_name,
  title, 
  author, 
  content_html, 
  status, 
  original_url,
  created_at
) VALUES (
  '호텔라이프', 
  '자유게시판',
  '테스트 게시글', 
  '테스트 작성자', 
  '<p>테스트 내용입니다</p>', 
  'pending',
  'https://cafe.naver.com/hotellife/123456',
  NOW()
);
EOF < /dev/null