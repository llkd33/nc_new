import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY
);

async function checkData() {
    try {
        // 최근 저장된 데이터 확인
        const { data: recent, error } = await supabase
            .from('naver_cafe_posts')
            .select('*')
            .order('created_at_server', { ascending: false })
            .limit(10);
        
        if (error) throw error;
        
        console.log(`\n📊 최근 저장된 게시글 (총 ${recent?.length || 0}개):\n`);
        
        recent?.forEach((post, i) => {
            console.log(`${i+1}. ${post.title}`);
            console.log(`   카페: ${post.cafe_name} | 상태: ${post.status}`);
            console.log(`   저장 시각: ${new Date(post.created_at_server).toLocaleString('ko-KR')}`);
            console.log(`   URL: ${post.original_url}\n`);
        });
        
        // 통계
        const { data: stats } = await supabase
            .from('naver_cafe_posts')
            .select('status, cafe_name');
        
        const statusCount = {};
        const cafeCount = {};
        
        stats?.forEach(row => {
            statusCount[row.status] = (statusCount[row.status] || 0) + 1;
            cafeCount[row.cafe_name] = (cafeCount[row.cafe_name] || 0) + 1;
        });
        
        console.log('📈 통계:');
        console.log('상태별:', statusCount);
        console.log('카페별:', cafeCount);
        
    } catch (error) {
        console.error('오류:', error);
    }
}

checkData();