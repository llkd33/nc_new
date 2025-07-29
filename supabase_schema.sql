-- 네이버 카페 크롤링 데이터 저장용 테이블
CREATE TABLE IF NOT EXISTS naver_cafe_posts (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cafe_name TEXT NOT NULL,
    board_name TEXT NOT NULL,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL,
    content_html TEXT NOT NULL,
    original_url TEXT NOT NULL UNIQUE,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'uploaded', 'failed')),
    created_at_server TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 인덱스 생성
CREATE INDEX idx_status ON naver_cafe_posts(status);
CREATE INDEX idx_cafe_name ON naver_cafe_posts(cafe_name);
CREATE INDEX idx_created_at ON naver_cafe_posts(created_at DESC);
CREATE INDEX idx_created_at_server ON naver_cafe_posts(created_at_server DESC);

-- RLS (Row Level Security) 정책
ALTER TABLE naver_cafe_posts ENABLE ROW LEVEL SECURITY;

-- API 키를 통한 접근 허용
CREATE POLICY "Enable insert for API" ON naver_cafe_posts
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Enable select for API" ON naver_cafe_posts
    FOR SELECT USING (true);

CREATE POLICY "Enable update for API" ON naver_cafe_posts
    FOR UPDATE USING (true);

-- 업데이트 시간 자동 갱신 트리거
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_naver_cafe_posts_updated_at BEFORE UPDATE
    ON naver_cafe_posts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Make.com Webhook 트리거용 함수
CREATE OR REPLACE FUNCTION notify_new_post()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM pg_notify('new_cafe_post', json_build_object(
        'id', NEW.id,
        'cafe_name', NEW.cafe_name,
        'title', NEW.title
    )::text);
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 새 게시글 추가 시 알림 트리거
CREATE TRIGGER trigger_new_post
    AFTER INSERT ON naver_cafe_posts
    FOR EACH ROW
    EXECUTE FUNCTION notify_new_post();