# Make.com에서 Supabase → 네이버 카페 직접 업로드 시도

## 방법 1: HTTP Request 모듈 사용

### 1단계: Webhook 트리거
- 이미 설정됨

### 2단계: Supabase 조회
```
Module: Supabase - Search Rows
Table: naver_cafe_posts  
Filter: status = 'pending'
Limit: 1 (하나씩 처리)
```

### 3단계: 네이버 로그인 (HTTP Request)
```
URL: https://nid.naver.com/nidlogin.login
Method: POST
Body:
  id: [네이버 ID]
  pw: [네이버 PW]
Headers:
  Content-Type: application/x-www-form-urlencoded
```

### 4단계: 카페 글쓰기 (HTTP Request)
```
URL: https://cafe.naver.com/ArticleWrite.nhn
Method: POST
Headers:
  Cookie: {{3.cookies}}
  Content-Type: application/x-www-form-urlencoded
Body:
  clubid: [대상 카페 ID]
  menuid: [게시판 ID]
  subject: {{2.title}}
  content: {{2.content_html}}
```

### 5단계: Supabase 상태 업데이트
```
Module: Supabase - Update Row
Table: naver_cafe_posts
ID: {{2.id}}
Update: status = 'uploaded'
```

## 방법 2: Integromat/Zapier의 커스텀 앱

일부 서비스는 네이버 카페 통합을 제공합니다:
- Integromat (현 Make.com)의 커뮤니티 앱
- Zapier의 써드파티 통합

## 방법 3: 중간 API 서버 구축

### Supabase Edge Function 활용
```javascript
// supabase/functions/upload-to-naver/index.ts
import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { chromium } from "https://deno.land/x/puppeteer@16.2.0/mod.ts"

serve(async (req) => {
  const { postId } = await req.json()
  
  // Supabase에서 게시글 조회
  const { data: post } = await supabase
    .from('naver_cafe_posts')
    .select('*')
    .eq('id', postId)
    .single()
  
  // Puppeteer로 네이버 카페 업로드
  const browser = await chromium.launch()
  const page = await browser.newPage()
  
  // 로그인
  await page.goto('https://nid.naver.com/nidlogin.login')
  await page.type('#id', NAVER_ID)
  await page.type('#pw', NAVER_PW)
  await page.click('.btn_login')
  
  // 글쓰기
  await page.goto(`https://cafe.naver.com/${TARGET_CAFE}/write`)
  await page.type('[name="subject"]', post.title)
  await page.type('[name="content"]', post.content_html)
  await page.click('.btn_submit')
  
  // 상태 업데이트
  await supabase
    .from('naver_cafe_posts')
    .update({ status: 'uploaded' })
    .eq('id', postId)
  
  await browser.close()
  
  return new Response(JSON.stringify({ success: true }))
})
```

## 🎯 현실적인 추천 방법

### 1. Make.com + 알림 (가장 간단)
```
Supabase → Make.com → Slack/Email 알림 → 수동 업로드
```

### 2. 반자동화 (추천)
```
Supabase → Make.com → 클립보드 복사 스크립트 → 수동 붙여넣기
```

### 3. 완전 자동화 (복잡)
```
Supabase → Edge Function (Puppeteer) → 네이버 카페
```

## 📝 Make.com 시나리오 예시 (알림 방식)

1. **Webhook**: 크롤러 트리거
2. **Supabase**: pending 게시글 조회
3. **Slack**: 메시지 전송
   ```
   새 게시글: {{title}}
   내용: {{content_html}}
   원본: {{original_url}}
   
   [업로드하기] 버튼 → 네이버 카페 링크
   ```
4. **Supabase**: status를 'notified'로 변경

이 방법이 가장 안정적이고 실용적입니다!