# Make.com 시나리오 완전 설정 가이드

## 🎯 목표
크롤링된 게시글이 Supabase에 저장되면 → Make.com이 감지 → GitHub Actions 실행 → 네이버 카페에 자동 포스팅

## 📋 준비물
- ✅ Supabase 계정 및 프로젝트
- ✅ Make.com 계정
- ✅ GitHub Personal Access Token: (GitHub에서 생성 필요)
- ✅ Webhook URL: `https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g`

---

## 🔧 단계별 설정

### 1단계: Make.com 로그인 및 시나리오 생성

1. https://www.make.com 로그인
2. **"Create a new scenario"** 클릭
3. 시나리오 이름: `Naver Cafe Auto Posting`

### 2단계: Webhook 모듈 설정 (트리거)

1. **"+"** 버튼 클릭
2. **"Webhooks"** 검색 → **"Custom webhook"** 선택
3. **"Add"** 클릭하여 새 webhook 생성
4. Webhook name: `Naver Cafe Trigger`
5. **"Save"** → 생성된 URL 확인
   - 기존 URL 사용: `https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g`
6. **"OK"** 클릭

### 3단계: Supabase 연결 설정

1. Webhook 모듈 옆 **"+"** 클릭
2. **"Supabase"** 검색 → **"Search Rows"** 선택
3. **Connection 생성**:
   - **"Add"** 클릭
   - Connection name: `Naver Cafe DB`
   - Supabase URL: `https://cbcftfkiosikuofmvwus.supabase.co`
   - Supabase API Key: (아래 중 하나 사용)
     ```
     Service Role Key (권장):
     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiY2Z0Zmtpb3Npa3VvZm12d3VzIiwicm9sZSI6InNlcnZpY2UfY...
     
     또는 Anon Key:
     eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiY2Z0Zmtpb3Npa3VvZm12d3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNDI3NTgsImV4cCI6MjA2ODgxODc1OH0.ol5b8z9JRZBKLpAjaNGDMzxVbFbBV0pzd9AKsoYlxw4
     ```
   - **"Save"** 클릭

4. **Supabase 모듈 설정**:
   - Table: `naver_cafe_posts`
   - Select: `*` (모든 컬럼)
   - Filter: 
     ```
     Column: status
     Operator: eq
     Value: pending
     ```
   - Order:
     ```
     Column: created_at_server
     Direction: Ascending
     ```
   - Range:
     ```
     Offset: 0
     Limit: 1
     ```
   - **"OK"** 클릭

### 4단계: Router 모듈 추가 (조건 분기)

1. Supabase 모듈 옆 **"+"** 클릭
2. **"Flow control"** → **"Router"** 선택
3. 두 개의 경로가 생성됨

#### Route 1 설정 (게시글 있음):
1. 첫 번째 경로 클릭
2. **"Set up a filter"** 클릭
3. Label: `Has Posts`
4. Condition:
   - Field: `2.id` (Supabase 결과의 id)
   - Operator: `Exists`
5. **"OK"** 클릭

#### Route 2 설정 (게시글 없음):
1. 두 번째 경로 클릭
2. **"Set up a filter"** 클릭
3. Label: `No Posts`
4. Condition:
   - Field: `2.id`
   - Operator: `Does not exist`
5. **"OK"** 클릭

### 5단계: HTTP Request 모듈 추가 (GitHub Actions 트리거)

1. **Route 1 (Has Posts)** 경로에 **"+"** 클릭
2. **"HTTP"** 검색 → **"Make a request"** 선택
3. **설정 입력**:

   **URL**:
   ```
   https://api.github.com/repos/llkd33/nc_new/actions/workflows/auto-post.yml/dispatches
   ```

   **Method**: `POST`

   **Headers**:
   | Key | Value |
   |-----|-------|
   | Accept | application/vnd.github+json |
   | Authorization | Bearer YOUR_GITHUB_TOKEN |
   | X-GitHub-Api-Version | 2022-11-28 |

   **Body type**: `JSON (application/json)`

   **Request content**:
   ```json
   {
     "ref": "main",
     "inputs": {
       "post_id": "{{2.id}}",
       "post_title": "{{2.title}}"
     }
   }
   ```

