# Make.com 네이버 카페 자동 글쓰기 시나리오 설정

## 전체 구조
1. **Webhook** (트리거) → 2. **Supabase** (데이터 조회) → 3. **HTTP Request** (네이버 카페 글쓰기)

## 상세 설정 가이드

### 1️⃣ Webhook 모듈 (이미 설정됨)
- URL: `https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g`
- 크롤러가 새 게시글 저장 시 자동 트리거

### 2️⃣ Supabase - Search rows
1. **Connection**: Supabase 연결 생성
   - URL: `https://cbcftfkiosikuofmvwus.supabase.co`
   - Service Role Key: (env 파일의 SUPABASE_SERVICE_ROLE_KEY)

2. **설정**:
   - Table: `naver_cafe_posts`
   - Filter: 
     ```
     status=eq.pending
     ```
   - Order by: `created_at_server.asc`
   - Limit: `1`

### 3️⃣ Router (조건 분기)
- **Route 1**: 데이터가 있을 때 (게시글 작성)
  - Filter: `{{2.id}} exists`
- **Route 2**: 데이터가 없을 때 (종료)
  - Filter: `{{2.id}} does not exist`

### 4️⃣ HTTP Request - 네이버 카페 글쓰기
네이버 공식 API 대신 **Make.com의 Naver Cafe 커스텀 앱** 사용을 추천합니다.

#### 옵션 1: Custom HTTP Request (웹훅 방식)
1. **URL**: 
   ```
   https://cafe.naver.com/atohealing
   ```

2. **Method**: `POST`

3. **Headers**:
   ```json
   {
     "Content-Type": "application/x-www-form-urlencoded",
     "User-Agent": "Mozilla/5.0"
   }
   ```

4. **Body**: Form URL-encoded
   ```
   clubid=25447805
   menuid=5
   subject={{2.title}}
   content={{2.content_html}}
   ```

#### 옵션 2: Browser Automation (Integromat/Make 플러그인)
Make.com Marketplace에서 "Web Scraper" 또는 "Browser Automation" 모듈 검색

### 5️⃣ Supabase - Update a row
**성공 시 상태 업데이트**
- Table: `naver_cafe_posts`
- ID: `{{2.id}}`
- Values:
  ```json
  {
    "status": "uploaded",
    "uploaded_at": "{{now}}"
  }
  ```

### 6️⃣ Error Handler
**실패 시 처리**
- Module: Supabase - Update a row
- Table: `naver_cafe_posts`
- ID: `{{2.id}}`
- Values:
  ```json
  {
    "status": "failed",
    "error_message": "{{error.message}}"
  }
  ```

## 대안: Zapier 또는 n8n 사용

### Zapier 설정
1. **Trigger**: Webhooks by Zapier
2. **Action**: Custom Request (웹 스크래핑)
3. **Action**: PostgreSQL (Supabase 업데이트)

### n8n 설정 (오픈소스, 셀프호스팅 가능)
```json
{
  "nodes": [
    {
      "name": "Webhook",
      "type": "n8n-nodes-base.webhook",
      "position": [250, 300]
    },
    {
      "name": "Supabase",
      "type": "n8n-nodes-base.supabase",
      "position": [450, 300]
    },
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "position": [650, 300]
    }
  ]
}
```

## 권장 솔루션

네이버 카페는 로그인과 CSRF 토큰이 필요하므로, 다음 방법을 추천합니다:

1. **Playwright Cloud Functions** 사용
   - Vercel, Netlify Functions에 Playwright 배포
   - Make.com에서 HTTP Request로 호출

2. **자체 API 서버 구축**
   ```javascript
   // api-server.js
   app.post('/post-to-naver', async (req, res) => {
     const { title, content } = req.body;
     // Playwright로 글쓰기 로직
     res.json({ success: true });
   });
   ```

3. **정기 실행 스크립트**
   - cron job으로 5분마다 실행
   - Supabase에서 pending 게시글 확인
   - 자동으로 네이버 카페에 업로드

## 테스트 방법

1. 크롤러 실행하여 새 게시글 저장
2. Make.com 시나리오 수동 실행
3. Supabase에서 상태 변경 확인
4. 네이버 카페에서 게시글 확인

## 주의사항

- 네이버 카페 API는 공식적으로 글쓰기를 지원하지 않음
- 자동화 시 네이버 이용약관 확인 필요
- 과도한 자동 글쓰기는 계정 제재 가능성 있음