#!/bin/bash

clear

echo "================================================"
echo "  YouTube PPL 분석 플랫폼 - 자동 설치"
echo "  Mac 버전"
echo "================================================"
echo ""

GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m'

echo "[1/8] Node.js 설치 확인 중..."
if ! command -v node &> /dev/null; then
    echo -e "${RED}✗ Node.js가 설치되어 있지 않습니다${NC}"
    exit 1
fi
NODE_VERSION=$(node --version)
echo -e "${GREEN}✓ Node.js 설치됨: $NODE_VERSION${NC}"

echo ""
echo "[2/8] 폴더 구조 생성 중..."
mkdir -p backend
mkdir -p frontend
echo -e "${GREEN}✓ 폴더 생성 완료${NC}"

echo ""
echo "[3/8] MongoDB 확인 중..."
echo -e "${YELLOW}⚠️  MongoDB가 설치되어 있지 않습니다${NC}"
echo "다음 명령어로 설치하세요:"
echo "brew tap mongodb/brew"
echo "brew install mongodb-community"

echo ""
echo "[4/8] API Key 설정 중..."
echo ""
read -p "API Key를 입력하세요 (AIzaSy...): " API_KEY

if [ -z "$API_KEY" ]; then
    echo -e "${YELLOW}⚠️  API Key가 입력되지 않았습니다${NC}"
    API_KEY="YOUR_YOUTUBE_API_KEY_HERE"
fi

echo ""
echo "[5/8] 백엔드 설정 파일 생성 중..."

cat > backend/.env << ENVEOF
YOUTUBE_API_KEY=$API_KEY
MONGODB_URI=mongodb://localhost:27017/youtube-analyzer
PORT=3001
NODE_ENV=development
CORS_ORIGIN=http://localhost:3000
ENVEOF

echo -e "${GREEN}✓ backend/.env 생성 완료${NC}"

echo ""
echo "[6/8] 백엔드 package.json 생성 중..."

cat > backend/package.json << 'PKGJSON'
{
  "name": "youtube-ppl-analyzer-backend",
  "version": "1.0.0",
  "description": "YouTube PPL 분석 플랫폼 백엔드",
  "main": "youtube-analyzer-backend.js",
  "scripts": {
    "start": "node youtube-analyzer-backend.js",
    "dev": "nodemon youtube-analyzer-backend.js"
  },
  "dependencies": {
    "express": "^4.18.2",
    "dotenv": "^16.0.3",
    "axios": "^1.3.0",
    "googleapis": "^118.0.0",
    "node-schedule": "^2.1.1",
    "mongoose": "^7.0.0",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "nodemon": "^2.0.20"
  }
}
PKGJSON

echo -e "${GREEN}✓ package.json 생성 완료${NC}"

echo ""
echo "[7/8] 백엔드 npm 패키지 설치 중..."
echo "(첫 설치는 2-3분 소요됩니다)"
echo ""

cd backend
npm install
if [ $? -ne 0 ]; then
    echo -e "${RED}✗ npm install 실패${NC}"
    exit 1
fi
cd ..

echo -e "${GREEN}✓ 백엔드 패키지 설치 완료${NC}"

echo ""
echo "[8/8] 프론트엔드 설정 중..."
echo "(이 단계는 3-5분 소요됩니다. 잠시 기다려주세요...)"
echo ""

cd frontend

npx create-react-app . 2>&1 | grep -v "npm notice"

if [ $? -ne 0 ]; then
    echo -e "${RED}✗ React 앱 생성 실패${NC}"
    exit 1
fi

echo ""
echo "필요한 라이브러리 설치 중..."
npm install recharts lucide-react axios

cd ..

echo -e "${GREEN}✓ 프론트엔드 설정 완료${NC}"

clear
echo "================================================"
echo -e "${GREEN}✓ 설치 완료!${NC}"
echo "================================================"
echo ""
echo "📝 다음 단계:"
echo "================================================"
echo ""
echo "1️⃣  youtube-analyzer-backend.js 파일을 backend 폴더에 복사하세요"
echo ""
echo "2️⃣  터미널을 2개 열어서 다음을 실행하세요:"
echo ""
echo "   [터미널 1 - 백엔드 실행]"
echo "   cd youtube-ppl-analyzer/backend"
echo "   npm start"
echo ""
echo "   [터미널 2 - 프론트엔드 실행]"
echo "   cd youtube-ppl-analyzer/frontend"
echo "   npm start"
echo ""
echo "================================================"
echo ""
