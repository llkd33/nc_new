# Make.com Integration Guide

## Overview

The Naver Cafe Crawler now works in two stages:
1. **Crawler** (GitHub Actions) - Crawls posts and saves to Supabase with `status: pending`
2. **Make.com** - Monitors Supabase for new posts and handles posting to target cafe

## How It Works

### 1. Crawling Phase (GitHub Actions)
- Runs on schedule (e.g., daily at 2 AM UTC)
- Crawls posts from hotellife cafe
- Saves to Supabase with:
  - `status: 'pending'` - Ready for Make.com to process
  - `created_at: timestamp` - When the post was crawled

### 2. Posting Phase (Make.com)
Your Make.com scenario should:

1. **Trigger**: Watch Supabase for new rows where `status = 'pending'`
2. **Process**: For each pending post:
   - Read the post data
   - Post to atohealing cafe
   - Update status in Supabase
3. **Update**: Change `status` to `'posted'` and set `posted_at` timestamp

## Supabase Schema

```sql
CREATE TABLE naver_cafe_posts (
  id SERIAL PRIMARY KEY,
  cafe_name TEXT,
  board_name TEXT,
  title TEXT,
  author TEXT,
  content_html TEXT,
  original_url TEXT UNIQUE,
  created_at TIMESTAMP DEFAULT NOW(),
  status TEXT DEFAULT 'pending', -- 'pending', 'posted', 'failed'
  posted_at TIMESTAMP,
  error_message TEXT
);
```

## Make.com Scenario Setup

### 1. Supabase Trigger Module
- Connection: Your Supabase project
- Table: `naver_cafe_posts`
- Filter: `status = 'pending'`
- Order: `created_at ASC` (oldest first)

### 2. HTTP Request Module (Post to Naver)
- URL: Target cafe posting endpoint
- Method: POST
- Headers: Include authentication
- Body: Format the post data

### 3. Supabase Update Module
- Table: `naver_cafe_posts`
- Filter: `id = [current_post_id]`
- Update:
  - `status`: 'posted'
  - `posted_at`: NOW()

### 4. Error Handling
- If posting fails, update:
  - `status`: 'failed'
  - `error_message`: [error details]

## Benefits

1. **Separation of Concerns**: Crawling and posting are independent
2. **Reliability**: Make.com can retry failed posts
3. **Flexibility**: Easy to change posting logic without modifying crawler
4. **Monitoring**: Make.com provides visual workflow monitoring
5. **Queue Management**: Posts are processed in order

## Running the Crawler

### GitHub Actions (Automated)
The crawler runs automatically via GitHub Actions:
- Schedule: Daily at specified time
- Workflow: `.github/workflows/hotellife-crawl.yml`

### Local Testing
```bash
# Set environment variables
export SUPABASE_URL="your_supabase_url"
export SUPABASE_ANON_KEY="your_supabase_key"
export NAVER_ID="your_naver_id"
export NAVER_PASSWORD="your_naver_password"

# Run crawler
node hotel-crawler.js
```

## Monitoring

Check the following:
1. **GitHub Actions**: Verify crawler runs successfully
2. **Supabase**: Check for new posts with `status = 'pending'`
3. **Make.com**: Monitor scenario execution history
4. **Target Cafe**: Verify posts appear correctly