# ⚠️ 중요 안내사항

## 네이버 카페 크롤링 제한사항

네이버 카페는 다음과 같은 이유로 직접 크롤링이 제한됩니다:

1. **로그인 필수**: 대부분의 카페 게시글은 로그인이 필요합니다
2. **봇 방지 기능**: Cloudflare 등의 봇 방지 기능이 적용되어 있습니다
3. **이용약관**: 네이버 서비스 이용약관상 자동화된 크롤링은 제한됩니다

## 🔄 대안 방법

### 1. 네이버 카페 API 사용 (공식 방법)
- 네이버 개발자센터에서 카페 API 신청
- API 키를 받아 합법적으로 데이터 수집
- 일일 호출 제한이 있지만 안정적

### 2. RSS 피드 활용
```javascript
// RSS 피드가 제공되는 경우
const RSS_FEEDS = [
    'https://cafe.naver.com/CafeRssArticleList.nhn?search.clubid=10322296',
    'https://cafe.naver.com/CafeRssArticleList.nhn?search.clubid=29738397'
];
```

### 3. 수동 입력 시스템
- Make.com에서 Google Sheets 연동
- 관리자가 직접 게시글 정보 입력
- Supabase로 자동 동기화

### 4. 브라우저 확장 프로그램
- Chrome Extension 개발
- 사용자가 카페 방문 시 수동으로 수집
- 수집된 데이터를 Supabase로 전송

## 📋 현재 구축된 시스템

### ✅ 완료된 작업
1. Supabase 테이블 구조 설계 및 생성
2. 크롤링 데이터 저장 로직 구현
3. Make.com Webhook 연동 준비
4. Edge Function 코드 작성

### 🔧 추가 필요 작업
1. 네이버 개발자센터에서 API 키 발급
2. RSS 피드 파서 구현
3. 또는 수동 입력 인터페이스 구축

## 💡 권장 사항

**네이버 카페 API 사용을 권장합니다:**

1. [네이버 개발자센터](https://developers.naver.com) 접속
2. 애플리케이션 등록
3. 카페 API 사용 신청
4. API 키로 `crawler-api.js` 파일 수정

```javascript
// crawler-api.js 예시
const NAVER_CLIENT_ID = 'your-client-id';
const NAVER_CLIENT_SECRET = 'your-client-secret';

async function fetchCafeArticlesViaAPI(clubId, menuId) {
    // 네이버 카페 API 호출 로직
}
```

## 📞 문의사항

추가 도움이 필요하시면 다음 방법을 고려해보세요:
- 네이버 개발자 포럼 문의
- Make.com 커뮤니티 활용
- Supabase Discord 채널