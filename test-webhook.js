import dotenv from 'dotenv';
import fetch from 'node-fetch';

dotenv.config();

async function testWebhook() {
    const webhookUrl = process.env.MAKE_WEBHOOK_URL;
    
    if (!webhookUrl) {
        console.error('❌ MAKE_WEBHOOK_URL이 .env 파일에 설정되지 않았습니다.');
        return;
    }
    
    console.log('🔔 Webhook 테스트 시작...');
    console.log(`URL: ${webhookUrl}\n`);
    
    // 테스트 데이터
    const testData = {
        event: 'test',
        message: 'Webhook 연결 테스트',
        timestamp: new Date().toISOString(),
        data: {
            cafe_name: '테스트카페',
            post_count: 3,
            posts: [
                {
                    id: 'test-1',
                    title: '테스트 게시글 1',
                    content: '이것은 테스트 내용입니다.',
                    created_at: new Date().toISOString()
                },
                {
                    id: 'test-2', 
                    title: '테스트 게시글 2',
                    content: '두 번째 테스트 내용입니다.',
                    created_at: new Date().toISOString()
                },
                {
                    id: 'test-3',
                    title: '테스트 게시글 3',
                    content: '세 번째 테스트 내용입니다.',
                    created_at: new Date().toISOString()
                }
            ]
        }
    };
    
    try {
        console.log('📤 데이터 전송 중...');
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(testData)
        });
        
        console.log(`✅ 응답 상태: ${response.status} ${response.statusText}`);
        
        const responseText = await response.text();
        console.log(`📥 응답 내용: ${responseText}`);
        
        if (response.ok) {
            console.log('\n✅ Webhook 테스트 성공!');
            console.log('이제 Make.com에서 "Successfully determined" 메시지를 확인하세요.');
        } else {
            console.error('\n❌ Webhook 테스트 실패');
        }
        
    } catch (error) {
        console.error('\n❌ 오류 발생:', error.message);
    }
}

// 실행
testWebhook();