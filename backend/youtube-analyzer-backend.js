const express = require('express');
const axios = require('axios');
const schedule = require('node-schedule');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const ExcelJS = require('exceljs');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

// 필수 환경변수 누락 시 서버가 원인 불명의 에러로 조용히 실패하는 대신 명확히 알린다.
const REQUIRED_ENV_VARS = ['YOUTUBE_API_KEY', 'MONGODB_URI'];
const missingEnvVars = REQUIRED_ENV_VARS.filter(key => !process.env[key]);
if (missingEnvVars.length > 0) {
  console.error('========================================');
  console.error(`[시작 오류] 필수 환경변수가 설정되지 않았습니다: ${missingEnvVars.join(', ')}`);
  console.error('로컬: backend/.env 파일을 확인하세요.');
  console.error('배포(Render): 대시보드 → Environment 탭을 확인하세요.');
  console.error('========================================');
}

// 로그인 토큰(JWT) 서명용 비밀키. 배포 환경(Render)에는 반드시 JWT_SECRET을 설정해야 한다.
// 설정하지 않으면 서버가 뜰 때마다 임시 키를 새로 생성하므로, 서버 재시작(배포/재배포 포함)마다
// 발급된 토큰이 전부 무효화되어 모든 사용자가 재로그인해야 한다 — 동작은 하지만 불편하니 꼭 설정할 것.
let JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  JWT_SECRET = crypto.randomBytes(32).toString('hex');
  console.warn('[경고] JWT_SECRET 환경변수가 없어 임시 키로 시작합니다. Render 환경변수에 JWT_SECRET(임의의 긴 문자열)을 추가하는 것을 권장합니다.');
}

// 일부 네트워크(ISP/방화벽)에서 mongodb+srv의 DNS SRV 조회가 차단되는 경우가 있어
// Node의 DNS 리졸버를 명시적으로 지정해 우회한다.
// 단, Render 같은 클라우드 호스팅 환경은 자체 네트워크 구성상 외부 DNS(8.8.8.8 등)로의
// 접근이 막혀 있을 수 있고, 이 경우 오히려 모든 외부 API 호출(유튜브 등)이 실패하게 되므로
// 로컬 개발 환경에서만 적용한다.
const dns = require('dns');
if (!process.env.RENDER) {
  try {
    dns.setServers(['8.8.8.8', '1.1.1.1', '8.8.4.4']);
  } catch (e) {
    console.warn('DNS 서버 설정 실패:', e.message);
  }
}

const app = express();
app.set('trust proxy', 1); // Render 리버스 프록시 신뢰 (express-rate-limit X-Forwarded-For 오류 방지)

// CORS_ORIGIN 환경변수(쉼표로 여러 개 구분 가능)가 설정되어 있으면 해당 origin만 허용하고,
// 설정되어 있지 않으면 기존과 동일하게 모든 origin을 허용한다(하위 호환, 미설정 시 동작 변화 없음).
const allowedOrigins = (process.env.CORS_ORIGIN || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors(allowedOrigins.length > 0 ? {
  origin: (origin, callback) => {
    // origin 헤더가 없는 요청(서버-투-서버, 헬스체크, curl 등)은 허용
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    console.warn(`[CORS 차단] 허용되지 않은 origin: ${origin}`);
    return callback(new Error('CORS 정책에 의해 차단되었습니다'));
  }
} : {}));
app.use(express.json());

// 이 API는 별도 로그인/인증이 없는 공개 URL이므로, 유튜브 API 쿼터 소진이나 무분별한 트래픽으로부터
// 보호하기 위해 기본적인 요청 속도 제한을 둔다.
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15분
  max: 300,                 // IP당 15분에 300회
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
});
app.use('/api/', generalLimiter);

// 채널 검색(발굴)은 호출 1회당 유튜브 API 쿼터를 100~150 유닛가량 소모하므로 더 엄격하게 제한한다.
const searchLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10분
  max: 10,                  // IP당 10분에 10회
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: '검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요 (유튜브 API 쿼터 보호).' }
});
app.use('/api/search', searchLimiter);

// 동일 키워드 반복 검색 시 유튜브 API 쿼터를 아끼기 위한 짧은 캐시(10분)
const SEARCH_CACHE_TTL_MS = 10 * 60 * 1000;
const searchCache = new Map();

