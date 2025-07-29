import axios from 'axios';
import dotenv from 'dotenv';
import readline from 'readline';

dotenv.config();

// 네이버 앱 정보 (개발자센터에서 발급받은 정보)
const CLIENT_ID = process.env.NAVER_CLIENT_ID || 'YOUR_CLIENT_ID';
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET || 'YOUR_CLIENT_SECRET';
// 네이버 개발자센터에 등록한 것과 동일해야 함
const REDIRECT_URI = process.env.NAVER_REDIRECT_URI || 'http://localhost:3000/callback';

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

// 1단계: 인증 URL 생성
function getAuthUrl() {
    const state = Math.random().toString(36).substring(7);
    return `https://nid.naver.com/oauth2.0/authorize?response_type=code&client_id=${CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&state=${state}`;
}

// 2단계: 토큰 발급
async function getAccessToken(code, state) {
    try {
        const tokenUrl = 'https://nid.naver.com/oauth2.0/token';
        
        const params = new URLSearchParams({
            grant_type: 'authorization_code',
            client_id: CLIENT_ID,
            client_secret: CLIENT_SECRET,
            code: code,
            state: state
        });
        
        const response = await axios.post(tokenUrl, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('토큰 발급 실패:', error.response?.data || error.message);
        throw error;
    }
}

// 3단계: 카페 목록 조회 (테스트)
async function getCafeList(accessToken) {
    try {
        const response = await axios.get('https://openapi.naver.com/v1/cafe/my', {
            headers: {
                'Authorization': `Bearer ${accessToken}`
            }
        });
        
        return response.data;
    } catch (error) {
        console.error('카페 목록 조회 실패:', error.response?.data || error.message);
        return null;
    }
}

// 메인 실행
async function main() {
    console.log('🔐 네이버 API 토큰 발급 도구\n');
    
    if (CLIENT_ID === 'YOUR_CLIENT_ID') {
        console.error('❌ 먼저 네이버 개발자센터에서 앱을 등록하고 CLIENT_ID와 CLIENT_SECRET을 설정하세요.');
        console.log('\n1. https://developers.naver.com 접속');
        console.log('2. Application → 애플리케이션 등록');
        console.log('3. 카페 API 선택');
        console.log('4. .env 파일에 CLIENT_ID와 CLIENT_SECRET 추가\n');
        process.exit(1);
    }
    
    const authUrl = getAuthUrl();
    
    console.log('1️⃣ 아래 URL을 브라우저에서 열어 로그인하세요:');
    console.log(authUrl);
    console.log('\n2️⃣ 로그인 후 리다이렉트된 URL에서 code 파라미터를 복사하세요.');
    console.log('예: http://localhost:3000/callback?code=XXXXX&state=XXXXX\n');
    
    rl.question('code 값을 입력하세요: ', async (code) => {
        rl.question('state 값을 입력하세요: ', async (state) => {
            try {
                console.log('\n3️⃣ 토큰 발급 중...');
                const tokenData = await getAccessToken(code, state);
                
                console.log('\n✅ 토큰 발급 성공!');
                console.log('Access Token:', tokenData.access_token);
                console.log('Refresh Token:', tokenData.refresh_token);
                console.log('만료 시간:', tokenData.expires_in, '초');
                
                // 카페 목록 테스트
                console.log('\n4️⃣ 카페 목록 조회 테스트...');
                const cafeList = await getCafeList(tokenData.access_token);
                
                if (cafeList) {
                    console.log('✅ API 정상 작동!');
                    console.log('내 카페 목록:', cafeList);
                }
                
                console.log('\n📝 다음 단계:');
                console.log('1. Access Token을 Make.com Data Store에 저장');
                console.log('2. TARGET_CAFE_ID와 TARGET_MENU_ID 확인');
                console.log('3. Make.com HTTP Request 모듈에서 사용');
                
            } catch (error) {
                console.error('❌ 오류 발생:', error.message);
            } finally {
                rl.close();
            }
        });
    });
}

main();