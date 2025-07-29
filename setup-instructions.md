# Supabase 설정 가이드

## 1. SQL 테이블 생성
Supabase 대시보드 > SQL Editor에서 `supabase_schema.sql` 파일의 내용을 실행하세요.

## 2. 데이터베이스 연결 정보
- **Project URL**: https://cbcftfkiosikuofmvwus.supabase.co
- **Database URL**: postgresql://postgres:navercrawling123!@db.cbcftfkiosikuofmvwus.supabase.co:5432/postgres
- **Anon Key**: 이미 .env 파일에 설정됨
- **Service Role Key**: 이미 supabase/.env 파일에 설정됨

## 3. Edge Function 배포

```bash
# Supabase CLI 설치 (아직 안했다면)
npm install -g supabase

# 로그인
supabase login

# 프로젝트 링크
cd supabase
supabase link --project-ref cbcftfkiosikuofmvwus

# Edge Function 배포
supabase functions deploy naver-cafe-crawler

# 환경변수 설정 (Make.com Webhook URL 받은 후)
supabase secrets set MAKE_WEBHOOK_URL=https://hook.eu1.make.com/your-webhook-url
```

## 4. CRON 작업 설정
Supabase 대시보드 > Database > Extensions에서 `pg_cron` 활성화 후:

```sql
-- CRON 작업 생성 (매일 아침 6시)
SELECT cron.schedule(
    'naver-cafe-crawler-daily',
    '0 6 * * *',
    $$
    SELECT
      net.http_post(
          url:='https://cbcftfkiosikuofmvwus.supabase.co/functions/v1/naver-cafe-crawler',
          headers:=format('{"Authorization": "Bearer %s", "Content-Type": "application/json"}', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNiY2Z0Zmtpb3Npa3VvZm12d3VzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTMyNDI3NTgsImV4cCI6MjA2ODgxODc1OH0.ol5b8z9JRZBKLpAjaNGDMzxVbFbBV0pzd9AKsoYlxw4')::jsonb
      ) AS request_id;
    $$
);

-- CRON 작업 확인
SELECT * FROM cron.job;

-- 필요시 CRON 작업 삭제
-- SELECT cron.unschedule('naver-cafe-crawler-daily');
```

## 5. 로컬 테스트

```bash
# 의존성 설치
npm install

# 테스트 실행
npm start
```

## 6. Make.com 시나리오 설정

1. **Webhook 모듈 생성**
   - Custom Webhook 생성
   - Webhook URL을 복사하여 .env 파일의 MAKE_WEBHOOK_URL에 추가

2. **Supabase 모듈 추가**
   - Connection: 
     - API URL: https://cbcftfkiosikuofmvwus.supabase.co
     - API Key: Service Role Key 사용
   - Action: Select Rows
   - Table: naver_cafe_posts
   - Filter: status = 'pending'

3. **네이버 카페 업로드 모듈**
   - HTTP 요청 또는 네이버 카페 API 사용
   - 게시글 작성 로직 구현

4. **상태 업데이트 모듈**
   - Supabase Update Row
   - status를 'uploaded'로 변경

## 7. 보안 주의사항
- Service Role Key는 서버 사이드에서만 사용
- 프로덕션 환경에서는 환경변수로 관리
- .env 파일은 절대 Git에 커밋하지 않음