const channelSchema = new mongoose.Schema({
  channelId: String,
  channelName: String,
  channelThumbnail: { type: String, default: '' }, // 채널 목록에 실제 유튜브 프로필 사진을 보여주기 위한 썸네일 URL
  subscribers: Number,
  totalViews: Number,

  // 담당자(계정) — 여러 팀원이 로그인해서 함께 쓰는 구조라, 이 채널을 누가 관리하는지 표시한다.
  // ownerName은 화면에 바로 뿌리기 위한 비정규화 캐시(계정이 바뀌거나 삭제돼도 과거 표시가 깨지지 않도록).
  ownerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  ownerName: { type: String, default: '' },
  
  // PPL 설정
  pplSettings: {
    productPrice: { type: Number, default: 50000 },
    expectedClicks: { type: Number, default: 0 },       // 예상 클릭수 (영상→구매페이지 유입 예상치)
    expectedConversionRate: { type: Number, default: 0.03 },

    // 품목/손익 관련 (BEP 계산용)
    itemId: { type: mongoose.Schema.Types.ObjectId, ref: 'Item', default: null },
    itemName: { type: String, default: '' },
    cost: { type: Number, default: 0 },            // 원가
    shippingCost: { type: Number, default: 0 },     // 배송비
    giftCost: { type: Number, default: 0 },         // 사은품 비용
    pgFeeRate: { type: Number, default: 0.0385 },    // PG(결제) 수수료율

    // MG / RS 딜 구조
    totalMG: { type: Number, default: 0 },           // 총 MG(최소보장금) 비용
    agencyMGShareRate: { type: Number, default: 0.3 }, // 대행사(쇼크) MG 분담 비율
    rsRate: { type: Number, default: 0.2 }            // 대행사에 지급하는 RS(매출 성과 배분) 비율
  },

  // 딜 조건 변경 이력 — 설정 저장 시 값이 바뀌면 "변경 전" 값을 스냅샷으로 남긴다.
  // 협상 과정에서 MG/RS/단가가 어떻게 바뀌어왔는지 추적하기 위한 용도 (현재값은 pplSettings, 과거값은 여기 누적)
  pplSettingsHistory: [{
    changedAt: { type: Date, default: Date.now },
    productPrice: Number,
    cost: Number,
    shippingCost: Number,
    giftCost: Number,
    pgFeeRate: Number,
    totalMG: Number,
    agencyMGShareRate: Number,
    rsRate: Number
  }],

  // 채널 최초 생성 시 pplSettings는 스키마 기본값(판매가 5만원/분담률 30%/RS율 20% 등)으로 채워지는데,
  // 이는 사용자가 실제로 입력한 딜 조건이 아니라 임시 placeholder다.
  // 이 플래그가 false인 상태에서 처음 저장되는 설정은 "진짜 변경"이 아니므로 이력에 남기지 않는다.
  dealConfigured: { type: Boolean, default: false },

  // 채널 관리 메타
  status: { type: String, enum: ['관심', '협의중', '완료', '보류', '미분류'], default: '미분류' },
  memo: { type: String, default: '' },
  channelTags: [{ type: String }],

  // 시청자 프로필(연령대/성별 분포) + 콘텐츠 카테고리.
  // YouTube Data API(공개 API)는 채널 소유자 본인이 아니면 시청자 연령/성별 통계를 절대 내주지 않는다
  // (그건 YouTube Analytics API 영역이라 채널 소유자의 OAuth 동의가 있어야만 조회 가능).
  // 그래서 이 값은 자동 수집이 불가능하고, 협업 논의 중 채널 측에서 공유해주는 미디어킷/애널리틱스 캡처를
  // 보고 담당자가 직접 입력해두는 "수동 기록용" 필드다. 대행사(쇼크)가 관리하는 리스트의 카테고리/연령대/성별
  // 컬럼과 동일한 정보를 우리 쪽에도 채널별로 남겨두기 위한 용도.
  audienceProfile: {
    category: { type: String, default: '' },        // 콘텐츠 카테고리 (예: 국내V로그, 코미디, 야외활동, 육아, 예능, 리빙 등)
    age1824: { type: Number, default: null },        // 18~24세 시청자 비율(%)
    age2534: { type: Number, default: null },        // 25~34세
    age3544: { type: Number, default: null },        // 35~44세
    age4554: { type: Number, default: null },        // 45~54세
    age5564: { type: Number, default: null },        // 55~64세
    genderMale: { type: Number, default: null },     // 남성 시청자 비율(%)
    genderFemale: { type: Number, default: null },   // 여성 시청자 비율(%)
    source: { type: String, default: '' },           // 근거/출처 메모 (예: "2026.06 미디어킷 기준")
    updatedAt: { type: Date, default: null }
  },

  // 요약 탭 공유 링크 — 토큰을 아는 사람만 읽기 전용으로 조회 가능
  // external: 채널 지표만 (MG/ROI 등 금액 정보 제외), internal: PPL 딜 조건까지 전체 포함
  shareTokens: {
    external: { type: String, default: null },
    internal: { type: String, default: null }
  },

  // 일일 누적 통계
  dailyStats: [{
    date: String,
    subscribers: Number,
    engagement: Number,
    avgViews: Number,
    predictedRevenue: Number,
    riskLevel: String
  }],
  
  videos: [{
    videoId: String,
    title: String,
    views: Number,
    likes: Number,
    comments: Number,
    uploadDate: Date,
    duration: Number,
    engagement: Number,
    tags: [String],
    categoryId: String,
    definition: String,
    hasPaidPromotion: { type: Boolean, default: false },  // 유튜브 공식 "유료 프로모션 포함" 표기
    hasSponsorKeyword: { type: Boolean, default: false }, // 설명란 광고/협찬 키워드 감지
    isAd: { type: Boolean, default: false },              // 위 둘 중 하나라도 해당하면 true
    ourCampaign: { type: Boolean, default: false },       // 우리(제스파)가 실제로 PPL을 집행한 영상인지 수동 표기 — isAd는 자동 감지(타 브랜드 광고 포함)이므로 별도 구분
    collectedAt: { type: Date, default: Date.now }
  }],
  
  history: [{
    date: Date,
    engagement: Number,
    avgViews: Number,
    predictedRevenue: Number
  }],

  // PPL 캠페인 실적 기록 — 캠페인 종료 후 실제 판매수량/매출을 입력해두면
  // 예상치(예상 클릭수 × 전환율)와 비교해 다음 캠페인의 전환율 추정 정확도를 높이는 데 참고할 수 있다.
  campaignLogs: [{
    date: { type: String, required: true },        // 집계 기준일 (YYYY-MM-DD)
    actualQty: { type: Number, default: 0 },        // 실제 판매수량
    actualRevenue: { type: Number, default: 0 },    // 실제 매출
    totalMG: { type: Number, default: 0 },          // 이 캠페인에 실제로 들어간 광고비(MG) — 과거 캠페인마다 금액이 다를 수 있어 직접 입력
    videoId: { type: String, default: null },       // 이 캠페인이 진행된 영상(ourCampaign으로 표시된 영상 중 선택) — 실측 조회수/CPV 계산에 사용
    expectedQtySnapshot: { type: Number, default: null },   // 기록 당시 예상 판매수량 (비교용 스냅샷)
    expectedClicksSnapshot: { type: Number, default: null }, // 기록 당시 예상 클릭수 (비교용 스냅샷)
    note: { type: String, default: '' },
    createdAt: { type: Date, default: Date.now }
  }],

  country: String,
  channelKeywords: [String],
  channelPublishedAt: Date,
  videoCount: Number,
  commentAnalysis: {
    lastAnalyzed: Date,
    totalCommentsFetched: Number,
    purchaseIntentRatio: Number,   // 구매의도 댓글 비율
    avgCommentLength: Number,       // 평균 댓글 길이
    replyRatio: Number,             // 답글 있는 댓글 비율
    negativeRatio: Number,          // 부정 키워드 비율
    qualityScore: Number,           // 댓글 품질 점수 0-100
    topPurchaseComments: [String],  // 구매의도 댓글 예시
  },
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const Channel = mongoose.model('Channel', channelSchema);

// 품목(제품) 마스터 스키마
const itemSchema = new mongoose.Schema({
  name: { type: String, required: true },
  sellPrice: { type: Number, default: 0 },     // 판매가
  cost: { type: Number, default: 0 },          // 원가
  shippingCost: { type: Number, default: 0 },  // 배송비
  giftCost: { type: Number, default: 0 },      // 사은품 비용 (기본값)
  memo: { type: String, default: '' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

const Item = mongoose.model('Item', itemSchema);

// 사용자 계정 — 로그인 인증 및 "누가 어떤 채널을 담당하는지" 구분을 위한 모델.
// 회원가입 폼은 없고 관리자가 직접 팀원 계정을 만들어 아이디/초기 비밀번호를 알려주는 방식이다.
// 예외적으로, 이 서버에 사용자가 단 한 명도 없는 최초 상태에서만 /api/auth/setup-admin으로
// 본인이 직접 첫 관리자 계정을 만들 수 있다 (그래야 아무도 관리자를 만들어 줄 수 없는 상황이 없다).
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ['admin', 'member'], default: 'member' },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

// PPL 손익/BEP 계산 유틸
function calculatePPLProfit(settings) {
  const sellPrice = Number(settings.productPrice) || 0;
  const cost = Number(settings.cost) || 0;
  const shippingCost = Number(settings.shippingCost) || 0;
  const giftCost = Number(settings.giftCost) || 0;
  const pgFeeRate = Number(settings.pgFeeRate) || 0;
  const totalMG = Number(settings.totalMG) || 0;
  const agencyMGShareRate = Number(settings.agencyMGShareRate) || 0;
  const rsRate = Number(settings.rsRate) || 0;

  const agencyMGShare = Math.round(totalMG * agencyMGShareRate);
  const ourMGShare = totalMG - agencyMGShare;

  const pgFee = sellPrice * pgFeeRate;
  const rsCost = sellPrice * rsRate;
  const unitMargin = sellPrice - cost - shippingCost - giftCost - pgFee - rsCost;

  const bepQty = unitMargin > 0 ? Math.ceil(ourMGShare / unitMargin) : null;
  const bepRevenue = bepQty ? bepQty * sellPrice : null;

  return {
    sellPrice,
    unitMargin: Math.round(unitMargin),
    totalMG,
    agencyMGShare,
    ourMGShare,
    bepQty,
    bepRevenue: bepRevenue ? Math.round(bepRevenue) : null
  };
}

// PPL 매출/손익 요약 계산 (프론트엔드 calculatePPLRevenue와 동일 기준으로 통일)
// 롱폼(10분↑) 영상 중 최근 10개를 기준으로 예상 판매수량/매출/순이익/ROI/ROAS를 계산한다.
function calculatePPLSummary(videos, settings) {
  const longform = (videos || []).filter(v => (v.duration || 0) > 600);
  const recent = longform.slice(0, 10);

  const totalMG = Number(settings.totalMG) || 0;

  if (recent.length === 0) {
    return {
      avgViews: 0, engagement: 0, expectedClicks: 0, clickRate: null, cpv: null,
      estimatedQty: 0, expectedRevenue: 0,
      unitMargin: 0, ourMGShare: 0, agencyMGShare: 0, netProfit: 0,
      roi: null, roas: null, riskLevel: '평가 불가', bepQty: null, bepRevenue: null
    };
  }

  const engagement = recent.reduce((sum, v) => sum + (parseFloat(v.engagement) || 0), 0) / recent.length / 100;
  const avgViews = recent.reduce((sum, v) => sum + (v.views || 0), 0) / recent.length;
  const expectedClicks = Number(settings.expectedClicks) || 0;
  const estimatedQty = expectedClicks * (settings.expectedConversionRate || 0);
  const expectedRevenue = estimatedQty * (settings.productPrice || 0);
  const clickRate = avgViews > 0 ? (expectedClicks / avgViews * 100) : null;
  const cpv = avgViews > 0 ? parseFloat((totalMG / avgViews).toFixed(2)) : null;

  const profit = calculatePPLProfit(settings);
  const netProfit = estimatedQty * profit.unitMargin - profit.ourMGShare;
  const roi = profit.ourMGShare > 0 ? (netProfit / profit.ourMGShare * 100) : null;
  const roas = profit.ourMGShare > 0 ? (expectedRevenue / profit.ourMGShare * 100) : null;

  // BEP 달성 여부(ROI 0% 기준)와 항상 일치하도록: ROI<0(BEP 미달)일 때만 '높음'
  let riskLevel = '평가 불가';
  if (roi !== null) {
    if (roi < 0) riskLevel = '높음';
    else if (roi < 100) riskLevel = '중간';
    else riskLevel = '낮음';
  }

  return {
    avgViews: Math.round(avgViews),
    engagement: parseFloat((engagement * 100).toFixed(2)),
    expectedClicks: Math.round(expectedClicks),
    clickRate: clickRate !== null ? parseFloat(clickRate.toFixed(2)) : null,
    cpv,
    estimatedQty: Math.round(estimatedQty),
    expectedRevenue: Math.round(expectedRevenue),
    unitMargin: profit.unitMargin,
    ourMGShare: profit.ourMGShare,
    agencyMGShare: profit.agencyMGShare,
    netProfit: Math.round(netProfit),
    roi: roi !== null ? parseFloat(roi.toFixed(2)) : null,
    roas: roas !== null ? parseFloat(roas.toFixed(2)) : null,
    riskLevel,
    bepQty: profit.bepQty,
    bepRevenue: profit.bepRevenue
  };
}

// 영상 설명란에서 협찬/광고 고지 문구를 탐지 (유튜브의 공식 "유료 프로모션" 플래그를
// 켜지 않고 설명란에만 고지하는 경우를 보완하기 위한 보조 신호)
const SPONSOR_KEYWORDS = [
  '유료광고', '유료 광고', '협찬', 'PPL', '광고 포함', '광고포함',
  '제품을 제공받아', '제품 제공', '제공받아', '지원을 받아', '지원받아',
  '원고료', '이 영상은 광고', 'sponsored', 'paid partnership', '유료 파트너십'
];
function detectSponsorKeyword(description) {
  if (!description) return false;
  const lower = description.toLowerCase();
  return SPONSOR_KEYWORDS.some(kw => lower.includes(kw.toLowerCase()));
}

// 가격/비용/비율 등 입력값 검증: 숫자가 아니거나 음수면 기본값으로 대체 (음수 가격, NaN 등 잘못된 값이
// DB에 저장되어 손익 계산이 깨지는 것을 방지)
function toNonNegativeNumber(value, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return n;
}

// 시청자 연령대/성별 비율처럼 "값이 없을 수도 있는" 0~100% 입력값 검증.
// toNonNegativeNumber와 달리 빈 값/잘못된 값은 0이 아니라 null로 남겨서
// "0%로 실제 입력했다"와 "아직 입력 안 했다"를 구분할 수 있게 한다.
function toPercentOrNull(value) {
  if (value === '' || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.min(100, Math.max(0, n));
}

// ── 인증/권한 미들웨어 ──────────────────────────────────────────
// Authorization: Bearer <token> 헤더의 JWT를 검증하고 req.user = { id, name, email, role }를 설정한다.
// 로그인 없이 서비스가 전면 공개되어 있던 것을, 팀원별 계정 로그인이 있어야만 쓸 수 있게 막는 게이트.
function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: '로그인이 필요합니다' });
  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch (e) {
    return res.status(401).json({ error: '로그인이 만료되었습니다. 다시 로그인해주세요' });
  }
}

// requireAuth 다음에 붙여 관리자만 허용한다 (팀원 계정 생성 등).
function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') return res.status(403).json({ error: '관리자만 가능한 작업입니다' });
  next();
}

// 채널 조회는 팀 전체에 열려있지만(누구 채널인지 서로 볼 수 있어야 하니까), 수정/삭제/갱신 같은
// 쓰기 작업은 그 채널의 담당자 본인 또는 관리자만 할 수 있도록 제한한다.
// :id 또는 :channelId 파라미터 어느 쪽을 쓰는 라우트든 동작하도록 둘 다 확인한다.
async function requireChannelOwner(req, res, next) {
  try {
    const channelId = req.params.id || req.params.channelId;
    if (!mongoose.Types.ObjectId.isValid(channelId)) {
      return res.status(400).json({ error: '잘못된 ID 형식입니다' });
    }
    const channel = await Channel.findById(channelId);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    const isOwner = channel.ownerId && channel.ownerId.toString() === req.user.id;
    if (!isOwner && req.user.role !== 'admin') {
      return res.status(403).json({ error: '이 채널의 담당자만 수정할 수 있습니다' });
    }
    req.channel = channel; // 핸들러에서 다시 조회하지 않도록 캐시
    next();
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
}

// 채널 갱신 시 영상 목록을 유튜브 API에서 통째로 새로 받아와 교체하는데,
// 이때 사용자가 수동으로 표시해둔 "우리 캠페인 영상" 체크는 API 응답에 없으므로 유실된다.
// videoId 기준으로 이전 목록의 값을 새 목록에 옮겨 붙여 보존한다.
function preserveOurCampaignFlags(oldVideos, newVideos) {
  if (!oldVideos || oldVideos.length === 0) return newVideos;
  const flagMap = new Map(oldVideos.filter(v => v.ourCampaign).map(v => [v.videoId, true]));
  if (flagMap.size === 0) return newVideos;
  return newVideos.map(v => flagMap.has(v.videoId) ? { ...v, ourCampaign: true } : v);
}

// 채널 데이터를 새로 받아왔을 때 채널 문서에 반영하는 공통 로직.
// 예전에는 수동 새로고침/전체 새로고침/매일 자동 갱신 3곳에 이 로직이 각자 복붙되어 있었는데,
// 그러다 보니 한쪽만 고치고 다른 쪽은 빠뜨리는 사고가 반복됐다(채널 개설일 필드가 그 예).
// 앞으로 갱신 시 반영할 필드가 늘어나도 여기 한 곳만 고치면 3곳 모두에 적용되도록 한곳으로 모은다.
function applyChannelRefresh(channel, channelInfo, videos) {
  channel.videos = preserveOurCampaignFlags(channel.videos, videos);
  channel.channelName = channelInfo.channelName;
  channel.channelThumbnail = channelInfo.channelThumbnail;
  channel.subscribers = channelInfo.subscribers;
  channel.totalViews = channelInfo.totalViews;
  channel.country = channelInfo.country;
  channel.channelKeywords = channelInfo.channelKeywords;
  channel.videoCount = channelInfo.videoCount;
  channel.channelPublishedAt = channelInfo.channelPublishedAt;
  channel.lastUpdated = new Date();

  const pplData = calculatePPLSummary(videos, channel.pplSettings);
  const today = new Date().toISOString().split('T')[0];
  const todayStats = channel.dailyStats.find(d => d.date === today);
  if (!todayStats) {
    channel.dailyStats.push({
      date: today,
      subscribers: channelInfo.subscribers,
      engagement: parseFloat(pplData.engagement),
      avgViews: pplData.avgViews,
      predictedRevenue: pplData.expectedRevenue,
      riskLevel: pplData.riskLevel
    });
  } else {
    todayStats.subscribers = channelInfo.subscribers;
  }

  channel.history.push({
    date: new Date(),
    engagement: parseFloat(pplData.engagement),
    avgViews: pplData.avgViews,
    predictedRevenue: pplData.expectedRevenue
  });
  if (channel.history.length > 90) {
    channel.history = channel.history.slice(-90);
  }

  return pplData;
}

class YouTubeAnalyzer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://www.googleapis.com/youtube/v3';
  }

  async getChannelInfo(channelId) {
    try {
      let channelId_real = channelId;

      // 이미 정확한 채널 ID(UC로 시작하는 24자)를 알고 있는 경우(채널 새로고침 시 항상 이 경우)에는
      // 검색 API를 거치지 않고 바로 조회한다. 검색은 텍스트 매칭이라 결과가 흔들릴 수 있는데,
      // 새로고침할 때마다 검색 top-1 결과로 채널을 다시 "찾는" 방식이면 극히 드물게 검색 결과가
      // 바뀌어 엉뚱한 채널 데이터로 덮어써질 위험이 있다. 이미 ID를 아는데 굳이 다시 찾을 이유가 없다.
      if (/^UC[\w-]{22}$/.test(channelId)) {
        channelId_real = channelId;
      } else {
        if (channelId.startsWith('@')) {
          channelId = channelId.substring(1);
        }

        const searchResponse = await axios.get(`${this.baseURL}/search`, {
          params: {
            part: 'snippet',
            q: channelId,
            type: 'channel',
            maxResults: 1,
            key: this.apiKey
          }
        });

        if (!searchResponse.data.items || searchResponse.data.items.length === 0) {
          throw new Error('채널을 찾을 수 없습니다');
        }

        channelId_real = searchResponse.data.items[0].snippet.channelId;
      }

      const response = await axios.get(`${this.baseURL}/channels`, {
        params: {
          part: 'statistics,snippet,brandingSettings',
          id: channelId_real,
          key: this.apiKey
        }
      });

      if (response.data.items.length === 0) {
        throw new Error('채널을 찾을 수 없습니다');
      }

      const channel = response.data.items[0];
      const keywordsRaw = channel.brandingSettings?.channel?.keywords || '';
      const thumbnails = channel.snippet.thumbnails || {};
      return {
        channelId: channel.id,
        channelName: channel.snippet.title,
        channelThumbnail: thumbnails.medium?.url || thumbnails.default?.url || '',
        subscribers: parseInt(channel.statistics.subscriberCount || 0),
        totalViews: parseInt(channel.statistics.viewCount || 0),
        country: channel.snippet.country || '',
        channelKeywords: keywordsRaw ? keywordsRaw.match(/"[^"]+"|[^\s]+/g)?.map(k => k.replace(/"/g,'')) || [] : [],
        channelPublishedAt: new Date(channel.snippet.publishedAt),
        videoCount: parseInt(channel.statistics.videoCount || 0),
      };
    } catch (error) {
      console.error('채널 정보 조회 실패:', error.message);
      throw error;
    }
  }

  async getChannelVideos(channelId) {
    try {
      const channelResponse = await axios.get(`${this.baseURL}/channels`, {
        params: {
          part: 'contentDetails',
          id: channelId,
          key: this.apiKey
        }
      });

      const uploadPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

      // 전체 영상 ID 수집 (nextPageToken으로 페이지네이션)
      const videoIds = [];
      let pageToken = undefined;
      do {
        const params = {
          part: 'contentDetails',
          playlistId: uploadPlaylistId,
          maxResults: 50,
          key: this.apiKey
        };
        if (pageToken) params.pageToken = pageToken;
        const playlistResponse = await axios.get(`${this.baseURL}/playlistItems`, { params });
        playlistResponse.data.items.forEach(item => videoIds.push(item.contentDetails.videoId));
        pageToken = playlistResponse.data.nextPageToken;
      } while (pageToken);

      const videos = [];
      for (let i = 0; i < videoIds.length; i += 50) {
        const batch = videoIds.slice(i, i + 50);
        const videoResponse = await axios.get(`${this.baseURL}/videos`, {
          params: {
            part: 'statistics,snippet,contentDetails,paidProductPlacementDetails',
            id: batch.join(','),
            key: this.apiKey
          }
        });

        for (const video of videoResponse.data.items) {
          const stats = video.statistics;
          const viewCount = parseInt(stats.viewCount || 0);
          const engagementRaw = viewCount > 0
            ? (parseInt(stats.likeCount || 0) + parseInt(stats.commentCount || 0)) / viewCount * 100
            : 0;
          const hasPaidPromotion = video.paidProductPlacementDetails?.hasPaidProductPlacement || false;
          const hasSponsorKeyword = detectSponsorKeyword(video.snippet.description);

          videos.push({
            videoId: video.id,
            title: video.snippet.title,
            views: viewCount,
            likes: parseInt(stats.likeCount || 0),
            comments: parseInt(stats.commentCount || 0),
            uploadDate: new Date(video.snippet.publishedAt),
            duration: this.parseDuration(video.contentDetails.duration),
            engagement: parseFloat(engagementRaw.toFixed(2)),
            categoryId: video.snippet.categoryId || '',
            definition: video.contentDetails.definition || '',
            hasPaidPromotion,
            hasSponsorKeyword,
            isAd: hasPaidPromotion || hasSponsorKeyword,
          });
        }
      }

      return videos;
    } catch (error) {
      console.error('영상 조회 실패:', error.message);
      throw error;
    }
  }

  parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;  // P0D(라이브방송), 특수 포맷 처리
    const hours = parseInt(match[1]) || 0;
    const minutes = parseInt(match[2]) || 0;
    const seconds = parseInt(match[3]) || 0;
    return hours * 3600 + minutes * 60 + seconds;
  }

  calculateEngagement(videos) {
    if (videos.length === 0) return 0;
    const totalEngagement = videos.reduce((sum, video) => {
      const engagement = (video.likes + video.comments) / video.views;
      return sum + engagement;
    }, 0);
    return (totalEngagement / videos.length * 100).toFixed(2);
  }

}

