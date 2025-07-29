# 🚀 네이버 카페 고도화 크롤러

GitHub 저장소를 참고하여 개선된 네이버 카페 크롤러입니다.

## 📋 주요 개선사항

### 1. **로그인 기능 추가**
- 네이버 계정으로 실제 로그인
- 쿠키 저장/복원으로 세션 유지
- 로그인 상태 자동 확인

### 2. **향상된 안티봇 회피**
- Playwright 사용으로 더 자연스러운 브라우징
- 랜덤 딜레이 및 사용자 행동 모방
- webdriver 감지 우회

### 3. **견고한 에러 처리**
- 재시도 로직 (exponential backoff)
- 커스텀 에러 클래스
- 상세한 에러 로깅

### 4. **모듈화된 구조**
```
crawler-advanced.js    # 메인 크롤러
config/
  └── index.js        # 설정 관리
utils/
  ├── helpers.js      # 헬퍼 함수
  ├── errors.js       # 에러 처리
  └── logger.js       # 로깅 시스템
```

## 🛠 설치 및 설정

### 1. 환경변수 설정
`.env` 파일에서 네이버 계정 정보를 입력하세요:
```env
NAVER_ID=your-naver-id
NAVER_PASSWORD=your-naver-password
```

### 2. 크롤링 설정
```env
# 크롤링할 게시글 수 (카페당)
POSTS_PER_CAFE=5

# 요청 간 딜레이 (밀리초)
REQUEST_DELAY=2000

# 크롤링 기간 (일)
CRAWL_PERIOD_DAYS=7

# 재시도 횟수
MAX_RETRIES=3
```

### 3. 디버그 모드
문제 해결을 위한 디버그 모드:
```env
DEBUG_MODE=true
HEADLESS=false  # 브라우저 UI 표시
LOG_LEVEL=DEBUG
SCREENSHOT_ON_ERROR=true
```

## 🚀 실행 방법

### 기본 실행
```bash
node crawler-advanced.js
```

### 디버그 모드로 실행
```bash
DEBUG_MODE=true HEADLESS=false node crawler-advanced.js
```

### 특정 기간 크롤링
```bash
CRAWL_PERIOD_DAYS=30 node crawler-advanced.js
```

## 📊 로깅 시스템

### 로그 레벨
- `DEBUG`: 상세한 디버그 정보
- `INFO`: 일반 정보 (기본값)
- `WARN`: 경고 메시지
- `ERROR`: 에러 메시지

### 파일 로깅
```env
LOG_TO_FILE=true
```
활성화 시 `crawler.log` 파일에 로그 저장

## 🔧 문제 해결

### 로그인 실패
1. 네이버 계정 정보 확인
2. 2단계 인증 비활성화
3. 해외 로그인 차단 확인

### 크롤링 실패
1. `DEBUG_MODE=true`로 실행
2. 스크린샷 확인 (`./screenshots`)
3. 네트워크 상태 확인

### 속도 제한
```env
REQUEST_DELAY=5000  # 딜레이 증가
```

## 🔐 보안 주의사항

1. `.env` 파일은 절대 Git에 커밋하지 마세요
2. 네이버 계정은 크롤링 전용 계정 사용 권장
3. 과도한 크롤링은 계정 제재 위험

## 📈 성능 최적화

### 메모리 사용량 감소
```env
HEADLESS=true
```

### 병렬 처리 (권장하지 않음)
네이버는 동시 접속을 제한하므로 순차 처리 권장

## 🆕 추가 기능 계획

- [ ] 프록시 지원
- [ ] 다중 계정 로테이션
- [ ] 이미지 다운로드 옵션
- [ ] 댓글 크롤링
- [ ] 통계 대시보드

## 📞 지원

문제가 지속되면:
1. 로그 파일 확인
2. GitHub Issues 확인
3. 네이버 카페 구조 변경 확인