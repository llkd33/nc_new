import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const MAKE_WEBHOOK_URL = 'https://hook.us2.make.com/w7zro75042wqeqx1tjhens60lctne8si'

serve(async (req) => {
  try {
    // Supabase client 생성
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // pending 상태의 게시글 조회
    const { data: posts, error } = await supabase
      .from('naver_cafe_posts')
      .select('*')
      .eq('status', 'pending')
      .limit(5)
      .order('created_at', { ascending: true })

    if (error) throw error

    // 각 게시글을 Make.com으로 전송
    for (const post of posts || []) {
      const response = await fetch(MAKE_WEBHOOK_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(post),
      })

      if (response.ok) {
        // 전송 성공 시 상태 업데이트
        await supabase
          .from('naver_cafe_posts')
          .update({ status: 'processing' })
          .eq('id', post.id)
      }
    }

    return new Response(
      JSON.stringify({ 
        message: 'Processed posts', 
        count: posts?.length || 0 
      }),
      { headers: { "Content-Type": "application/json" } }
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    )
  }
})