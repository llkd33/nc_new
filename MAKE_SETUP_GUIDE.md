# Make.com 자동 포스팅 설정 가이드

## 전체 플로우
```
크롤링 (GitHub Actions) → Supabase 저장 → Make.com 트리거 → 네이버 카페 포스팅
```

## Make.com 시나리오 설정 단계

### 1️⃣ 시나리오 생성
1. Make.com 로그인
2. "Create a new scenario" 클릭
3. 시나리오 이름: "Naver Cafe Auto Posting"

### 2️⃣ 모듈 1: Webhook (트리거)
**이미 설정된 웹훅 사용**
- Webhook URL: `https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g`
- 크롤러가 새 게시글 저장 시 자동 트리거

### 3️⃣ 모듈 2: Supabase - Search Rows
1. **"+" 클릭** → **Supabase** 검색 → **Search Rows** 선택

2. **Connection 생성**:
   - Connection name: "Naver Cafe DB"
   - URL: `https://cbcftfkiosikuofmvwus.supabase.co`
   - Service Role Key: `.env` 파일의 `SUPABASE_SERVICE_ROLE_KEY`
   - Save 클릭

3. **모듈 설정**:
   ```
   Table: naver_cafe_posts
   Select columns: *
   Filter: status=eq.pending
   Order: created_at_server.asc
   Range: 0-0 (첫 번째 레코드만)
   ```

### 4️⃣ 모듈 3: Router (조건 분기)
1. **"+" 클릭** → **Flow Control** → **Router**

2. **Route 1**: 데이터 있음
   - Label: "Has Posts"
   - Condition: `{{2.id}} Exists`

3. **Route 2**: 데이터 없음
   - Label: "No Posts"
   - Condition: `{{2.id}} Does not exist`

### 5️⃣ 모듈 4: HTTP Request (포스팅)
**Route 1에 연결**

#### 옵션 A: API 서버 사용 (권장)
1. **먼저 API 서버 배포** (Railway 추천)
   ```bash
   railway login
   railway init
   railway up
   ```

2. **HTTP Request 설정**:
   ```
   URL: https://your-app.railway.app/api/post-to-naver
   Method: POST
   Headers:
     Content-Type: application/json
   Body:
   {
     "postId": "{{2.id}}"
   }
   ```

#### 옵션 B: 직접 웹훅 (간단한 알림용)
```
URL: https://your-slack-webhook-or-discord
Method: POST
Body:
{
  "text": "새 게시글: {{2.title}}"
}
```

### 6️⃣ 모듈 5: Supabase - Update a Row
**HTTP Request 성공 후 연결**

1. **설정**:
   ```
   Table: naver_cafe_posts
   Row ID: {{2.id}}
   Column values:
     status: uploaded
     uploaded_at: {{now}}
   ```

### 7️⃣ Error Handler 설정
1. HTTP Request 모듈 우클릭
2. "Add error handler" 선택
3. **Supabase - Update a Row** 추가:
   ```
   Table: naver_cafe_posts
   Row ID: {{2.id}}
   Column values:
     status: failed
     error_message: {{4.error.message}}
   ```

## 실행 스케줄 설정

### 옵션 1: 즉시 실행 (권장)
- Webhook 트리거 시 바로 실행
- 크롤링 완료 즉시 포스팅 시도

### 옵션 2: 정기 실행
1. 시나리오 설정 → Schedule
2. 실행 시간 설정:
   - 오전 10시
   - 오후 3시
   - 오후 8시

## 테스트 방법

1. **수동 테스트**:
   ```bash
   curl -X POST https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g \
     -H "Content-Type: application/json" \
     -d '{"test": true}'
   ```

2. **실제 테스트**:
   - GitHub Actions에서 크롤러 수동 실행
   - Make.com 시나리오 실행 확인
   - Supabase 상태 변경 확인

## 대안: Make.com Custom App

### Puppeteer Cloud Function 생성
1. Vercel에 배포:
   ```javascript
   // api/post-to-naver.js
   export default async function handler(req, res) {
     // Playwright 로직
     res.json({ success: true });
   }
   ```

2. Make.com에서 HTTP Request로 호출

## 모니터링

### Make.com Dashboard
- 실행 히스토리 확인
- 에러 로그 확인
- 실행 통계

### Supabase Dashboard
```sql
-- 상태별 게시글 수
SELECT status, COUNT(*) 
FROM naver_cafe_posts 
GROUP BY status;

-- 최근 업로드
SELECT * FROM naver_cafe_posts 
WHERE status = 'uploaded' 
ORDER BY uploaded_at DESC 
LIMIT 10;
```

## 주의사항

1. **Rate Limiting**
   - 네이버 카페 과도한 요청 방지
   - 게시글 간 최소 5분 간격 권장

2. **에러 처리**
   - 로그인 실패
   - 네트워크 오류
   - 권한 문제

3. **보안**
   - API 서버는 HTTPS 사용
   - 환경변수로 인증 정보 관리

## 문제 해결

### "No posts found" 계속 발생
- Supabase에 pending 상태 게시글 있는지 확인
- Filter 조건 확인

### HTTP Request 실패
- API 서버 실행 중인지 확인
- URL 정확한지 확인
- 네트워크 연결 확인

### 상태 업데이트 안됨
- Supabase 연결 확인
- Row ID 매핑 확인
- 권한 확인