const analyzer = new YouTubeAnalyzer(process.env.YOUTUBE_API_KEY);

// :id 라우트 파라미터 공통 검증 — 잘못된 형식의 ObjectId가 들어오면
// Mongoose CastError로 인해 알 수 없는 500 에러가 나가는 것을 방지하고 400으로 명확히 응답한다.
app.param('id', (req, res, next, id) => {
  if (!mongoose.Types.ObjectId.isValid(id)) {
    return res.status(400).json({ error: '잘못된 ID 형식입니다' });
  }
  next();
});

// ── 인증 ──────────────────────────────────────────────────────
// GET: 최초 셋업이 필요한지 확인 — 가입된 사용자가 한 명도 없으면 true.
// 프론트는 이 값을 보고 "로그인 화면"과 "최초 관리자 계정 만들기 화면" 중 어느 걸 보여줄지 정한다.
app.get('/api/auth/setup-status', async (req, res) => {
  try {
    const count = await User.countDocuments();
    res.json({ needsSetup: count === 0 });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: 최초 관리자 계정 생성 — 사용자가 한 명도 없을 때만 동작한다(그 이후엔 항상 거부).
// 이후 팀원 계정은 이 관리자가 /api/users로 직접 만들어준다(공개 회원가입 폼은 없음).
app.post('/api/auth/setup-admin', async (req, res) => {
  try {
    const count = await User.countDocuments();
    if (count > 0) return res.status(403).json({ error: '이미 초기 설정이 완료되었습니다' });

    const { name, email, password } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: '이름/이메일/비밀번호를 모두 입력하세요' });
    if (String(password).length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: String(email).toLowerCase().trim(), passwordHash, role: 'admin' });

    // 지금까지 담당자 없이 등록되어 있던 채널은 전부 최초 관리자 소유로 지정한다(기존 데이터 이관).
    await Channel.updateMany({ ownerId: null }, { $set: { ownerId: user._id, ownerName: user.name } });

    const token = jwt.sign({ id: user._id.toString(), name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: '이미 사용 중인 이메일입니다' });
    res.status(500).json({ error: error.message });
  }
});

