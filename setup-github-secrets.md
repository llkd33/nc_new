# GitHub Actions Secrets 설정 가이드

## 필수 Secrets 설정

GitHub 저장소에서 다음 Secrets를 설정해야 합니다:

1. **저장소 페이지** → **Settings** → **Secrets and variables** → **Actions**

2. **New repository secret** 클릭하여 다음 추가:

### 필수 Secrets

| Name | Value | 설명 |
|------|-------|------|
| `SUPABASE_URL` | `https://cbcftfkiosikuofmvwus.supabase.co` | Supabase 프로젝트 URL |
| `SUPABASE_ANON_KEY` | `eyJhbGc...` | Supabase Anon Key |
| `MAKE_WEBHOOK_URL` | `https://hook.us2.make.com/...` | Make.com 웹훅 URL |
| `NAVER_ID` | `crepix` | 네이버 ID |
| `NAVER_PASSWORD` | `hotelier6226` | 네이버 비밀번호 |

### 선택 Secrets (API 사용 시)

| Name | Value | 설명 |
|------|-------|------|
| `NAVER_CLIENT_ID` | `9gC5CFue37ee6rjkRYgH` | 네이버 API Client ID |
| `NAVER_CLIENT_SECRET` | `Q2nZPc3sOb` | 네이버 API Secret |

## 설정 방법

1. Settings → Secrets and variables → Actions
2. "New repository secret" 클릭
3. Name과 Value 입력
4. "Add secret" 클릭

## 워크플로우 실행

### 자동 실행
- **크롤러**: 매일 9시, 14시, 19시 (한국시간)
- **자동 게시**: 매일 10시, 15시, 20시 (한국시간)

### 수동 실행
1. Actions 탭 이동
2. 원하는 워크플로우 선택
3. "Run workflow" 클릭
4. 옵션 선택 후 실행

## 주의사항

- Secrets는 한 번 설정하면 값을 볼 수 없음
- 값 수정 시 다시 입력해야 함
- 비밀번호는 GitHub에 안전하게 암호화되어 저장됨