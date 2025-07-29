import fs from 'fs/promises';
import path from 'path';

// 로그 레벨
export const LogLevel = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3
};

// 로거 클래스
export class Logger {
    constructor(options = {}) {
        this.level = options.level || LogLevel.INFO;
        this.logFile = options.logFile || 'crawler.log';
        this.consoleOutput = options.consoleOutput !== false;
        this.fileOutput = options.fileOutput || false;
    }
    
    async log(level, message, data = null) {
        if (level < this.level) return;
        
        const timestamp = new Date().toISOString();
        const levelName = this.getLevelName(level);
        const logEntry = {
            timestamp,
            level: levelName,
            message,
            data
        };
        
        // 콘솔 출력
        if (this.consoleOutput) {
            const prefix = this.getPrefix(level);
            console.log(`${prefix} ${message}`);
            if (data) {
                console.log('   ', data);
            }
        }
        
        // 파일 출력
        if (this.fileOutput) {
            await this.writeToFile(logEntry);
        }
    }
    
    async writeToFile(logEntry) {
        try {
            const logLine = JSON.stringify(logEntry) + '\n';
            await fs.appendFile(this.logFile, logLine, 'utf-8');
        } catch (error) {
            console.error('로그 파일 쓰기 실패:', error);
        }
    }
    
    getLevelName(level) {
        switch (level) {
            case LogLevel.DEBUG: return 'DEBUG';
            case LogLevel.INFO: return 'INFO';
            case LogLevel.WARN: return 'WARN';
            case LogLevel.ERROR: return 'ERROR';
            default: return 'UNKNOWN';
        }
    }
    
    getPrefix(level) {
        switch (level) {
            case LogLevel.DEBUG: return '🔍';
            case LogLevel.INFO: return '📝';
            case LogLevel.WARN: return '⚠️';
            case LogLevel.ERROR: return '❌';
            default: return '•';
        }
    }
    
    debug(message, data) {
        return this.log(LogLevel.DEBUG, message, data);
    }
    
    info(message, data) {
        return this.log(LogLevel.INFO, message, data);
    }
    
    warn(message, data) {
        return this.log(LogLevel.WARN, message, data);
    }
    
    error(message, data) {
        return this.log(LogLevel.ERROR, message, data);
    }
}

// 기본 로거 인스턴스
export const logger = new Logger({
    level: process.env.LOG_LEVEL ? LogLevel[process.env.LOG_LEVEL] : LogLevel.INFO,
    fileOutput: process.env.LOG_TO_FILE === 'true'
});