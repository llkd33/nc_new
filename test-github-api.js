import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// GitHub Actions API 테스트
async function testGitHubActionsAPI() {
    // GitHub Personal Access Token이 필요합니다
    const GITHUB_TOKEN = 'YOUR_GITHUB_TOKEN'; // 여기에 토큰 입력
    const OWNER = 'llkd33';
    const REPO = 'nc_new';
    const WORKFLOW_FILE = 'auto-post.yml';
    
    if (GITHUB_TOKEN === 'YOUR_GITHUB_TOKEN') {
        console.error('❌ GitHub Personal Access Token을 설정하세요!');
        console.log('\n토큰 생성 방법:');
        console.log('1. GitHub → Settings → Developer settings');
        console.log('2. Personal access tokens → Tokens (classic)');
        console.log('3. Generate new token');
        console.log('4. Scopes: repo, workflow 선택');
        console.log('5. 생성된 토큰을 이 파일의 GITHUB_TOKEN에 입력');
        return;
    }
    
    console.log('🔧 GitHub Actions API 테스트 시작...\n');
    
    try {
        // 1. 워크플로우 확인
        console.log('1️⃣ 워크플로우 정보 확인...');
        const workflowsResponse = await axios.get(
            `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows`,
            {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            }
        );
        
        const workflows = workflowsResponse.data.workflows;
        const autoPostWorkflow = workflows.find(w => w.path.includes(WORKFLOW_FILE));
        
        if (autoPostWorkflow) {
            console.log(`✅ 워크플로우 발견: ${autoPostWorkflow.name}`);
            console.log(`   ID: ${autoPostWorkflow.id}`);
            console.log(`   상태: ${autoPostWorkflow.state}`);
        } else {
            console.error('❌ auto-post.yml 워크플로우를 찾을 수 없습니다');
            return;
        }
        
        // 2. 워크플로우 트리거
        console.log('\n2️⃣ 워크플로우 트리거 테스트...');
        const dispatchResponse = await axios.post(
            `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`,
            {
                ref: 'main',
                inputs: {
                    post_id: 'test-123',
                    post_title: '테스트 게시글'
                }
            },
            {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            }
        );
        
        console.log('✅ 워크플로우 트리거 성공!');
        console.log('   상태 코드:', dispatchResponse.status);
        
        // 3. 실행 확인
        console.log('\n3️⃣ 워크플로우 실행 확인 중...');
        await new Promise(resolve => setTimeout(resolve, 3000)); // 3초 대기
        
        const runsResponse = await axios.get(
            `https://api.github.com/repos/${OWNER}/${REPO}/actions/runs?per_page=1`,
            {
                headers: {
                    'Accept': 'application/vnd.github+json',
                    'Authorization': `Bearer ${GITHUB_TOKEN}`,
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            }
        );
        
        if (runsResponse.data.workflow_runs.length > 0) {
            const latestRun = runsResponse.data.workflow_runs[0];
            console.log('✅ 최신 실행 정보:');
            console.log(`   실행 ID: ${latestRun.id}`);
            console.log(`   상태: ${latestRun.status}`);
            console.log(`   URL: ${latestRun.html_url}`);
        }
        
        console.log('\n✅ 테스트 완료!');
        console.log('\nMake.com에서 사용할 설정:');
        console.log('─'.repeat(50));
        console.log(`URL: https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW_FILE}/dispatches`);
        console.log('\nHeaders:');
        console.log('  Accept: application/vnd.github+json');
        console.log(`  Authorization: Bearer ${GITHUB_TOKEN}`);
        console.log('  X-GitHub-Api-Version: 2022-11-28');
        console.log('\nBody (JSON):');
        console.log(JSON.stringify({
            ref: 'main',
            inputs: {
                post_id: '{{2.id}}',
                post_title: '{{2.title}}'
            }
        }, null, 2));
        console.log('─'.repeat(50));
        
    } catch (error) {
        console.error('❌ 오류 발생:', error.message);
        if (error.response) {
            console.error('응답 상태:', error.response.status);
            console.error('응답 데이터:', error.response.data);
        }
    }
}

// 실행
testGitHubActionsAPI();