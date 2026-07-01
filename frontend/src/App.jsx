import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Eye, Plus, Trash2, RefreshCw, Loader, Download, ExternalLink, ArrowUp, ArrowDown, HelpCircle, Package, Pencil } from 'lucide-react';
import api, { addChannel, getChannels, refreshChannel, deleteChannel, searchChannels, analyzeComments, getItems, addItem, updateItem, deleteItem, addCampaignLog, deleteCampaignLog } from './api';

const InfoTooltip = ({ content, children }) => {
  const [showTooltip, setShowTooltip] = useState(false);
  return (
    <div className="relative inline-block">
      <div onMouseEnter={() => setShowTooltip(true)} onMouseLeave={() => setShowTooltip(false)} className="cursor-help inline-flex items-center gap-1">
        {children}
        <HelpCircle size={14} className="text-blue-400" />
      </div>
      {showTooltip && (
        <div className="absolute bottom-full left-0 mb-2 p-3 bg-slate-900 border border-blue-500 rounded text-xs text-slate-200 w-56 z-50 shadow-lg whitespace-normal">
          {content}
          <div className="absolute top-full left-4 w-2 h-2 bg-slate-900 border-r border-b border-blue-500"></div>
        </div>
      )}
    </div>
  );
};

export default function YouTubeAnalyzer() {
  const [channels, setChannels] = useState([]);
  const [channelInput, setChannelInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialLoad, setInitialLoad] = useState(true);
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState({});
  const [activeTab, setActiveTab] = useState('summary');
  const [settings, setSettings] = useState({
    productPrice: 50000, expectedClicks: 0, expectedConversionRate: 0.03,
    itemId: '', itemName: '', cost: 0, shippingCost: 0, giftCost: 0, pgFeeRate: 0.0385,
    totalMG: 0, agencyMGShareRate: 0.3, rsRate: 0.2
  });
  const [sortConfig, setSortConfig] = useState({ key: 'uploadDate', direction: 'desc' });
  const [analyzingComments, setAnalyzingComments] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [discoverKeyword, setDiscoverKeyword] = useState('안마기 리뷰');
  const [discoverResults, setDiscoverResults] = useState([]);
  const [discovering, setDiscovering] = useState(false);

  // 품목 관리
  const [items, setItems] = useState([]);
  const [showItemManager, setShowItemManager] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', sellPrice: '', cost: '', shippingCost: '', giftCost: '', memo: '' });
  const [editingItemId, setEditingItemId] = useState(null);

  // 캠페인 실적 기록
  const [campaignLogForm, setCampaignLogForm] = useState({ date: '', actualQty: '', actualRevenue: '', note: '' });

  useEffect(() => { loadChannels(); loadItems(); }, []);

  // 채널 선택 시 해당 채널의 설정값 로드
  useEffect(() => {
    const ch = channels.find(c => c._id === selectedChannelId);
    if (ch?.pplSettings) {
      setSettings({
        productPrice: ch.pplSettings.productPrice ?? 50000,
        expectedClicks: ch.pplSettings.expectedClicks ?? 0,
        expectedConversionRate: ch.pplSettings.expectedConversionRate ?? 0.03,
        itemId: ch.pplSettings.itemId ?? '',
        itemName: ch.pplSettings.itemName ?? '',
        cost: ch.pplSettings.cost ?? 0,
        shippingCost: ch.pplSettings.shippingCost ?? 0,
        giftCost: ch.pplSettings.giftCost ?? 0,
        pgFeeRate: ch.pplSettings.pgFeeRate ?? 0.0385,
        totalMG: ch.pplSettings.totalMG ?? 0,
        agencyMGShareRate: ch.pplSettings.agencyMGShareRate ?? 0.3,
        rsRate: ch.pplSettings.rsRate ?? 0.2,
      });
    }
  }, [selectedChannelId, channels]);

  const loadChannels = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getChannels();
      setChannels(data);
    } catch (err) {
      setError('채널 목록을 불러올 수 없습니다');
    } finally {
      setLoading(false);
      setInitialLoad(false);
    }
  };

  const loadItems = async () => {
    try {
      const data = await getItems();
      setItems(data);
    } catch (err) {
      // 품목 목록 로드 실패는 조용히 무시 (핵심 기능 아님)
    }
  };

  const resetItemForm = () => {
    setItemForm({ name: '', sellPrice: '', cost: '', shippingCost: '', giftCost: '', memo: '' });
    setEditingItemId(null);
  };

  const handleSaveItem = async () => {
    if (!itemForm.name.trim()) { setError('품목명을 입력하세요'); return; }
    try {
      const payload = {
        name: itemForm.name.trim(),
        sellPrice: Math.max(0, parseInt(itemForm.sellPrice) || 0),
        cost: Math.max(0, parseInt(itemForm.cost) || 0),
        shippingCost: Math.max(0, parseInt(itemForm.shippingCost) || 0),
        giftCost: Math.max(0, parseInt(itemForm.giftCost) || 0),
        memo: itemForm.memo || ''
      };
      if (editingItemId) {
        const updated = await updateItem(editingItemId, payload);
        setItems(items.map(it => it._id === editingItemId ? updated : it));
        setError('✓ 품목이 수정되었습니다');
      } else {
        const created = await addItem(payload);
        setItems([...items, created]);
        setError('✓ 품목이 등록되었습니다');
      }
      resetItemForm();
    } catch (err) {
      setError('품목 저장 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleEditItem = (item) => {
    setEditingItemId(item._id);
    setItemForm({
      name: item.name,
      sellPrice: item.sellPrice ?? '',
      cost: item.cost ?? '',
      shippingCost: item.shippingCost ?? '',
      giftCost: item.giftCost ?? '',
      memo: item.memo ?? ''
    });
  };

  const handleDeleteItem = async (itemId) => {
    if (!window.confirm('이 품목을 삭제하시겠습니까?')) return;
    try {
      await deleteItem(itemId);
      setItems(items.filter(it => it._id !== itemId));
      if (editingItemId === itemId) resetItemForm();
    } catch (err) {
      setError('품목 삭제 실패: ' + err.message);
    }
  };

  // 캠페인 실적 기록 추가 — 예상치(예상 클릭수×전환율) 대비 실제 결과를 남겨두면
  // 다음 캠페인의 전환율을 감으로 추정하는 대신 과거 실측 데이터로 보정할 수 있다.
  const handleAddCampaignLog = async (channelId) => {
    if (!campaignLogForm.date) { setError('집계 기준일을 입력하세요'); return; }
    try {
      const payload = {
        date: campaignLogForm.date,
        actualQty: Math.max(0, parseInt(campaignLogForm.actualQty) || 0),
        actualRevenue: Math.max(0, parseInt(campaignLogForm.actualRevenue) || 0),
        note: campaignLogForm.note || ''
      };
      const updated = await addCampaignLog(channelId, payload);
      setChannels(channels.map(ch => ch._id === channelId ? updated : ch));
      setCampaignLogForm({ date: '', actualQty: '', actualRevenue: '', note: '' });
      setError('✓ 캠페인 실적이 기록되었습니다');
    } catch (err) {
      setError('캠페인 실적 기록 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleDeleteCampaignLog = async (channelId, logId) => {
    if (!window.confirm('이 실적 기록을 삭제하시겠습니까?')) return;
    try {
      const updated = await deleteCampaignLog(channelId, logId);
      setChannels(channels.map(ch => ch._id === channelId ? updated : ch));
    } catch (err) {
      setError('실적 기록 삭제 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  // 품목 선택 시 판매가/원가/배송비/사은품비용 자동 반영
  const handleSelectItem = (itemId) => {
    const item = items.find(it => it._id === itemId);
    if (!item) {
      setSettings({ ...settings, itemId: '', itemName: '' });
      return;
    }
    setSettings({
      ...settings,
      itemId: item._id,
      itemName: item.name,
      productPrice: item.sellPrice ?? settings.productPrice,
      cost: item.cost ?? 0,
      shippingCost: item.shippingCost ?? 0,
      giftCost: item.giftCost ?? 0
    });
  };

  // MG/RS/BEP 손익 계산 (백엔드 calculatePPLProfit과 동일한 로직)
  const calculateBEP = (s) => {
    const sellPrice = Number(s.productPrice) || 0;
    const cost = Number(s.cost) || 0;
    const shippingCost = Number(s.shippingCost) || 0;
    const giftCost = Number(s.giftCost) || 0;
    const pgFeeRate = Number(s.pgFeeRate) || 0;
    const totalMG = Number(s.totalMG) || 0;
    const agencyMGShareRate = Number(s.agencyMGShareRate) || 0;
    const rsRate = Number(s.rsRate) || 0;

    const agencyMGShare = Math.round(totalMG * agencyMGShareRate);
    const ourMGShare = totalMG - agencyMGShare;
    const pgFee = sellPrice * pgFeeRate;
    const rsCost = sellPrice * rsRate;
    const unitMargin = sellPrice - cost - shippingCost - giftCost - pgFee - rsCost;
    const bepQty = unitMargin > 0 ? Math.ceil(ourMGShare / unitMargin) : null;
    const bepRevenue = bepQty ? bepQty * sellPrice : null;

    return { unitMargin: Math.round(unitMargin), agencyMGShare, ourMGShare, bepQty, bepRevenue };
  };

  const handleAddChannel = async () => {
    if (!channelInput.trim()) { setError('채널 ID를 입력하세요'); return; }
    try {
      setLoading(true);
      setError(null);
      const newChannel = await addChannel(channelInput.trim());
      setChannels([...channels, newChannel]);
      setChannelInput('');
      setShowAddForm(false);
      setSelectedChannelId(newChannel._id);
    } catch (err) {
      setError('채널 추가 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleRefreshChannel = async (channelId) => {
    try {
      setRefreshing({ ...refreshing, [channelId]: true });
      setError(null);
      const result = await refreshChannel(channelId);
      setChannels(channels.map(ch => ch._id === channelId ? result.channel : ch));
      if (result.newVideosDetected > 0) {
        setError(`✓ ${result.newVideosDetected}개의 새 영상이 감지되었습니다`);
      }
    } catch (err) {
      setError('새로고침 실패: ' + err.message);
    } finally {
      setRefreshing({ ...refreshing, [channelId]: false });
    }
  };

  const handleDeleteChannel = async (channelId) => {
    if (!window.confirm('이 채널을 삭제하시겠습니까?')) return;
    try {
      setError(null);
      await deleteChannel(channelId);
      setChannels(channels.filter(ch => ch._id !== channelId));
      if (selectedChannelId === channelId) { setSelectedChannelId(null); }
    } catch (err) {
      setError('삭제 실패: ' + err.message);
    }
  };

  const handleAnalyzeComments = async () => {
    if (!selectedChannel) return;
    try {
      setAnalyzingComments(true);
      setError(null);
      const updated = await analyzeComments(selectedChannel._id);
      setChannels(channels.map(ch => ch._id === updated._id ? updated : ch));
      setError('✓ 댓글 분석이 완료됐습니다');
    } catch (err) {
      setError('댓글 분석 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setAnalyzingComments(false);
    }
  };

  const handleDiscover = async () => {
    if (!discoverKeyword.trim()) return;
    try {
      setDiscovering(true);
      setError(null);
      const results = await searchChannels(discoverKeyword.trim());
      setDiscoverResults(results);
    } catch (err) {
      setError('채널 검색 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setDiscovering(false);
    }
  };

  const handleAddChannelById = async (channelId, channelName) => {
    try {
      setLoading(true);
      setError(null);
      const newChannel = await addChannel(channelId);
      setChannels(prev => [...prev, newChannel]);
      setSelectedChannelId(newChannel._id);
      setShowDiscover(false);
      setError(`✓ ${channelName} 채널이 추가됐습니다`);
    } catch (err) {
      setError('채널 추가 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    if (!selectedChannel) return;
    try {
      const response = await api.post(`/channels/${selectedChannel._id}/settings`, settings);
      const updated = response.data;
      setChannels(channels.map(ch => ch._id === selectedChannel._id ? updated : ch));
      setError('✓ 설정이 저장되었습니다');
    } catch (err) {
      setError('설정 저장 실패: ' + (err.response?.data?.error || err.message));
    }
  };

  const handleExportExcel = async () => {
    if (!selectedChannel) return;
    try {
      const response = await api.get(`/channels/${selectedChannel._id}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(response.data);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PPL_분석_${selectedChannel.channelName}.xlsx`;
      a.click();
    } catch (err) {
      let msg = err.message;
      if (err.response?.data instanceof Blob) {
        try {
          const text = await err.response.data.text();
          const parsed = JSON.parse(text);
          msg = parsed.error || msg;
        } catch (_) { /* blob이 JSON이 아니면 기본 메시지 사용 */ }
      } else if (err.response?.data?.error) {
        msg = err.response.data.error;
      }
      console.error('Excel export error:', err);
      setError('Excel 다운로드 실패: ' + msg);
    }
  };

  const filterVideos = (videos, type) => {
    return (videos || []).filter(v => {
      const duration = v.duration || 0;
      if (type === 'shorts') return duration <= 60;          // 60초 이하: 숏폼
      if (type === 'mid') return duration > 60 && duration <= 600;  // 1~10분: 미드폼
      if (type === 'longform') return duration > 600;        // 10분 초과: 롱폼
      return true;
    });
  };

  // PPL 매출/손익 분석 — MG/RS/원가 구조를 반영한 통합 계산
  // 예상 판매수량(예상 클릭수 × 전환율)에 개당 기여마진을 곱해 순이익을 구하고,
  // 우리측 MG 부담금(고정비)을 차감한다. (손익/BEP 탭의 calculateBEP와 동일한 원가 기준 사용)
  const calculatePPLRevenue = (videos) => {
    const longformVideos = filterVideos(videos, 'longform');
    if (!longformVideos || longformVideos.length === 0) {
      return { avgViews: 0, engagement: 0, expectedClicks: 0, clickRate: null, cpv: null, estimatedQty: 0, expectedRevenue: 0, unitMargin: 0, ourMGShare: 0, netProfit: 0, roi: null, roas: null, riskLevel: '평가 불가' };
    }
    const recentVideos = longformVideos.slice(0, 10);
    const engagement = recentVideos.reduce((sum, v) => sum + (parseFloat(v.engagement) || 0), 0) / recentVideos.length / 100;
    const avgViews = recentVideos.reduce((sum, v) => sum + (v.views || 0), 0) / recentVideos.length;
    const expectedClicks = Number(settings.expectedClicks) || 0;

    const estimatedQty = expectedClicks * settings.expectedConversionRate;
    const expectedRevenue = estimatedQty * settings.productPrice;
    const clickRate = avgViews > 0 ? (expectedClicks / avgViews * 100) : null;
    const cpv = avgViews > 0 ? Number((settings.totalMG / avgViews).toFixed(2)) : null;

    const bep = calculateBEP(settings);
    const netProfit = estimatedQty * bep.unitMargin - bep.ourMGShare;
    const roi = bep.ourMGShare > 0 ? (netProfit / bep.ourMGShare * 100) : null;
    const roas = bep.ourMGShare > 0 ? (expectedRevenue / bep.ourMGShare * 100) : null;

    // BEP 달성 여부(ROI 0% 기준)와 항상 일치하도록: ROI<0(BEP 미달)일 때만 '높음'
    let riskLevel = '평가 불가';
    if (roi !== null) {
      if (roi < 0) riskLevel = '높음';
      else if (roi < 100) riskLevel = '중간';
      else riskLevel = '낮음';
    }

    return {
      avgViews: Math.round(avgViews),
      engagement: (engagement * 100).toFixed(2),
      expectedClicks: Math.round(expectedClicks),
      clickRate: clickRate !== null ? parseFloat(clickRate.toFixed(2)) : null,
      cpv,
      estimatedQty: Math.round(estimatedQty),
      expectedRevenue: Math.round(expectedRevenue),
      unitMargin: bep.unitMargin,
      ourMGShare: bep.ourMGShare,
      bepQty: bep.bepQty,
      netProfit: Math.round(netProfit),
      roi: roi !== null ? parseFloat(roi.toFixed(2)) : null,
      roas: roas !== null ? parseFloat(roas.toFixed(2)) : null,
      riskLevel
    };
  };

  const calculateViewTrend = (videos) => {
    const sorted = [...(videos || [])].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    const recent = sorted.slice(0, 10);
    const prev = sorted.slice(10, 20);
    if (recent.length === 0) return null;
    const recentAvg = recent.reduce((s, v) => s + (v.views || 0), 0) / recent.length;
    const prevAvg = prev.length > 0 ? prev.reduce((s, v) => s + (v.views || 0), 0) / prev.length : null;
    const change = prevAvg ? ((recentAvg - prevAvg) / prevAvg * 100) : null;
    const chartData = sorted.slice(0, 20).reverse().map((v, i) => ({
      name: `${i + 1}`,
      views: v.views || 0,
      title: v.title
    }));
    return {
      recentAvg: Math.round(recentAvg),
      prevAvg: prevAvg ? Math.round(prevAvg) : null,
      change: change !== null ? parseFloat(change.toFixed(1)) : null,
      chartData
    };
  };

  // 효율 점수 계산 (0~100점)
  // 구독자 대비 조회수 비율 25점 + 업로드 주기 25점 + 인게이지먼트 25점 + 롱폼 비율 25점
  const calculateEfficiencyScore = (channel) => {
    const videos = channel?.videos || [];
    const subscribers = channel?.subscribers || 0;
    const allVideos = videos.length;
    const lf = filterVideos(videos, 'longform');
    const mid = filterVideos(videos, 'mid');

    // 1. 구독자 대비 조회수 비율
    const sorted = [...videos].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    const recentAvgViews = sorted.slice(0, 10).reduce((s, v) => s + (v.views || 0), 0) / Math.max(sorted.slice(0, 10).length, 1);
    const viewsRatio = subscribers > 0 ? (recentAvgViews / subscribers) * 100 : 0;
    let viewsScore = 5;
    if (viewsRatio >= 30) viewsScore = 25;
    else if (viewsRatio >= 15) viewsScore = 20;
    else if (viewsRatio >= 5) viewsScore = 13;

    // 2. 업로드 주기 (최근 10개 영상 간격 평균)
    let uploadScore = 5;
    const recentDates = sorted.slice(0, 10).map(v => new Date(v.uploadDate)).filter(d => !isNaN(d));
    if (recentDates.length >= 2) {
      let totalGap = 0;
      for (let i = 0; i < recentDates.length - 1; i++) {
        totalGap += (recentDates[i] - recentDates[i + 1]) / (1000 * 60 * 60 * 24);
      }
      const avgGapDays = totalGap / (recentDates.length - 1);
      if (avgGapDays <= 7) uploadScore = 25;
      else if (avgGapDays <= 14) uploadScore = 20;
      else if (avgGapDays <= 30) uploadScore = 12;
    }

    // 3. 인게이지먼트율
    const recentLF = lf.slice(0, 10);
    const engRate = recentLF.length > 0
      ? recentLF.reduce((s, v) => s + (parseFloat(v.engagement) || 0), 0) / recentLF.length
      : 0;
    let engScore = 5;
    if (engRate >= 5) engScore = 25;
    else if (engRate >= 3) engScore = 18;
    else if (engRate >= 1) engScore = 10;

    // 4. 롱폼 비율
    const longformRatio = allVideos > 0 ? ((lf.length + mid.length > 0 ? lf.length / (lf.length + mid.length) : 0) * 100) : 0;
    let lfScore = 5;
    if (longformRatio >= 50) lfScore = 25;
    else if (longformRatio >= 30) lfScore = 18;
    else if (longformRatio >= 10) lfScore = 10;

    const total = viewsScore + uploadScore + engScore + lfScore;
    const avgGapDays = (() => {
      if (recentDates.length < 2) return null;
      let totalGap = 0;
      for (let i = 0; i < recentDates.length - 1; i++) totalGap += (recentDates[i] - recentDates[i + 1]) / (1000 * 60 * 60 * 24);
      return Math.round(totalGap / (recentDates.length - 1));
    })();

    return {
      total,
      details: {
        viewsRatio: viewsRatio.toFixed(1),
        viewsScore,
        avgGapDays,
        uploadScore,
        engRate: engRate.toFixed(2),
        engScore,
        longformRatio: longformRatio.toFixed(1),
        lfScore
      }
    };
  };

  const getSortedVideos = (videos) => {
    const sorted = [...(videos || [])].sort((a, b) => {
      let aVal, bVal;
      switch (sortConfig.key) {
        case 'views':
          aVal = a.views || 0;
          bVal = b.views || 0;
          break;
        case 'likes':
          aVal = a.likes || 0;
          bVal = b.likes || 0;
          break;
        case 'comments':
          aVal = a.comments || 0;
          bVal = b.comments || 0;
          break;
        case 'uploadDate':
        default:
          aVal = new Date(a.uploadDate).getTime();
          bVal = new Date(b.uploadDate).getTime();
      }
      if (sortConfig.direction === 'asc') { return aVal - bVal; }
      else { return bVal - aVal; }
    });
    return sorted;
  };

  const handleSort = (key) => {
    setSortConfig({
      key,
      direction: sortConfig.key === key && sortConfig.direction === 'desc' ? 'asc' : 'desc'
    });
  };

  const SortIcon = ({ column }) => {
    if (sortConfig.key !== column) return <span className="text-slate-500">↕️</span>;
    return sortConfig.direction === 'desc' ? <ArrowDown size={14} /> : <ArrowUp size={14} />;
  };

  const selectedChannel = channels.find(ch => ch._id === selectedChannelId);
  const pplData = selectedChannel ? calculatePPLRevenue(selectedChannel.videos) : {};
  // 최근 롱폼 평균조회수 × 인게이지먼트를 "예상 클릭수" 입력의 참고값으로 제공 (실제 값은 사용자가 직접 입력/보정)
  const suggestedClicks = Math.round((pplData.avgViews || 0) * (parseFloat(pplData.engagement || 0) / 100));
  const longformVideos = selectedChannel ? filterVideos(selectedChannel.videos, 'longform') : [];
  const midVideos = selectedChannel ? filterVideos(selectedChannel.videos, 'mid') : [];
  const shortsVideos = selectedChannel ? filterVideos(selectedChannel.videos, 'shorts') : [];
  const sortedLongformVideos = getSortedVideos(longformVideos);
  const sortedMidVideos = getSortedVideos(midVideos);
  const sortedShortsVideos = getSortedVideos(shortsVideos);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="bg-black bg-opacity-50 border-b border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
            <div>
              <h1 className="text-xl sm:text-3xl font-bold text-white">📊 YouTube PPL 분석기 PRO</h1>
              <p className="text-slate-400 mt-1 text-sm sm:text-base">{channels.length}개 채널 분석 중</p>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button onClick={() => setShowItemManager(!showItemManager)} className={`flex-1 sm:flex-none justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition font-medium text-sm border ${showItemManager ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-transparent border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
                <Package size={16} /> 품목관리
              </button>
              <button onClick={() => setShowDiscover(!showDiscover)} className={`flex-1 sm:flex-none justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition font-medium text-sm border ${showDiscover ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-transparent border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
                🔍 채널 발굴
              </button>
              <button onClick={() => setShowAddForm(true)} className="flex-1 sm:flex-none justify-center bg-blue-600 hover:bg-blue-700 text-white px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition text-sm font-semibold shadow-lg shadow-blue-900/40" disabled={loading}>
                <Plus size={18} /> 채널 추가
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-3 sm:px-6 py-4 sm:py-8">
        {error && (
          <div className={`mb-6 p-4 rounded-lg text-sm sm:text-base ${error.includes('✓') ? 'bg-green-900 text-green-200 border border-green-700' : 'bg-red-900 text-red-200 border border-red-700'}`}>
            {error}
            <button onClick={() => setError(null)} className="float-right text-lg">✕</button>
          </div>
        )}

        {showItemManager && (
          <div className="bg-slate-800 border border-emerald-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-1">📦 품목 관리</h2>
            <p className="text-slate-400 text-sm mb-4">PPL에 사용할 제품의 판매가·원가·배송비·사은품 비용을 등록해두면, 채널 설정에서 불러와 손익을 계산할 수 있습니다</p>

            <div className="bg-slate-700 border border-slate-600 rounded-lg p-4 mb-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-slate-300 text-xs mb-1">품목명</label>
                  <input type="text" value={itemForm.name} onChange={e => setItemForm({ ...itemForm, name: e.target.value })} placeholder="예: 제스파 안마기 A" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs mb-1">판매가 (원)</label>
                  <input type="number" min="0" value={itemForm.sellPrice} onChange={e => setItemForm({ ...itemForm, sellPrice: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs mb-1">원가 (원)</label>
                  <input type="number" min="0" value={itemForm.cost} onChange={e => setItemForm({ ...itemForm, cost: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs mb-1">배송비 (원)</label>
                  <input type="number" min="0" value={itemForm.shippingCost} onChange={e => setItemForm({ ...itemForm, shippingCost: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div>
                  <label className="block text-slate-300 text-xs mb-1">사은품 비용 (원)</label>
                  <input type="number" min="0" value={itemForm.giftCost} onChange={e => setItemForm({ ...itemForm, giftCost: e.target.value })} className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
                </div>
                <div className="col-span-2 md:col-span-1">
                  <label className="block text-slate-300 text-xs mb-1">메모</label>
                  <input type="text" value={itemForm.memo} onChange={e => setItemForm({ ...itemForm, memo: e.target.value })} placeholder="선택사항" className="w-full bg-slate-800 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-emerald-500" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={handleSaveItem} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded text-sm font-semibold transition">
                  {editingItemId ? '수정 저장' : '+ 품목 등록'}
                </button>
                {editingItemId && (
                  <button onClick={resetItemForm} className="bg-slate-600 hover:bg-slate-500 text-white px-4 py-2 rounded text-sm transition">취소</button>
                )}
              </div>
            </div>

            {items.length > 0 ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">품목명</th><th className="text-right p-2">판매가</th><th className="text-right p-2">원가</th><th className="text-right p-2">배송비</th><th className="text-right p-2">사은품</th><th className="text-left p-2">메모</th><th className="text-center p-2">관리</th></tr></thead>
                  <tbody>
                    {items.map(item => (
                      <tr key={item._id} className="border-b border-slate-700 hover:bg-slate-700 transition">
                        <td className="p-2 text-white font-semibold">{item.name}</td>
                        <td className="text-right p-2 text-slate-200">{(item.sellPrice || 0).toLocaleString()}원</td>
                        <td className="text-right p-2 text-slate-400">{(item.cost || 0).toLocaleString()}원</td>
                        <td className="text-right p-2 text-slate-400">{(item.shippingCost || 0).toLocaleString()}원</td>
                        <td className="text-right p-2 text-slate-400">{(item.giftCost || 0).toLocaleString()}원</td>
                        <td className="p-2 text-slate-500 truncate max-w-xs">{item.memo}</td>
                        <td className="text-center p-2">
                          <div className="flex gap-1 justify-center">
                            <button onClick={() => handleEditItem(item)} className="text-blue-400 hover:text-blue-300 p-1"><Pencil size={14} /></button>
                            <button onClick={() => handleDeleteItem(item._id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-slate-400 text-center py-6 text-sm">등록된 품목이 없습니다. 위에서 첫 품목을 등록하세요.</p>
            )}
          </div>
        )}

        {showDiscover && (
          <div className="bg-slate-800 border border-purple-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-1">🔍 PPL 채널 발굴</h2>
            <p className="text-slate-400 text-sm mb-4">키워드로 유튜브 채널을 검색하고 제스파 안마기 PPL 적합도를 자동으로 분석합니다</p>
            <div className="flex flex-col sm:flex-row gap-3 mb-2">
              <input
                type="text"
                value={discoverKeyword}
                onChange={e => setDiscoverKeyword(e.target.value)}
                onKeyPress={e => e.key === 'Enter' && handleDiscover()}
                placeholder="예: 안마기 리뷰, 홈케어, 직장인 피로회복, 헬스 루틴"
                className="flex-1 bg-slate-700 border border-slate-600 rounded px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-purple-500"
              />
              <button onClick={handleDiscover} disabled={discovering} className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white px-6 py-3 rounded transition flex items-center justify-center gap-2 font-semibold">
                {discovering ? <><Loader size={16} className="animate-spin" /> 분석 중...</> : '검색'}
              </button>
            </div>
            <p className="text-xs text-slate-500 mb-4">💡 추천 키워드: 안마기, 마사지기, 헬스케어, 피로회복, 홈트레이닝, 직장인 건강, 스트레칭, 라이프스타일 리뷰</p>

            {discoverResults.length > 0 && (
              <div className="space-y-3 mt-4">
                <p className="text-slate-300 text-sm font-semibold">검색 결과 {discoverResults.length}개 — PPL 적합도 순 정렬</p>
                {discoverResults.map((ch, idx) => {
                  const scoreColor = ch.pplScore >= 70 ? 'text-green-400 bg-green-900' : ch.pplScore >= 40 ? 'text-yellow-400 bg-yellow-900' : 'text-red-400 bg-red-900';
                  const scoreBadge = ch.pplScore >= 70 ? '✅ 강추' : ch.pplScore >= 40 ? '⚠️ 검토' : '❌ 비적합';
                  const alreadyAdded = channels.some(c => c.channelId === ch.channelId);
                  return (
                    <div key={ch.channelId} className="bg-slate-700 border border-slate-600 rounded-lg p-4 flex flex-col sm:flex-row gap-3 sm:gap-4 items-start">
                      {ch.thumbnail && <img src={ch.thumbnail} alt="" className="w-12 h-12 sm:w-16 sm:h-16 rounded-full object-cover flex-shrink-0" />}
                      <div className="flex-1 min-w-0 w-full">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <span className="font-bold text-white truncate">{idx + 1}. {ch.channelName}</span>
                          {ch.country === 'KR' && <span className="text-xs bg-blue-800 text-blue-200 px-2 py-0.5 rounded">🇰🇷 한국</span>}
                        </div>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-slate-400 mb-2">
                          <span>구독자: <strong className="text-white">{ch.subscribers >= 1000000 ? (ch.subscribers/1000000).toFixed(1)+'M' : (ch.subscribers/1000).toFixed(0)+'K'}</strong></span>
                          <span>인게이지먼트: <strong className="text-yellow-400">{ch.engagement}%</strong></span>
                          <span>롱폼 비중: <strong className="text-blue-400">{ch.longformRatio}%</strong></span>
                          <span>영상 수: <strong className="text-white">{ch.videoCount?.toLocaleString()}개</strong></span>
                        </div>
                        {ch.description && <p className="text-xs text-slate-500 truncate">{ch.description}</p>}
                      </div>
                      <div className="flex sm:flex-col items-center gap-3 sm:gap-2 flex-shrink-0 w-full sm:w-auto justify-between sm:justify-start">
                        <div className="flex items-center gap-2 sm:flex-col">
                          <div className={`text-2xl font-bold px-3 py-1 rounded-lg ${scoreColor}`}>{ch.pplScore}점</div>
                          <div className={`text-xs font-semibold ${scoreColor.split(' ')[0]}`}>{scoreBadge}</div>
                        </div>
                        {alreadyAdded ? (
                          <span className="text-xs text-slate-500 sm:mt-1">추가됨 ✓</span>
                        ) : (
                          <button onClick={() => handleAddChannelById(ch.channelId, ch.channelName)} disabled={loading} className="sm:mt-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white text-xs px-3 py-1.5 rounded transition whitespace-nowrap">
                            + 분석 추가
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {showAddForm && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">유튜브 채널 추가</h2>
            <div className="flex flex-col sm:flex-row gap-3 sm:gap-4">
              <input type="text" placeholder="예: @MrBeast" value={channelInput} onChange={(e) => setChannelInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddChannel()} className="flex-1 bg-slate-700 border border-slate-600 rounded px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500" disabled={loading} />
              <div className="flex gap-3">
                <button onClick={handleAddChannel} disabled={loading} className="flex-1 sm:flex-none justify-center bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-6 py-3 rounded transition flex items-center gap-2">
                  {loading ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                  {loading ? '추가중...' : '추가'}
                </button>
                <button onClick={() => setShowAddForm(false)} className="flex-1 sm:flex-none bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded transition" disabled={loading}>닫기</button>
              </div>
            </div>
          </div>
        )}

        {initialLoad ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
            <Loader size={36} className="mx-auto text-blue-400 mb-4 animate-spin" />
            <p className="text-slate-400">채널 목록을 불러오는 중...</p>
          </div>
        ) : channels.length === 0 ? (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-12 text-center">
            <Eye size={48} className="mx-auto text-slate-500 mb-4" />
            <h3 className="text-xl font-semibold text-white mb-2">분석할 채널을 추가하세요</h3>
            <p className="text-slate-400 mb-6">유튜브 채널을 추가하면 PPL 성공률을 분석할 수 있습니다</p>
            <button onClick={() => setShowAddForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg inline-flex items-center gap-2">
              <Plus size={20} /> 첫 채널 추가하기
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-1">
              <div className="space-y-3 max-h-96 overflow-y-auto">
                {channels.map(channel => (
                  <div key={channel._id} onClick={() => setSelectedChannelId(channel._id)} className={`p-4 rounded-lg border cursor-pointer transition ${selectedChannelId === channel._id ? 'bg-slate-800 border-blue-500 ring-1 ring-blue-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${selectedChannelId === channel._id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                        {channel.channelName?.charAt(0) || '?'}
                      </div>
                      <div className="min-w-0">
                        <h3 className="font-semibold text-white truncate leading-tight">{channel.channelName}</h3>
                        <p className="text-xs text-slate-400">구독자 {(channel.subscribers/1000).toFixed(0)}K</p>
                      </div>
                    </div>
                    <p className="text-xs text-slate-500 mb-3">롱폼 {filterVideos(channel.videos, 'longform').length} · 미드 {filterVideos(channel.videos, 'mid').length} · 숏폼 {filterVideos(channel.videos, 'shorts').length}</p>
                    <div className="flex gap-2">
                      <button onClick={(e) => { e.stopPropagation(); handleRefreshChannel(channel._id); }} disabled={refreshing[channel._id]} className="flex-1 bg-slate-700 hover:bg-blue-600 disabled:opacity-50 text-slate-200 hover:text-white text-xs py-1.5 rounded transition flex items-center justify-center gap-1">
                        {refreshing[channel._id] ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {refreshing[channel._id] ? '중...' : '갱신'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteChannel(channel._id); }} className="bg-slate-700 hover:bg-red-600 text-slate-200 hover:text-white p-1.5 rounded transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedChannel && (
              <div className="lg:col-span-2 space-y-6">
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {['summary', 'bep', 'trends', 'settings', 'longform', 'mid', 'shorts', 'export'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3.5 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap flex-shrink-0 ${activeTab === tab ? 'bg-blue-600 text-white shadow shadow-blue-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}>
                      {tab === 'summary' && '📊 요약'} {tab === 'longform' && '🎬 롱폼(10분↑)'} {tab === 'mid' && '▶️ 미드폼(1~10분)'} {tab === 'shorts' && '📱 숏폼(60초↓)'} {tab === 'settings' && '⚙️ 설정'} {tab === 'bep' && '💰 손익/BEP'} {tab === 'trends' && '📈 트렌드'} {tab === 'export' && '📥 내보내기'}
                    </button>
                  ))}
                </div>

                {activeTab === 'summary' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h2 className="text-2xl font-bold text-white mb-2">{selectedChannel.channelName}</h2>
                    <p className="text-slate-400 text-sm mb-4">✨ 최근 10개 롱폼(10분↑) 영상 기준 PPL 분석</p>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">총 조회수</p><p className="text-2xl font-bold text-white mt-1">{(selectedChannel.totalViews / 1000000000).toFixed(1)}B</p></div>
                      <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">구독자</p><p className="text-2xl font-bold text-white mt-1">{(selectedChannel.subscribers / 1000000).toFixed(1)}M</p></div>
                      <div className="bg-slate-700 rounded p-4"><InfoTooltip content="= (좋아요 + 댓글) / 조회수 × 100%"><p className="text-slate-400 text-sm">인게이지먼트</p><p className="text-2xl font-bold text-white mt-1">{pplData.engagement}%</p></InfoTooltip></div>
                      <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">평균 조회수</p><p className="text-2xl font-bold text-white mt-1">{(pplData.avgViews/1000).toFixed(0)}K</p></div>
                    </div>

                    {/* 효율 점수 카드 */}
                    {(() => {
                      const eff = calculateEfficiencyScore(selectedChannel);
                      const d = eff.details;
                      const scoreColor = eff.total >= 75 ? 'text-green-400' : eff.total >= 50 ? 'text-yellow-400' : 'text-red-400';
                      const scoreBg = eff.total >= 75 ? 'from-green-900 to-green-800 border-green-600' : eff.total >= 50 ? 'from-yellow-900 to-yellow-800 border-yellow-600' : 'from-red-900 to-red-800 border-red-600';
                      const grade = eff.total >= 75 ? '✅ PPL 적합' : eff.total >= 50 ? '⚠️ 검토 필요' : '❌ 비적합';
                      return (
                        <div className={`bg-gradient-to-br ${scoreBg} border rounded-lg p-5 mb-6`}>
                          <div className="flex items-center justify-between mb-4">
                            <div>
                              <h3 className="text-lg font-bold text-white">⚡ 채널 효율 점수</h3>
                              <p className="text-xs text-slate-400 mt-0.5">구독자대비조회수 · 업로드주기 · 인게이지먼트 · 롱폼비율</p>
                            </div>
                            <div className="text-center">
                              <p className={`text-4xl font-bold ${scoreColor}`}>{eff.total}<span className="text-lg">점</span></p>
                              <p className={`text-sm font-semibold mt-1 ${scoreColor}`}>{grade}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-black bg-opacity-30 rounded p-3">
                              <InfoTooltip content="최근 10개 영상 평균 조회수 ÷ 구독자 수. 30% 이상이면 충성도 높은 채널입니다.">
                                <p className="text-slate-300 text-xs">👥 구독자 대비 조회수</p>
                              </InfoTooltip>
                              <p className="text-xl font-bold text-white mt-1">{d.viewsRatio}%</p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-xs text-slate-400">{d.viewsRatio >= 30 ? '충성도 높음 ✓' : d.viewsRatio >= 15 ? '보통' : '낮음'}</p>
                                <p className="text-xs font-bold text-yellow-400">{d.viewsScore}/25점</p>
                              </div>
                            </div>
                            <div className="bg-black bg-opacity-30 rounded p-3">
                              <InfoTooltip content="최근 10개 영상 사이의 평균 업로드 간격. 7일 이하면 꾸준한 활동 채널입니다.">
                                <p className="text-slate-300 text-xs">📅 평균 업로드 주기</p>
                              </InfoTooltip>
                              <p className="text-xl font-bold text-white mt-1">{d.avgGapDays !== null ? `${d.avgGapDays}일` : '-'}</p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-xs text-slate-400">{d.avgGapDays !== null ? (d.avgGapDays <= 7 ? '매우 활발 ✓' : d.avgGapDays <= 14 ? '활발' : d.avgGapDays <= 30 ? '보통' : '비활성') : '-'}</p>
                                <p className="text-xs font-bold text-yellow-400">{d.uploadScore}/25점</p>
                              </div>
                            </div>
                            <div className="bg-black bg-opacity-30 rounded p-3">
                              <InfoTooltip content="롱폼 최근 10개 기준 평균 인게이지먼트율. 5% 이상이면 반응이 매우 좋은 채널입니다.">
                                <p className="text-slate-300 text-xs">💬 인게이지먼트율</p>
                              </InfoTooltip>
                              <p className="text-xl font-bold text-white mt-1">{d.engRate}%</p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-xs text-slate-400">{d.engRate >= 5 ? '매우 높음 ✓' : d.engRate >= 3 ? '높음' : d.engRate >= 1 ? '보통' : '낮음'}</p>
                                <p className="text-xs font-bold text-yellow-400">{d.engScore}/25점</p>
                              </div>
                            </div>
                            <div className="bg-black bg-opacity-30 rounded p-3">
                              <InfoTooltip content="롱폼(10분↑) ÷ (롱폼+미드폼) 비율. PPL은 롱폼에서 효과가 높습니다.">
                                <p className="text-slate-300 text-xs">🎬 롱폼 비율</p>
                              </InfoTooltip>
                              <p className="text-xl font-bold text-white mt-1">{d.longformRatio}%</p>
                              <div className="flex justify-between items-center mt-1">
                                <p className="text-xs text-slate-400">{d.longformRatio >= 50 ? 'PPL 최적 ✓' : d.longformRatio >= 30 ? '적합' : '낮음'}</p>
                                <p className="text-xs font-bold text-yellow-400">{d.lfScore}/25점</p>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })()}

                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-700 rounded p-4"><InfoTooltip content="= 총 MG 비용 ÷ 평균 조회수. 조회수 1회를 만드는 데 든 비용"><p className="text-slate-400 text-sm">CPV(조회수당 비용)</p></InfoTooltip><p className="text-2xl font-bold text-white mt-1">{pplData.cpv !== null && pplData.cpv !== undefined ? `${pplData.cpv.toLocaleString()}원` : '계산 불가'}</p></div>
                      <div className="bg-slate-700 rounded p-4"><InfoTooltip content="= 예상 클릭수 ÷ 평균 조회수 × 100%. 설정 탭에서 예상 클릭수를 입력하면 계산됩니다"><p className="text-slate-400 text-sm">예상 클릭률</p></InfoTooltip><p className="text-2xl font-bold text-white mt-1">{pplData.clickRate !== null && pplData.clickRate !== undefined ? `${pplData.clickRate}%` : '계산 불가'}</p></div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-600 rounded-lg p-6">
                      <h3 className="text-xl font-bold text-white mb-1">💰 PPL 매출 분석</h3>
                      <p className="text-blue-200/70 text-xs mb-4">원가·MG·RS 반영 (설정 탭에서 입력) — 광고비/수수료율 대신 실제 딜 구조 기준</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-slate-800/80 rounded-lg p-4"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">상품 객단가</p><p className="text-xl font-bold text-white">{settings.productPrice.toLocaleString()}원</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4"><InfoTooltip content="= 총 MG − 대행사(쇼크) MG 분담금. 판매 마진으로 회수해야 하는 고정비"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">우리측 MG 부담금</p></InfoTooltip><p className="text-xl font-bold text-white">{pplData.ourMGShare?.toLocaleString()}원</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4"><InfoTooltip content="설정 탭에서 직접 입력 (참고: 평균조회수 × 인게이지먼트)"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">🖱️ 예상 클릭수</p></InfoTooltip><p className="text-xl font-bold text-white">{pplData.expectedClicks?.toLocaleString()}회</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4"><InfoTooltip content="= 예상 클릭수 × 전환율"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">📦 예상 판매수량</p></InfoTooltip><p className="text-xl font-bold text-white">{pplData.estimatedQty?.toLocaleString()}개</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4"><InfoTooltip content="= 예상 판매수량 × 상품 객단가"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">📊 예상 매출</p></InfoTooltip><p className="text-xl font-bold text-white">{pplData.expectedRevenue?.toLocaleString()}원</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4"><InfoTooltip content="= 판매가 − 원가 − 배송비 − 사은품 − PG수수료 − RS비용"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">개당 기여마진</p></InfoTooltip><p className={`text-xl font-bold ${pplData.unitMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pplData.unitMargin?.toLocaleString()}원</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4 ring-1 ring-slate-600"><InfoTooltip content="= 예상 판매수량 × 개당 기여마진 − 우리측 MG 부담금"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">💵 순이익</p></InfoTooltip><p className={`text-xl font-bold ${pplData.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pplData.netProfit?.toLocaleString()}원</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4"><InfoTooltip content="= 예상매출 / 우리측 MG 부담금 × 100%"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">📈 ROAS</p></InfoTooltip><p className="text-xl font-bold text-blue-400">{pplData.roas !== null ? `${pplData.roas}%` : '계산 불가'}</p></div>
                        <div className="bg-slate-800/80 rounded-lg p-4"><InfoTooltip content="= 순이익 / 우리측 MG 부담금 × 100%"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">🎯 ROI</p></InfoTooltip><p className="text-xl font-bold text-blue-400">{pplData.roi !== null ? `${pplData.roi}%` : '계산 불가'}</p></div>
                      </div>
                      <div className={`p-4 rounded text-center font-bold text-lg mt-4 ${pplData.riskLevel === '낮음' ? 'bg-green-600 text-green-100' : pplData.riskLevel === '중간' ? 'bg-yellow-600 text-yellow-100' : 'bg-red-600 text-red-100'}`}>
                        <InfoTooltip content="ROI(=순이익/우리측MG부담금) 기준 — ROI 100%↑ → 낮음(강추) / ROI 0~100% → 중간(BEP 달성, 검토) / ROI 0% 미만 → 높음(BEP 미달, 신중) / 우리측 MG 부담금이 0원이면 '평가 불가'">
                          <span>위험도: {pplData.riskLevel} {pplData.riskLevel === '낮음' ? '✅ 강추' : pplData.riskLevel === '중간' ? '⚠️ 검토' : pplData.riskLevel === '평가 불가' ? '' : '❌ 신중'}</span>
                        </InfoTooltip>
                      </div>
                      {pplData.bepQty !== null && pplData.bepQty !== undefined && (
                        <p className="text-blue-200 text-xs mt-3 text-center">BEP 판매수량 {pplData.bepQty?.toLocaleString()}개 대비 예상 판매수량 {pplData.estimatedQty?.toLocaleString()}개 {pplData.estimatedQty >= pplData.bepQty ? '— BEP 달성 예상 ✅' : '— BEP 미달 예상 ⚠️'}</p>
                      )}
                    </div>

                    {/* 조회수 트렌드 섹션 */}
                    {(() => {
                      const trend = calculateViewTrend(longformVideos);
                      if (!trend) return null;
                      const isUp = trend.change !== null && trend.change > 0;
                      const isDown = trend.change !== null && trend.change < 0;
                      const trendColor = isUp ? 'text-green-400' : isDown ? 'text-red-400' : 'text-slate-400';
                      const trendBg = isUp ? 'bg-green-900 border-green-700' : isDown ? 'bg-red-900 border-red-700' : 'bg-slate-700 border-slate-600';
                      return (
                        <div className="bg-slate-700 border border-slate-600 rounded-lg p-5 mt-4">
                          <h3 className="text-lg font-bold text-white mb-3">📊 조회수 트렌드 분석</h3>
                          <p className="text-xs text-slate-400 mb-4">롱폼 기준 최근 10개 vs 이전 10개 평균 조회수 비교</p>
                          <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-slate-800 rounded p-3 text-center">
                              <p className="text-slate-400 text-xs mb-1">최근 10개 평균</p>
                              <p className="text-xl font-bold text-white">{(trend.recentAvg / 1000).toFixed(1)}K</p>
                            </div>
                            <div className="bg-slate-800 rounded p-3 text-center">
                              <p className="text-slate-400 text-xs mb-1">이전 10개 평균</p>
                              <p className="text-xl font-bold text-slate-300">{trend.prevAvg ? (trend.prevAvg / 1000).toFixed(1) + 'K' : '-'}</p>
                            </div>
                            <div className={`rounded p-3 text-center border ${trendBg}`}>
                              <p className="text-slate-400 text-xs mb-1">변화율</p>
                              <p className={`text-xl font-bold flex items-center justify-center gap-1 ${trendColor}`}>
                                {trend.change !== null ? (
                                  <>{isUp ? <ArrowUp size={18} /> : isDown ? <ArrowDown size={18} /> : null}{Math.abs(trend.change)}%</>
                                ) : '-'}
                              </p>
                            </div>
                          </div>
                          {trend.chartData.length > 0 && (
                            <ResponsiveContainer width="100%" height={160}>
                              <LineChart data={trend.chartData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} label={{ value: '영상 순서 (오래된→최근)', position: 'insideBottom', offset: -2, fill: '#64748b', fontSize: 10 }} />
                                <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v >= 1000 ? (v/1000).toFixed(0)+'K' : v} />
                                <Tooltip
                                  contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', fontSize: 12 }}
                                  formatter={(value) => [(value/1000).toFixed(1) + 'K 조회', '조회수']}
                                  labelFormatter={(label, payload) => payload?.[0]?.payload?.title?.slice(0, 30) || `영상 ${label}`}
                                />
                                <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} activeDot={{ r: 5 }} />
                              </LineChart>
                            </ResponsiveContainer>
                          )}
                        </div>
                      );
                    })()}

                    {/* 댓글 분석 섹션 */}
                    <div className="bg-slate-700 border border-slate-600 rounded-lg p-5 mt-4">
                      <div className="flex justify-between items-center mb-3">
                        <div>
                          <h3 className="text-lg font-bold text-white">💬 댓글 품질 분석</h3>
                          {selectedChannel.commentAnalysis?.lastAnalyzed && (
                            <p className="text-xs text-slate-400 mt-0.5">마지막 분석: {new Date(selectedChannel.commentAnalysis.lastAnalyzed).toLocaleDateString('ko-KR')}</p>
                          )}
                        </div>
                        <button
                          onClick={handleAnalyzeComments}
                          disabled={analyzingComments}
                          className="bg-purple-600 hover:bg-purple-700 disabled:bg-slate-600 text-white px-4 py-2 rounded transition text-sm flex items-center gap-2"
                        >
                          {analyzingComments ? <><Loader size={14} className="animate-spin" /> 분석 중...</> : '🔍 댓글 분석 실행'}
                        </button>
                      </div>

                      {selectedChannel.commentAnalysis?.qualityScore != null ? (() => {
                        const ca = selectedChannel.commentAnalysis;
                        const engScore = Math.min(parseFloat(pplData.engagement || 0) * 10, 100);
                        const compositeScore = Math.round((engScore + ca.qualityScore) / 2);
                        const compositeColor = compositeScore >= 70 ? 'text-green-400' : compositeScore >= 40 ? 'text-yellow-400' : 'text-red-400';
                        return (
                          <div>
                            {/* 복합 PPL 점수 */}
                            <div className="bg-slate-800 rounded-lg p-4 mb-4 text-center">
                              <p className="text-slate-400 text-sm mb-1">복합 PPL 점수 <span className="text-xs">(인게이지먼트 + 댓글품질)</span></p>
                              <p className={`text-5xl font-bold ${compositeColor}`}>{compositeScore}<span className="text-2xl">점</span></p>
                              <div className="flex justify-center gap-6 mt-2 text-xs text-slate-400">
                                <span>인게이지먼트 점수: <strong className="text-white">{Math.round(engScore)}점</strong></span>
                                <span>댓글 품질 점수: <strong className="text-white">{ca.qualityScore}점</strong></span>
                              </div>
                            </div>

                            {/* 세부 지표 */}
                            <div className="grid grid-cols-2 gap-3 mb-4">
                              <div className="bg-slate-800 rounded p-3">
                                <InfoTooltip content="구매 관련 키워드(어디서, 얼마, 구매, 링크 등)가 포함된 댓글 비율. PPL 전환율과 직결됩니다.">
                                  <p className="text-slate-400 text-xs">🛒 구매의도 댓글</p>
                                </InfoTooltip>
                                <p className="text-xl font-bold text-green-400 mt-1">{(ca.purchaseIntentRatio * 100).toFixed(1)}%</p>
                                <p className="text-xs text-slate-500">분석 댓글 {ca.totalCommentsFetched}개 중</p>
                              </div>
                              <div className="bg-slate-800 rounded p-3">
                                <InfoTooltip content="댓글 평균 글자수. 20자 이상이면 진성 팬 비율이 높습니다.">
                                  <p className="text-slate-400 text-xs">✍️ 평균 댓글 길이</p>
                                </InfoTooltip>
                                <p className="text-xl font-bold text-blue-400 mt-1">{ca.avgCommentLength}자</p>
                                <p className="text-xs text-slate-500">{ca.avgCommentLength >= 20 ? '진성 팬 多 ✓' : '단순 반응 多'}</p>
                              </div>
                              <div className="bg-slate-800 rounded p-3">
                                <InfoTooltip content="답글이 달린 댓글 비율. 높을수록 커뮤니티가 활발합니다.">
                                  <p className="text-slate-400 text-xs">💬 답글 활성 비율</p>
                                </InfoTooltip>
                                <p className="text-xl font-bold text-purple-400 mt-1">{(ca.replyRatio * 100).toFixed(1)}%</p>
                                <p className="text-xs text-slate-500">{ca.replyRatio >= 0.2 ? '커뮤니티 활발 ✓' : '단방향 소통'}</p>
                              </div>
                              <div className="bg-slate-800 rounded p-3">
                                <InfoTooltip content="광고/협찬 부정 반응 키워드 비율. 낮을수록 PPL 친화적인 채널입니다.">
                                  <p className="text-slate-400 text-xs">⚠️ 광고 부정 반응</p>
                                </InfoTooltip>
                                <p className={`text-xl font-bold mt-1 ${ca.negativeRatio <= 0.05 ? 'text-green-400' : 'text-red-400'}`}>{(ca.negativeRatio * 100).toFixed(1)}%</p>
                                <p className="text-xs text-slate-500">{ca.negativeRatio <= 0.05 ? 'PPL 친화적 ✓' : '광고 거부감 주의'}</p>
                              </div>
                            </div>

                            {/* 구매의도 댓글 예시 */}
                            {ca.topPurchaseComments?.length > 0 && (
                              <div className="bg-slate-800 rounded p-3">
                                <p className="text-slate-400 text-xs mb-2">🛒 구매의도 댓글 예시</p>
                                <div className="space-y-1">
                                  {ca.topPurchaseComments.map((c, i) => (
                                    <p key={i} className="text-xs text-slate-300 bg-slate-700 rounded px-2 py-1 truncate">"{c}"</p>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <p className="text-slate-500 text-sm text-center py-4">댓글 분석을 실행하면 구매의도, 댓글 품질, 복합 PPL 점수를 확인할 수 있습니다</p>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'longform' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">🎬 롱폼 분석 (10분↑) — {sortedLongformVideos.length}개</h3>
                    {sortedLongformVideos.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {sortedLongformVideos?.map((video, idx) => (
                              <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate">{idx + 1}. {video.title}</span>
                                    {video.isAd && (
                                      <span
                                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40"
                                        title={video.hasPaidPromotion ? 'YouTube 공식 유료 프로모션 표기' : '설명란에서 광고/협찬 문구 감지'}
                                      >
                                        광고
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right p-2 text-white font-semibold">{(video.views/1000).toFixed(0)}K</td>
                                <td className="text-right p-2 text-blue-400">{(video.likes/1000).toFixed(1)}K</td>
                                <td className="text-right p-2 text-green-400">{(video.comments/1000).toFixed(1)}K</td>
                                <td className="text-right p-2 text-yellow-400 font-semibold">{video.engagement}%</td>
                                <td className="text-right p-2 text-slate-400">{new Date(video.uploadDate).toLocaleDateString('ko-KR')}</td>
                                <td className="text-center p-2"><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition"><ExternalLink size={16} className="inline" /></a></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-center py-8">롱폼 영상이 없습니다</p>
                    )}
                  </div>
                )}

                {activeTab === 'mid' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">▶️ 미드폼 분석 (1~10분) — {sortedMidVideos.length}개</h3>
                    {sortedMidVideos.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {sortedMidVideos.map((video, idx) => (
                              <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate">{idx + 1}. {video.title}</span>
                                    {video.isAd && (
                                      <span
                                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40"
                                        title={video.hasPaidPromotion ? 'YouTube 공식 유료 프로모션 표기' : '설명란에서 광고/협찬 문구 감지'}
                                      >
                                        광고
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right p-2 text-white font-semibold">{(video.views/1000).toFixed(0)}K</td>
                                <td className="text-right p-2 text-blue-400">{(video.likes/1000).toFixed(1)}K</td>
                                <td className="text-right p-2 text-green-400">{(video.comments/1000).toFixed(1)}K</td>
                                <td className="text-right p-2 text-yellow-400 font-semibold">{video.engagement}%</td>
                                <td className="text-right p-2 text-slate-400">{new Date(video.uploadDate).toLocaleDateString('ko-KR')}</td>
                                <td className="text-center p-2"><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition"><ExternalLink size={16} className="inline" /></a></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-center py-8">미드폼 영상이 없습니다</p>
                    )}
                  </div>
                )}

                {activeTab === 'shorts' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">📱 숏폼 분석 (60초↓) — {sortedShortsVideos.length}개</h3>
                    {sortedShortsVideos.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {sortedShortsVideos?.map((video, idx) => (
                              <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate">{idx + 1}. {video.title}</span>
                                    {video.isAd && (
                                      <span
                                        className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40"
                                        title={video.hasPaidPromotion ? 'YouTube 공식 유료 프로모션 표기' : '설명란에서 광고/협찬 문구 감지'}
                                      >
                                        광고
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="text-right p-2 text-white font-semibold">{(video.views/1000).toFixed(0)}K</td>
                                <td className="text-right p-2 text-blue-400">{(video.likes/1000).toFixed(1)}K</td>
                                <td className="text-right p-2 text-green-400">{(video.comments/1000).toFixed(1)}K</td>
                                <td className="text-right p-2 text-yellow-400 font-semibold">{video.engagement}%</td>
                                <td className="text-right p-2 text-slate-400">{new Date(video.uploadDate).toLocaleDateString('ko-KR')}</td>
                                <td className="text-center p-2"><a href={`https://www.youtube.com/watch?v=${video.videoId}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300 transition"><ExternalLink size={16} className="inline" /></a></td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className="text-slate-400 text-center py-8">숏폼 영상이 없습니다</p>
                    )}
                  </div>
                )}

                {activeTab === 'settings' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">⚙️ PPL 설정</h3>
                    <div className="space-y-4">
                      <div>
                        <label className="block text-slate-300 text-sm mb-2">📦 품목 불러오기</label>
                        <select value={settings.itemId || ''} onChange={(e) => handleSelectItem(e.target.value)} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500">
                          <option value="">직접 입력 (품목 미선택)</option>
                          {items.map(item => (
                            <option key={item._id} value={item._id}>{item.name} — {(item.sellPrice || 0).toLocaleString()}원</option>
                          ))}
                        </select>
                        {items.length === 0 && <p className="text-xs text-slate-500 mt-1">등록된 품목이 없습니다. 상단 "📦 품목관리"에서 먼저 등록하세요.</p>}
                      </div>
                      <div><label className="block text-slate-300 text-sm mb-2">상품 객단가 / 판매가 (원)</label><input type="number" min="0" value={settings.productPrice} onChange={(e) => setSettings({...settings, productPrice: parseInt(e.target.value)})} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>
                      <div>
                        <label className="block text-slate-300 text-sm mb-2">예상 클릭수 (회)</label>
                        <input type="number" min="0" value={settings.expectedClicks} onChange={(e) => setSettings({...settings, expectedClicks: parseInt(e.target.value) || 0})} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" />
                        <div className="flex items-center justify-between gap-2 mt-1">
                          <p className="text-xs text-slate-500">참고: 최근 롱폼 평균조회수 × 인게이지먼트 = {suggestedClicks.toLocaleString()}회</p>
                          <button type="button" onClick={() => setSettings({...settings, expectedClicks: suggestedClicks})} className="text-xs text-blue-400 hover:text-blue-300 shrink-0 whitespace-nowrap">이 값 적용</button>
                        </div>
                      </div>
                      <div><label className="block text-slate-300 text-sm mb-2">예상 전환율 (%, 클릭 대비 구매)</label><input type="number" min="0" step="0.01" value={settings.expectedConversionRate * 100} onChange={(e) => setSettings({...settings, expectedConversionRate: parseFloat(e.target.value) / 100})} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>

                      <div className="border-t border-slate-700 pt-4 mt-2">
                        <h4 className="text-slate-200 font-semibold mb-3">💰 손익/BEP 계산용 원가 정보</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div><label className="block text-slate-300 text-xs mb-1">원가 (원)</label><input type="number" min="0" value={settings.cost} onChange={(e) => setSettings({...settings, cost: parseInt(e.target.value) || 0})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" /></div>
                          <div><label className="block text-slate-300 text-xs mb-1">배송비 (원)</label><input type="number" min="0" value={settings.shippingCost} onChange={(e) => setSettings({...settings, shippingCost: parseInt(e.target.value) || 0})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" /></div>
                          <div><label className="block text-slate-300 text-xs mb-1">사은품 비용 (원)</label><input type="number" min="0" value={settings.giftCost} onChange={(e) => setSettings({...settings, giftCost: parseInt(e.target.value) || 0})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" /></div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-slate-300 text-xs mb-1">PG(결제) 수수료율 (%)</label>
                          <input type="number" min="0" step="0.01" value={settings.pgFeeRate * 100} onChange={(e) => setSettings({...settings, pgFeeRate: parseFloat(e.target.value) / 100 || 0})} className="w-full md:w-1/3 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                      </div>

                      <div className="border-t border-slate-700 pt-4 mt-2">
                        <h4 className="text-slate-200 font-semibold mb-3">🤝 MG / RS 딜 구조 (쇼크 대행)</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                          <div><label className="block text-slate-300 text-xs mb-1">총 MG 비용 (원) — PPL 총 비용</label><input type="number" min="0" value={settings.totalMG} onChange={(e) => setSettings({...settings, totalMG: parseInt(e.target.value) || 0})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" /></div>
                          <div><label className="block text-slate-300 text-xs mb-1">대행사 MG 분담율 (%)</label><input type="number" min="0" step="1" value={settings.agencyMGShareRate * 100} onChange={(e) => setSettings({...settings, agencyMGShareRate: parseFloat(e.target.value) / 100 || 0})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" /></div>
                          <div><label className="block text-slate-300 text-xs mb-1">RS율 (%, 대행사 지급)</label><input type="number" min="0" step="1" value={settings.rsRate * 100} onChange={(e) => setSettings({...settings, rsRate: parseFloat(e.target.value) / 100 || 0})} className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" /></div>
                        </div>
                        <p className="text-xs text-slate-500 mt-2">예: 총 MG 1,000만원, RS 20% 합의 시 대행사가 MG의 30%(300만원)를 분담 → 대행사 MG 분담율 30 입력</p>
                        {(() => {
                          const preview = calculateBEP(settings);
                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
                              <div className="bg-slate-900/60 border border-slate-700 rounded-lg px-4 py-3">
                                <p className="text-slate-400 text-xs mb-1">대행사(쇼크) MG 분담금</p>
                                <p className="text-lg font-bold text-white">{preview.agencyMGShare.toLocaleString()}원</p>
                              </div>
                              <div className="bg-slate-900/60 border border-blue-500/40 rounded-lg px-4 py-3">
                                <p className="text-slate-400 text-xs mb-1">제스파(우리) MG 부담금</p>
                                <p className="text-lg font-bold text-blue-400">{preview.ourMGShare.toLocaleString()}원</p>
                              </div>
                            </div>
                          );
                        })()}
                      </div>

                      <div className="flex gap-4 pt-4"><button onClick={handleSaveSettings} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded transition font-semibold">저장</button><button onClick={() => setActiveTab('summary')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition">취소</button></div>
                    </div>
                  </div>
                )}

                {activeTab === 'bep' && (() => {
                  const bep = calculateBEP(settings);
                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                      <h3 className="text-lg font-bold text-white mb-1">💰 손익 / BEP 분석</h3>
                      <p className="text-slate-400 text-sm mb-4">{settings.itemName ? `품목: ${settings.itemName}` : '품목 미선택 — 설정 탭에서 원가 정보를 입력하세요'}</p>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
                        <div className="bg-slate-800/80 rounded-lg p-4">
                          <p className="text-slate-400 text-xs uppercase tracking-wide mb-1">총 MG 비용</p>
                          <p className="text-xl font-bold text-white">{(settings.totalMG || 0).toLocaleString()}원</p>
                        </div>
                        <div className="bg-slate-800/80 rounded-lg p-4">
                          <InfoTooltip content="= 총 MG 비용 ÷ 평균 조회수(최근 롱폼 10개 기준)"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">CPV(조회수당 비용)</p></InfoTooltip>
                          <p className="text-xl font-bold text-white">{pplData.cpv !== null && pplData.cpv !== undefined ? `${pplData.cpv.toLocaleString()}원` : '계산 불가'}</p>
                        </div>
                        <div className="bg-slate-800/80 rounded-lg p-4">
                          <InfoTooltip content="= 총 MG × 대행사 MG 분담율"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">대행사(쇼크) MG 분담금</p></InfoTooltip>
                          <p className="text-xl font-bold text-white">{bep.agencyMGShare.toLocaleString()}원</p>
                        </div>
                        <div className="bg-slate-800/80 rounded-lg p-4 col-span-1 sm:col-span-2 ring-1 ring-blue-500/40">
                          <InfoTooltip content="= 총 MG - 대행사 분담금. 이 금액을 판매 마진으로 회수해야 손익분기(BEP)입니다"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">우리측 MG 부담금</p></InfoTooltip>
                          <p className="text-2xl font-bold text-blue-400">{bep.ourMGShare.toLocaleString()}원</p>
                        </div>
                      </div>

                      <div className="bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-600 rounded-lg p-6">
                        <h3 className="text-xl font-bold text-white mb-4">📉 손익분기점(BEP)</h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="bg-slate-800/80 rounded-lg p-4">
                            <InfoTooltip content="= 판매가 - 원가 - 배송비 - 사은품 - PG수수료 - RS비용 (한 개 팔 때마다 남는 마진)"><p className="text-blue-200/70 text-xs uppercase tracking-wide mb-1">개당 기여마진</p></InfoTooltip>
                            <p className={`text-xl font-bold ${bep.unitMargin > 0 ? 'text-green-400' : 'text-red-400'}`}>{bep.unitMargin.toLocaleString()}원</p>
                          </div>
                          <div className="bg-slate-800/80 rounded-lg p-4">
                            <InfoTooltip content="= 우리측 MG 부담금 ÷ 개당 기여마진"><p className="text-blue-200/70 text-xs uppercase tracking-wide mb-1">🎯 BEP 판매수량</p></InfoTooltip>
                            <p className="text-xl font-bold text-white">{bep.bepQty !== null ? `${bep.bepQty.toLocaleString()}개` : '계산 불가'}</p>
                          </div>
                          <div className="bg-slate-800/80 rounded-lg p-4 col-span-1 sm:col-span-2">
                            <InfoTooltip content="= BEP 판매수량 × 판매가"><p className="text-blue-200/70 text-xs uppercase tracking-wide mb-1">🎯 BEP 매출</p></InfoTooltip>
                            <p className="text-xl font-bold text-white">{bep.bepRevenue !== null ? `${bep.bepRevenue.toLocaleString()}원` : '계산 불가'}</p>
                          </div>
                        </div>
                        {bep.unitMargin <= 0 && (
                          <div className="mt-4 p-3 bg-red-900 border border-red-700 rounded text-red-200 text-sm">
                            ⚠️ 개당 기여마진이 0원 이하입니다. 판매가, 원가, RS율 등을 다시 확인하세요.
                          </div>
                        )}
                      </div>

                      <div className="mt-6 pt-6 border-t border-slate-700">
                        <h3 className="text-lg font-bold text-white mb-1">📋 캠페인 실적 기록</h3>
                        <p className="text-slate-400 text-xs mb-4">캠페인 종료 후 실제 판매수량/매출을 기록해두면, 예상치와 비교해 다음 캠페인의 전환율을 더 정확하게 가늠할 수 있습니다.</p>

                        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 mb-3">
                          <input type="date" value={campaignLogForm.date} onChange={e => setCampaignLogForm({...campaignLogForm, date: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                          <input type="number" min="0" placeholder="실제 판매수량" value={campaignLogForm.actualQty} onChange={e => setCampaignLogForm({...campaignLogForm, actualQty: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                          <input type="number" min="0" placeholder="실제 매출(원)" value={campaignLogForm.actualRevenue} onChange={e => setCampaignLogForm({...campaignLogForm, actualRevenue: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                          <input type="text" placeholder="메모 (선택)" value={campaignLogForm.note} onChange={e => setCampaignLogForm({...campaignLogForm, note: e.target.value})} className="bg-slate-700 border border-slate-600 rounded px-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500" />
                        </div>
                        <button onClick={() => handleAddCampaignLog(selectedChannel._id)} className="bg-blue-600 hover:bg-blue-700 text-white text-sm px-4 py-2 rounded font-semibold transition mb-4">+ 실적 기록 추가</button>

                        {(selectedChannel.campaignLogs && selectedChannel.campaignLogs.length > 0) ? (
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead className="border-b border-slate-600"><tr className="text-slate-300">
                                <th className="text-left p-2">날짜</th>
                                <th className="text-right p-2">실제 판매수량</th>
                                <th className="text-right p-2">실제 매출</th>
                                <th className="text-right p-2">당시 예상수량</th>
                                <th className="text-right p-2">실측 전환율</th>
                                <th className="text-left p-2">메모</th>
                                <th className="text-center p-2">관리</th>
                              </tr></thead>
                              <tbody>
                                {[...selectedChannel.campaignLogs].sort((a, b) => new Date(b.date) - new Date(a.date)).map(log => {
                                  const measuredRate = log.expectedClicksSnapshot ? (log.actualQty / log.expectedClicksSnapshot * 100) : null;
                                  return (
                                    <tr key={log._id} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                      <td className="p-2 text-slate-300">{log.date}</td>
                                      <td className="text-right p-2 text-white">{log.actualQty?.toLocaleString()}개</td>
                                      <td className="text-right p-2 text-white">{log.actualRevenue?.toLocaleString()}원</td>
                                      <td className="text-right p-2 text-slate-400">{log.expectedQtySnapshot !== null && log.expectedQtySnapshot !== undefined ? `${log.expectedQtySnapshot.toLocaleString()}개` : '-'}</td>
                                      <td className="text-right p-2 text-blue-400">{measuredRate !== null ? `${measuredRate.toFixed(2)}%` : '-'}</td>
                                      <td className="p-2 text-slate-400">{log.note}</td>
                                      <td className="text-center p-2"><button onClick={() => handleDeleteCampaignLog(selectedChannel._id, log._id)} className="text-red-400 hover:text-red-300 p-1"><Trash2 size={14} /></button></td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          </div>
                        ) : (
                          <p className="text-slate-500 text-sm text-center py-4">아직 기록된 실적이 없습니다.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {activeTab === 'trends' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">📈 지난 30일 트렌드</h3>
                    {selectedChannel.dailyStats && selectedChannel.dailyStats.length > 1 ? (
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={selectedChannel.dailyStats.slice(-30)}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                          <XAxis dataKey="date" tick={{ fill: '#94a3b8' }} />
                          <YAxis tick={{ fill: '#94a3b8' }} />
                          <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0' }} />
                          <Legend />
                          <Line type="monotone" dataKey="engagement" stroke="#3b82f6" name="인게이지먼트 %" strokeWidth={2} />
                        </LineChart>
                      </ResponsiveContainer>
                    ) : (
                      <p className="text-slate-400 text-center py-8">데이터가 부족합니다. 며칠 뒤에 다시 확인해주세요.</p>
                    )}
                  </div>
                )}

                {activeTab === 'export' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">📥 데이터 내보내기</h3>
                    <button onClick={handleExportExcel} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition font-semibold">
                      <Download size={20} /> Excel 다운로드 (상세 분석)
                    </button>
                    <p className="text-slate-400 text-sm mt-4">✓ 요약 분석 시트<br/>✓ 롱폼/숏폼 상세 분석<br/>✓ 일일 통계 데이터<br/>✓ 30일 트렌드 분석</p>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        <div className="mt-12 text-center text-slate-400 text-sm">
          <p>💡 팁: 정기적으로 갱신하여 최신 통계를 확인하세요</p>
        </div>
      </div>
    </div>
  );
}
