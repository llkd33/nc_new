# Make.com 네이버 카페 자동 업로드 설정 가이드

## 🎯 목표
Supabase에 저장된 게시글을 자동으로 내 네이버 카페에 업로드

## 📋 시나리오 구성

### 1. Webhook 수신 (완료 ✅)
```
Webhook URL: https://hook.us2.make.com/09b9iry56ry3le6vp5xm8b6o6aohwn5h
```

### 2. Supabase에서 대기 중인 게시글 조회
```
Module: Supabase - Search Rows
Table: naver_cafe_posts
Filter: status = 'pending'
Limit: 5
```

### 3. 네이버 카페 글쓰기 (HTTP Request)

#### 방법 1: HTTP Request 모듈 사용
```
URL: https://cafe.naver.com/ArticleWrite.nhn
Method: POST
Headers:
  - Cookie: [네이버 로그인 쿠키]
  - Content-Type: application/x-www-form-urlencoded

Body:
  clubid: [내 카페 ID]
  menuid: [게시판 ID]
  subject: {{Supabase.title}}
  content: {{Supabase.content_html}}
```

#### 방법 2: 네이버 Open API 사용 (권장)
1. https://developers.naver.com 에서 애플리케이션 등록
2. 카페 API 사용 신청
3. API로 게시글 작성

### 4. Supabase 상태 업데이트
```
Module: Supabase - Update Row
Table: naver_cafe_posts
ID: {{Supabase.id}}
Update: status = 'uploaded'
```

## 🚨 주의사항

### 네이버 카페 글쓰기의 어려움
1. **로그인 세션 필요**: Cookie 기반 인증
2. **CSRF 토큰**: 보안 토큰 필요
3. **캡차**: 자동 글쓰기 방지

## 💡 대안 방법들

### 1. Google Sheets 중간 단계 (추천 ⭐)
```
Webhook → Supabase → Google Sheets → 수동 복사/붙여넣기
```

### 2. 이메일 알림
```
Webhook → Supabase → Gmail → 이메일로 게시글 내용 전송
```

### 3. Slack/Discord 알림
```
Webhook → Supabase → Slack → 채널에 게시글 전송 → 수동 업로드
```

### 4. WordPress 블로그 연동
```
Webhook → Supabase → WordPress API → 블로그 자동 포스팅
```

## 📝 Google Sheets 연동 예시

### 1. Google Sheets 모듈 추가
- Action: Add a Row
- Spreadsheet: [새 스프레드시트 생성]
- Sheet: Sheet1

### 2. 매핑
```
Column A (제목): {{Supabase.title}}
Column B (내용): {{Supabase.content_html}}
Column C (원본URL): {{Supabase.original_url}}
Column D (작성일): {{Supabase.created_at}}
Column E (상태): pending
```

### 3. 수동 작업
1. Google Sheets 확인
2. 내용 복사
3. 네이버 카페에 수동 업로드
4. Sheets에서 상태를 'uploaded'로 변경

## 🔄 전체 플로우

```
크롤러 실행
    ↓
Supabase 저장
    ↓
Webhook 트리거
    ↓
Make.com 시나리오
    ↓
Google Sheets 저장
    ↓
이메일/Slack 알림
    ↓
수동 업로드
    ↓
상태 업데이트
```

## 🛠 즉시 사용 가능한 시나리오

### Webhook → Supabase → Google Sheets → Gmail

1. **Webhook**: 데이터 수신
2. **Supabase**: pending 게시글 조회
3. **Google Sheets**: 새 행 추가
4. **Gmail**: 알림 이메일 발송
   ```
   제목: 새 게시글 {{count}}개 대기 중
   내용: Google Sheets 링크 포함
   ```

이 방법이 가장 현실적이고 안정적입니다!