const express = require('express');
const axios = require('axios');
const schedule = require('node-schedule');
const mongoose = require('mongoose');
const cors = require('cors');
const ExcelJS = require('exceljs');
require('dotenv').config();

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
app.use(cors());
app.use(express.json());

const channelSchema = new mongoose.Schema({
  channelId: String,
  channelName: String,
  subscribers: Number,
  totalViews: Number,
  
  // PPL 설정
  pplSettings: {
    productPrice: { type: Number, default: 50000 },
    adBudget: { type: Number, default: 1000000 },
    expectedClicks: { type: Number, default: 0 },       // 예상 클릭수 (영상→구매페이지 유입 예상치)
    expectedConversionRate: { type: Number, default: 0.03 },
    commissionRate: { type: Number, default: 0.1 },
    targetROI: { type: Number, default: 3 },

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
  
  // 일일 누적 통계
  dailyStats: [{
    date: String,
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
    collectedAt: { type: Date, default: Date.now }
  }],
  
  history: [{
    date: Date,
    engagement: Number,
    avgViews: Number,
    predictedRevenue: Number
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

class YouTubeAnalyzer {
  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://www.googleapis.com/youtube/v3';
  }

  async getChannelInfo(channelId) {
    try {
      let channelId_real = channelId;
      
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
      return {
        channelId: channel.id,
        channelName: channel.snippet.title,
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

  async getChannelVideos(channelId, maxResults = 30) {
    try {
      const channelResponse = await axios.get(`${this.baseURL}/channels`, {
        params: {
          part: 'contentDetails',
          id: channelId,
          key: this.apiKey
        }
      });

      const uploadPlaylistId = channelResponse.data.items[0].contentDetails.relatedPlaylists.uploads;

      const playlistResponse = await axios.get(`${this.baseURL}/playlistItems`, {
        params: {
          part: 'contentDetails',
          playlistId: uploadPlaylistId,
          maxResults: maxResults,
          key: this.apiKey
        }
      });

      const videoIds = playlistResponse.data.items.map(item => item.contentDetails.videoId);

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
          const engagement = (parseInt(stats.likeCount || 0) + parseInt(stats.commentCount || 0)) / parseInt(stats.viewCount || 1);
          const hasPaidPromotion = video.paidProductPlacementDetails?.hasPaidProductPlacement || false;
          const hasSponsorKeyword = detectSponsorKeyword(video.snippet.description);

          videos.push({
            videoId: video.id,
            title: video.snippet.title,
            views: parseInt(stats.viewCount || 0),
            likes: parseInt(stats.likeCount || 0),
            comments: parseInt(stats.commentCount || 0),
            uploadDate: new Date(video.snippet.publishedAt),
            duration: this.parseDuration(video.contentDetails.duration),
            engagement: (engagement * 100).toFixed(2),
            tags: video.snippet.tags || [],
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

  calculatePPLRevenue(videos, settings) {
    const engagement = parseFloat(this.calculateEngagement(videos)) / 100;
    const avgViews = videos.reduce((sum, v) => sum + v.views, 0) / videos.length;
    
    const expectedRevenue = avgViews * engagement * settings.expectedConversionRate * settings.productPrice;
    const commission = expectedRevenue * settings.commissionRate;
    const netProfit = expectedRevenue - commission - settings.adBudget;
    const roi = (netProfit / settings.adBudget * 100).toFixed(2);
    
    let riskLevel = '높음';
    if (roi > 200 && engagement > 0.05) riskLevel = '낮음';
    else if (roi > 100 && engagement > 0.02) riskLevel = '중간';

    return {
      avgViews: Math.round(avgViews),
      engagement: engagement.toFixed(4),
      expectedRevenue: Math.round(expectedRevenue),
      commission: Math.round(commission),
      netProfit: Math.round(netProfit),
      roi: parseFloat(roi),
      riskLevel: riskLevel
    };
  }
}

const analyzer = new YouTubeAnalyzer(process.env.YOUTUBE_API_KEY);

// POST: 채널 추가
app.post('/api/channels', async (req, res) => {
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
      adBudget: 1000000,
      expectedClicks: 0,
      expectedConversionRate: 0.03,
      commissionRate: 0.1,
      cost: 0, shippingCost: 0, giftCost: 0, pgFeeRate: 0.0385,
      totalMG: 0, agencyMGShareRate: 0.3, rsRate: 0.2
    });

    const channel = new Channel({
      channelId: channelInfo.channelId,
      channelName: channelInfo.channelName,
      subscribers: channelInfo.subscribers,
      totalViews: channelInfo.totalViews,
      country: channelInfo.country,
      channelKeywords: channelInfo.channelKeywords,
      channelPublishedAt: channelInfo.channelPublishedAt,
      videoCount: channelInfo.videoCount,
      pplSettings: {
        productPrice: 50000,
        adBudget: 1000000,
        expectedClicks: 0,
        expectedConversionRate: 0.03,
        commissionRate: 0.1,
        targetROI: 3
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

// GET: 모든 채널 조회
app.get('/api/channels', async (req, res) => {
  try {
    const channels = await Channel.find().sort({ lastUpdated: -1 });
    res.json(channels);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 특정 채널 조회
app.get('/api/channels/:id', async (req, res) => {
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
app.post('/api/channels/:id/refresh', async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    const channelInfo = await analyzer.getChannelInfo(channel.channelId);
    const videos = await analyzer.getChannelVideos(channel.channelId);

    const newVideos = videos.filter(v => 
      !channel.videos.some(existing => existing.videoId === v.videoId)
    );

    const pplData = calculatePPLSummary(videos, channel.pplSettings);
    const today = new Date().toISOString().split('T')[0];
    const todayStats = channel.dailyStats.find(d => d.date === today);

    if (!todayStats) {
      channel.dailyStats.push({
        date: today,
        engagement: parseFloat(pplData.engagement),
        avgViews: pplData.avgViews,
        predictedRevenue: pplData.expectedRevenue,
        riskLevel: pplData.riskLevel
      });
    }

    channel.channelName = channelInfo.channelName;
    channel.subscribers = channelInfo.subscribers;
    channel.totalViews = channelInfo.totalViews;
    channel.country = channelInfo.country;
    channel.channelKeywords = channelInfo.channelKeywords;
    channel.videoCount = channelInfo.videoCount;
    // 기존 영상 유지 + 새 영상만 추가 (누적)
    channel.videos = [...channel.videos, ...newVideos];
    channel.lastUpdated = new Date();

    channel.history.push({
      date: new Date(),
      engagement: parseFloat(pplData.engagement),
      avgViews: pplData.avgViews,
      predictedRevenue: pplData.expectedRevenue
    });

    if (channel.history.length > 90) {
      channel.history = channel.history.slice(-90);
    }

    await channel.save();
    res.json({
      message: '데이터 업데이트 완료',
      newVideosDetected: newVideos.length,
      channel
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// POST: PPL 설정 저장
app.post('/api/channels/:id/settings', async (req, res) => {
  try {
    const channel = await Channel.findById(req.params.id);
    if (!channel) {
      return res.status(404).json({ error: '채널을 찾을 수 없습니다' });
    }

    channel.pplSettings = {
      productPrice: req.body.productPrice || 50000,
      adBudget: req.body.adBudget || 1000000,
      expectedClicks: req.body.expectedClicks || 0,
      expectedConversionRate: req.body.expectedConversionRate || 0.03,
      commissionRate: req.body.commissionRate || 0.1,
      targetROI: req.body.targetROI || 3,

      itemId: req.body.itemId || null,
      itemName: req.body.itemName || '',
      cost: req.body.cost || 0,
      shippingCost: req.body.shippingCost || 0,
      giftCost: req.body.giftCost || 0,
      pgFeeRate: req.body.pgFeeRate ?? 0.0385,

      totalMG: req.body.totalMG || 0,
      agencyMGShareRate: req.body.agencyMGShareRate ?? 0.3,
      rsRate: req.body.rsRate ?? 0.2
    };

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

// DELETE: 채널 삭제
app.delete('/api/channels/:id', async (req, res) => {
  try {
    await Channel.findByIdAndDelete(req.params.id);
    res.json({ message: '채널이 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ===== 품목(제품) 관리 API =====

// POST: 품목 추가
app.post('/api/items', async (req, res) => {
  try {
    const { name, sellPrice, cost, shippingCost, giftCost, memo } = req.body;
    if (!name) return res.status(400).json({ error: '품목명을 입력하세요' });

    const item = new Item({
      name,
      sellPrice: sellPrice || 0,
      cost: cost || 0,
      shippingCost: shippingCost || 0,
      giftCost: giftCost || 0,
      memo: memo || ''
    });
    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: 품목 목록 조회
app.get('/api/items', async (req, res) => {
  try {
    const items = await Item.find().sort({ name: 1 });
    res.json(items);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// PUT: 품목 수정
app.put('/api/items/:id', async (req, res) => {
  try {
    const { name, sellPrice, cost, shippingCost, giftCost, memo } = req.body;
    const item = await Item.findById(req.params.id);
    if (!item) return res.status(404).json({ error: '품목을 찾을 수 없습니다' });

    if (name !== undefined) item.name = name;
    if (sellPrice !== undefined) item.sellPrice = sellPrice;
    if (cost !== undefined) item.cost = cost;
    if (shippingCost !== undefined) item.shippingCost = shippingCost;
    if (giftCost !== undefined) item.giftCost = giftCost;
    if (memo !== undefined) item.memo = memo;
    item.updatedAt = new Date();

    await item.save();
    res.json(item);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// DELETE: 품목 삭제
app.delete('/api/items/:id', async (req, res) => {
  try {
    await Item.findByIdAndDelete(req.params.id);
    res.json({ message: '품목이 삭제되었습니다' });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// GET: Excel 다운로드
app.get('/api/channels/:id/export', async (req, res) => {
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
      { header: '광고/PPL 여부', key: 'isAd', width: 14 }
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
        isAd: video.isAd ? '광고' : ''
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
app.post('/api/channels/:id/analyze-comments', async (req, res) => {
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
app.get('/api/search', async (req, res) => {
  try {
    const { keyword } = req.query;
    if (!keyword) return res.status(400).json({ error: '검색어를 입력하세요' });

    // 1. 채널 검색
    const searchResponse = await axios.get(`${analyzer.baseURL}/search`, {
      params: { part: 'snippet', q: keyword, type: 'channel', maxResults: 10, regionCode: 'KR', relevanceLanguage: 'ko', key: analyzer.apiKey }
    });
    if (!searchResponse.data.items?.length) return res.json([]);

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
    res.json(results);
  } catch (error) {
    const detail = error.response?.data?.error?.message || error.message;
    console.error('[검색 실패]', detail, error.response?.data || '');
    res.status(500).json({ error: detail });
  }
});

// 자동 스케줄링
async function setupScheduling() {
  schedule.scheduleJob('0 1 * * *', async () => {
    console.log('[스케줄] 일일 자동 업데이트 시작...');
    try {
      const channels = await Channel.find();
      for (const channel of channels) {
        try {
          const videos = await analyzer.getChannelVideos(channel.channelId);
          channel.videos = videos;
          channel.lastUpdated = new Date();

          const pplData = calculatePPLSummary(videos, channel.pplSettings);
          const today = new Date().toISOString().split('T')[0];
          const todayStats = channel.dailyStats.find(d => d.date === today);

          if (!todayStats) {
            channel.dailyStats.push({
              date: today,
              engagement: parseFloat(pplData.engagement),
              avgViews: pplData.avgViews,
              predictedRevenue: pplData.expectedRevenue,
              riskLevel: pplData.riskLevel
            });
          }

          await channel.save();
          console.log(`✓ ${channel.channelName} 업데이트 완료`);
        } catch (error) {
          console.error(`✗ ${channel.channelName} 실패:`, error.message);
        }
      }
    } catch (error) {
      console.error('[스케줄] 오류:', error.message);
    }
  });

  console.log('✓ 자동 스케줄링 설정 완료');
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
