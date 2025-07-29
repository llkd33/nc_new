# Make.com 시나리오 시각적 가이드

## 전체 구조도
```
[1. Webhook] 
     ↓
[2. Supabase: Search Rows]
     ↓
[3. Router]
     ├─ Route 1: Has Posts → [4. HTTP: GitHub Actions] → [5. Supabase: Update Status]
     │                              ↓ (Error)
     │                        [6. Error Handler: Update Failed]
     └─ Route 2: No Posts → (End)
```

## 각 모듈별 세부 설정

### 1️⃣ Webhook
```
이름: Naver Cafe Trigger
URL: https://hook.us2.make.com/lkrfrcki4wr53cdjcudnfmvyqfaese7g
```

### 2️⃣ Supabase Search
```json
{
  "table": "naver_cafe_posts",
  "filter": "status=eq.pending",
  "order": "created_at_server.asc",
  "limit": 1
}
```

### 3️⃣ Router 조건
```
Route 1: {{2.id}} Exists
Route 2: {{2.id}} Does not exist
```

### 4️⃣ HTTP Request
```
POST https://api.github.com/repos/llkd33/nc_new/actions/workflows/auto-post.yml/dispatches

Headers:
- Accept: application/vnd.github+json
- Authorization: Bearer YOUR_GITHUB_TOKEN
- X-GitHub-Api-Version: 2022-11-28

Body:
{
  "ref": "main",
  "inputs": {
    "post_id": "{{2.id}}",
    "post_title": "{{2.title}}"
  }
}
```

### 5️⃣ Success Update
```json
{
  "table": "naver_cafe_posts",
  "id": "{{2.id}}",
  "status": "processing",
  "updated_at": "{{now}}"
}
```

### 6️⃣ Error Update
```json
{
  "table": "naver_cafe_posts",
  "id": "{{2.id}}",
  "status": "failed",
  "error_message": "{{5.error.message}}"
}
```

## 빠른 복사용 설정값

### Supabase Connection
```
URL: https://cbcftfkiosikuofmvwus.supabase.co
API Key: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiY2Z0Zmtpb3Npa3VvZm12d3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNDI3NTgsImV4cCI6MjA2ODgxODc1OH0.ol5b8z9JRZBKLpAjaNGDMzxVbFbBV0pzd9AKsoYlxw4
```

### GitHub Headers
```
Accept: application/vnd.github+json
Authorization: Bearer YOUR_GITHUB_TOKEN
X-GitHub-Api-Version: 2022-11-28
```