// POST: 로그인
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ error: '이메일/비밀번호를 입력하세요' });

    const user = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (!user) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const match = await bcrypt.compare(password, user.passwordHash);
    if (!match) return res.status(401).json({ error: '이메일 또는 비밀번호가 올바르지 않습니다' });

    const token = jwt.sign({ id: user._id.toString(), name: user.name, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ token, user: { id: user._id, name: user.name, email: user.email, role: user.role } });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 내 정보 (토큰 유효성 확인용으로 프론트 로드 시 호출)
app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// ── 팀원 관리 ─────────────────────────────────────────────────
// GET: 팀원 목록(담당 채널 수 포함) — 로그인한 사람이면 누구나 조회 가능(서로 담당 채널을 볼 수 있어야 하니까)
app.get('/api/users', requireAuth, async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash').sort({ createdAt: 1 });
    const counts = await Channel.aggregate([
      { $match: { ownerId: { $ne: null } } },
      { $group: { _id: '$ownerId', count: { $sum: 1 } } }
    ]);
    const countMap = new Map(counts.map(c => [c._id.toString(), c.count]));
    res.json(users.map(u => ({
      id: u._id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt,
      channelCount: countMap.get(u._id.toString()) || 0
    })));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: 팀원 계정 생성 (관리자 전용) — 회원가입 폼 없이 관리자가 아이디/초기 비밀번호를 직접 발급한다.
app.post('/api/users', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: '이름/이메일/비밀번호를 모두 입력하세요' });
    if (String(password).length < 8) return res.status(400).json({ error: '비밀번호는 8자 이상이어야 합니다' });
    const allowedRole = role === 'admin' ? 'admin' : 'member';

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email: String(email).toLowerCase().trim(), passwordHash, role: allowedRole });
    res.json({ id: user._id, name: user.name, email: user.email, role: user.role, channelCount: 0 });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ error: '이미 사용 중인 이메일입니다' });
    res.status(500).json({ error: error.message });
  }
});

