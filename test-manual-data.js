import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
const MAKE_WEBHOOK_URL = process.env.MAKE_WEBHOOK_URL;

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// 테스트용 샘플 데이터
const samplePosts = [
    {
        cafe_name: '부동산스터디',
        board_name: '자유게시판',
        title: '테스트 게시글 - 부동산 투자 팁',
        author: '테스트유저1',
        created_at: new Date().toISOString(),
        content_html: '<p>이것은 테스트 게시글입니다. <b>부동산 투자</b>에 대한 내용입니다.</p><p>Make.com으로 자동 업로드될 예정입니다.</p>',
        original_url: 'https://cafe.naver.com/jaegebal/test-article-1'
    },
    {
        cafe_name: '부린이집',
        board_name: '정보공유',
        title: '테스트 게시글 - 첫 주택 구매 경험',
        author: '테스트유저2',
        created_at: new Date(Date.now() - 3600000).toISOString(), // 1시간 전
        content_html: '<h2>첫 주택 구매 후기</h2><p>안녕하세요. 첫 주택을 구매한 경험을 공유합니다.</p><ul><li>위치: 서울</li><li>평수: 25평</li><li>가격: 비공개</li></ul>',
        original_url: 'https://cafe.naver.com/burini/test-article-2'
    }
];

async function testSaveAndWebhook() {
    console.log('🧪 테스트 데이터로 시스템 검증 시작...\n');
    
    try {
        // 1. Supabase에 데이터 저장
        console.log('📝 Supabase에 테스트 데이터 저장 중...');
        const { data, error } = await supabase
            .from('naver_cafe_posts')
            .insert(samplePosts)
            .select();
        
        if (error) {
            console.error('❌ Supabase 저장 실패:', error);
            return;
        }
        
        console.log(`✅ ${data.length}개의 테스트 게시글이 저장되었습니다.`);
        console.log('\n저장된 데이터:');
        data.forEach((post, index) => {
            console.log(`${index + 1}. [${post.cafe_name}] ${post.title} (ID: ${post.id})`);
        });
        
        // 2. Make.com Webhook 호출
        if (MAKE_WEBHOOK_URL) {
            console.log('\n📤 Make.com Webhook 호출 중...');
            
            try {
                const response = await fetch(MAKE_WEBHOOK_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        event: 'new_posts',
                        count: data.length,
                        posts: data
                    })
                });
                
                console.log(`✅ Webhook 호출 성공! (상태 코드: ${response.status})`);
                
                if (response.ok) {
                    const responseText = await response.text();
                    console.log('응답:', responseText);
                }
                
            } catch (webhookError) {
                console.error('❌ Webhook 호출 실패:', webhookError.message);
            }
        } else {
            console.log('\n⚠️  Make.com Webhook URL이 설정되지 않았습니다.');
        }
        
        // 3. 저장된 데이터 확인
        console.log('\n📊 현재 pending 상태의 게시글 확인...');
        const { data: pendingPosts } = await supabase
            .from('naver_cafe_posts')
            .select('*')
            .eq('status', 'pending')
            .order('created_at_server', { ascending: false })
            .limit(10);
        
        console.log(`대기 중인 게시글: ${pendingPosts?.length || 0}개`);
        
    } catch (error) {
        console.error('❌ 테스트 중 오류 발생:', error);
    }
}

// 실행
testSaveAndWebhook()
    .then(() => {
        console.log('\n✅ 테스트 완료!');
        console.log('\n다음 단계:');
        console.log('1. Make.com에서 Webhook이 트리거되었는지 확인');
        console.log('2. Supabase 대시보드에서 데이터 확인');
        console.log('3. Make.com 시나리오에서 네이버 카페 업로드 설정');
    })
    .catch(error => {
        console.error('테스트 실패:', error);
    });