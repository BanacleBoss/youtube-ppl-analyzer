#!/bin/bash
echo "========================================="
echo "  YouTube PPL 분석기 - 프론트엔드"
echo "========================================="
echo ""
echo "🔄 기존 프론트엔드 프로세스 종료 중..."
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1
echo "✅ 이전 프로세스 종료 완료"
echo ""
echo "🚀 프론트엔드 시작 중..."
echo "-----------------------------------------"
cd ~/Desktop/youtube-ppl-analyzer/frontend
npm start