// POST: 채널 추가
app.post('/api/channels', requireAuth, async (req, res) => {
  try {
    const { channelId } = req.body;

    const existing = await Channel.findOne({ channelId });
    if (existing) {
      return res.status(400).json({ error: '이미 추가된 채널입니다' });
    }

    const channelInfo = await analyzer.getChannelInfo(channelId);
    const videos = await analyzer.getChannelVideos(channelInfo.channelId);

    const pplData = calculatePPLSummary(videos, {
      productPrice: 50000,
      expectedClicks: 0,
      expectedConversionRate: 0.03,
      cost: 0, shippingCost: 0, giftCost: 0, pgFeeRate: 0.0385,
      totalMG: 0, agencyMGShareRate: 0.3, rsRate: 0.2
    });

    const channel = new Channel({
      channelId: channelInfo.channelId,
      channelName: channelInfo.channelName,
      channelThumbnail: channelInfo.channelThumbnail,
      subscribers: channelInfo.subscribers,
      totalViews: channelInfo.totalViews,
      country: channelInfo.country,
      channelKeywords: channelInfo.channelKeywords,
      channelPublishedAt: channelInfo.channelPublishedAt,
      videoCount: channelInfo.videoCount,
      ownerId: req.user.id,
      ownerName: req.user.name,
      pplSettings: {
        productPrice: 50000,
        expectedClicks: 0,
        expectedConversionRate: 0.03
      },
      videos,
      dailyStats: [{
        date: new Date().toISOString().split('T')[0],
        engagement: parseFloat(pplData.engagement),
        avgViews: pplData.avgViews,
        predictedRevenue: pplData.expectedRevenue,
        riskLevel: pplData.riskLevel
      }],
      history: [{
        date: new Date(),
        engagement: parseFloat(pplData.engagement),
        avgViews: pplData.avgViews,
        predictedRevenue: pplData.expectedRevenue
      }]
    });

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 헬스체크 (UptimeRobot 전용 — DB 조회 없이 즉시 응답)
app.get('/api/health', (req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// GET: 채널 조회
// 쿼리 없이 호출하면 "내 채널"만, ?ownerId=<사용자ID>로 특정 팀원의 채널을, ?ownerId=all(관리자 전용)로
// 전체 채널을 조회한다. 팀원 목록에서 다른 사람 이름을 클릭했을 때 그 사람 채널로 전환하는 데 쓰인다.
app.get('/api/channels', requireAuth, async (req, res) => {
  try {
    const { ownerId } = req.query;
    let filter;
    if (ownerId === 'all') {
      if (req.user.role !== 'admin') return res.status(403).json({ error: '전체 채널 조회는 관리자만 가능합니다' });
      filter = {};
    } else if (ownerId) {
      if (!mongoose.Types.ObjectId.isValid(ownerId)) return res.status(400).json({ error: '잘못된 ownerId 형식입니다' });
      filter = { ownerId };
    } else {
      filter = { ownerId: req.user.id };
    }
    const channels = await Channel.find(filter).sort({ lastUpdated: -1 });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 특정 채널 조회 — 조회는 팀 전체에 열려있다(수정/삭제만 담당자 제한).
app.get('/api/channels/:id', requireAuth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: 채널 데이터 새로고침
app.post('/api/channels/:id/refresh', requireAuth, requireChannelOwner, async (req, res) => {
  console.log(`[REFRESH] 요청 시작: ${req.params.id}`);
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }
    console.log(`[REFRESH] 채널 찾음: ${channel.channelName} (${channel.channelId})`);

    const channelInfo = await analyzer.getChannelInfo(channel.channelId);
    console.log(`[REFRESH] 채널 정보 수집 완료`);
    const videos = await analyzer.getChannelVideos(channel.channelId);
    console.log(`[REFRESH] 영상 수집 완료: ${videos.length}개`);

    applyChannelRefresh(channel, channelInfo, videos);

    await channel.save();
    res.json({
      message: '데이터 업데이트 완료',
      totalVideos: videos.length,
      channel
    });
  } catch (error) {
    console.error(`[REFRESH ERROR] ${error.message}`, error.stack);
    res.status(500).json({ error: error.message });
  }
});

// POST: 전체 채널 순차 갱신 — 기본적으로 "내 채널"만 갱신하고, 관리자가 ?scope=all로 요청하면 전체를 갱신한다.
app.post('/api/channels/refresh-all', requireAuth, async (req, res) => {
  console.log('[REFRESH-ALL] 전체 갱신 시작');
  try {
    const filter = (req.user.role === 'admin' && req.query.scope === 'all') ? {} : { ownerId: req.user.id };
    const channels = await Channel.find(filter);
    if (channels.length === 0) return res.json({ results: [], total: 0 });

    const results = [];
    for (const channel of channels) {
      try {
        const channelInfo = await analyzer.getChannelInfo(channel.channelId);
        const videos = await analyzer.getChannelVideos(channel.channelId);

        applyChannelRefresh(channel, channelInfo, videos);

        await channel.save();
        results.push({ id: channel._id, name: channel.channelName, success: true, totalVideos: videos.length });
        console.log(`[REFRESH-ALL] ✓ ${channel.channelName} (${videos.length}개)`);

        // 채널 간 3초 딜레이 — YouTube API 쿼터 보호
        if (channels.indexOf(channel) < channels.length - 1) {
          await new Promise(res => setTimeout(res, 3000));
        }
      } catch (err) {
        results.push({ id: channel._id, name: channel.channelName, success: false, error: err.message });
        console.error(`[REFRESH-ALL] ✗ ${channel.channelName}: ${err.message}`);
      }
    }

    const succeeded = results.filter(r => r.success).length;
    console.log(`[REFRESH-ALL] 완료: ${succeeded}/${channels.length} 성공`);
    res.json({ results, total: channels.length, succeeded });
  } catch (error) {
    console.error('[REFRESH-ALL ERROR]', error.message);
    res.status(500).json({ error: error.message });
  }
});

// POST: PPL 설정 저장
app.post('/api/channels/:id/settings', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    const nextSettings = {
      productPrice: toNonNegativeNumber(req.body.productPrice, 50000),
      expectedClicks: toNonNegativeNumber(req.body.expectedClicks, 0),
      expectedConversionRate: toNonNegativeNumber(req.body.expectedConversionRate, 0.03),

      itemId: req.body.itemId || null,
      itemName: req.body.itemName || '',
      cost: toNonNegativeNumber(req.body.cost, 0),
      shippingCost: toNonNegativeNumber(req.body.shippingCost, 0),
      giftCost: toNonNegativeNumber(req.body.giftCost, 0),
      pgFeeRate: toNonNegativeNumber(req.body.pgFeeRate, 0.0385),

      totalMG: toNonNegativeNumber(req.body.totalMG, 0),
      agencyMGShareRate: toNonNegativeNumber(req.body.agencyMGShareRate, 0.3),
      rsRate: toNonNegativeNumber(req.body.rsRate, 0.2)
    };

    // 딜 조건(가격/원가/MG/RS 등)이 실제로 바뀌었으면, 바뀌기 전 값을 이력에 스냅샷으로 남긴다.
    // 단, dealConfigured가 false인 상태(=채널 생성 후 아직 한 번도 실제로 딜 조건을 저장한 적 없음)의
    // 첫 저장은 "스키마 기본값 → 실제값"으로 바뀌는 것일 뿐 진짜 변경이 아니므로 이력에 남기지 않는다.
    const DEAL_FIELDS = ['productPrice', 'cost', 'shippingCost', 'giftCost', 'pgFeeRate', 'totalMG', 'agencyMGShareRate', 'rsRate'];
    const prev = channel.pplSettings || {};
    const dealChanged = channel.dealConfigured && DEAL_FIELDS.some(f => Number(prev[f] || 0) !== Number(nextSettings[f] || 0));
    if (dealChanged) {
      if (!channel.pplSettingsHistory) channel.pplSettingsHistory = [];
      channel.pplSettingsHistory.push({
        changedAt: new Date(),
        productPrice: prev.productPrice,
        cost: prev.cost,
        shippingCost: prev.shippingCost,
        giftCost: prev.giftCost,
        pgFeeRate: prev.pgFeeRate,
        totalMG: prev.totalMG,
        agencyMGShareRate: prev.agencyMGShareRate,
        rsRate: prev.rsRate
      });
    }

    channel.pplSettings = nextSettings;
    channel.dealConfigured = true;

    // 새로운 설정으로 PPL 계산 업데이트
    const pplData = calculatePPLSummary(channel.videos, channel.pplSettings);
    const today = new Date().toISOString().split('T')[0];
    const todayStatIndex = channel.dailyStats.findIndex(d => d.date === today);

    if (todayStatIndex >= 0) {
      channel.dailyStats[todayStatIndex] = {
        date: today,
        engagement: parseFloat(pplData.engagement),
        avgViews: pplData.avgViews,
        predictedRevenue: pplData.expectedRevenue,
        riskLevel: pplData.riskLevel
      };
    }

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH: 딜 조건 변경 이력 항목 수정 (예: 채널 생성 초기 placeholder 값이 잘못 기록된 경우 실제 값으로 정정)
app.patch('/api/channels/:id/settings-history/:historyId', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });

    const entry = channel.pplSettingsHistory.id(req.params.historyId);
    if (!entry) return res.status(404).json({ error: '이력 항목을 찾을 수 없습니다' });

    const FIELDS = ['productPrice', 'cost', 'shippingCost', 'giftCost', 'pgFeeRate', 'totalMG', 'agencyMGShareRate', 'rsRate'];
    FIELDS.forEach(f => {
      if (req.body[f] !== undefined) entry[f] = toNonNegativeNumber(req.body[f], entry[f] || 0);
    });
    if (req.body.changedAt) entry.changedAt = new Date(req.body.changedAt);

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: 딜 조건 변경 이력 항목 삭제 (잘못 기록된 항목 정리용)
app.delete('/api/channels/:id/settings-history/:historyId', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });

    const entry = channel.pplSettingsHistory.id(req.params.historyId);
    if (!entry) return res.status(404).json({ error: '이력 항목을 찾을 수 없습니다' });
    entry.deleteOne();

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: 채널 삭제
app.delete('/api/channels/:id', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    await Channel.findByIdAndDelete(req.params.id);
    res.json({ message: '채널이 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH: 채널 메타 정보 (상태/메모/태그) 업데이트
app.patch('/api/channels/:id/meta', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const { status, memo, channelTags, audienceProfile } = req.body;
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });

    const allowed = ['관심', '협의중', '완료', '보류', '미분류'];
    if (status !== undefined) {
      if (!allowed.includes(status)) return res.status(400).json({ error: '유효하지 않은 상태값입니다' });
      channel.status = status;
    }
    if (memo !== undefined) channel.memo = memo;
    if (channelTags !== undefined) channel.channelTags = channelTags;

    // 시청자 프로필(연령대/성별/카테고리) — 공개 API로는 알 수 없어 수동 입력받는 값이라
    // 형식만 가볍게 정리(0~100% 범위, 빈 값은 null)하고 그대로 저장한다.
    if (audienceProfile !== undefined) {
      channel.audienceProfile = {
        category: (audienceProfile.category || '').trim(),
        age1824: toPercentOrNull(audienceProfile.age1824),
        age2534: toPercentOrNull(audienceProfile.age2534),
        age3544: toPercentOrNull(audienceProfile.age3544),
        age4554: toPercentOrNull(audienceProfile.age4554),
        age5564: toPercentOrNull(audienceProfile.age5564),
        genderMale: toPercentOrNull(audienceProfile.genderMale),
        genderFemale: toPercentOrNull(audienceProfile.genderFemale),
        source: (audienceProfile.source || '').trim(),
        updatedAt: new Date()
      };
    }

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: 캠페인 실적 기록 추가 (실제 판매수량/매출 — 향후 전환율 추정 정확도 개선용)
app.post('/api/channels/:id/campaign-logs', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    const { date, actualQty, actualRevenue, totalMG, videoId, note } = req.body;
    if (!date) return res.status(400).json({ error: '집계 기준일을 입력하세요' });
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ error: '집계 기준일은 YYYY-MM-DD 형식이어야 합니다' });
    }
    // 연결 영상은 실제로 이 채널의 영상이어야 한다 — 오타/유효하지 않은 videoId가 그대로 저장되면
    // 나중에 channel.videos와 조인할 때 조용히 매칭 실패해서 실측 CPV/조회수가 계속 "-"로만 보이게 된다.
    if (videoId && !channel.videos.some(v => v.videoId === videoId)) {
      return res.status(400).json({ error: '선택한 영상이 이 채널의 영상 목록에 없습니다' });
    }

    // 기록 당시의 예상치를 스냅샷으로 함께 저장해두면 나중에 "예상 대비 실제" 비교가 가능하다.
    const pplData = calculatePPLSummary(channel.videos, channel.pplSettings);

    channel.campaignLogs.push({
      date,
      actualQty: toNonNegativeNumber(actualQty, 0),
      actualRevenue: toNonNegativeNumber(actualRevenue, 0),
      totalMG: toNonNegativeNumber(totalMG, 0),
      videoId: videoId || null,
      expectedQtySnapshot: pplData.estimatedQty,
      expectedClicksSnapshot: pplData.expectedClicks,
      note: note || ''
    });

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: 캠페인 실적 기록 삭제
app.delete('/api/channels/:channelId/campaign-logs/:logId', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.channelId)) {
      return res.status(400).json({ error: '잘못된 ID 형식입니다' });
    }
    const channel = await Channel.findById(req.params.channelId);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    channel.campaignLogs = channel.campaignLogs.filter(
      log => log._id.toString() !== req.params.logId
    );

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PATCH: 특정 영상을 "우리 캠페인 영상"으로 수동 표시/해제
// isAd/hasPaidPromotion은 자동 감지(타 브랜드 광고 포함)라서, 우리가 실제로 집행한 캠페인인지는 별도로 표시해야 한다.
// 채널 갱신 시 유튜브 API로 영상 목록을 통째로 새로 받아오므로, 이 값은 preserveOurCampaignFlags()로 갱신 후에도 보존된다.
app.patch('/api/channels/:id/videos/:videoId/campaign-flag', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const { ourCampaign } = req.body || {};
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });

    const video = channel.videos.find(v => v.videoId === req.params.videoId);
    if (!video) return res.status(404).json({ error: '영상을 찾을 수 없습니다' });

    video.ourCampaign = !!ourCampaign;
    await channel.save();
    res.json({ videoId: video.videoId, ourCampaign: video.ourCampaign });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 요약 탭 공유 링크 API =====
// 외부에 공유할 때 로그인 없이도 요약 지표를 볼 수 있도록, 채널 ID 대신 추측 불가능한
// 토큰으로 접근하는 읽기 전용 공개 조회 경로를 별도로 둔다.
// external: 구독자/조회수/효율점수 등 채널 지표만 (MG 비용·ROI 등 금액 정보 제외)
// internal: PPL 매출 분석(MG/BEP/ROI 등)까지 전체 포함

// POST: 공유 링크 생성 (이미 있으면 기존 토큰을 그대로 반환 — 재생성 시 링크가 바뀌지 않도록)
app.post('/api/channels/:id/share', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const { type } = req.body || {};
    if (!['external', 'internal'].includes(type)) {
      return res.status(400).json({ error: 'type은 external 또는 internal 이어야 합니다' });
    }
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });

    if (!channel.shareTokens) channel.shareTokens = {};
    if (!channel.shareTokens[type]) {
      channel.shareTokens[type] = crypto.randomBytes(16).toString('hex');
      channel.markModified('shareTokens');
      await channel.save();
    }
    res.json({ type, token: channel.shareTokens[type] });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: 공유 링크 비활성화 (링크가 유출됐을 때 즉시 차단하는 용도)
app.delete('/api/channels/:id/share/:type', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const { type } = req.params;
    if (!['external', 'internal'].includes(type)) {
      return res.status(400).json({ error: 'type은 external 또는 internal 이어야 합니다' });
    }
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });

    if (channel.shareTokens) {
      channel.shareTokens[type] = null;
      channel.markModified('shareTokens');
      await channel.save();
    }
    res.json({ type, token: null });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 토큰으로 공개 요약 데이터 조회 (인증 없이 접근 가능 — 토큰 자체가 비밀키 역할)
app.get('/api/public/summary/:token', async (req, res) => {
  try {
    const { token } = req.params;
    const channel = await Channel.findOne({
      $or: [{ 'shareTokens.external': token }, { 'shareTokens.internal': token }]
    });
    if (!channel) {
      return res.status(404).json({ error: '유효하지 않거나 만료된 링크입니다' });
    }
    const mode = channel.shareTokens?.external === token ? 'external' : 'internal';

    const payload = {
      mode,
      channelName: channel.channelName,
      subscribers: channel.subscribers,
      totalViews: channel.totalViews,
      country: channel.country,
      channelPublishedAt: channel.channelPublishedAt,
      videos: channel.videos,
      dailyStats: channel.dailyStats
    };
    if (mode === 'internal') {
      payload.status = channel.status;
      payload.channelTags = channel.channelTags;
      payload.pplSettings = channel.pplSettings;
    }
    res.json(payload);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 품목(제품) 관리 API =====

// POST: 품목 추가
app.post('/api/items', requireAuth, async (req, res) => {
  try {
    const { name, sellPrice, cost, shippingCost, giftCost, memo } = req.body;
    if (!name || !String(name).trim()) return res.status(400).json({ error: '품목명을 입력하세요' });

    const item = new Item({
      name: String(name).trim(),
      sellPrice: toNonNegativeNumber(sellPrice),
      cost: toNonNegativeNumber(cost),
      shippingCost: toNonNegativeNumber(shippingCost),
      giftCost: toNonNegativeNumber(giftCost),
      memo: memo || ''
    });
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 품목 목록 조회
app.get('/api/items', requireAuth, async (req, res) => {
  try {
    const items = await Item.find().sort({ name: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT: 품목 수정
app.put('/api/items/:id', requireAuth, async (req, res) => {
  try {
    const { name, sellPrice, cost, shippingCost, giftCost, memo } = req.body;
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: '품목을 찾을 수 없습니다' });

    if (name !== undefined && String(name).trim()) item.name = String(name).trim();
    if (sellPrice !== undefined) item.sellPrice = toNonNegativeNumber(sellPrice, item.sellPrice);
    if (cost !== undefined) item.cost = toNonNegativeNumber(cost, item.cost);
    if (shippingCost !== undefined) item.shippingCost = toNonNegativeNumber(shippingCost, item.shippingCost);
    if (giftCost !== undefined) item.giftCost = toNonNegativeNumber(giftCost, item.giftCost);
    if (memo !== undefined) item.memo = memo;
    item.updatedAt = new Date();

    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: 품목 삭제
app.delete('/api/items/:id', requireAuth, async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: '품목이 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Excel 다운로드
app.get('/api/channels/:id/export', requireAuth, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    const workbook = new ExcelJS.Workbook();

    // Sheet 1: 요약
    const summarySheet = workbook.addWorksheet('요약 분석');
    summarySheet.columns = [
      { header: '항목', key: 'item', width: 20 },
      { header: '값', key: 'value', width: 20 }
    ];

    const pplData = calculatePPLSummary(channel.videos, channel.pplSettings);
    const s = channel.pplSettings;
    const summaryData = [
      { item: '채널명', value: channel.channelName },
      { item: '구독자', value: (channel.subscribers / 1000000).toFixed(1) + 'M' },
      { item: '총 조회수', value: (channel.totalViews / 1000000000).toFixed(1) + 'B' },
      { item: '인게이지먼트율', value: pplData.engagement + '%' },
      { item: '', value: '' },
      { item: '품목명', value: s.itemName || '(미선택)' },
      { item: '상품 판매가', value: (s.productPrice || 0).toLocaleString() + '원' },
      { item: '원가', value: (s.cost || 0).toLocaleString() + '원' },
      { item: '배송비', value: (s.shippingCost || 0).toLocaleString() + '원' },
      { item: '사은품 비용', value: (s.giftCost || 0).toLocaleString() + '원' },
      { item: 'PG 수수료율', value: ((s.pgFeeRate || 0) * 100).toFixed(2) + '%' },
      { item: '', value: '' },
      { item: '총 MG 비용', value: (s.totalMG || 0).toLocaleString() + '원' },
      { item: '대행사(쇼크) MG 분담금', value: pplData.agencyMGShare.toLocaleString() + '원' },
      { item: '우리측 MG 부담금', value: pplData.ourMGShare.toLocaleString() + '원' },
      { item: 'RS율(대행사 지급)', value: ((s.rsRate || 0) * 100).toFixed(1) + '%' },
      { item: '', value: '' },
      { item: '평균 조회수(최근 롱폼 10개)', value: pplData.avgViews.toLocaleString() + '회' },
      { item: 'CPV(조회수당 비용)', value: pplData.cpv !== null ? pplData.cpv.toLocaleString() + '원' : '계산 불가' },
      { item: '예상 클릭수', value: (pplData.expectedClicks || 0).toLocaleString() + '회' },
      { item: '예상 클릭률(조회수 대비)', value: pplData.clickRate !== null ? pplData.clickRate + '%' : '계산 불가' },
      { item: '예상 전환율', value: ((s.expectedConversionRate || 0) * 100).toFixed(2) + '%' },
      { item: '', value: '' },
      { item: '예상 판매수량', value: pplData.estimatedQty.toLocaleString() + '개' },
      { item: '예상 매출', value: pplData.expectedRevenue.toLocaleString() + '원' },
      { item: '개당 기여마진', value: pplData.unitMargin.toLocaleString() + '원' },
      { item: '순이익', value: pplData.netProfit.toLocaleString() + '원' },
      { item: 'ROI', value: pplData.roi !== null ? pplData.roi + '%' : '계산 불가' },
      { item: 'ROAS', value: pplData.roas !== null ? pplData.roas + '%' : '계산 불가' },
      { item: 'BEP 판매수량', value: pplData.bepQty !== null ? pplData.bepQty.toLocaleString() + '개' : '계산 불가' },
      { item: 'BEP 매출', value: pplData.bepRevenue !== null ? pplData.bepRevenue.toLocaleString() + '원' : '계산 불가' },
      { item: '위험도', value: pplData.riskLevel }
    ];

    summaryData.forEach(row => summarySheet.addRow(row));

    // Sheet 2: 영상 분석
    const videoSheet = workbook.addWorksheet('영상별 분석');
    videoSheet.columns = [
      { header: '순번', key: 'index', width: 8 },
      { header: '영상 제목', key: 'title', width: 40 },
      { header: '조회수', key: 'views', width: 15 },
      { header: '좋아요', key: 'likes', width: 12 },
      { header: '댓글', key: 'comments', width: 12 },
      { header: '인게이지먼트', key: 'engagement', width: 15 },
      { header: '업로드일', key: 'uploadDate', width: 15 },
      { header: '광고/PPL 여부', key: 'isAd', width: 14 },
      { header: '우리 캠페인', key: 'ourCampaign', width: 12 }
    ];

    channel.videos.forEach((video, index) => {
      videoSheet.addRow({
        index: index + 1,
        title: video.title,
        views: video.views.toLocaleString(),
        likes: video.likes.toLocaleString(),
        comments: video.comments.toLocaleString(),
        engagement: video.engagement + '%',
        uploadDate: new Date(video.uploadDate).toLocaleDateString('ko-KR'),
        isAd: video.isAd ? '광고' : '',
        ourCampaign: video.ourCampaign ? '✓' : ''
      });
    });

    // Sheet 3: 일일 통계
    const dailySheet = workbook.addWorksheet('일일 통계');
    dailySheet.columns = [
      { header: '날짜', key: 'date', width: 15 },
      { header: '인게이지먼트', key: 'engagement', width: 15 },
      { header: '평균 조회수', key: 'avgViews', width: 15 },
      { header: '예상 매출', key: 'revenue', width: 15 },
      { header: '위험도', key: 'riskLevel', width: 12 }
    ];

    channel.dailyStats.forEach(stat => {
      dailySheet.addRow({
        date: stat.date,
        engagement: stat.engagement + '%',
        avgViews: stat.avgViews.toLocaleString(),
        revenue: stat.predictedRevenue.toLocaleString() + '원',
        riskLevel: stat.riskLevel
      });
    });

    // 파일 저장
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="PPL_분석_${channel.channelName}_${new Date().toISOString().split('T')[0]}.xlsx"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: 댓글 분석 (구매의도 + 품질 점수)
app.post('/api/channels/:id/analyze-comments', requireAuth, requireChannelOwner, async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) return res.status(404).json({ error: '채널을 찾을 수 없습니다' });

    // 롱폼 영상(10분↑) 조회수 상위 10개
    const longformVideos = channel.videos
      .filter(v => v.duration > 600)
      .sort((a, b) => b.views - a.views)
      .slice(0, 10);

    if (longformVideos.length === 0) {
      return res.status(400).json({ error: '분석할 롱폼 영상이 없습니다' });
    }

    const PURCHASE_KEYWORDS = ['어디서', '얼마', '구매', '살까', '링크', '쿠팡', '직구', '추천', '구입', '가격', '파는곳', '사고싶', '구매처', '살수있', '어디파', '주문'];
    const NEGATIVE_KEYWORDS  = ['광고', '스킵', '협찬', '뒷광고', '광고하네', '스폰서', '협찬글'];

    let allComments = [];
    let purchaseComments = [];

    for (const video of longformVideos) {
      try {
        const response = await axios.get(`${analyzer.baseURL}/commentThreads`, {
          params: { part: 'snippet,replies', videoId: video.videoId, maxResults: 20, order: 'relevance', key: analyzer.apiKey }
        });
        const items = response.data.items || [];
        items.forEach(item => {
          const text = item.snippet.topLevelComment.snippet.textDisplay;
          const cleanText = text.replace(/<[^>]*>/g, '');
          const comment = {
            text: cleanText,
            likeCount: item.snippet.topLevelComment.snippet.likeCount || 0,
            replyCount: item.snippet.totalReplyCount || 0,
          };
          allComments.push(comment);
          if (PURCHASE_KEYWORDS.some(k => cleanText.includes(k))) {
            purchaseComments.push(cleanText.slice(0, 120));
          }
        });
      } catch (e) { /* 댓글 비활성화 영상 스킵 */ }
    }

    if (allComments.length === 0) {
      return res.status(400).json({ error: '댓글을 가져올 수 없습니다. 채널 댓글이 비활성화됐을 수 있습니다.' });
    }

    const purchaseCount  = allComments.filter(c => PURCHASE_KEYWORDS.some(k => c.text.includes(k))).length;
    const negativeCount  = allComments.filter(c => NEGATIVE_KEYWORDS.some(k => c.text.includes(k))).length;
    const withReplies    = allComments.filter(c => c.replyCount > 0).length;
    const avgLength      = allComments.reduce((s, c) => s + c.text.length, 0) / allComments.length;

    const purchaseIntentRatio = purchaseCount / allComments.length;
    const negativeRatio       = negativeCount / allComments.length;
    const replyRatio          = withReplies / allComments.length;

    // 댓글 품질 점수 (0-100)
    let qualityScore = 0;
    qualityScore += Math.min(purchaseIntentRatio * 400, 40);   // 구매의도 최대 40점
    qualityScore += Math.min((avgLength / 20) * 25, 25);       // 댓글 길이 최대 25점 (20자 기준)
    qualityScore += Math.min(replyRatio * 100, 20);            // 답글 비율 최대 20점
    qualityScore -= Math.min(negativeRatio * 150, 15);         // 부정 키워드 최대 -15점
    qualityScore = Math.max(0, Math.min(100, Math.round(qualityScore)));

    channel.commentAnalysis = {
      lastAnalyzed: new Date(),
      totalCommentsFetched: allComments.length,
      purchaseIntentRatio: parseFloat(purchaseIntentRatio.toFixed(4)),
      avgCommentLength: parseFloat(avgLength.toFixed(1)),
      replyRatio: parseFloat(replyRatio.toFixed(4)),
      negativeRatio: parseFloat(negativeRatio.toFixed(4)),
      qualityScore,
      topPurchaseComments: purchaseComments.slice(0, 5),
    };

    await channel.save();
    res.json(channel);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 채널 검색 및 PPL 적합도 분석
app.get('/api/search', requireAuth, async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) return res.status(400).json({ error: '검색어를 입력하세요' });

    const cacheKey = keyword.trim().toLowerCase();
    const cached = searchCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < SEARCH_CACHE_TTL_MS) {
      return res.json(cached.data);
    }

    // 1. 채널 검색
    const searchResponse = await axios.get(`${analyzer.baseURL}/search`, {
      params: { part: 'snippet', q: keyword, type: 'channel', maxResults: 10, regionCode: 'KR', relevanceLanguage: 'ko', key: analyzer.apiKey }
    });
    if (!searchResponse.data.items?.length) {
      searchCache.set(cacheKey, { timestamp: Date.now(), data: [] });
      return res.json([]);
    }

    const channelIds = searchResponse.data.items.map(item => item.snippet.channelId);

    // 2. 채널 상세 정보
    const channelResponse = await axios.get(`${analyzer.baseURL}/channels`, {
      params: { part: 'statistics,snippet,contentDetails', id: channelIds.join(','), key: analyzer.apiKey }
    });

    // 3. 채널별 최근 영상 분석 + PPL 점수 계산
    const results = await Promise.all(channelResponse.data.items.map(async (channel) => {
      const stats = channel.statistics;
      const snippet = channel.snippet;
      let engagement = 0, longformRatio = 0, recentUpload = null;

      try {
        const uploadPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads;
        if (uploadPlaylistId) {
          const plRes = await axios.get(`${analyzer.baseURL}/playlistItems`, {
            params: { part: 'contentDetails', playlistId: uploadPlaylistId, maxResults: 10, key: analyzer.apiKey }
          });
          const videoIds = plRes.data.items.map(i => i.contentDetails.videoId);
          if (videoIds.length > 0) {
            const vidRes = await axios.get(`${analyzer.baseURL}/videos`, {
              params: { part: 'statistics,contentDetails,snippet', id: videoIds.join(','), key: analyzer.apiKey }
            });
            const videos = vidRes.data.items.map(v => ({
              views: parseInt(v.statistics.viewCount || 0),
              likes: parseInt(v.statistics.likeCount || 0),
              comments: parseInt(v.statistics.commentCount || 0),
              duration: analyzer.parseDuration(v.contentDetails.duration),
              publishedAt: v.snippet.publishedAt
            }));
            const totalEng = videos.reduce((s, v) => s + (v.views > 0 ? (v.likes + v.comments) / v.views : 0), 0);
            engagement = videos.length > 0 ? (totalEng / videos.length * 100) : 0;
            const lfCount = videos.filter(v => v.duration > 600).length;
            longformRatio = videos.length > 0 ? (lfCount / videos.length * 100) : 0;
            recentUpload = videos[0]?.publishedAt || null;
          }
        }
      } catch (e) { /* 영상 조회 실패 시 점수 0으로 계속 */ }

      // PPL 적합도 점수 계산 (0~100)
      const subscribers = parseInt(stats.subscriberCount || 0);
      let score = 0;
      // 구독자 (30점): 10만~100만이 안마기 PPL 최적 범위
      if (subscribers >= 100000 && subscribers <= 1000000) score += 30;
      else if (subscribers >= 10000 && subscribers < 100000) score += 15;
      else if (subscribers > 1000000 && subscribers <= 5000000) score += 20;
      else if (subscribers > 5000000) score += 10;
      // 인게이지먼트 (25점)
      if (engagement >= 5) score += 25;
      else if (engagement >= 3) score += 20;
      else if (engagement >= 1) score += 10;
      // 롱폼 비중 (20점): 안마기 PPL은 롱폼에서 효과적
      if (longformRatio >= 60) score += 20;
      else if (longformRatio >= 30) score += 10;
      // 최근 활동 (15점)
      if (recentUpload) {
        const days = (Date.now() - new Date(recentUpload)) / 86400000;
        if (days <= 30) score += 15;
        else if (days <= 60) score += 10;
        else if (days <= 90) score += 5;
      }
      // 한국 채널 (10점)
      if (snippet.country === 'KR') score += 10;

      return {
        channelId: channel.id,
        channelName: snippet.title,
        description: (snippet.description || '').slice(0, 150),
        thumbnail: snippet.thumbnails?.medium?.url || '',
        subscribers,
        totalViews: parseInt(stats.viewCount || 0),
        videoCount: parseInt(stats.videoCount || 0),
        country: snippet.country || '',
        publishedAt: snippet.publishedAt,
        engagement: parseFloat(engagement.toFixed(2)),
        longformRatio: parseFloat(longformRatio.toFixed(0)),
        recentUpload,
        pplScore: Math.min(score, 100)
      };
    }));

    results.sort((a, b) => b.pplScore - a.pplScore);
    searchCache.set(cacheKey, { timestamp: Date.now(), data: results });
    res.json(results);
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error('[검색 실패]', detail, error.response?.data || '');
    res.status(500).json({ error: detail });
  }
});

// 자동 스케줄링
async function setupScheduling() {
  // 매일 KST 03:00 (UTC 18:00) 자동 갱신
  schedule.scheduleJob('0 18 * * *', async () => {
    console.log('[스케줄] 일일 자동 갱신 시작 (KST 03:00)');
    try {
      const channels = await Channel.find();
      console.log(`[스케줄] 총 ${channels.length}개 채널 갱신 예정`);
      for (const channel of channels) {
        // 채널 간 5초 딜레이 — YouTube API 쿼터 보호
        await new Promise(res => setTimeout(res, 5000));
        try {
          const channelInfo = await analyzer.getChannelInfo(channel.channelId);
          const videos = await analyzer.getChannelVideos(channel.channelId);

          applyChannelRefresh(channel, channelInfo, videos);

          await channel.save();
          console.log(`[스케줄] ✓ ${channel.channelName} 갱신 완료 (${videos.length}개 영상)`);
        } catch (error) {
          console.error(`[스케줄] ✗ ${channel.channelName} 실패:`, error.message);
        }
      }
      console.log('[스케줄] 일일 자동 갱신 완료');
    } catch (error) {
      console.error('[스케줄] 오류:', error.message);
    }
  });

  console.log('✓ 자동 스케줄링 설정 완료 (매일 KST 03:00 갱신)');
}

async function startServer() {
  try {
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/youtube-analyzer');
    console.log('✓ MongoDB 연결 성공');

    await setupScheduling();

    const PORT = process.env.PORT || 3001;
    app.listen(PORT, () => {
      console.log(`✓ 서버 시작: http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error('서버 시작 실패:', error.message);
    process.exit(1);
  }
}

startServer();

module.exports = app;
