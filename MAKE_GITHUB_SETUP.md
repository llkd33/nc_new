# Make.com → GitHub Actions 연동 가이드

## 전체 플로우
```
크롤링 → Supabase 저장 → Make.com 웹훅 → GitHub Actions 트리거 → 네이버 카페 포스팅
```

## 1단계: GitHub Personal Access Token 생성

1. GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. "Generate new token" 클릭
3. 설정:
   - Note: `Make.com Integration`
   - Expiration: 90 days (또는 원하는 기간)
   - Scopes: 
     - ✅ `repo` (전체 선택)
     - ✅ `workflow`
4. "Generate token" 클릭
5. **토큰 복사** (한 번만 표시됨!)

## 2단계: Make.com 시나리오 설정

### 모듈 1: Webhook (이미 있음)
- URL: `https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g`

### 모듈 2: Supabase - Search Rows
```
Table: naver_cafe_posts
Filter: status=eq.pending
Order: created_at_server.asc
Limit: 1
```

### 모듈 3: Router
- Route 1: `{{2.id}} Exists` (게시글 있음)
- Route 2: `{{2.id}} Does not exist` (게시글 없음)

### 모듈 4: HTTP Request - GitHub Actions 트리거
**Route 1에 연결**

1. **설정**:
   ```
   URL: https://api.github.com/repos/llkd33/nc_new/actions/workflows/auto-post.yml/dispatches
   
   Method: POST
   
   Headers:
     Accept: application/vnd.github+json
     Authorization: Bearer YOUR_GITHUB_TOKEN
     X-GitHub-Api-Version: 2022-11-28
   
   Body Type: JSON (application/json)
   
   Request Content:
   {
     "ref": "main",
     "inputs": {
       "post_id": "{{2.id}}",
       "post_title": "{{2.title}}"
     }
   }
   ```

2. **GitHub Token 설정**:
   - Headers의 Authorization에서 `YOUR_GITHUB_TOKEN`을 실제 토큰으로 교체
   - 예: `Bearer ghp_xxxxxxxxxxxxx`

### 모듈 5: Supabase - Update Row (선택사항)
```
Table: naver_cafe_posts
ID: {{2.id}}
Values:
  status: processing
  updated_at: {{now}}
```

## 3단계: GitHub Actions 워크플로우 수정 (완료)

`auto-post.yml` 파일에 입력 파라미터가 이미 추가되었습니다.

## 4단계: Make.com 시나리오 테스트

### 테스트 순서:
1. Make.com 시나리오 저장 및 활성화 (ON)
2. 웹훅 테스트:
   ```bash
   node make-webhook-test.js
   ```
3. Make.com에서 실행 확인
4. GitHub Actions 탭에서 워크플로우 실행 확인

## 5단계: Error Handler 추가

### HTTP Request 실패 시:
1. HTTP Request 모듈 우클릭 → "Add error handler"
2. **Webhook Response** 모듈 추가:
   ```json
   {
     "status": "error",
     "message": "GitHub Actions 트리거 실패",
     "error": "{{5.error.message}}"
   }
   ```

## 전체 시나리오 흐름도

```
[Webhook] 
    ↓
[Supabase: Search pending posts]
    ↓
[Router: 게시글 있음?]
    ├─ Yes → [HTTP: GitHub Actions 트리거] → [Success]
    └─ No → [End]
```

## 모니터링

### Make.com:
- Execution history에서 각 실행 확인
- 에러 발생 시 상세 로그 확인

### GitHub Actions:
- Actions 탭에서 실행 상태 확인
- workflow_dispatch 이벤트로 트리거됨

### Supabase:
```sql
-- 처리 중인 게시글
SELECT * FROM naver_cafe_posts 
WHERE status = 'processing';

-- 최근 업로드된 게시글
SELECT * FROM naver_cafe_posts 
WHERE status = 'uploaded' 
ORDER BY uploaded_at DESC 
LIMIT 5;
```

## 주의사항

1. **GitHub Token 보안**:
   - Make.com에 토큰 저장 시 안전하게 관리
   - 토큰 만료 전 갱신 필요

2. **Rate Limits**:
   - GitHub API: 시간당 5,000 요청
   - 충분하지만 과도한 호출 주의

3. **동시 실행 방지**:
   - GitHub Actions는 동시 실행 제한 가능
   - concurrency 설정 추가 가능

## 트러블슈팅

### "Not Found" 에러:
- 저장소 이름 확인 (llkd33/nc_new)
- workflow 파일명 확인 (auto-post.yml)
- 토큰 권한 확인 (workflow scope)

### "Bad credentials" 에러:
- GitHub 토큰 재확인
- Bearer 뒤에 공백 있는지 확인
- 토큰 만료 여부 확인

### 워크플로우 실행 안됨:
- GitHub Actions 활성화 여부 확인
- main 브랜치에 push 되었는지 확인
- workflow_dispatch 권한 확인