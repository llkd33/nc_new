# Quick Setup - Make.com Webhook Integration

## 1. Import Blueprint

1. Open Make.com
2. Create new scenario
3. Click ⋮ (three dots) → Import Blueprint
4. Upload `make-webhook-final-blueprint.json`

## 2. Replace Placeholders

After import, you need to replace 3 placeholders:

### A. GitHub Token (Module 3)
- Find: `REPLACE_WITH_YOUR_GITHUB_TOKEN`
- Replace with: Your GitHub Personal Access Token
- Get token: GitHub → Settings → Developer settings → Personal access tokens → Generate new token
- Required scopes: `repo`, `workflow`

### B. Supabase URL (Modules 5 & 6)
- Find: `REPLACE_WITH_YOUR_SUPABASE_URL`
- Replace with: Your Supabase project URL (e.g., `https://xxxxx.supabase.co`)
- Get URL: Supabase Dashboard → Settings → API → Project URL

### C. Supabase Anon Key (Modules 5 & 6)
- Find: `REPLACE_WITH_YOUR_SUPABASE_ANON_KEY`
- Replace with: Your Supabase anon key
- Get key: Supabase Dashboard → Settings → API → anon public key
- Note: Replace in both "apikey" and "Authorization" headers

## 3. Configure Webhook

1. In Make.com scenario, click on first module (Webhook)
2. Click "Add" to create new webhook
3. Name it "Supabase Posts Webhook"
4. Copy the webhook URL

## 4. Set Up Supabase Webhook

1. Go to Supabase Dashboard
2. Database → Webhooks → Create new webhook
3. Configure:
   - Name: `naver_cafe_posts_webhook`
   - Table: `naver_cafe_posts`
   - Events: ☑ Insert ☑ Update
   - URL: Paste the Make.com webhook URL
   - HTTP Headers: Leave empty
   - Conditions: `status` equals `pending`
4. Click "Create webhook"

## 5. Test the Flow

Run this SQL in Supabase:

```sql
INSERT INTO naver_cafe_posts (
  cafe_name, board_name, title, author, 
  content_html, status, original_url, created_at
) VALUES (
  '호텔라이프', '자유게시판', 'Make.com Test', 
  'Tester', '<p>Testing webhook integration</p>', 
  'pending', 'https://cafe.naver.com/hotellife/test', NOW()
);
```

## 6. Verify

1. Check Make.com scenario history - should show execution
2. Check GitHub Actions - should show workflow run
3. Check Supabase - status should change from 'pending' to 'processing'

## Troubleshooting

**Webhook not triggering:**
- Ensure webhook is enabled in Supabase
- Check condition matches exactly: `status = 'pending'`

**GitHub Actions 403 error:**
- Token needs `workflow` permission
- Regenerate token with correct scopes

**Supabase update fails:**
- Check URL format: must end with `/rest/v1/naver_cafe_posts?id=eq.{{1.record.id}}`
- Verify anon key is correct in both headers

## Complete Flow

1. `hotel-crawler.js` saves posts with `status: 'pending'`
2. Supabase webhook fires on insert
3. Make.com receives webhook data
4. Make.com triggers `posting-only.yml` workflow
5. GitHub Actions posts to Naver
6. Make.com updates status in Supabase