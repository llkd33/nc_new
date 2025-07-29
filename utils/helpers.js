import fs from 'fs/promises';
import path from 'path';

// 딜레이 함수
export function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// 랜덤 딜레이
export async function randomDelay(min = 1000, max = 3000) {
    const delayTime = Math.floor(Math.random() * (max - min + 1)) + min;
    await delay(delayTime);
}

// 재시도 로직
export async function retryWithBackoff(fn, retries = 3, initialDelay = 1000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1) throw error;
            
            const backoffDelay = initialDelay * Math.pow(2, i);
            console.log(`⏳ 재시도 ${i + 1}/${retries} (${backoffDelay}ms 대기)`);
            await delay(backoffDelay);
        }
    }
}

// 한국어 날짜 파싱
export function parseKoreanDate(dateStr) {
    const now = new Date();
    
    // "HH:mm" 형식 (오늘)
    if (dateStr.includes(':')) {
        const [hours, minutes] = dateStr.split(':').map(Number);
        const date = new Date(now);
        date.setHours(hours, minutes, 0, 0);
        return date;
    }
    
    // "MM.dd" 형식 (올해)
    if (dateStr.match(/^\d{1,2}\.\d{1,2}$/)) {
        const [month, day] = dateStr.split('.').map(Number);
        const date = new Date(now.getFullYear(), month - 1, day);
        if (date > now) {
            date.setFullYear(date.getFullYear() - 1);
        }
        return date;
    }
    
    // "YY.MM.dd" 형식
    if (dateStr.match(/^\d{2}\.\d{1,2}\.\d{1,2}$/)) {
        const [year, month, day] = dateStr.split('.').map(Number);
        return new Date(2000 + year, month - 1, day);
    }
    
    // "YYYY.MM.dd" 형식
    if (dateStr.match(/^\d{4}\.\d{1,2}\.\d{1,2}$/)) {
        const [year, month, day] = dateStr.split('.').map(Number);
        return new Date(year, month - 1, day);
    }
    
    return now;
}

// 날짜 필터링
export function shouldCrawlPost(postDate, periodDays) {
    const crawlDate = new Date();
    crawlDate.setDate(crawlDate.getDate() - periodDays);
    
    const postDateObj = parseKoreanDate(postDate);
    return postDateObj >= crawlDate;
}

// 디렉토리 생성
export async function ensureDirectory(dirPath) {
    try {
        await fs.mkdir(dirPath, { recursive: true });
    } catch (error) {
        console.error(`디렉토리 생성 실패: ${dirPath}`, error);
    }
}

// 스크린샷 저장
export async function saveScreenshot(page, filename, directory = './screenshots') {
    try {
        await ensureDirectory(directory);
        const filepath = path.join(directory, `${filename}_${Date.now()}.png`);
        await page.screenshot({ path: filepath, fullPage: true });
        console.log(`📸 스크린샷 저장: ${filepath}`);
        return filepath;
    } catch (error) {
        console.error('스크린샷 저장 실패:', error);
        return null;
    }
}

// HTML 정제
export function cleanHtml(html) {
    if (!html) return '';
    
    // 스크립트와 스타일 태그 제거
    let cleaned = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
    cleaned = cleaned.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
    
    // 빈 태그 제거
    cleaned = cleaned.replace(/<[^>]+>\s*<\/[^>]+>/g, '');
    
    // 연속된 공백 정리
    cleaned = cleaned.replace(/\s+/g, ' ').trim();
    
    return cleaned;
}

// URL 검증
export function isValidUrl(string) {
    try {
        new URL(string);
        return true;
    } catch (_) {
        return false;
    }
}

// 속도 제한 클래스
export class RateLimiter {
    constructor(maxRequests, timeWindow) {
        this.maxRequests = maxRequests;
        this.timeWindow = timeWindow;
        this.requests = [];
    }
    
    async throttle() {
        const now = Date.now();
        this.requests = this.requests.filter(time => now - time < this.timeWindow);
        
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = this.timeWindow - (now - oldestRequest);
            console.log(`⏱️  속도 제한: ${Math.ceil(waitTime / 1000)}초 대기`);
            await delay(waitTime);
        }
        
        this.requests.push(now);
    }
}