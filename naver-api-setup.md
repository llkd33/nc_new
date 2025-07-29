# 네이버 카페 API + Make.com 자동화 설정

## 1. 네이버 API 인증 토큰 발급

### 방법 1: 간단한 토큰 발급 스크립트
```javascript
// get-naver-token.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const CLIENT_ID = 'YOUR_CLIENT_ID';
const CLIENT_SECRET = 'YOUR_CLIENT_SECRET';
const REDIRECT_URI = 'https://www.make.com/callback';

// 1단계: 인증 URL 생성
function getAuthUrl() {
    const state = Math.random().toString(36).substring(7);
    return `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${REDIRECT_URI}&state=${state}`;
}

// 2단계: 토큰 발급
async function getAccessToken(code) {
    const tokenUrl = 'https://nid.naver.com/oauth2.0/token';
    
    const response = await axios.post(tokenUrl, null, {
        params: {
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
            state: 'random_state'
        }
    });
    
    return response.data.access_token;
}

console.log('인증 URL:', getAuthUrl());
```

## 2. Make.com 시나리오 설정

### 모듈 구성:
1. **Webhook** → 2. **Supabase** → 3. **HTTP Request (네이버 API)**

### HTTP Request 모듈 설정:

#### 카페 게시글 작성 API
```
URL: https://openapi.naver.com/v1/cafe/{{카페ID}}/menu/{{메뉴ID}}/articles
Method: POST
Headers:
  Authorization: Bearer {{ACCESS_TOKEN}}
  Content-Type: application/json

Body:
{
  "subject": "{{2.title}}",
  "content": "{{2.content_html}}"
}
```

## 3. Make.com에서 네이버 API 연동

### Step 1: Data Store 생성 (토큰 저장용)
1. Make.com → Tools → Data stores
2. "Add data store" 클릭
3. 구조:
   - token: text
   - expires_at: date
   - refresh_token: text

### Step 2: 시나리오 구성

#### 모듈 1: Webhook (이미 설정됨)

#### 모듈 2: Supabase - Search Rows
```
Table: naver_cafe_posts
Filter: status = pending
Limit: 1
```

#### 모듈 3: Data Store - Get Token
토큰 가져오기

#### 모듈 4: Router (분기)
- Route 1: 토큰 유효 → 게시글 작성
- Route 2: 토큰 만료 → 토큰 갱신

#### 모듈 5: HTTP Request - 카페 글쓰기
```
URL: https://openapi.naver.com/v1/cafe/{{TARGET_CAFE_ID}}/menu/{{TARGET_MENU_ID}}/articles
Method: POST
Headers:
  Authorization: Bearer {{3.token}}
  Content-Type: application/json
Body:
{
  "subject": "{{2.title}}",
  "content": "{{2.content_html}}"
}
```

#### 모듈 6: Supabase - Update Row
```
Table: naver_cafe_posts
ID: {{2.id}}
Values:
  status: uploaded
  uploaded_at: {{now}}
```

## 4. 환경변수 추가 (.env)

```bash
# 네이버 API
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
NAVER_ACCESS_TOKEN=your_access_token

# 대상 카페
TARGET_CAFE_ID=your_target_cafe_id
TARGET_MENU_ID=your_target_menu_id
```

## 5. 토큰 관리 자동화

### Supabase Edge Function으로 토큰 갱신
```typescript
// supabase/functions/refresh-naver-token/index.ts
import { serve } from "https://deno.land/std/http/server.ts"

serve(async (req) => {
  const refreshToken = Deno.env.get('NAVER_REFRESH_TOKEN')
  
  const response = await fetch('https://nid.naver.com/oauth2.0/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: Deno.env.get('NAVER_CLIENT_ID'),
      client_secret: Deno.env.get('NAVER_CLIENT_SECRET'),
      refresh_token: refreshToken,
    }),
  })
  
  const data = await response.json()
  
  // Make.com Data Store 업데이트
  await fetch('https://hook.us2.make.com/YOUR_WEBHOOK', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'update_token',
      token: data.access_token,
      expires_in: data.expires_in
    })
  })
  
  return new Response(JSON.stringify({ success: true }))
})
```

## 6. 테스트 및 실행

1. 네이버 API 토큰 발급
2. Make.com Data Store에 토큰 저장
3. 크롤러 실행으로 테스트:
   ```bash
   node crawler-optimized.js
   ```

## ⚠️ 주의사항

1. **API 제한**
   - 일일 호출 제한 있음
   - 카페별 쓰기 권한 필요

2. **토큰 관리**
   - Access Token은 보통 1시간 유효
   - Refresh Token으로 자동 갱신 필요

3. **카페 설정**
   - 카페 관리자 권한 필요
   - API 사용 허용 설정 필요