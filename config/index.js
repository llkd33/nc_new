import dotenv from 'dotenv';

dotenv.config();

// 카페 설정
export const CAFE_CONFIG = {
    '부동산스터디': {
        clubId: '12730407',
        menuId: '84',  // 회원간 묻고 답하기
        cafeName: '부동산스터디',
        cafeUrl: 'https://cafe.naver.com/jaegebal'
    },
    '부린이집': {
        clubId: '29860051',
        menuId: '16',  // 자유게시판
        cafeName: '부린이집',
        cafeUrl: 'https://cafe.naver.com/burini'
    }
};

// 크롤링 설정
export const CRAWL_CONFIG = {
    POSTS_PER_CAFE: parseInt(process.env.POSTS_PER_CAFE) || 5,
    REQUEST_DELAY: parseInt(process.env.REQUEST_DELAY) || 2000,
    CRAWL_PERIOD_DAYS: parseInt(process.env.CRAWL_PERIOD_DAYS) || 7,
    MAX_RETRIES: parseInt(process.env.MAX_RETRIES) || 3,
    COOKIE_FILE: process.env.COOKIE_FILE || 'naver_cookies.json',
    TIMEOUT: parseInt(process.env.TIMEOUT) || 30000
};

// 브라우저 설정
export const BROWSER_CONFIG = {
    HEADLESS: process.env.HEADLESS !== 'false',
    ARGS: [
        '--disable-blink-features=AutomationControlled',
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process'
    ],
    USER_AGENT: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
};

// 선택자 설정
export const SELECTORS = {
    LOGIN: {
        ID_INPUT: '#id',
        PW_INPUT: '#pw',
        LOGIN_BUTTON: '.btn_login'
    },
    CAFE: {
        MAIN_IFRAME: 'iframe#cafe_main',
        ARTICLE_BOARD: '.article-board',
        ARTICLE_ROW: '.article-board tbody tr',
        ARTICLE_LINK: '.td_article .article',
        AUTHOR: '.td_name .m-tcol-c',
        DATE: '.td_date',
        NOTICE_ICON: '.ico-list-notice'
    },
    CONTENT: [
        '.se-main-container',
        '.ContentRenderer',
        '#tbody',
        '.content-area',
        '#postViewArea',
        '.post-content',
        '.NHN_Writeform_Main'
    ]
};

// 에러 타입
export const ERROR_TYPES = {
    LOGIN_FAILED: 'LOGIN_FAILED',
    TIMEOUT: 'TIMEOUT',
    FRAME_ERROR: 'FRAME_ERROR',
    NETWORK_ERROR: 'NETWORK_ERROR',
    PARSE_ERROR: 'PARSE_ERROR'
};

// 디버그 설정
export const DEBUG_CONFIG = {
    ENABLED: process.env.DEBUG_MODE === 'true',
    LOG_BROWSER_CONSOLE: process.env.LOG_BROWSER_CONSOLE === 'true',
    SCREENSHOT_ON_ERROR: process.env.SCREENSHOT_ON_ERROR === 'true',
    SCREENSHOT_PATH: process.env.SCREENSHOT_PATH || './screenshots'
};