4. **"OK"** 클릭

### 6단계: Supabase Update 모듈 추가 (상태 업데이트)

1. HTTP Request 모듈 옆 **"+"** 클릭
2. **"Supabase"** → **"Update a Row"** 선택
3. **설정**:
   - Connection: `Naver Cafe DB` (이미 생성한 연결)
   - Table: `naver_cafe_posts`
   - Row ID: `{{2.id}}`
   - Update fields:
     ```
     status: processing
     updated_at: {{now}}
     ```
4. **"OK"** 클릭

### 7단계: Error Handler 추가

1. **HTTP Request 모듈** 우클릭
2. **"Add error handler"** 선택
3. **"+"** 클릭 → **"Supabase"** → **"Update a Row"**
4. **설정**:
   - Table: `naver_cafe_posts`
   - Row ID: `{{2.id}}`
   - Update fields:
     ```
     status: failed
     error_message: GitHub Actions trigger failed - {{5.error.message}}
     ```
5. **"OK"** 클릭

### 8단계: 시나리오 활성화

1. 좌측 하단 **"SCHEDULING"** 토글 → **ON**
2. **"Save"** 버튼 클릭 (💾 아이콘)
3. **"Run once"** 클릭하여 테스트

---

## 🧪 테스트 방법

### 방법 1: 웹훅 테스트
```bash
node make-webhook-test.js
```

### 방법 2: 실제 크롤링 테스트
```bash
node crawler-optimized.js
```

### 방법 3: 수동 테스트
1. Make.com에서 **"Run once"** 클릭
2. 30초 내에 아래 명령 실행:
   ```bash
   curl -X POST https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g \
     -H "Content-Type: application/json" \
     -d '{"event": "test"}'
   ```

---

## 📊 모니터링

### Make.com에서 확인:
1. **History** 탭에서 실행 기록 확인
2. 각 모듈 클릭하여 입출력 데이터 확인
3. 에러 발생 시 빨간색으로 표시

### GitHub Actions에서 확인:
1. https://github.com/llkd33/nc_new/actions
2. workflow_dispatch로 트리거된 실행 확인

### Supabase에서 확인:
```sql
-- 처리 상태 확인
SELECT id, title, status, created_at_server, uploaded_at
FROM naver_cafe_posts
ORDER BY created_at_server DESC
LIMIT 10;
```

---

## ⚠️ 주의사항

1. **Webhook URL 보안**: 
   - URL이 노출되면 누구나 트리거 가능
   - 필요시 IP 화이트리스트 설정

2. **Rate Limiting**:
   - GitHub API: 시간당 5,000 요청
   - 너무 자주 실행하지 않도록 주의

3. **토큰 관리**:
   - GitHub 토큰 만료 전 갱신 필요
   - Make.com에 안전하게 저장

---

## 🔧 문제 해결

### "Webhook not found" 오류
- 웹훅 URL 확인
- 시나리오가 ON 상태인지 확인

### "No data" 오류
- Supabase에 pending 상태 게시글 있는지 확인
- Filter 조건 확인

### GitHub Actions 실행 안됨
- Actions 탭에서 활성화 여부 확인
- 토큰 권한 확인 (repo, workflow)

### 상태 업데이트 안됨
- Supabase 연결 확인
- Row ID 매핑 확인

---

## 🎉 완료!

이제 다음 플로우가 자동으로 작동합니다:
1. 크롤러 실행 → 새 게시글 저장
2. Supabase 트리거 → Make.com 웹훅 호출
3. Make.com → pending 게시글 조회
4. GitHub Actions 트리거 → auto-post.yml 실행
5. 네이버 카페에 자동 포스팅
6. Supabase 상태 업데이트