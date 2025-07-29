import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// Make.com 웹훅 테스트
async function testWebhook() {
    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.error('❌ MAKE_WEBHOOK_URL이 설정되지 않았습니다.');
        return;
    }
    
    console.log('🚀 Make.com 웹훅 테스트 시작...');
    console.log('URL:', webhookUrl);
    
    try {
        // 테스트 데이터
        const testData = {
            event: 'test',
            timestamp: new Date().toISOString(),
            message: '웹훅 연결 테스트입니다',
            source: 'manual-test'
        };
        
        console.log('\n📤 전송 데이터:', JSON.stringify(testData, null, 2));
        
        // 웹훅 호출
        const response = await axios.post(webhookUrl, testData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });
        
        console.log('\n✅ 웹훅 호출 성공!');
        console.log('응답 상태:', response.status);
        console.log('응답 데이터:', response.data);
        
        console.log('\n📋 다음 단계:');
        console.log('1. Make.com 시나리오에서 실행 확인');
        console.log('2. Webhook 모듈의 데이터 확인');
        console.log('3. 후속 모듈들이 정상 작동하는지 확인');
        
    } catch (error) {
        console.error('\n❌ 웹훅 호출 실패:', error.message);
        
        if (error.response) {
            console.error('응답 상태:', error.response.status);
            console.error('응답 데이터:', error.response.data);
        }
        
        console.log('\n🔧 문제 해결 방법:');
        console.log('1. Make.com에서 웹훅이 활성화되어 있는지 확인');
        console.log('2. 웹훅 URL이 올바른지 확인');
        console.log('3. Make.com 시나리오가 "ON" 상태인지 확인');
    }
}

// 실행
testWebhook();