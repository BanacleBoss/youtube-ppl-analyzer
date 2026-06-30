#!/bin/bash
echo "========================================="
echo "  YouTube PPL 분석기 - 백엔드 서버"
echo "========================================="
echo ""
echo "🔄 기존 백엔드 프로세스 종료 중..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
sleep 1
echo "✅ 이전 프로세스 종료 완료"
echo ""
echo "🚀 백엔드 서버 시작 중..."
echo "-----------------------------------------"
cd ~/Desktop/youtube-ppl-analyzer/backend
node youtube-analyzer-backend.js
