#!/bin/bash

# 새 Webhook URL 업데이트 스크립트

echo "🔄 Webhook URL 업데이트"
echo "========================"
echo ""
echo "1. Make.com에서 새 Webhook URL을 복사하세요"
echo "2. 아래에 붙여넣고 Enter를 누르세요:"
echo ""

read -p "새 Webhook URL: " NEW_WEBHOOK_URL

if [ -z "$NEW_WEBHOOK_URL" ]; then
    echo "❌ URL이 입력되지 않았습니다."
    exit 1
fi

# .env 파일 백업
cp .env .env.backup

# .env 파일에서 MAKE_WEBHOOK_URL 업데이트
if [[ "$OSTYPE" == "darwin"* ]]; then
    # macOS
    sed -i '' "s|MAKE_WEBHOOK_URL=.*|MAKE_WEBHOOK_URL=$NEW_WEBHOOK_URL|" .env
else
    # Linux
    sed -i "s|MAKE_WEBHOOK_URL=.*|MAKE_WEBHOOK_URL=$NEW_WEBHOOK_URL|" .env
fi

echo ""
echo "✅ .env 파일이 업데이트되었습니다!"
echo ""
echo "테스트하려면 다음 명령어를 실행하세요:"
echo "node test-webhook.js"