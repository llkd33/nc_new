// 커스텀 에러 클래스
export class CrawlerError extends Error {
    constructor(message, type, details = {}) {
        super(message);
        this.name = 'CrawlerError';
        this.type = type;
        this.details = details;
        this.timestamp = new Date().toISOString();
    }
}

// 에러 타입별 처리
export function handleError(error, context = '') {
    console.error(`\n❌ 에러 발생 ${context ? `(${context})` : ''}`);
    console.error(`   타입: ${error.type || 'UNKNOWN'}`);
    console.error(`   메시지: ${error.message}`);
    
    if (error.details) {
        console.error(`   상세:`, error.details);
    }
    
    if (error.stack && process.env.DEBUG_MODE === 'true') {
        console.error(`   스택:`, error.stack);
    }
    
    // 에러 타입별 추가 처리
    switch (error.type) {
        case 'LOGIN_FAILED':
            console.error('   💡 해결책: 네이버 계정 정보를 확인하세요');
            break;
        case 'TIMEOUT':
            console.error('   💡 해결책: 네트워크 상태를 확인하거나 타임아웃을 늘려보세요');
            break;
        case 'FRAME_ERROR':
            console.error('   💡 해결책: 카페 구조가 변경되었을 수 있습니다');
            break;
        case 'NETWORK_ERROR':
            console.error('   💡 해결책: 인터넷 연결을 확인하세요');
            break;
    }
}

// 에러 래핑 함수
export async function wrapWithErrorHandler(fn, errorType, context) {
    try {
        return await fn();
    } catch (error) {
        if (error instanceof CrawlerError) {
            throw error;
        }
        
        throw new CrawlerError(
            error.message,
            errorType,
            { originalError: error.toString(), context }
        );
    }
}