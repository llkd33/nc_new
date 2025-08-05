-- Supabase Database Webhook 설정 SQL

-- 1. Webhook Function 생성
CREATE OR REPLACE FUNCTION notify_makecom_on_pending_posts()
RETURNS trigger AS $$
BEGIN
  -- status가 'pending'인 경우에만 webhook 트리거
  IF NEW.status = 'pending' THEN
    PERFORM
      net.http_post(
        url := 'YOUR_MAKE_COM_WEBHOOK_URL_HERE',
        headers := '{"Content-Type": "application/json"}'::jsonb,
        body := json_build_object(
          'id', NEW.id,
          'cafe_name', NEW.cafe_name,
          'board_name', NEW.board_name,
          'title', NEW.title,
          'author', NEW.author,
          'created_at', NEW.created_at,
          'content_html', NEW.content_html,
          'original_url', NEW.original_url,
          'status', NEW.status
        )::text
      );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2. Trigger 생성
CREATE TRIGGER on_pending_post_created
  AFTER INSERT OR UPDATE ON naver_cafe_posts
  FOR EACH ROW
  EXECUTE FUNCTION notify_makecom_on_pending_posts();

-- 3. 확인
SELECT * FROM pg_trigger WHERE tgname = 'on_pending_post_created';