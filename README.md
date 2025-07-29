# Naver Cafe Crawler & Auto Poster

네이버 카페 게시글을 자동으로 크롤링하고 다른 카페에 업로드하는 자동화 시스템입니다.

## 기능

- 🔍 네이버 카페 게시글 자동 크롤링
- 💾 Supabase 데이터베이스 저장
- 🔔 Make.com 웹훅 연동
- ✍️ 자동 게시글 업로드

## 설치

```bash
npm install
```

## 환경 설정

`.env` 파일을 생성하고 다음 정보를 입력하세요:

```env
# Supabase
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key

# Make.com
MAKE_WEBHOOK_URL=your_webhook_url

# Naver
NAVER_ID=your_naver_id
NAVER_PASSWORD=your_naver_password

# API (선택사항)
NAVER_CLIENT_ID=your_client_id
NAVER_CLIENT_SECRET=your_client_secret
```

## 사용 방법

### 1. 데이터베이스 설정

```bash
# Supabase에서 SQL 실행
cat supabase_schema.sql
```

### 2. 크롤러 실행

```bash
node crawler-optimized.js
```

### 3. API 서버 실행 (선택사항)

```bash
node api-server.js
```

## 파일 구조

- `crawler-optimized.js` - 메인 크롤러
- `api-server.js` - 자동 업로드 API 서버
- `config/cafes.js` - 크롤링할 카페 목록
- `supabase_schema.sql` - 데이터베이스 스키마

## Make.com 설정

1. Webhook 모듈 추가
2. Supabase 연동
3. HTTP Request로 API 호출

## 주의사항

- 네이버 이용약관을 준수하세요
- 과도한 크롤링은 피하세요
- 개인정보 보호에 유의하세요
