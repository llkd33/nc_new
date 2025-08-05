import dotenv from 'dotenv';
dotenv.config();

console.log('🧪 크롤러 테스트 시작...\n');

// 환경변수 확인
console.log('📋 환경변수 확인:');
console.log(`- SUPABASE_URL: ${process.env.SUPABASE_URL ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`- SUPABASE_ANON_KEY: ${process.env.SUPABASE_ANON_KEY ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`- NAVER_ID: ${process.env.NAVER_ID ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`- NAVER_PASSWORD: ${process.env.NAVER_PASSWORD ? '✅ 설정됨' : '❌ 없음'}`);
console.log(`- NAVER_COOKIES: ${process.env.NAVER_COOKIES ? '✅ 설정됨' : '❌ 없음'}`);

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_ANON_KEY) {
    console.error('\n❌ Supabase 설정이 필요합니다. .env 파일을 확인하세요.');
    process.exit(1);
}

console.log('\n🚀 크롤러 실행 테스트...\n');

// 크롤러 순차 실행
const crawlers = [
    { name: 'Selenium', file: './crawler-selenium.js' },
    { name: 'Stealth', file: './crawler-stealth.js' },
    { name: 'Improved', file: './crawler-improved.js' },
    { name: 'Advanced', file: './crawler-advanced.js' },
    { name: 'Public', file: './crawler-public.js' }
];

async function testCrawlers() {
    for (const crawler of crawlers) {
        console.log(`\n🔄 ${crawler.name} 크롤러 테스트 중...`);
        
        try {
            const module = await import(crawler.file);
            const crawlFunction = Object.values(module)[0]; // 첫 번째 export된 함수
            
            if (typeof crawlFunction === 'function') {
                const results = await crawlFunction();
                
                if (results && results.length > 0) {
                    console.log(`✅ ${crawler.name} 크롤러 성공! ${results.length}개 게시글 수집`);
                    console.log('수집된 게시글:');
                    results.slice(0, 3).forEach((post, i) => {
                        console.log(`  ${i + 1}. ${post.title} (${post.cafe_name})`);
                    });
                    return; // 성공하면 종료
                } else {
                    console.log(`⚠️  ${crawler.name} 크롤러: 게시글 0개`);
                }
            }
        } catch (error) {
            console.error(`❌ ${crawler.name} 크롤러 실패: ${error.message}`);
        }
    }
    
    console.log('\n❌ 모든 크롤러가 실패했습니다.');
}

testCrawlers();