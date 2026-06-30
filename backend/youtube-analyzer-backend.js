const express = require('express');
const axios = require('axios');
const schedule = require('node-schedule');
const mongoose = require('mongoose');
const cors = require('cors');
const ExcelJS = require('exceljs');
require('dotenv').config();

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
    expectedConversionRate: { type: Number, default: 0.03 },
    commissionRate: { type: Number, default: 0.1 },
    targetROI: { type: Number, default: 3 }
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
    collectedAt: { type: Date, default: Date.now }
  }],
  
  history: [{
    date: Date,
    engagement: Number,
    avgViews: Number,
    predictedRevenue: Number
  }],
  
  lastUpdated: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const Channel = mongoose.model('Channel', channelSchema);

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
          part: 'statistics,snippet',
          id: channelId_real,
          key: this.apiKey
        }
      });

      if (response.data.items.length === 0) {
        throw new Error('채널을 찾을 수 없습니다');
      }

      const channel = response.data.items[0];
      return {
        channelId: channel.id,
        channelName: channel.snippet.title,
        subscribers: parseInt(channel.statistics.subscriberCount || 0),
        totalViews: parseInt(channel.statistics.viewCount || 0)
      };
    } catch (error) {
      console.error('채널 정보 조회 실패:', error.message);
      throw error;
    }
  }

  async getChannelVideos(channelId, maxResults = 50) {
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
            part: 'statistics,snippet,contentDetails',
            id: batch.join(','),
            key: this.apiKey
          }
        });

        for (const video of videoResponse.data.items) {
          const stats = video.statistics;
          const engagement = (parseInt(stats.likeCount || 0) + parseInt(stats.commentCount || 0)) / parseInt(stats.viewCount || 1);

          videos.push({
            videoId: video.id,
            title: video.snippet.title,
            views: parseInt(stats.viewCount || 0),
            likes: parseInt(stats.likeCount || 0),
            comments: parseInt(stats.commentCount || 0),
            uploadDate: new Date(video.snippet.publishedAt),
            duration: this.parseDuration(video.contentDetails.duration),
            engagement: (engagement * 100).toFixed(2)
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
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
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

    const pplData = analyzer.calculatePPLRevenue(videos, {
      productPrice: 50000,
      adBudget: 1000000,
      expectedConversionRate: 0.03,
      commissionRate: 0.1
    });

    const channel = new Channel({
      channelId: channelInfo.channelId,
      channelName: channelInfo.channelName,
      subscribers: channelInfo.subscribers,
      totalViews: channelInfo.totalViews,
      pplSettings: {
        productPrice: 50000,
        adBudget: 1000000,
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

    const pplData = analyzer.calculatePPLRevenue(videos, channel.pplSettings);
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
    channel.videos = videos;
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
      expectedConversionRate: req.body.expectedConversionRate || 0.03,
      commissionRate: req.body.commissionRate || 0.1,
      targetROI: req.body.targetROI || 3
    };

    // 새로운 설정으로 PPL 계산 업데이트
    const pplData = analyzer.calculatePPLRevenue(channel.videos, channel.pplSettings);
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

    const pplData = analyzer.calculatePPLRevenue(channel.videos, channel.pplSettings);
    const summaryData = [
      { item: '채널명', value: channel.channelName },
      { item: '구독자', value: (channel.subscribers / 1000000).toFixed(1) + 'M' },
      { item: '총 조회수', value: (channel.totalViews / 1000000000).toFixed(1) + 'B' },
      { item: '인게이지먼트율', value: pplData.engagement + '%' },
      { item: '', value: '' },
      { item: '상품 객단가', value: channel.pplSettings.productPrice.toLocaleString() + '원' },
      { item: '광고비', value: channel.pplSettings.adBudget.toLocaleString() + '원' },
      { item: '예상 매출', value: pplData.expectedRevenue.toLocaleString() + '원' },
      { item: '수수료', value: pplData.commission.toLocaleString() + '원' },
      { item: '순이익', value: pplData.netProfit.toLocaleString() + '원' },
      { item: 'ROI', value: pplData.roi + '%' },
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
      { header: '업로드일', key: 'uploadDate', width: 15 }
    ];

    channel.videos.forEach((video, index) => {
      videoSheet.addRow({
        index: index + 1,
        title: video.title,
        views: video.views.toLocaleString(),
        likes: video.likes.toLocaleString(),
        comments: video.comments.toLocaleString(),
        engagement: video.engagement + '%',
        uploadDate: new Date(video.uploadDate).toLocaleDateString('ko-KR')
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

          const pplData = analyzer.calculatePPLRevenue(videos, channel.pplSettings);
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
