#!/bin/bash

echo "🚀 새 GitHub 저장소에 푸시하기"
echo ""

# 1. 현재 remote 제거
echo "1️⃣ 기존 remote 제거..."
git remote remove origin

# 2. 새 remote 추가
echo "2️⃣ 새 remote 추가..."
echo "GitHub username을 입력하세요 (예: llkd33):"
read username
echo "Repository 이름을 입력하세요 (예: naver-cafe-crawler):"
read reponame

git remote add origin https://github.com/$username/$reponame.git

# 3. 확인
echo "3️⃣ Remote 확인..."
git remote -v

# 4. 푸시
echo "4️⃣ 코드 푸시..."
echo "먼저 GitHub에서 저장소를 생성하세요: https://github.com/new"
echo "생성 완료 후 Enter를 누르세요..."
read

git push -u origin main

echo "✅ 완료!"