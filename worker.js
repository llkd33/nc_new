export default {
  async fetch(request, env) {
    // CORS 헤더
    const headers = {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers });
    }

    if (request.method === 'POST' && request.url.includes('/api/post-to-naver')) {
      try {
        // Supabase에서 pending 게시글 조회
        const supabaseResponse = await fetch(
          `${env.SUPABASE_URL}/rest/v1/naver_cafe_posts?status=eq.pending&order=created_at_server.asc&limit=1`,
          {
            headers: {
              'apikey': env.SUPABASE_ANON_KEY,
              'Authorization': `Bearer ${env.SUPABASE_ANON_KEY}`
            }
          }
        );

        const posts = await supabaseResponse.json();
        
        if (!posts || posts.length === 0) {
          return new Response(JSON.stringify({
            success: false,
            message: '업로드할 게시글이 없습니다'
          }), { headers });
        }

        // 여기서 실제 네이버 카페 글쓰기는 별도 서버에서 처리
        // 또는 Puppeteer Cloud Function 호출
        
        return new Response(JSON.stringify({
          success: true,
          message: '처리 중',
          post: posts[0]
        }), { headers });

      } catch (error) {
        return new Response(JSON.stringify({
          success: false,
          error: error.message
        }), { status: 500, headers });
      }
    }

    return new Response(JSON.stringify({
      message: 'Naver Cafe API Worker'
    }), { headers });
  }
};