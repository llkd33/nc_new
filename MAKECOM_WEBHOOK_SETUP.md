# Make.com Webhook Setup Guide

## Complete Setup Process

### 1. Supabase Webhook Configuration

In Supabase Dashboard:
1. Go to Database → Webhooks
2. Click "Create a new webhook"
3. Configure:
   - **Name**: naver_cafe_posts_webhook
   - **Table**: naver_cafe_posts
   - **Events**: Insert, Update
   - **Conditions**: Select "status" equals "pending"
   - **URL**: (You'll get this from Make.com in step 2)

### 2. Make.com Scenario Setup

1. Create new scenario in Make.com
2. Add modules in this order:

#### Module 1: Custom Webhook
- Click "Add a new module" → Search "Webhooks" → Select "Custom webhook"
- Click "Add" to create new webhook
- Copy the webhook URL
- Go back to Supabase and paste this URL in the webhook configuration
- Save the Supabase webhook

#### Module 2: Data Structure
In Make.com webhook module:
1. Click "Determine data structure"
2. Run this test in Supabase SQL editor:
```sql
INSERT INTO naver_cafe_posts (
  cafe_name, board_name, title, author, 
  content_html, status, original_url, created_at
) VALUES (
  '호텔라이프', '자유게시판', 'Test for Make.com', 
  'Test Author', '<p>Test content</p>', 
  'pending', 'https://cafe.naver.com/hotellife/test', NOW()
);
```
3. Make.com should receive the webhook
4. Click "Successfully determined"

#### Module 3: HTTP Request (GitHub Actions)
- URL: `https://api.github.com/repos/llkd33/nc_new/actions/workflows/posting-only.yml/dispatches`
- Method: POST
- Headers:
  - Accept: `application/vnd.github+json`
  - Authorization: `Bearer YOUR_GITHUB_TOKEN`
  - X-GitHub-Api-Version: `2022-11-28`
  - Content-Type: `application/json`
- Body (Raw JSON):
```json
{
  "ref": "main",
  "inputs": {
    "post_id": "{{1.record.id}}",
    "title": "{{1.record.title}}",
    "author": "{{1.record.author}}",
    "content": "{{1.record.content_html}}",
    "cafe_name": "{{1.record.cafe_name}}"
  }
}
```

#### Module 4: Router
Add conditions:
- Route 1 (Success): Status Code equals 204
- Route 2 (Failed): Status Code not equals 204

#### Module 5a: Success - Update Supabase
- URL: `YOUR_SUPABASE_URL/rest/v1/naver_cafe_posts?id=eq.{{1.record.id}}`
- Method: PATCH
- Headers:
  - apikey: `YOUR_SUPABASE_ANON_KEY`
  - Authorization: `Bearer YOUR_SUPABASE_ANON_KEY`
  - Content-Type: `application/json`
  - Prefer: `return=minimal`
- Body:
```json
{
  "status": "processing"
}
```

#### Module 5b: Failed - Update Supabase
Same as 5a but with body:
```json
{
  "status": "failed",
  "error_message": "GitHub Actions dispatch failed: {{2.statusCode}}"
}
```

### 3. Required Credentials

1. **GitHub Personal Access Token**:
   - Go to GitHub Settings → Developer settings → Personal access tokens → Tokens (classic)
   - Generate new token with scopes:
     - `repo` (full control)
     - `workflow` (update GitHub Action workflows)
   - Copy token and save securely

2. **Supabase Keys**:
   - Find in Supabase Dashboard → Settings → API
   - Copy:
     - Project URL
     - anon public key

### 4. Testing the Complete Flow

1. Insert test data in Supabase:
```sql
INSERT INTO naver_cafe_posts (
  cafe_name, board_name, title, author, 
  content_html, status, original_url, created_at
) VALUES (
  '호텔라이프', '자유게시판', 'Integration Test', 
  'Tester', '<p>Testing complete flow</p>', 
  'pending', 'https://cafe.naver.com/hotellife/test2', NOW()
);
```

2. Check Make.com scenario execution
3. Verify GitHub Actions workflow triggered
4. Confirm Supabase status updated

### 5. Troubleshooting

**Webhook not firing:**
- Check Supabase webhook is enabled
- Verify conditions match exactly
- Test with simple insert without conditions first

**GitHub Actions 403/404:**
- Ensure token has workflow scope
- Verify repository name is correct
- Check workflow file exists in main branch

**Empty webhook data:**
- Use `{{1.record.field_name}}` format
- Test webhook data structure first
- Enable "Parse JSON" in HTTP module

## Data Flow Summary

1. Crawler saves post with `status: 'pending'`
2. Supabase webhook triggers on insert/update
3. Make.com receives webhook with post data
4. Make.com calls GitHub Actions workflow
5. GitHub Actions runs posting-only.yml
6. Make.com updates status based on result

## Example Webhook Payload

What Supabase sends to Make.com:
```json
{
  "type": "INSERT",
  "table": "naver_cafe_posts",
  "record": {
    "id": 123,
    "cafe_name": "호텔라이프",
    "board_name": "자유게시판",
    "title": "Test Post",
    "author": "Author Name",
    "content_html": "<p>Content</p>",
    "status": "pending",
    "original_url": "https://...",
    "created_at": "2024-01-09T12:00:00Z"
  },
  "schema": "public",
  "old_record": null
}
```

Access fields with: `{{1.record.field_name}}`