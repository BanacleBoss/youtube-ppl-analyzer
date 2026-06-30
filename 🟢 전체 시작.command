#!/bin/bash
echo "========================================="
echo "  YouTube PPL 분석기 - 전체 서버 시작"
echo "========================================="
echo ""
echo "🔄 기존 프로세스 종료 중..."
lsof -ti:3001 | xargs kill -9 2>/dev/null
lsof -ti:3000 | xargs kill -9 2>/dev/null
sleep 1
echo "✅ 종료 완료"
echo ""

# 백엔드를 새 터미널 창으로 실행
osascript -e '
tell application "Terminal"
    do script "echo \"=== 백엔드 서버 ===\"; cd ~/Desktop/youtube-ppl-analyzer/backend && node youtube-analyzer-backend.js"
    set bounds of front window to {0, 0, 800, 500}
end tell'

sleep 2

# 프론트엔드를 새 터미널 창으로 실행
osascript -e '
tell application "Terminal"
    do script "echo \"=== 프론트엔드 ===\"; cd ~/Desktop/youtube-ppl-analyzer/frontend && npm start"
    set bounds of front window to {820, 0, 1620, 500}
end tell'

echo ""
echo "✅ 두 서버 모두 별도 창에서 시작됩니다!"
echo "   백엔드: http://localhost:3001"
echo "   프론트엔드: http://localhost:3000"
echo ""
echo "잠시 후 브라우저가 자동으로 열립니다..."
sleep 3
