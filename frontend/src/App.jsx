import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
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
  const [compareMode, setCompareMode] = useState(false);
  const [compareChannelIds, setCompareChannelIds] = useState([]);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [channelSearch, setChannelSearch] = useState('');
  const [channelSortBy, setChannelSortBy] = useState('name'); // name | score | subscribers
  const [discoverKeyword, setDiscoverKeyword] = useState('안마기 리뷰');
  const [discoverResults, setDiscoverResults] = useState([]);
  const [discovering, setDiscovering] = useState(false);

  // 영상 탭 페이지네이션 + 검색
  const VIDEOS_PER_PAGE = 50;
  const [videoPage, setVideoPage] = useState(1);
  const [videoSearch, setVideoSearch] = useState('');

  // 품목 관리
  const [items, setItems] = useState([]);
  const [showItemManager, setShowItemManager] = useState(false);
  const [itemForm, setItemForm] = useState({ name: '', sellPrice: '', cost: '', shippingCost: '', giftCost: '', memo: '' });
  const [editingItemId, setEditingItemId] = useState(null);

  // 캠페인 실적 기록
  const [campaignLogForm, setCampaignLogForm] = useState({ date: '', actualQty: '', actualRevenue: '', note: '' });

  // 채널 메타 (상태/메모/태그)
  const [metaForm, setMetaForm] = useState({ status: '미분류', memo: '', channelTags: [] });
  const [metaTagInput, setMetaTagInput] = useState('');
  const [savingMeta, setSavingMeta] = useState(false);

  // 시뮬레이터 state (부모에 유지 → 탭 전환해도 값 보존, 리마운트 없음)
  const [sim, setSim] = React.useState({
    productPrice: 89000, cost: 30000, shippingCost: 3500, giftCost: 0,
    pgFeeRate: 0.0385, totalMG: 3000000, agencyMGShareRate: 0.3,
    rsRate: 0.2, expectedClicks: 500, conversionRate: 0.03,
  });
  const [simInitialized, setSimInitialized] = React.useState(false);
  const [statusFilter, setStatusFilter] = useState('전체');

  useEffect(() => { loadChannels(); loadItems(); }, []);
  // 탭/채널 변경 시 페이지·검색 초기화
  useEffect(() => { setVideoPage(1); setVideoSearch(''); }, [activeTab, selectedChannelId]);

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
    // 채널 메타 폼 초기화
    if (ch) {
      setMetaForm({
        status: ch.status || '미분류',
        memo: ch.memo || '',
        channelTags: ch.channelTags || [],
      });
      setMetaTagInput('');
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
      setError(`✓ 갱신 완료 — 총 ${result.totalVideos ?? result.channel?.videos?.length ?? 0}개 영상 수집`);
    } catch (err) {
      setError('새로고침 실패: ' + err.message);
    } finally {
      setRefreshing({ ...refreshing, [channelId]: false });
    }
  };

  const [refreshingAll, setRefreshingAll] = useState(false);
  const [refreshAllProgress, setRefreshAllProgress] = useState({ current: 0, total: 0, name: '' });
  const handleRefreshAll = async () => {
    if (!window.confirm(`등록된 채널 ${channels.length}개를 모두 갱신합니다. 채널 수에 따라 수 분이 소요될 수 있습니다.`)) return;
    setRefreshingAll(true);
    setError(null);
    const total = channels.length;
    let succeeded = 0;
    const failed = [];
    for (let i = 0; i < channels.length; i++) {
      const ch = channels[i];
      setRefreshAllProgress({ current: i + 1, total, name: ch.channelName });
      try {
        const result = await refreshChannel(ch._id);
        setChannels(prev => prev.map(c => c._id === ch._id ? result.channel : c));
        succeeded++;
      } catch (err) {
        failed.push(ch.channelName);
      }
    }
    setRefreshingAll(false);
    setRefreshAllProgress({ current: 0, total: 0, name: '' });
    if (failed.length > 0) {
      setError(`✓ ${succeeded}/${total}개 갱신 완료 — 실패: ${failed.join(', ')}`);
    } else {
      setError(`✓ 전체 ${total}개 채널 갱신 완료`);
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

  const handleSaveMeta = async () => {
    if (!selectedChannel) return;
    setSavingMeta(true);
    try {
      const response = await api.patch(`/channels/${selectedChannel._id}/meta`, metaForm);
      setChannels(channels.map(ch => ch._id === selectedChannel._id ? { ...ch, ...response.data } : ch));
      setError('✓ 채널 정보가 저장되었습니다');
    } catch (err) {
      setError('저장 실패: ' + (err.response?.data?.error || err.message));
    } finally {
      setSavingMeta(false);
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

  const handleGenerateProposal = () => {
    if (!selectedChannel) return;
    const ch = selectedChannel;
    const eff = calculateEfficiencyScore(ch);
    const ppl = calculatePPLRevenue(ch.videos);
    const lf = filterVideos(ch.videos, 'longform');
    const assessment = generateChannelAssessment(ch);
    const subsText = ch.subscribers >= 1000000 ? `${(ch.subscribers/1000000).toFixed(1)}M` : `${(ch.subscribers/1000).toFixed(0)}K`;
    const scoreColor = eff.total >= 75 ? '#22c55e' : eff.total >= 50 ? '#eab308' : '#ef4444';
    const grade = eff.total >= 75 ? 'PPL 적합 ✅' : eff.total >= 50 ? '검토 필요 ⚠️' : '비적합 ❌';

    const rows = (items) => items.map(([k,v]) => `<tr><td style="color:#94a3b8;padding:8px 12px;border-bottom:1px solid #334155;font-size:13px">${k}</td><td style="color:#f1f5f9;padding:8px 12px;border-bottom:1px solid #334155;font-size:13px;font-weight:600;text-align:right">${v}</td></tr>`).join('');

    const assessmentHtml = assessment.map(sec => `
      <div style="background:${sec.highlight?'#1e3a2f':'#1e293b'};border:1px solid ${sec.highlight?'#22c55e':'#334155'};border-radius:8px;padding:14px;margin-bottom:10px">
        <div style="color:${sec.highlight?'#86efac':'#94a3b8'};font-size:13px;font-weight:700;margin-bottom:6px">${sec.title}</div>
        <div style="color:${sec.highlight?'#bbf7d0':'#cbd5e1'};font-size:13px;line-height:1.7">${sec.body}</div>
      </div>`).join('');

    const html = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="UTF-8">
<title>PPL 제안서 — ${ch.channelName}</title>
<style>
  body{margin:0;padding:0;background:#0f172a;color:#f1f5f9;font-family:'Apple SD Gothic Neo','Malgun Gothic',sans-serif;-webkit-print-color-adjust:exact;print-color-adjust:exact}
  .page{max-width:800px;margin:0 auto;padding:40px 32px}
  @media print{body{background:#fff;color:#111}.dark{background:#fff!important;color:#111!important}}
  .print-btn{position:fixed;top:16px;right:16px;background:#3b82f6;color:#fff;border:none;padding:10px 20px;border-radius:8px;cursor:pointer;font-size:14px;font-weight:700;z-index:999}
  .print-btn:hover{background:#2563eb}
  @media print{.print-btn{display:none}}
</style>
</head><body>
<button class="print-btn" onclick="window.print()">🖨️ PDF 저장</button>
<div class="page">
  <!-- 헤더 -->
  <div style="border-bottom:2px solid #3b82f6;padding-bottom:24px;margin-bottom:28px">
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <div style="color:#3b82f6;font-size:12px;font-weight:700;letter-spacing:2px;margin-bottom:6px">PPL PROPOSAL</div>
        <h1 style="margin:0;font-size:28px;font-weight:800;color:#f1f5f9">${ch.channelName}</h1>
        <div style="color:#64748b;font-size:13px;margin-top:6px">작성일: ${new Date().toLocaleDateString('ko-KR', {year:'numeric',month:'long',day:'numeric'})} &nbsp;·&nbsp; YouTube Channel Analyzer</div>
      </div>
      <div style="text-align:center;background:#1e293b;border:2px solid ${scoreColor};border-radius:12px;padding:16px 24px">
        <div style="color:#94a3b8;font-size:11px;font-weight:700;letter-spacing:1px">효율 점수</div>
        <div style="color:${scoreColor};font-size:36px;font-weight:900;line-height:1">${eff.total}</div>
        <div style="color:#64748b;font-size:11px">/ 100점</div>
        <div style="color:${scoreColor};font-size:12px;font-weight:700;margin-top:4px">${grade}</div>
      </div>
    </div>
  </div>

  <!-- 채널 기본 지표 -->
  <h2 style="color:#3b82f6;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:12px">📊 채널 기본 지표</h2>
  <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:28px">
    ${rows([
      ['구독자 수', subsText],
      ['총 조회수', `${(ch.totalViews/100000000).toFixed(1)}억 회`],
      ['롱폼 영상 수', `${lf.length}개`],
      ['평균 조회수 (롱폼 10개)', `${(ppl.avgViews/1000).toFixed(1)}K`],
      ['인게이지먼트율', `${ppl.engagement}%`],
      ['채널 운영 기간', eff.details.channelAgeYears ? `${eff.details.channelAgeYears}년` : '-'],
    ])}
  </table>

  <!-- 효율 점수 세부 -->
  <h2 style="color:#3b82f6;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:12px">⚡ 효율 점수 세부 내역</h2>
  <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:28px">
    ${rows([
      ['💬 인게이지먼트율', `${eff.details.engRate}% → ${eff.details.engScore}/35점`],
      ['👥 구독자 대비 조회수', `${eff.details.viewsRatio}% → ${eff.details.viewsScore}/25점`],
      ['📊 조회수 일관성 (CV)', `${eff.details.cvPercent ?? '-'}% → ${eff.details.consistencyScore}/15점`],
      ['📅 평균 업로드 주기', `${eff.details.avgGapDays ?? '-'}일 → ${eff.details.uploadScore}/10점`],
      ['📢 최근 광고 비율', `${eff.details.adRatio}% → ${eff.details.adScore}/10점`],
      ['📆 채널 연령', `${eff.details.channelAgeYears ?? '-'}년 → ${eff.details.ageScore}/5점`],
    ])}
  </table>

  <!-- PPL 수익 분석 -->
  <h2 style="color:#3b82f6;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:12px">💰 PPL 수익 분석</h2>
  <table style="width:100%;border-collapse:collapse;background:#1e293b;border-radius:8px;overflow:hidden;margin-bottom:28px">
    ${rows([
      ['상품 객단가', `${settings.productPrice.toLocaleString()}원`],
      ['총 MG', `${settings.totalMG.toLocaleString()}원`],
      ['우리측 MG 부담', `${ppl.ourMGShare?.toLocaleString()}원`],
      ['예상 클릭수', `${ppl.expectedClicks?.toLocaleString()}회`],
      ['예상 판매수량', `${ppl.estimatedQty?.toLocaleString()}개`],
      ['예상 매출', `${ppl.expectedRevenue?.toLocaleString()}원`],
      ['순이익', `${ppl.netProfit?.toLocaleString()}원`],
      ['ROI', ppl.roi !== null ? `${ppl.roi}%` : '계산 불가'],
      ['위험도', ppl.riskLevel],
    ])}
  </table>

  <!-- 채널 총평 -->
  <h2 style="color:#3b82f6;font-size:15px;font-weight:700;letter-spacing:1px;margin-bottom:12px">💡 채널 종합 총평</h2>
  ${assessmentHtml}

  <!-- 푸터 -->
  <div style="margin-top:40px;padding-top:16px;border-top:1px solid #334155;display:flex;justify-content:space-between;align-items:center">
    <div style="color:#475569;font-size:11px">YouTube Channel Analyzer · Built by Jay Jeong</div>
    <div style="color:#475569;font-size:11px">${new Date().toLocaleDateString('ko-KR')}</div>
  </div>
</div>
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const win = window.open(url, '_blank');
    if (win) win.focus();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
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

    const cpm = cpv !== null ? Math.round(cpv * 1000) : null;

    return {
      avgViews: Math.round(avgViews),
      engagement: (engagement * 100).toFixed(2),
      expectedClicks: Math.round(expectedClicks),
      clickRate: clickRate !== null ? parseFloat(clickRate.toFixed(2)) : null,
      cpv,
      cpm,
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
  // 인게이지먼트 35 + 구독자대비조회수 25 + 조회수일관성 15 + 업로드주기 10 + 광고비율 10 + 채널연령 5
  const calculateEfficiencyScore = (channel) => {
    const videos = channel?.videos || [];
    const subscribers = channel?.subscribers || 0;
    const lf = filterVideos(videos, 'longform');
    const mid = filterVideos(videos, 'mid');
    const lfSorted = [...lf].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate));
    const recentLF = lfSorted.slice(0, 10);

    // 1. 인게이지먼트율 (35점) — PPL 전환에 가장 직결
    const engRate = recentLF.length > 0
      ? recentLF.reduce((s, v) => s + (parseFloat(v.engagement) || 0), 0) / recentLF.length : 0;
    let engScore = 3;
    if (engRate >= 5) engScore = 35;
    else if (engRate >= 3) engScore = 26;
    else if (engRate >= 1.5) engScore = 17;
    else if (engRate >= 0.5) engScore = 9;

    // 2. 구독자 대비 조회수 비율 (25점) — 실제 영향력·충성도
    const recentAvgViews = recentLF.length > 0
      ? recentLF.reduce((s, v) => s + (v.views || 0), 0) / recentLF.length : 0;
    const viewsRatio = subscribers > 0 ? (recentAvgViews / subscribers) * 100 : 0;
    let viewsScore = 3;
    if (viewsRatio >= 30) viewsScore = 25;
    else if (viewsRatio >= 15) viewsScore = 19;
    else if (viewsRatio >= 5) viewsScore = 12;
    else if (viewsRatio >= 2) viewsScore = 6;

    // 3. 조회수 일관성 (15점) — 예측 가능성·투자 리스크
    let consistencyScore = 3;
    let cvPercent = null;
    if (recentLF.length >= 3) {
      const views = recentLF.map(v => v.views || 0);
      const mean = views.reduce((s, v) => s + v, 0) / views.length;
      if (mean > 0) {
        const variance = views.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / views.length;
        const cv = Math.sqrt(variance) / mean * 100; // 변동계수(%)
        cvPercent = Math.round(cv);
        if (cv <= 30) consistencyScore = 15;
        else if (cv <= 60) consistencyScore = 11;
        else if (cv <= 100) consistencyScore = 6;
      }
    }

    // 4. 업로드 주기 (10점) — 롱폼 기준, 활동성
    let uploadScore = 1;
    const recentDates = recentLF.map(v => new Date(v.uploadDate)).filter(d => !isNaN(d));
    let avgGapDays = null;
    if (recentDates.length >= 2) {
      let totalGap = 0;
      for (let i = 0; i < recentDates.length - 1; i++)
        totalGap += (recentDates[i] - recentDates[i + 1]) / (1000 * 60 * 60 * 24);
      avgGapDays = Math.round(totalGap / (recentDates.length - 1));
      if (avgGapDays <= 7) uploadScore = 10;
      else if (avgGapDays <= 14) uploadScore = 8;
      else if (avgGapDays <= 30) uploadScore = 5;
    }

    // 5. 최근 광고 비율 (10점) — 낮을수록 PPL 친화적
    let adScore = 5;
    const recentAll = [...videos].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)).slice(0, 20);
    const adCount = recentAll.filter(v => v.isAd).length;
    const adRatio = recentAll.length > 0 ? adCount / recentAll.length * 100 : 0;
    if (adRatio <= 10) adScore = 10;
    else if (adRatio <= 25) adScore = 7;
    else if (adRatio <= 40) adScore = 4;
    else adScore = 1;

    // 6. 채널 연령 (5점) — 오래될수록 신뢰도·안정성 높음
    let ageScore = 1;
    let channelAgeYears = null;
    if (channel?.channelPublishedAt) {
      channelAgeYears = (Date.now() - new Date(channel.channelPublishedAt)) / (1000 * 60 * 60 * 24 * 365);
      if (channelAgeYears >= 5) ageScore = 5;
      else if (channelAgeYears >= 3) ageScore = 4;
      else if (channelAgeYears >= 1) ageScore = 2;
    }

    const total = Math.min(100, engScore + viewsScore + consistencyScore + uploadScore + adScore + ageScore);
    const longformRatio = (lf.length + mid.length) > 0 ? (lf.length / (lf.length + mid.length) * 100) : 0;

    return {
      total,
      details: {
        engRate: engRate.toFixed(2), engScore,
        viewsRatio: viewsRatio.toFixed(1), viewsScore,
        cvPercent, consistencyScore,
        avgGapDays, uploadScore,
        adRatio: adRatio.toFixed(1), adScore,
        channelAgeYears: channelAgeYears ? channelAgeYears.toFixed(1) : null, ageScore,
        longformRatio: longformRatio.toFixed(1),
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
    setVideoPage(1);
  };

  // ──────────────────────────────────────────────
  // 채널 종합 총평 자동 생성
  // ──────────────────────────────────────────────
  const generateChannelAssessment = (channel) => {
    const videos = channel?.videos || [];
    const lf = filterVideos(videos, 'longform');
    const mid = filterVideos(videos, 'mid');
    const shorts = filterVideos(videos, 'shorts');
    const eff = calculateEfficiencyScore(channel);
    const d = eff.details;
    const trend = calculateViewTrend(lf);
    const ca = channel.commentAnalysis;
    const subs = channel.subscribers || 0;
    const totalVids = videos.length;
    const lfRatio = totalVids > 0 ? lf.length / totalVids * 100 : 0;

    const sections = [];

    // ── 1. 채널 개요 ──
    const subsText = subs >= 1000000 ? `${(subs/1000000).toFixed(1)}M` : subs >= 10000 ? `${(subs/10000).toFixed(1)}만` : `${(subs/1000).toFixed(0)}K`;
    const ageText = d.channelAgeYears ? `${d.channelAgeYears}년` : '정보 없음';
    const contentFocus = lfRatio >= 60 ? '롱폼 중심 채널' : shorts.length > lf.length + mid.length ? '숏폼 중심 채널' : '혼합형 채널';
    sections.push({
      title: '📺 채널 개요',
      body: `구독자 ${subsText}, 채널 운영 ${ageText}의 ${contentFocus}입니다. ` +
        `총 영상 ${totalVids.toLocaleString()}개 중 롱폼 ${lf.length}개(${lfRatio.toFixed(0)}%), 미드폼 ${mid.length}개, 숏폼 ${shorts.length}개로 구성되어 있습니다. ` +
        (d.avgGapDays !== null
          ? `롱폼 기준 평균 ${d.avgGapDays}일마다 업로드하며, ${d.avgGapDays <= 14 ? '꾸준한 업로드 패턴을 보입니다.' : d.avgGapDays <= 30 ? '월 1~2회 수준의 업로드 주기입니다.' : '업로드 간격이 비교적 긴 편입니다.'}`
          : '업로드 주기 데이터가 부족합니다.')
    });

    // ── 2. 시청자 반응 & 인게이지먼트 ──
    const engRate = parseFloat(d.engRate);
    const engLevel = engRate >= 5 ? '매우 높은' : engRate >= 3 ? '높은' : engRate >= 1.5 ? '평균 수준의' : '낮은';
    const viewsRatioVal = parseFloat(d.viewsRatio);
    const loyaltyText = viewsRatioVal >= 30 ? '충성도 높은 팬층을 보유하고 있으며,' : viewsRatioVal >= 15 ? '적정 수준의 팬 충성도를 갖추고 있으며,' : '팬 충성도는 다소 낮은 편이나,';
    const cvText = d.cvPercent !== null
      ? (d.cvPercent <= 30 ? '영상마다 조회수 편차가 적어 안정적인 성과를 예측할 수 있습니다.' : d.cvPercent <= 60 ? '조회수 편차가 있으나 예측 가능한 범위 내에 있습니다.' : '영상별 조회수 편차가 커서 PPL 성과 예측이 불확실합니다.')
      : '';
    const trendText = trend?.change !== null
      ? (trend.change > 10 ? `최근 조회수가 ${trend.change}% 상승 중으로 성장하는 채널입니다.` : trend.change < -10 ? `최근 조회수가 ${Math.abs(trend.change)}% 하락세를 보이고 있어 주의가 필요합니다.` : '조회수는 비교적 안정적으로 유지되고 있습니다.')
      : '';
    sections.push({
      title: '📊 시청자 반응 분석',
      body: `롱폼 기준 평균 인게이지먼트율 ${d.engRate}%로 ${engLevel} 반응도를 보입니다. ` +
        `${loyaltyText} 구독자 대비 평균 조회수 비율은 ${d.viewsRatio}%입니다. ` +
        `${cvText} ${trendText}`
    });

    // ── 3. PPL 친화도 ──
    const adRatioVal = parseFloat(d.adRatio);
    const adText = adRatioVal <= 10
      ? `최근 광고 비율이 ${d.adRatio}%로 매우 낮아, 시청자들의 광고 피로도가 낮고 새로운 PPL에 대한 수용도가 높을 것으로 판단됩니다.`
      : adRatioVal <= 25
      ? `최근 광고 비율이 ${d.adRatio}%로 적정 수준입니다. 광고 피로도는 관리 가능한 범위입니다.`
      : `최근 광고 비율이 ${d.adRatio}%로 다소 높아, 시청자들이 광고 콘텐츠에 이미 익숙하거나 피로를 느낄 수 있습니다.`;
    const lfPplText = lf.length >= 20
      ? `롱폼 영상이 ${lf.length}개로 충분하여 PPL 노출 기회가 다양합니다.`
      : lf.length >= 5
      ? `롱폼 영상 ${lf.length}개에서 PPL 집행이 가능합니다.`
      : `롱폼 영상이 ${lf.length}개로 적어 PPL 집행 가능한 영상이 제한적입니다.`;
    sections.push({
      title: '🎯 PPL 친화도',
      body: `${adText} ${lfPplText}`
    });

    // ── 4. 제품 핏 분석 (헬스케어/마사지기) ──
    const channelName = channel.channelName || '';
    const keywords = (channel.channelKeywords || []).join(' ').toLowerCase();
    const healthKeywords = ['건강', '헬스', '운동', '마사지', '피로', '스트레칭', '몸관리', '홈케어', '다이어트', '웰니스', '라이프스타일', '일상'];
    const familyKeywords = ['가족', '육아', '주부', '살림', '일상', '맘', '패밀리', 'family', '엄마'];
    const matchedHealth = healthKeywords.filter(k => channelName.includes(k) || keywords.includes(k));
    const matchedFamily = familyKeywords.filter(k => channelName.includes(k) || keywords.includes(k));
    let fitText = '';
    let fitLevel = '';
    if (matchedHealth.length > 0) {
      fitLevel = '높음';
      fitText = `채널 키워드(${matchedHealth.slice(0,3).join(', ')})가 헬스케어·마사지 제품과 직접 연관되어 제품 핏이 우수합니다. 시청자들이 이미 건강 관련 콘텐츠에 관심이 높아 PPL 전환율 기대치가 높습니다.`;
    } else if (matchedFamily.length > 0) {
      fitLevel = '중간';
      fitText = `가족·일상 채널로, 마사지기·헬스케어 제품의 '집에서 쉽게 쓰는 건강 아이템' 포지셔닝으로 접근하면 시청자 공감을 이끌어낼 수 있습니다.`;
    } else if (subs >= 100000 && engRate >= 3) {
      fitLevel = '중간';
      fitText = `채널 카테고리가 헬스케어와 직접 연관되지는 않지만, 높은 인게이지먼트를 보유한 중대형 채널로서 브랜드 인지도 확대 목적의 PPL에는 적합할 수 있습니다. 타깃 시청자층 분석 후 판단을 권장합니다.`;
    } else {
      fitLevel = '낮음';
      fitText = `채널의 콘텐츠 방향성이 헬스케어·마사지 제품과의 연관성이 낮습니다. PPL 집행 시 시청자 거부감이 발생할 수 있어 신중한 검토가 필요합니다.`;
    }
    sections.push({
      title: `🛍️ 제품 핏 분석 (헬스케어/마사지기) — ${fitLevel}`,
      body: fitText
    });

    // ── 5. 댓글 분석 요약 (있을 때만) ──
    if (ca?.qualityScore != null) {
      const purchaseRate = (ca.purchaseIntentRatio * 100).toFixed(1);
      const negRate = (ca.negativeRatio * 100).toFixed(1);
      const commentText =
        `댓글 품질 점수 ${ca.qualityScore}점, 구매의도 댓글 비율 ${purchaseRate}%로 ` +
        (ca.purchaseIntentRatio >= 0.1 ? '시청자들의 구매 관심도가 높습니다. ' : '시청자 구매 의향은 보통 수준입니다. ') +
        `평균 댓글 길이 ${ca.avgCommentLength}자로 ${ca.avgCommentLength >= 20 ? '진성 팬의 비중이 높고,' : '단순 반응 댓글이 많으며,'} ` +
        `광고 부정 반응은 ${negRate}%로 ${ca.negativeRatio <= 0.05 ? 'PPL 친화적인 댓글 분위기를 형성하고 있습니다.' : '광고에 대한 거부 반응이 일부 존재합니다.'}`;
      sections.push({ title: '💬 댓글 품질 요약', body: commentText });
    }

    // ── 6. 종합 의견 ──
    const score = eff.total;
    let recommendation = '';
    let recColor = '';
    if (score >= 75) {
      recommendation = `효율 점수 ${score}점으로 PPL 집행을 적극 권장합니다. 높은 인게이지먼트와 안정적인 조회수를 바탕으로 예측 가능한 PPL 성과가 기대됩니다. 우선 협의 채널로 검토하시기 바랍니다.`;
      recColor = 'green';
    } else if (score >= 55) {
      recommendation = `효율 점수 ${score}점으로 조건부 집행을 검토할 수 있습니다. 일부 지표가 아쉽지만 전체적으로 균형 잡힌 채널입니다. MG 조건을 보수적으로 설정하고 소규모 테스트 캠페인으로 시작하는 것을 권장합니다.`;
      recColor = 'yellow';
    } else if (score >= 40) {
      recommendation = `효율 점수 ${score}점으로 신중한 접근이 필요합니다. 특정 지표에서 리스크 요인이 확인됩니다. 낮은 MG로 리스크를 최소화하거나, 지표 개선 후 재검토를 권장합니다.`;
      recColor = 'orange';
    } else {
      recommendation = `효율 점수 ${score}점으로 현 시점에서 PPL 집행을 권장하지 않습니다. 인게이지먼트, 조회수 일관성 등 핵심 지표가 기준에 미달합니다. 해당 채널은 보류 처리하고 다른 채널을 우선 검토하시기 바랍니다.`;
      recColor = 'red';
    }
    sections.push({ title: '📋 종합 의견', body: recommendation, highlight: true, color: recColor });

    return sections;
  };

  // 영상 테이블 페이지네이션 + 검색 헬퍼
  const getPaginatedVideos = (videos) => {
    const filtered = videoSearch.trim()
      ? videos.filter(v => v.title?.toLowerCase().includes(videoSearch.toLowerCase()))
      : videos;
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / VIDEOS_PER_PAGE));
    const safePage = Math.min(videoPage, totalPages);
    const start = (safePage - 1) * VIDEOS_PER_PAGE;
    const paged = filtered.slice(start, start + VIDEOS_PER_PAGE);
    return { paged, total, totalPages, safePage, start };
  };

  // 페이지네이션 UI 컴포넌트
  const PaginationBar = ({ total, totalPages, safePage }) => {
    if (totalPages <= 1) return null;
    return (
      <div className="flex items-center justify-between mt-4 pt-3 border-t border-slate-700">
        <p className="text-xs text-slate-400">총 {total.toLocaleString()}개 중 {((safePage-1)*VIDEOS_PER_PAGE+1).toLocaleString()}~{Math.min(safePage*VIDEOS_PER_PAGE, total).toLocaleString()}번째</p>
        <div className="flex items-center gap-2">
          <button onClick={() => setVideoPage(1)} disabled={safePage === 1} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white transition">«</button>
          <button onClick={() => setVideoPage(p => Math.max(1, p-1))} disabled={safePage === 1} className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white transition">이전</button>
          <span className="text-xs text-slate-300">{safePage} / {totalPages}</span>
          <button onClick={() => setVideoPage(p => Math.min(totalPages, p+1))} disabled={safePage === totalPages} className="text-xs px-3 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white transition">다음</button>
          <button onClick={() => setVideoPage(totalPages)} disabled={safePage === totalPages} className="text-xs px-2 py-1 rounded bg-slate-700 hover:bg-slate-600 disabled:opacity-30 text-white transition">»</button>
        </div>
      </div>
    );
  };

  const toggleCompareChannel = (id) => {
    setCompareChannelIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const generateMarkdownReport = (channel) => {
    const lf = filterVideos(channel.videos, 'longform');
    const mid = filterVideos(channel.videos, 'mid');
    const shorts = filterVideos(channel.videos, 'shorts');
    const ppl = calculatePPLRevenue(channel.videos);
    const eff = calculateEfficiencyScore(channel);
    const trend = calculateViewTrend(lf);
    const ca = channel.commentAnalysis;
    const now = new Date().toLocaleDateString('ko-KR');

    const lines = [
      `# 📊 채널 검토 리포트 — ${channel.channelName}`,
      `> 생성일: ${now}`,
      ``,
      `## 기본 정보`,
      `| 항목 | 값 |`,
      `|------|-----|`,
      `| 구독자 | ${(channel.subscribers/10000).toFixed(1)}만 |`,
      `| 총 조회수 | ${(channel.totalViews/100000000).toFixed(1)}억 |`,
      `| 국가 | ${channel.country || '-'} |`,
      `| 롱폼 영상 수 | ${lf.length}개 |`,
      `| 미드폼 영상 수 | ${mid.length}개 |`,
      `| 숏폼 영상 수 | ${shorts.length}개 |`,
      ``,
      `## ⚡ 채널 효율 점수: **${eff.total}점 / 100점**`,
      `| 지표 | 값 | 점수 |`,
      `|------|-----|------|`,
      `| 인게이지먼트율 | ${eff.details.engRate}% | ${eff.details.engScore}/35 |`,
      `| 구독자 대비 조회수 | ${eff.details.viewsRatio}% | ${eff.details.viewsScore}/25 |`,
      `| 조회수 일관성 (변동계수) | ${eff.details.cvPercent !== null ? eff.details.cvPercent+'%' : '-'} | ${eff.details.consistencyScore}/15 |`,
      `| 평균 업로드 주기 (롱폼) | ${eff.details.avgGapDays !== null ? eff.details.avgGapDays+'일' : '-'} | ${eff.details.uploadScore}/10 |`,
      `| 최근 광고 비율 | ${eff.details.adRatio}% | ${eff.details.adScore}/10 |`,
      `| 채널 연령 | ${eff.details.channelAgeYears !== null ? eff.details.channelAgeYears+'년' : '-'} | ${eff.details.ageScore}/5 |`,
      ``,
      `## 📈 PPL 분석 (최근 롱폼 10개 기준)`,
      `| 항목 | 값 |`,
      `|------|-----|`,
      `| 평균 조회수 | ${(ppl.avgViews/1000).toFixed(1)}K |`,
      `| 인게이지먼트 | ${ppl.engagement}% |`,
      `| CPV (조회수당 비용) | ${ppl.cpv !== null ? ppl.cpv.toLocaleString()+'원' : '미입력'} |`,
      `| CPM (1,000회당) | ${ppl.cpm !== null ? ppl.cpm.toLocaleString()+'원' : '미입력'} |`,
      `| 예상 클릭수 | ${ppl.expectedClicks.toLocaleString()}회 |`,
      `| 예상 판매수량 | ${ppl.estimatedQty.toLocaleString()}개 |`,
      `| 예상 매출 | ${ppl.expectedRevenue.toLocaleString()}원 |`,
      `| 순이익 | ${ppl.netProfit.toLocaleString()}원 |`,
      `| ROI | ${ppl.roi !== null ? ppl.roi+'%' : '계산 불가'} |`,
      `| ROAS | ${ppl.roas !== null ? ppl.roas+'%' : '계산 불가'} |`,
      `| 위험도 | ${ppl.riskLevel} |`,
    ];

    if (trend) {
      lines.push(``, `## 📊 조회수 트렌드`);
      lines.push(`- 최근 10개 평균: **${(trend.recentAvg/1000).toFixed(1)}K**`);
      lines.push(`- 이전 10개 평균: **${trend.prevAvg ? (trend.prevAvg/1000).toFixed(1)+'K' : '-'}**`);
      if (trend.change !== null) lines.push(`- 변화율: **${trend.change > 0 ? '+' : ''}${trend.change}%**`);
    }

    if (ca?.qualityScore != null) {
      lines.push(``, `## 💬 댓글 품질 분석`);
      lines.push(`| 지표 | 값 |`);
      lines.push(`|------|-----|`);
      lines.push(`| 댓글 품질 점수 | ${ca.qualityScore}점 |`);
      lines.push(`| 구매의도 댓글 비율 | ${(ca.purchaseIntentRatio*100).toFixed(1)}% |`);
      lines.push(`| 평균 댓글 길이 | ${ca.avgCommentLength}자 |`);
      lines.push(`| 광고 부정 반응 | ${(ca.negativeRatio*100).toFixed(1)}% |`);
    }

    // 채널 종합 총평
    const assessment = generateChannelAssessment(channel);
    if (assessment?.length > 0) {
      lines.push(``, `## 💡 채널 종합 총평`);
      assessment.forEach(sec => {
        lines.push(``, `### ${sec.title}`);
        lines.push(sec.body);
      });
    }

    if (channel.campaignLogs?.length > 0) {
      lines.push(``, `## 📋 과거 캠페인 실적`);
      lines.push(`| 날짜 | 실제 판매수량 | 실제 매출 | 메모 |`);
      lines.push(`|------|------|------|------|`);
      channel.campaignLogs.forEach(log => {
        lines.push(`| ${log.date} | ${log.actualQty?.toLocaleString()}개 | ${log.actualRevenue?.toLocaleString()}원 | ${log.note || '-'} |`);
      });
    }

    lines.push(``, `---`, `*YouTube Channel Analyzer | Built by Jay Jeong (정승환)*`);
    return lines.join('\n');
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
              <h1 className="text-xl sm:text-3xl font-bold text-white tracking-tight">📊 YouTube Channel <span className="text-blue-400">Analyzer</span></h1>
              <p className="text-slate-500 mt-0.5 text-xs sm:text-sm">
                {channels.length}개 채널 · Built by <span className="text-slate-400 font-medium">Jay Jeong</span>
                {process.env.REACT_APP_VERSION && <span className="text-slate-600 ml-2">v{process.env.REACT_APP_VERSION}{process.env.REACT_APP_BUILD_TIME && ` · ${process.env.REACT_APP_BUILD_TIME} 빌드`}</span>}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 sm:gap-3">
              <button onClick={handleRefreshAll} disabled={refreshingAll || channels.length === 0} className={`flex-1 sm:flex-none justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition font-medium text-sm border ${refreshingAll ? 'bg-cyan-600/20 border-cyan-500 text-cyan-300' : 'bg-transparent border-slate-600 text-slate-300 hover:border-cyan-400 hover:text-cyan-300'} disabled:opacity-40`}>
                {refreshingAll
                  ? <><Loader size={14} className="animate-spin" /> {refreshAllProgress.current}/{refreshAllProgress.total} 갱신 중</>
                  : <><RefreshCw size={14} /> 전체 갱신</>}
              </button>
              <button onClick={() => setShowGuide(true)} className="flex-1 sm:flex-none justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition font-medium text-sm border bg-transparent border-slate-600 text-slate-300 hover:border-blue-400 hover:text-blue-300">
                ❓ 사용 가이드
              </button>
              <button onClick={() => setShowItemManager(!showItemManager)} className={`flex-1 sm:flex-none justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition font-medium text-sm border ${showItemManager ? 'bg-emerald-600/20 border-emerald-500 text-emerald-300' : 'bg-transparent border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
                <Package size={16} /> 품목관리
              </button>
              <button onClick={() => setShowDiscover(!showDiscover)} className={`flex-1 sm:flex-none justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition font-medium text-sm border ${showDiscover ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-transparent border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
                🔍 채널 발굴
              </button>
              <button onClick={() => { setCompareMode(!compareMode); setCompareChannelIds([]); }} className={`flex-1 sm:flex-none justify-center px-3 sm:px-5 py-2 sm:py-2.5 rounded-lg flex items-center gap-2 transition font-medium text-sm border ${compareMode ? 'bg-orange-600/20 border-orange-500 text-orange-300' : 'bg-transparent border-slate-600 text-slate-300 hover:border-slate-500 hover:text-white'}`}>
                ⚖️ {compareMode ? `비교 중 (${compareChannelIds.length}개 선택)` : '채널 비교'}
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
                  {loading ? '수집 중 (영상 많으면 1~2분 소요)...' : '추가'}
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
              {/* 채널 검색 + 정렬 */}
              <div className="mb-3 space-y-2">
                <input
                  type="text"
                  value={channelSearch}
                  onChange={e => setChannelSearch(e.target.value)}
                  placeholder="🔎 채널 검색..."
                  className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
                <div className="flex gap-1.5">
                  {[['name','이름순'],['score','효율점수'],['subscribers','구독자']].map(([val, label]) => (
                    <button key={val} onClick={() => setChannelSortBy(val)} className={`flex-1 text-xs py-1.5 rounded transition font-medium ${channelSortBy === val ? 'bg-blue-600 text-white' : 'bg-slate-800 text-slate-400 hover:bg-slate-700'}`}>{label}</button>
                  ))}
                </div>
                {/* 상태 필터 */}
                <div className="flex gap-1 flex-wrap">
                  {['전체','관심','협의중','완료','보류','미분류'].map(s => {
                    const statusStyle = { '관심':'bg-blue-500/20 text-blue-400 border-blue-500/40', '협의중':'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', '완료':'bg-green-500/20 text-green-400 border-green-500/40', '보류':'bg-red-500/20 text-red-400 border-red-500/40', '미분류':'bg-slate-500/20 text-slate-400 border-slate-500/40', '전체':'bg-slate-700 text-slate-300 border-slate-600' };
                    const isActive = statusFilter === s;
                    return (
                      <button key={s} onClick={() => setStatusFilter(s)} className={`text-xs px-2 py-0.5 rounded-full border transition ${isActive ? (statusStyle[s] || 'bg-slate-700 text-white border-slate-500') : 'bg-slate-800 text-slate-500 border-slate-700 hover:border-slate-500'}`}>{s}</button>
                    );
                  })}
                </div>
              </div>
              <div className="space-y-2 overflow-y-auto" style={{maxHeight:'calc(100vh - 320px)'}}>
                {(() => {
                  let list = [...channels];
                  if (channelSearch.trim()) list = list.filter(ch => ch.channelName?.toLowerCase().includes(channelSearch.toLowerCase()));
                  if (statusFilter !== '전체') list = list.filter(ch => (ch.status || '미분류') === statusFilter);
                  if (channelSortBy === 'score') list.sort((a,b) => calculateEfficiencyScore(b).total - calculateEfficiencyScore(a).total);
                  else if (channelSortBy === 'subscribers') list.sort((a,b) => (b.subscribers||0) - (a.subscribers||0));
                  else list.sort((a,b) => (a.channelName||'').localeCompare(b.channelName||'', 'ko'));
                  if (list.length === 0) return <p className="text-slate-500 text-sm text-center py-6">검색 결과가 없습니다</p>;

                  const statusBadge = { '관심':'bg-blue-500/20 text-blue-400 border-blue-500/40', '협의중':'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', '완료':'bg-green-500/20 text-green-400 border-green-500/40', '보류':'bg-red-500/20 text-red-400 border-red-500/40' };

                  return list.map(channel => {
                    const eff = calculateEfficiencyScore(channel);
                    const badgeColor = eff.total >= 75 ? 'bg-green-500/20 text-green-400 border-green-500/40' : eff.total >= 50 ? 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40' : 'bg-red-500/20 text-red-400 border-red-500/40';
                    const st = channel.status || '미분류';
                    return (
                      <div key={channel._id} onClick={() => setSelectedChannelId(channel._id)} className={`p-3.5 rounded-xl border cursor-pointer transition-all ${selectedChannelId === channel._id ? 'bg-blue-950/60 border-blue-500 ring-1 ring-blue-500/50 shadow-lg shadow-blue-900/20' : 'bg-slate-800/80 border-slate-700/80 hover:border-slate-600 hover:bg-slate-800'}`}>
                        <div className="flex items-center gap-3 mb-2">
                          {compareMode && (
                            <input type="checkbox" checked={compareChannelIds.includes(channel._id)} onChange={e => { e.stopPropagation(); toggleCompareChannel(channel._id); }} className="w-4 h-4 accent-orange-500 flex-shrink-0 cursor-pointer" />
                          )}
                          <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${selectedChannelId === channel._id ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-300'}`}>
                            {channel.channelName?.charAt(0) || '?'}
                          </div>
                          <div className="min-w-0 flex-1">
                            <h3 className="font-semibold text-white truncate leading-tight text-sm">{channel.channelName}</h3>
                            <p className="text-xs text-slate-400">구독자 {channel.subscribers >= 1000000 ? (channel.subscribers/1000000).toFixed(1)+'M' : (channel.subscribers/1000).toFixed(0)+'K'}</p>
                          </div>
                          <span className={`flex-shrink-0 text-xs font-bold px-2 py-0.5 rounded-full border ${badgeColor}`}>{eff.total}점</span>
                        </div>
                        <div className="flex items-center gap-1.5 mb-1.5 flex-wrap">
                          {st !== '미분류' && <span className={`text-xs px-1.5 py-0.5 rounded-full border ${statusBadge[st] || 'bg-slate-500/20 text-slate-400 border-slate-500/40'}`}>{st}</span>}
                          {(channel.channelTags || []).slice(0,2).map(tag => (
                            <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/40">#{tag}</span>
                          ))}
                        </div>
                        <p className="text-xs text-slate-500 mb-1.5">롱폼 {filterVideos(channel.videos, 'longform').length} · 미드 {filterVideos(channel.videos, 'mid').length} · 숏폼 {filterVideos(channel.videos, 'shorts').length}</p>
                        {channel.lastUpdated && <p className="text-xs text-slate-600 mb-2">{new Date(channel.lastUpdated).toLocaleDateString('ko-KR', {month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})} 갱신</p>}
                        <div className="flex gap-1.5">
                          <button onClick={(e) => { e.stopPropagation(); handleRefreshChannel(channel._id); }} disabled={refreshing[channel._id]} className="flex-1 bg-slate-700/80 hover:bg-blue-600 disabled:opacity-50 text-slate-300 hover:text-white text-xs py-1.5 rounded-lg transition flex items-center justify-center gap-1">
                            {refreshing[channel._id] ? <Loader size={11} className="animate-spin" /> : <RefreshCw size={11} />}
                            {refreshing[channel._id] ? '갱신 중' : '갱신'}
                          </button>
                          <button onClick={(e) => { e.stopPropagation(); handleDeleteChannel(channel._id); }} className="bg-slate-700/80 hover:bg-red-600/80 text-slate-400 hover:text-white p-1.5 rounded-lg transition">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {selectedChannel && (
              <div className="lg:col-span-2 space-y-6">
                <div className="flex gap-1.5 overflow-x-auto pb-1 -mx-1 px-1">
                  {['summary', 'simulator', 'bep', 'trends', 'settings', 'longform', 'mid', 'shorts', 'export'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-3.5 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap flex-shrink-0 ${activeTab === tab ? 'bg-blue-600 text-white shadow shadow-blue-900/40' : 'bg-slate-800 text-slate-400 hover:bg-slate-700 hover:text-slate-200'}`}>
                      {tab === 'summary' && '📊 요약'} {tab === 'simulator' && '🎛️ 시뮬레이터'} {tab === 'longform' && '🎬 롱폼(10분↑)'} {tab === 'mid' && '▶️ 미드폼(1~10분)'} {tab === 'shorts' && '📱 숏폼(60초↓)'} {tab === 'settings' && '⚙️ 설정'} {tab === 'bep' && '💰 손익/BEP'} {tab === 'trends' && '📈 트렌드'} {tab === 'export' && '📥 내보내기'}
                    </button>
                  ))}
                  {compareMode && compareChannelIds.length >= 2 && (
                    <button onClick={() => setActiveTab('compare')} className={`px-3.5 py-2 rounded-lg font-medium text-sm transition whitespace-nowrap flex-shrink-0 ${activeTab === 'compare' ? 'bg-orange-600 text-white' : 'bg-orange-900/40 text-orange-300 hover:bg-orange-800/40'}`}>
                      ⚖️ 채널 비교
                    </button>
                  )}
                </div>

                {activeTab === 'summary' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex items-start justify-between gap-3 mb-2">
                      <h2 className="text-2xl font-bold text-white">{selectedChannel.channelName}</h2>
                      {(() => {
                        const st = selectedChannel.status || '미분류';
                        const statusStyle = { '관심':'bg-blue-500/20 text-blue-400 border-blue-500/40', '협의중':'bg-yellow-500/20 text-yellow-400 border-yellow-500/40', '완료':'bg-green-500/20 text-green-400 border-green-500/40', '보류':'bg-red-500/20 text-red-400 border-red-500/40' };
                        if (st === '미분류') return null;
                        return <span className={`flex-shrink-0 text-sm px-3 py-1 rounded-full border font-medium ${statusStyle[st]}`}>{st}</span>;
                      })()}
                    </div>
                    {selectedChannel.channelTags?.length > 0 && (
                      <div className="flex gap-1.5 flex-wrap mb-2">
                        {selectedChannel.channelTags.map(tag => (
                          <span key={tag} className="text-xs px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/40">#{tag}</span>
                        ))}
                      </div>
                    )}
                    {selectedChannel.memo && (
                      <div className="bg-slate-700/60 border border-slate-600 rounded-lg px-3 py-2 mb-3 text-sm text-slate-300">
                        📝 {selectedChannel.memo}
                      </div>
                    )}
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
                              <p className="text-xs text-slate-400 mt-0.5">인게이지먼트(35) · 조회수비율(25) · 일관성(15) · 업로드주기(10) · 광고비율(10) · 채널연령(5)</p>
                            </div>
                            <div className="text-center">
                              <p className={`text-4xl font-bold ${scoreColor}`}>{eff.total}<span className="text-lg">점</span></p>
                              <p className={`text-sm font-semibold mt-1 ${scoreColor}`}>{grade}</p>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3">
                            {[
                              { icon:'💬', label:'인게이지먼트율', value:`${d.engRate}%`, score:d.engScore, max:35, tooltip:'롱폼 최근 10개 기준 평균 인게이지먼트율. PPL 전환에 직결되는 가장 중요한 지표입니다.', status: d.engRate >= 5 ? '매우 높음 ✓' : d.engRate >= 3 ? '높음' : d.engRate >= 1.5 ? '보통' : '낮음' },
                              { icon:'👥', label:'구독자 대비 조회수', value:`${d.viewsRatio}%`, score:d.viewsScore, max:25, tooltip:'최근 10개 영상 평균 조회수 ÷ 구독자 수. 30% 이상이면 충성도 높은 채널입니다.', status: d.viewsRatio >= 30 ? '충성도 높음 ✓' : d.viewsRatio >= 15 ? '보통' : '낮음' },
                              { icon:'📊', label:'조회수 일관성', value: d.cvPercent !== null ? `CV ${d.cvPercent}%` : '-', score:d.consistencyScore, max:15, tooltip:'조회수 변동계수(CV). 낮을수록 매 영상 조회수가 안정적 — PPL ROI 예측이 쉽습니다.', status: d.cvPercent !== null ? (d.cvPercent <= 30 ? '매우 안정적 ✓' : d.cvPercent <= 60 ? '안정적' : d.cvPercent <= 100 ? '보통' : '불안정') : '-' },
                              { icon:'📅', label:'업로드 주기 (롱폼)', value: d.avgGapDays !== null ? `${d.avgGapDays}일` : '-', score:d.uploadScore, max:10, tooltip:'최근 롱폼 10개 기준 평균 업로드 간격. 7일 이하면 꾸준히 활동하는 채널입니다.', status: d.avgGapDays !== null ? (d.avgGapDays <= 7 ? '매우 활발 ✓' : d.avgGapDays <= 14 ? '활발' : d.avgGapDays <= 30 ? '보통' : '비활성') : '-' },
                              { icon:'📢', label:'최근 광고 비율', value:`${d.adRatio}%`, score:d.adScore, max:10, tooltip:'최근 영상 20개 중 광고(isAd) 비율. 낮을수록 PPL 피로도가 낮고 수용도가 높습니다.', status: d.adRatio <= 10 ? 'PPL 친화적 ✓' : d.adRatio <= 25 ? '양호' : d.adRatio <= 40 ? '주의' : '광고 과다' },
                              { icon:'📆', label:'채널 연령', value: d.channelAgeYears !== null ? `${d.channelAgeYears}년` : '-', score:d.ageScore, max:5, tooltip:'채널 개설 이후 경과 연수. 오래된 채널일수록 신뢰도와 팬덤 안정성이 높습니다.', status: d.channelAgeYears !== null ? (d.channelAgeYears >= 5 ? '신뢰도 높음 ✓' : d.channelAgeYears >= 3 ? '안정적' : d.channelAgeYears >= 1 ? '성장기' : '신규') : '-' },
                            ].map(item => (
                              <div key={item.label} className="bg-black bg-opacity-30 rounded p-3">
                                <InfoTooltip content={item.tooltip}>
                                  <p className="text-slate-300 text-xs">{item.icon} {item.label}</p>
                                </InfoTooltip>
                                <p className="text-xl font-bold text-white mt-1">{item.value}</p>
                                <div className="flex justify-between items-center mt-1">
                                  <p className="text-xs text-slate-400">{item.status}</p>
                                  <p className="text-xs font-bold text-yellow-400">{item.score}/{item.max}점</p>
                                </div>
                                <div className="w-full bg-black/40 rounded-full h-1.5 mt-2">
                                  <div className={`h-1.5 rounded-full transition-all ${item.score/item.max >= 0.8 ? 'bg-green-400' : item.score/item.max >= 0.5 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{width:`${(item.score/item.max)*100}%`}} />
                                </div>
                              </div>
                            ))}
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

                    {/* 구독자 변화 트래킹 */}
                    {(() => {
                      const stats = (selectedChannel.dailyStats || [])
                        .filter(d => d.subscribers)
                        .sort((a, b) => a.date.localeCompare(b.date));
                      if (stats.length < 2) return null;
                      const chartData = stats.map(d => ({
                        date: d.date.slice(5), // MM-DD
                        subscribers: d.subscribers,
                      }));
                      const first = stats[0].subscribers;
                      const last = stats[stats.length - 1].subscribers;
                      const growthAbs = last - first;
                      const growthPct = first > 0 ? ((growthAbs / first) * 100).toFixed(1) : '0.0';
                      const isUp = growthAbs >= 0;
                      return (
                        <div className="bg-slate-700 border border-slate-600 rounded-lg p-5 mt-4">
                          <h3 className="text-lg font-bold text-white mb-1">📈 구독자 변화 트래킹</h3>
                          <p className="text-xs text-slate-400 mb-4">채널 갱신마다 스냅샷 저장 — {stats.length}개 데이터 포인트</p>
                          <div className="grid grid-cols-3 gap-3 mb-4">
                            <div className="bg-slate-800 rounded p-3 text-center">
                              <p className="text-slate-400 text-xs mb-1">첫 기록</p>
                              <p className="text-lg font-bold text-white">{first >= 1000000 ? (first/1000000).toFixed(1)+'M' : (first/1000).toFixed(0)+'K'}</p>
                              <p className="text-xs text-slate-500">{stats[0].date}</p>
                            </div>
                            <div className="bg-slate-800 rounded p-3 text-center">
                              <p className="text-slate-400 text-xs mb-1">최근</p>
                              <p className="text-lg font-bold text-white">{last >= 1000000 ? (last/1000000).toFixed(1)+'M' : (last/1000).toFixed(0)+'K'}</p>
                              <p className="text-xs text-slate-500">{stats[stats.length-1].date}</p>
                            </div>
                            <div className={`rounded p-3 text-center border ${isUp ? 'bg-green-900/40 border-green-700' : 'bg-red-900/40 border-red-700'}`}>
                              <p className="text-slate-400 text-xs mb-1">증감</p>
                              <p className={`text-lg font-bold flex items-center justify-center gap-1 ${isUp ? 'text-green-400' : 'text-red-400'}`}>
                                {isUp ? <ArrowUp size={16}/> : <ArrowDown size={16}/>}
                                {Math.abs(growthAbs) >= 1000 ? (Math.abs(growthAbs)/1000).toFixed(1)+'K' : Math.abs(growthAbs)}
                              </p>
                              <p className={`text-xs ${isUp ? 'text-green-400' : 'text-red-400'}`}>{isUp ? '+' : ''}{growthPct}%</p>
                            </div>
                          </div>
                          <ResponsiveContainer width="100%" height={160}>
                            <LineChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                              <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => v >= 1000000 ? (v/1000000).toFixed(1)+'M' : (v/1000).toFixed(0)+'K'} />
                              <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', fontSize: 12 }}
                                formatter={v => [v >= 1000000 ? (v/1000000).toFixed(2)+'M' : (v/1000).toFixed(1)+'K', '구독자']} />
                              <Line type="monotone" dataKey="subscribers" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} activeDot={{ r: 5 }} />
                            </LineChart>
                          </ResponsiveContainer>
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

                    {/* ── 채널 종합 총평 ── */}
                    {(() => {
                      const sections = generateChannelAssessment(selectedChannel);
                      const colorMap = {
                        green: { bg: 'bg-green-900/40 border-green-600', icon: '✅', text: 'text-green-300' },
                        yellow: { bg: 'bg-yellow-900/40 border-yellow-600', icon: '⚠️', text: 'text-yellow-200' },
                        orange: { bg: 'bg-orange-900/40 border-orange-600', icon: '🔶', text: 'text-orange-200' },
                        red: { bg: 'bg-red-900/40 border-red-600', icon: '❌', text: 'text-red-200' },
                      };
                      return (
                        <div className="bg-slate-700 border border-slate-600 rounded-lg p-5 mt-4">
                          <h3 className="text-lg font-bold text-white mb-1">💡 채널 종합 총평</h3>
                          <p className="text-xs text-slate-400 mb-4">채널 특성 · 데이터 분석 · 제품 핏 · 종합 의견을 자동으로 정리합니다</p>
                          <div className="space-y-3">
                            {sections.map((sec, i) => {
                              const isHighlight = sec.highlight;
                              const c = colorMap[sec.color] || {};
                              return (
                                <div key={i} className={`rounded-lg p-4 border ${isHighlight ? c.bg : 'bg-slate-800 border-slate-600'}`}>
                                  <p className={`text-sm font-bold mb-1.5 ${isHighlight ? c.text : 'text-slate-300'}`}>{sec.title}</p>
                                  <p className={`text-sm leading-relaxed ${isHighlight ? c.text : 'text-slate-300'}`}>{sec.body}</p>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}

                {activeTab === 'longform' && (() => {
                  const { paged, total, totalPages, safePage, start } = getPaginatedVideos(sortedLongformVideos);
                  return (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h3 className="text-lg font-bold text-white">🎬 롱폼 분석 (10분↑) — {sortedLongformVideos.length}개</h3>
                      <input type="text" value={videoSearch} onChange={e => { setVideoSearch(e.target.value); setVideoPage(1); }} placeholder="🔎 제목 검색..." className="w-full sm:w-56 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                    </div>
                    {paged.length > 0 ? (
                      <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {paged.map((video, idx) => (
                              <tr key={video.videoId || idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-slate-400 shrink-0 text-xs w-6">{start+idx+1}.</span>
                                    <span className="truncate">{video.title}</span>
                                    {video.isAd && <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40" title={video.hasPaidPromotion ? 'YouTube 공식 유료 프로모션 표기' : '설명란에서 광고/협찬 문구 감지'}>광고</span>}
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
                      <PaginationBar total={total} totalPages={totalPages} safePage={safePage} />
                      </>
                    ) : (
                      <p className="text-slate-400 text-center py-8">{videoSearch ? '검색 결과가 없습니다' : '롱폼 영상이 없습니다'}</p>
                    )}
                  </div>
                  );
                })()}

                {activeTab === 'mid' && (() => {
                  const { paged, total, totalPages, safePage, start } = getPaginatedVideos(sortedMidVideos);
                  return (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h3 className="text-lg font-bold text-white">▶️ 미드폼 분석 (1~10분) — {sortedMidVideos.length}개</h3>
                      <input type="text" value={videoSearch} onChange={e => { setVideoSearch(e.target.value); setVideoPage(1); }} placeholder="🔎 제목 검색..." className="w-full sm:w-56 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                    </div>
                    {paged.length > 0 ? (
                      <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {paged.map((video, idx) => (
                              <tr key={video.videoId || idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-slate-400 shrink-0 text-xs w-6">{start+idx+1}.</span>
                                    <span className="truncate">{video.title}</span>
                                    {video.isAd && <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40">광고</span>}
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
                      <PaginationBar total={total} totalPages={totalPages} safePage={safePage} />
                      </>
                    ) : (
                      <p className="text-slate-400 text-center py-8">{videoSearch ? '검색 결과가 없습니다' : '미드폼 영상이 없습니다'}</p>
                    )}
                  </div>
                  );
                })()}

                {activeTab === 'shorts' && (() => {
                  const { paged, total, totalPages, safePage, start } = getPaginatedVideos(sortedShortsVideos);
                  return (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                      <h3 className="text-lg font-bold text-white">📱 숏폼 분석 (60초↓) — {sortedShortsVideos.length}개</h3>
                      <input type="text" value={videoSearch} onChange={e => { setVideoSearch(e.target.value); setVideoPage(1); }} placeholder="🔎 제목 검색..." className="w-full sm:w-56 bg-slate-700 border border-slate-600 rounded px-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500" />
                    </div>
                    {paged.length > 0 ? (
                      <>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {paged.map((video, idx) => (
                              <tr key={video.videoId || idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 max-w-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="truncate text-slate-400 shrink-0 text-xs w-6">{start+idx+1}.</span>
                                    <span className="truncate">{video.title}</span>
                                    {video.isAd && <span className="shrink-0 px-1.5 py-0.5 rounded text-[10px] font-bold bg-orange-500/20 text-orange-400 border border-orange-500/40">광고</span>}
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
                      <PaginationBar total={total} totalPages={totalPages} safePage={safePage} />
                      </>
                    ) : (
                      <p className="text-slate-400 text-center py-8">{videoSearch ? '검색 결과가 없습니다' : '숏폼 영상이 없습니다'}</p>
                    )}
                  </div>
                  );
                })()}

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

                    {/* ── 채널 관리 (상태 / 메모 / 태그) ── */}
                    <div className="mt-6 pt-6 border-t border-slate-700">
                      <h3 className="text-lg font-bold text-white mb-4">🗂️ 채널 관리</h3>
                      <div className="space-y-4">
                        {/* 상태 */}
                        <div>
                          <label className="block text-slate-300 text-sm mb-2">진행 상태</label>
                          <div className="flex gap-2 flex-wrap">
                            {[
                              { v:'관심', color:'bg-blue-600 border-blue-500', inactive:'bg-slate-700 text-slate-400 border-slate-600 hover:border-blue-500' },
                              { v:'협의중', color:'bg-yellow-600 border-yellow-500', inactive:'bg-slate-700 text-slate-400 border-slate-600 hover:border-yellow-500' },
                              { v:'완료', color:'bg-green-600 border-green-500', inactive:'bg-slate-700 text-slate-400 border-slate-600 hover:border-green-500' },
                              { v:'보류', color:'bg-red-700 border-red-500', inactive:'bg-slate-700 text-slate-400 border-slate-600 hover:border-red-500' },
                              { v:'미분류', color:'bg-slate-500 border-slate-400', inactive:'bg-slate-700 text-slate-400 border-slate-600 hover:border-slate-400' },
                            ].map(({ v, color, inactive }) => (
                              <button key={v} onClick={() => setMetaForm(f => ({...f, status: v}))}
                                className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${metaForm.status === v ? color + ' text-white' : inactive}`}>
                                {v}
                              </button>
                            ))}
                          </div>
                        </div>
                        {/* 태그 */}
                        <div>
                          <label className="block text-slate-300 text-sm mb-2">태그</label>
                          <div className="flex gap-2 mb-2 flex-wrap">
                            {metaForm.channelTags.map(tag => (
                              <span key={tag} className="flex items-center gap-1 text-xs px-2 py-1 rounded-full bg-purple-500/20 text-purple-400 border border-purple-500/40">
                                #{tag}
                                <button onClick={() => setMetaForm(f => ({...f, channelTags: f.channelTags.filter(t => t !== tag)}))} className="text-purple-400 hover:text-white ml-0.5">×</button>
                              </span>
                            ))}
                          </div>
                          <div className="flex gap-2">
                            <input type="text" value={metaTagInput} onChange={e => setMetaTagInput(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter' && metaTagInput.trim()) { setMetaForm(f => ({...f, channelTags: [...new Set([...f.channelTags, metaTagInput.trim()])]})); setMetaTagInput(''); }}}
                              placeholder="태그 입력 후 Enter (예: 건강, 맘채널)"
                              className="flex-1 bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-purple-500" />
                            <button onClick={() => { if (metaTagInput.trim()) { setMetaForm(f => ({...f, channelTags: [...new Set([...f.channelTags, metaTagInput.trim()])]})); setMetaTagInput(''); }}}
                              className="bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded text-sm transition">추가</button>
                          </div>
                        </div>
                        {/* 메모 */}
                        <div>
                          <label className="block text-slate-300 text-sm mb-2">메모</label>
                          <textarea value={metaForm.memo} onChange={e => setMetaForm(f => ({...f, memo: e.target.value}))}
                            rows={3} placeholder="담당자, 협의 내용, 특이사항 등 자유롭게..."
                            className="w-full bg-slate-700 border border-slate-600 rounded px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-blue-500 resize-none" />
                        </div>
                        <button onClick={handleSaveMeta} disabled={savingMeta}
                          className="w-full bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white py-2 rounded transition font-semibold text-sm">
                          {savingMeta ? '저장 중...' : '💾 채널 정보 저장'}
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'simulator' && (() => {
                  // 부모 sim/setSim 직접 사용 — 내부 컴포넌트 정의 없음 (리마운트 방지)
                  const simCalc = (s) => {
                    const ourMG = s.totalMG * (1 - s.agencyMGShareRate);
                    const qty = Math.round(s.expectedClicks * s.conversionRate);
                    const revenue = qty * s.productPrice;
                    const pgFee = s.productPrice * s.pgFeeRate;
                    const rsAmount = s.productPrice * s.rsRate;
                    const unitMargin = s.productPrice - s.cost - s.shippingCost - s.giftCost - pgFee - rsAmount;
                    const grossProfit = qty * unitMargin;
                    const netProfit = grossProfit - ourMG;
                    const roi = ourMG > 0 ? Math.round(netProfit / ourMG * 100) : null;
                    const roas = ourMG > 0 ? Math.round(revenue / ourMG * 100) : null;
                    const bepQty = unitMargin > 0 ? Math.ceil(ourMG / unitMargin) : null;
                    return { ourMG, qty, revenue, unitMargin, grossProfit, netProfit, roi, roas, bepQty };
                  };

                  const r = simCalc(sim);

                  const simScenarios = [
                    { label: '😰 비관', clicks: Math.round(sim.expectedClicks * 0.5), color: 'border-red-600 bg-red-900/20' },
                    { label: '😐 기본', clicks: sim.expectedClicks, color: 'border-yellow-600 bg-yellow-900/20' },
                    { label: '😊 낙관', clicks: Math.round(sim.expectedClicks * 2), color: 'border-green-600 bg-green-900/20' },
                  ].map(sc => ({ ...sc, ...simCalc({ ...sim, expectedClicks: sc.clicks }) }));

                  const simCurveData = Array.from({ length: 11 }, (_, i) => {
                    const qty = Math.round(r.bepQty ? r.bepQty * i * 0.25 : sim.expectedClicks * sim.conversionRate * i * 0.2);
                    return { qty, profit: qty * r.unitMargin - r.ourMG };
                  });

                  const simWon = v => {
                    const abs = Math.abs(v);
                    const sign = v < 0 ? '-' : '';
                    if (abs >= 100000000) return sign + (abs/100000000).toFixed(1).replace(/\.0$/,'') + '억원';
                    if (abs >= 10000) return sign + (abs/10000).toFixed(1).replace(/\.0$/,'') + '만원';
                    return sign + abs.toLocaleString() + '원';
                  };
                  const simPct = v => (v*100).toFixed(1)+'%';
                  const simNum = v => v.toLocaleString()+'개';

                  const SimSlider = ({ label, value, min, max, step, format, onChange }) => (
                    <div>
                      <div className="flex justify-between mb-1">
                        <span className="text-slate-300 text-xs">{label}</span>
                        <span className="text-white text-xs font-bold">{format(value)}</span>
                      </div>
                      <input type="range" min={min} max={max} step={step} value={value}
                        onChange={e => onChange(Number(e.target.value))}
                        className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-slate-600 accent-blue-500" />
                      <div className="flex justify-between text-slate-600 text-xs mt-0.5">
                        <span>{format(min)}</span><span>{format(max)}</span>
                      </div>
                    </div>
                  );

                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                      <h3 className="text-lg font-bold text-white mb-1">🎛️ PPL 수익 시뮬레이터</h3>
                      <p className="text-slate-400 text-xs mb-5">슬라이더를 조절하면 손익이 실시간으로 변경됩니다. 설정 탭과 독립적으로 동작합니다.</p>

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* ── 슬라이더 패널 ── */}
                        <div className="space-y-4">
                          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide">📦 상품 조건</p>
                          <SimSlider label="판매가" value={sim.productPrice} min={10000} max={500000} step={1000} format={simWon} onChange={v => setSim(s=>({...s,productPrice:v}))} />
                          <SimSlider label="원가" value={sim.cost} min={0} max={300000} step={1000} format={simWon} onChange={v => setSim(s=>({...s,cost:v}))} />
                          <SimSlider label="배송비 + 사은품" value={sim.shippingCost + sim.giftCost} min={0} max={30000} step={1000} format={simWon} onChange={v => setSim(s=>({...s,shippingCost:v}))} />

                          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide pt-2">💰 딜 조건</p>
                          <SimSlider label="총 MG" value={sim.totalMG} min={0} max={20000000} step={10000} format={simWon} onChange={v => setSim(s=>({...s,totalMG:v}))} />
                          <SimSlider label="대행사 MG 분담률" value={sim.agencyMGShareRate} min={0} max={1} step={0.05} format={simPct} onChange={v => setSim(s=>({...s,agencyMGShareRate:v}))} />
                          <SimSlider label="RS율 (매출 배분)" value={sim.rsRate} min={0} max={0.5} step={0.01} format={simPct} onChange={v => setSim(s=>({...s,rsRate:v}))} />

                          <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide pt-2">🖱️ 전환 조건</p>
                          <SimSlider label="예상 클릭수" value={sim.expectedClicks} min={0} max={10000} step={50} format={v=>v.toLocaleString()+'회'} onChange={v => setSim(s=>({...s,expectedClicks:v}))} />
                          <SimSlider label="전환율" value={sim.conversionRate} min={0.001} max={0.2} step={0.001} format={simPct} onChange={v => setSim(s=>({...s,conversionRate:v}))} />

                          <button onClick={() => setSim({
                            productPrice: settings.productPrice||89000, cost: settings.cost||30000,
                            shippingCost: settings.shippingCost||3500, giftCost: settings.giftCost||0,
                            pgFeeRate: settings.pgFeeRate||0.0385, totalMG: settings.totalMG||3000000,
                            agencyMGShareRate: settings.agencyMGShareRate||0.3, rsRate: settings.rsRate||0.2,
                            expectedClicks: settings.expectedClicks||500, conversionRate: settings.expectedConversionRate||0.03,
                          })} className="w-full text-xs text-slate-400 hover:text-white bg-slate-700 hover:bg-slate-600 py-2 rounded transition">
                            ↺ 설정값으로 초기화
                          </button>
                        </div>

                        {/* ── 결과 패널 ── */}
                        <div className="space-y-4">
                          {/* 핵심 지표 */}
                          <div className={`rounded-xl p-5 border-2 text-center ${r.netProfit >= 0 ? 'bg-green-900/30 border-green-500' : 'bg-red-900/30 border-red-500'}`}>
                            <p className="text-slate-300 text-sm mb-1">순이익</p>
                            <p className={`text-4xl font-bold ${r.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                              {r.netProfit >= 0 ? '+' : ''}{simWon(r.netProfit)}
                            </p>
                            <div className="flex justify-center gap-4 mt-2 text-xs text-slate-400">
                              <span>ROI <strong className={r.roi >= 0 ? 'text-green-400' : 'text-red-400'}>{r.roi !== null ? r.roi+'%' : '-'}</strong></span>
                              <span>ROAS <strong className="text-blue-400">{r.roas !== null ? r.roas+'%' : '-'}</strong></span>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-2">
                            {[
                              { label:'우리측 MG', value: simWon(r.ourMG), sub:'대행사 제외' },
                              { label:'개당 기여마진', value: simWon(r.unitMargin), sub: r.unitMargin >= 0 ? '마진 있음 ✓' : '마진 없음 ✗' },
                              { label:'예상 판매수량', value: simNum(r.qty), sub:`클릭 ${sim.expectedClicks.toLocaleString()}회 × ${simPct(sim.conversionRate)}` },
                              { label:'예상 매출', value: simWon(r.revenue), sub:'판매수량 × 판매가' },
                              { label:'BEP 판매수량', value: r.bepQty !== null ? simNum(r.bepQty) : '-', sub: r.bepQty !== null ? (r.qty >= r.bepQty ? '✅ BEP 달성' : '⚠️ BEP 미달') : '-' },
                              { label:'총 기여이익', value: simWon(r.grossProfit), sub:'판매수량 × 기여마진' },
                            ].map(item => (
                              <div key={item.label} className="bg-slate-700/80 rounded-lg p-3">
                                <p className="text-slate-400 text-xs">{item.label}</p>
                                <p className="text-white font-bold text-sm mt-0.5">{item.value}</p>
                                <p className="text-slate-500 text-xs mt-0.5">{item.sub}</p>
                              </div>
                            ))}
                          </div>

                          {/* 시나리오 비교 */}
                          <div>
                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">📊 시나리오 비교 (클릭수 기준)</p>
                            <div className="grid grid-cols-3 gap-2">
                              {simScenarios.map(sc => (
                                <div key={sc.label} className={`rounded-lg p-3 border text-center ${sc.color}`}>
                                  <p className="text-white text-xs font-bold">{sc.label}</p>
                                  <p className="text-slate-400 text-xs mt-0.5">{sc.clicks.toLocaleString()}회</p>
                                  <p className={`font-bold text-sm mt-1 ${sc.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                    {sc.netProfit >= 0 ? '+' : ''}{simWon(sc.netProfit)}
                                  </p>
                                  <p className="text-slate-500 text-xs">{sc.roi !== null ? 'ROI '+sc.roi+'%' : '-'}</p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* 수익 곡선 */}
                          <div>
                            <p className="text-slate-400 text-xs font-semibold uppercase tracking-wide mb-2">📈 수량별 순이익 곡선</p>
                            <ResponsiveContainer width="100%" height={140}>
                              <LineChart data={simCurveData}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
                                <XAxis dataKey="qty" tick={{ fill:'#94a3b8', fontSize:10 }} tickFormatter={v=>v+'개'} />
                                <YAxis tick={{ fill:'#94a3b8', fontSize:10 }} tickFormatter={v=>Math.abs(v)>=10000?(v/10000).toFixed(0)+'만':v} />
                                <Tooltip contentStyle={{ backgroundColor:'#1e293b', border:'1px solid #475569', fontSize:11 }}
                                  formatter={v=>[simWon(v),'순이익']} labelFormatter={v=>`판매수량 ${v.toLocaleString()}개`} />
                                <ReferenceLine y={0} stroke="#ef4444" strokeDasharray="4 4" />
                                <Line type="monotone" dataKey="profit" stroke={r.netProfit >= 0 ? '#22c55e' : '#ef4444'} strokeWidth={2} dot={false} />
                              </LineChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}

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
                          <InfoTooltip content="= CPV × 1,000. 광고 노출 1,000회당 비용. 유튜브 평균 CPM은 2,000~8,000원 수준입니다."><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">CPM (1,000회 노출당)</p></InfoTooltip>
                          <p className="text-xl font-bold text-yellow-400">{pplData.cpm !== null && pplData.cpm !== undefined ? `${pplData.cpm.toLocaleString()}원` : '계산 불가'}</p>
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

                        {/* 과거 실적 평균 vs 현재 예측 비교 */}
                        {selectedChannel.campaignLogs?.length > 0 && (() => {
                          const logs = selectedChannel.campaignLogs;
                          const avgActualQty = Math.round(logs.reduce((s, l) => s + (l.actualQty || 0), 0) / logs.length);
                          const avgActualRevenue = Math.round(logs.reduce((s, l) => s + (l.actualRevenue || 0), 0) / logs.length);
                          const avgActualROI = logs.filter(l => l.actualRevenue && pplData.ourMGShare > 0).length > 0
                            ? (logs.reduce((s, l) => s + (((l.actualRevenue || 0) - pplData.ourMGShare) / pplData.ourMGShare * 100), 0) / logs.length).toFixed(1)
                            : null;
                          return (
                            <div className="mt-6 bg-slate-800 border border-blue-500/30 rounded-lg p-4">
                              <h4 className="text-white font-semibold mb-3">📊 과거 실적 평균 vs 현재 예측 비교</h4>
                              <div className="overflow-x-auto">
                                <table className="w-full text-sm">
                                  <thead><tr className="text-slate-400 text-xs">
                                    <th className="text-left p-2">지표</th>
                                    <th className="text-right p-2">과거 평균 ({logs.length}회)</th>
                                    <th className="text-right p-2">현재 예측</th>
                                    <th className="text-right p-2">차이</th>
                                  </tr></thead>
                                  <tbody>
                                    <tr className="border-t border-slate-700">
                                      <td className="p-2 text-slate-300">판매수량</td>
                                      <td className="text-right p-2 text-white">{avgActualQty.toLocaleString()}개</td>
                                      <td className="text-right p-2 text-blue-400">{pplData.estimatedQty?.toLocaleString()}개</td>
                                      <td className={`text-right p-2 font-semibold ${pplData.estimatedQty >= avgActualQty ? 'text-green-400' : 'text-red-400'}`}>
                                        {pplData.estimatedQty >= avgActualQty ? '+' : ''}{(pplData.estimatedQty - avgActualQty).toLocaleString()}개
                                      </td>
                                    </tr>
                                    <tr className="border-t border-slate-700">
                                      <td className="p-2 text-slate-300">매출</td>
                                      <td className="text-right p-2 text-white">{avgActualRevenue.toLocaleString()}원</td>
                                      <td className="text-right p-2 text-blue-400">{pplData.expectedRevenue?.toLocaleString()}원</td>
                                      <td className={`text-right p-2 font-semibold ${pplData.expectedRevenue >= avgActualRevenue ? 'text-green-400' : 'text-red-400'}`}>
                                        {pplData.expectedRevenue >= avgActualRevenue ? '+' : ''}{(pplData.expectedRevenue - avgActualRevenue).toLocaleString()}원
                                      </td>
                                    </tr>
                                    {avgActualROI !== null && (
                                      <tr className="border-t border-slate-700">
                                        <td className="p-2 text-slate-300">ROI</td>
                                        <td className="text-right p-2 text-white">{avgActualROI}%</td>
                                        <td className="text-right p-2 text-blue-400">{pplData.roi !== null ? pplData.roi+'%' : '-'}</td>
                                        <td className="text-right p-2 text-slate-400">-</td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </div>
                          );
                        })()}
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
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 space-y-4">
                    <h3 className="text-lg font-bold text-white mb-4">📥 데이터 내보내기</h3>

                    {/* PPL 제안서 */}
                    <div className="bg-gradient-to-br from-blue-900/40 to-indigo-900/40 border border-blue-600/50 rounded-lg p-4 mb-2">
                      <h4 className="text-white font-bold mb-1">📄 PPL 제안서 생성</h4>
                      <p className="text-blue-200/70 text-xs mb-3">채널 분석 결과를 인쇄용 제안서로 생성합니다. 새 탭에서 열린 후 🖨️ PDF 저장 버튼을 누르면 PDF로 저장됩니다.</p>
                      <button onClick={handleGenerateProposal} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition font-bold text-sm">
                        📄 PPL 제안서 열기
                      </button>
                    </div>

                    <button onClick={handleExportExcel} className="w-full bg-green-600 hover:bg-green-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition font-semibold">
                      <Download size={20} /> Excel 다운로드 (상세 분석)
                    </button>
                    <div className="border-t border-slate-700 pt-4">
                      <h4 className="text-white font-semibold mb-2">📋 채널 검토 리포트</h4>
                      <p className="text-slate-400 text-xs mb-3">PPT·노션에 붙여넣기 좋은 마크다운 형식으로 생성됩니다</p>
                      <button
                        onClick={() => {
                          const md = generateMarkdownReport(selectedChannel);
                          navigator.clipboard.writeText(md).then(() => setError('✓ 마크다운 리포트가 클립보드에 복사됐습니다'));
                        }}
                        className="w-full bg-purple-600 hover:bg-purple-700 text-white py-3 rounded-lg flex items-center justify-center gap-2 transition font-semibold"
                      >
                        📋 마크다운 리포트 복사
                      </button>
                    </div>
                    <p className="text-slate-500 text-xs mt-2">✓ 요약 분석 시트 · ✓ 롱폼/숏폼 상세 · ✓ 일일 통계 · ✓ 30일 트렌드 · ✓ 채널 검토 리포트</p>
                  </div>
                )}

                {activeTab === 'compare' && (() => {
                  const compareChannels = channels.filter(ch => compareChannelIds.includes(ch._id));
                  if (compareChannels.length < 2) return (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center">
                      <p className="text-slate-400">왼쪽 채널 목록에서 2개 이상 체크하세요</p>
                    </div>
                  );
                  const metrics = compareChannels.map(ch => {
                    const lf = filterVideos(ch.videos, 'longform');
                    const recent = [...lf].sort((a,b) => new Date(b.uploadDate)-new Date(a.uploadDate)).slice(0,10);
                    const avgViews = recent.length > 0 ? Math.round(recent.reduce((s,v) => s+(v.views||0), 0)/recent.length) : 0;
                    const engagement = recent.length > 0 ? (recent.reduce((s,v) => s+(parseFloat(v.engagement)||0), 0)/recent.length).toFixed(2) : '0';
                    const eff = calculateEfficiencyScore(ch);
                    return { ch, avgViews, engagement, eff, lf: lf.length };
                  });

                  const copyCompareReport = () => {
                    const lines = [
                      `# ⚖️ 채널 비교 리포트`,
                      `> 생성일: ${new Date().toLocaleDateString('ko-KR')}`,
                      ``,
                      `| 항목 | ${metrics.map(m => m.ch.channelName).join(' | ')} |`,
                      `|------|${metrics.map(() => '------').join('|')}|`,
                      `| 구독자 | ${metrics.map(m => (m.ch.subscribers/10000).toFixed(1)+'만').join(' | ')} |`,
                      `| 평균 조회수 | ${metrics.map(m => (m.avgViews/1000).toFixed(1)+'K').join(' | ')} |`,
                      `| 인게이지먼트 | ${metrics.map(m => m.engagement+'%').join(' | ')} |`,
                      `| 롱폼 수 | ${metrics.map(m => m.lf+'개').join(' | ')} |`,
                      `| 효율 점수 | ${metrics.map(m => m.eff.total+'점').join(' | ')} |`,
                    ];
                    navigator.clipboard.writeText(lines.join('\n')).then(() => setError('✓ 비교 리포트가 클립보드에 복사됐습니다'));
                  };

                  return (
                    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                      <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-white">⚖️ 채널 비교 ({compareChannels.length}개)</h3>
                        <button onClick={copyCompareReport} className="bg-purple-600 hover:bg-purple-700 text-white text-sm px-4 py-2 rounded transition">📋 비교표 복사</button>
                      </div>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600">
                            <tr className="text-slate-300">
                              <th className="text-left p-3">항목</th>
                              {metrics.map(m => <th key={m.ch._id} className="text-right p-3 text-blue-300">{m.ch.channelName}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {[
                              { label: '구독자', getValue: m => `${(m.ch.subscribers/10000).toFixed(1)}만`, best: 'max', getNum: m => m.ch.subscribers },
                              { label: '평균 조회수', getValue: m => `${(m.avgViews/1000).toFixed(1)}K`, best: 'max', getNum: m => m.avgViews },
                              { label: '인게이지먼트', getValue: m => `${m.engagement}%`, best: 'max', getNum: m => parseFloat(m.engagement) },
                              { label: '롱폼 수', getValue: m => `${m.lf}개`, best: 'max', getNum: m => m.lf },
                              { label: '⚡ 효율 점수', getValue: m => `${m.eff.total}점`, best: 'max', getNum: m => m.eff.total },
                              { label: '구독자 대비 조회수', getValue: m => `${m.eff.details.viewsRatio}%`, best: 'max', getNum: m => parseFloat(m.eff.details.viewsRatio) },
                              { label: '업로드 주기', getValue: m => m.eff.details.avgGapDays !== null ? `${m.eff.details.avgGapDays}일` : '-', best: 'min', getNum: m => m.eff.details.avgGapDays ?? 999 },
                              { label: '롱폼 비율', getValue: m => `${m.eff.details.longformRatio}%`, best: 'max', getNum: m => parseFloat(m.eff.details.longformRatio) },
                            ].map(row => {
                              const nums = metrics.map(m => row.getNum(m));
                              const bestVal = row.best === 'max' ? Math.max(...nums) : Math.min(...nums.filter(n => n < 999));
                              return (
                                <tr key={row.label} className="border-t border-slate-700 hover:bg-slate-700/50">
                                  <td className="p-3 text-slate-300 font-medium">{row.label}</td>
                                  {metrics.map((m, i) => (
                                    <td key={m.ch._id} className={`text-right p-3 font-semibold ${nums[i] === bestVal ? 'text-green-400' : 'text-white'}`}>
                                      {row.getValue(m)}
                                      {nums[i] === bestVal && <span className="text-xs ml-1">✓</span>}
                                    </td>
                                  ))}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <p className="text-slate-500 text-xs mt-3">✓ 표시는 각 항목에서 가장 좋은 채널입니다</p>
                    </div>
                  );
                })()}
              </div>
            )}
          </div>
        )}

        <div className="mt-12 border-t border-slate-800 pt-6 text-center space-y-1">
          <p className="text-slate-500 text-xs">💡 팁: 정기적으로 갱신하여 최신 통계를 확인하세요</p>
          <p className="text-slate-600 text-xs">
            YouTube Channel Analyzer · Built by <span className="text-slate-500 font-medium">Jay Jeong (정승환)</span>
            {process.env.REACT_APP_VERSION && (
              <span className="text-slate-700 ml-2">
                v{process.env.REACT_APP_VERSION}
                {process.env.REACT_APP_BUILD_TIME && <> · {process.env.REACT_APP_BUILD_TIME} 빌드</>}
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── 사용 가이드 모달 ── */}
      {showGuide && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-start justify-center overflow-y-auto py-8 px-4" onClick={e => { if (e.target === e.currentTarget) setShowGuide(false); }}>
          <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-3xl shadow-2xl">
            {/* 헤더 */}
            <div className="flex items-center justify-between px-6 py-5 border-b border-slate-700">
              <div>
                <h2 className="text-xl font-bold text-white">📖 사용 가이드</h2>
                <p className="text-slate-400 text-sm mt-0.5">YouTube Channel Analyzer 시작하기</p>
              </div>
              <button onClick={() => setShowGuide(false)} className="text-slate-400 hover:text-white transition text-2xl leading-none">×</button>
            </div>

            {/* 본문 */}
            <div className="px-6 py-6 space-y-8 text-sm">

              {/* 전체 흐름 */}
              <section>
                <h3 className="text-blue-400 font-bold text-base mb-3">🗺️ 전체 사용 흐름</h3>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 text-center">
                  {[
                    { step:'①', title:'채널 추가', desc:'YouTube 채널 URL 입력' },
                    { step:'②', title:'데이터 수집', desc:'영상/구독자 자동 분석' },
                    { step:'③', title:'효율 점수 확인', desc:'PPL 적합도 100점 평가' },
                    { step:'④', title:'PPL 설정', desc:'MG·원가·RS 입력' },
                    { step:'⑤', title:'수익 분석', desc:'예상 매출·ROI 계산' },
                  ].map(s => (
                    <div key={s.step} className="bg-slate-800 rounded-lg p-3 border border-slate-700">
                      <p className="text-blue-400 font-bold text-lg">{s.step}</p>
                      <p className="text-white font-semibold mt-1">{s.title}</p>
                      <p className="text-slate-400 text-xs mt-1">{s.desc}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* 채널 추가 */}
              <section>
                <h3 className="text-green-400 font-bold text-base mb-3">➕ 채널 추가하기</h3>
                <div className="bg-slate-800 rounded-lg p-4 space-y-2 border border-slate-700">
                  <p className="text-slate-300">1. 우측 상단 <span className="bg-blue-600 text-white px-2 py-0.5 rounded text-xs font-semibold">+ 채널 추가</span> 버튼 클릭</p>
                  <p className="text-slate-300">2. YouTube 채널 URL 또는 @핸들 입력</p>
                  <p className="text-slate-400 text-xs pl-4">예시: <code className="bg-slate-700 px-1.5 rounded">https://www.youtube.com/@channelname</code></p>
                  <p className="text-slate-400 text-xs pl-4">예시: <code className="bg-slate-700 px-1.5 rounded">@channelname</code> 만 입력해도 됩니다</p>
                  <p className="text-slate-300">3. 추가 완료 후 <span className="text-yellow-400">갱신</span> 버튼을 눌러 전체 영상 데이터를 수집하세요</p>
                  <div className="bg-yellow-900/30 border border-yellow-700/50 rounded p-3 mt-2">
                    <p className="text-yellow-300 text-xs">⚠️ 첫 갱신 시 영상이 많은 채널(500개↑)은 1~2분 소요될 수 있습니다. 완료될 때까지 기다려 주세요.</p>
                  </div>
                </div>
              </section>

              {/* 탭 설명 */}
              <section>
                <h3 className="text-purple-400 font-bold text-base mb-3">📑 탭별 기능 안내</h3>
                <div className="space-y-2">
                  {[
                    { tab:'📊 요약', desc:'채널 핵심 지표, 효율 점수(100점), PPL 수익 분석, 구독자 변화 그래프, 채널 총평을 한눈에 확인합니다.' },
                    { tab:'💰 손익/BEP', desc:'원가·배송비·MG를 반영한 손익분기점(BEP) 판매수량을 계산합니다. 몇 개 팔아야 본전인지 바로 확인하세요.' },
                    { tab:'📈 트렌드', desc:'일자별 인게이지먼트·조회수·예상수익 변화를 확인합니다. 갱신할 때마다 데이터가 쌓입니다.' },
                    { tab:'⚙️ 설정', desc:'PPL 단가·MG·RS·원가를 입력하고, 채널 상태·태그·메모를 관리합니다.' },
                    { tab:'🎬 롱폼 / ▶️ 미드폼 / 📱 숏폼', desc:'영상 길이별 목록을 확인합니다. 제목 검색, 조회수·날짜 정렬, 50개씩 페이지 이동이 가능합니다.' },
                    { tab:'📥 내보내기', desc:'채널 분석 보고서를 Markdown 텍스트 또는 Excel 파일로 다운로드합니다.' },
                  ].map(item => (
                    <div key={item.tab} className="flex gap-3 bg-slate-800 rounded-lg p-3 border border-slate-700">
                      <span className="text-white font-semibold shrink-0 w-36">{item.tab}</span>
                      <span className="text-slate-300">{item.desc}</span>
                    </div>
                  ))}
                </div>
              </section>

              {/* 효율 점수 */}
              <section>
                <h3 className="text-yellow-400 font-bold text-base mb-3">⚡ 효율 점수 이해하기</h3>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700">
                  <p className="text-slate-300 mb-3">총 <span className="text-white font-bold">100점</span> 만점으로, 6개 지표를 중요도에 따라 가중치 배점합니다.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-3">
                    {[
                      { label:'💬 인게이지먼트율', score:'35점', desc:'(좋아요+댓글)÷조회수. 가장 중요한 지표' },
                      { label:'👥 구독자 대비 조회수', score:'25점', desc:'팬 충성도. 30% 이상이면 우수' },
                      { label:'📊 조회수 일관성', score:'15점', desc:'영상별 편차. 낮을수록 안정적' },
                      { label:'📅 업로드 주기', score:'10점', desc:'롱폼 기준. 14일 이내면 활발' },
                      { label:'📢 광고 비율', score:'10점', desc:'최근 영상 중 광고 비율. 낮을수록 좋음' },
                      { label:'📆 채널 연령', score:'5점', desc:'5년 이상이면 신뢰도 높음' },
                    ].map(item => (
                      <div key={item.label} className="flex justify-between items-start gap-2 bg-slate-700/60 rounded p-2">
                        <div>
                          <p className="text-white text-xs font-semibold">{item.label}</p>
                          <p className="text-slate-400 text-xs">{item.desc}</p>
                        </div>
                        <span className="text-yellow-400 font-bold text-xs shrink-0">{item.score}</span>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-3 text-xs">
                    <span className="bg-green-700/40 text-green-300 px-2 py-1 rounded border border-green-700/60">✅ 75점↑ PPL 적합</span>
                    <span className="bg-yellow-700/40 text-yellow-300 px-2 py-1 rounded border border-yellow-700/60">⚠️ 50~74점 검토 필요</span>
                    <span className="bg-red-700/40 text-red-300 px-2 py-1 rounded border border-red-700/60">❌ 50점↓ 비적합</span>
                  </div>
                </div>
              </section>

              {/* PPL 수익 계산 */}
              <section>
                <h3 className="text-orange-400 font-bold text-base mb-3">💰 PPL 수익 계산 방법</h3>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-2">
                  <p className="text-slate-300">⚙️ 설정 탭에서 아래 항목을 입력하면 자동 계산됩니다.</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                    {[
                      { label:'상품 판매가', example:'예: 89,000원' },
                      { label:'원가 / 배송비 / 사은품', example:'예: 30,000 / 3,500 / 2,000원' },
                      { label:'총 MG (최소보장금)', example:'예: 3,000,000원' },
                      { label:'대행사 MG 분담율', example:'예: 30% (쇼크 부담)' },
                      { label:'RS율 (매출 배분)', example:'예: 20%' },
                      { label:'예상 클릭수', example:'조회수 × 인게이지먼트 참고' },
                    ].map(item => (
                      <div key={item.label} className="bg-slate-700/60 rounded p-2">
                        <p className="text-white text-xs font-semibold">{item.label}</p>
                        <p className="text-slate-400 text-xs">{item.example}</p>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* 채널 관리 */}
              <section>
                <h3 className="text-pink-400 font-bold text-base mb-3">🗂️ 채널 관리 기능</h3>
                <div className="bg-slate-800 rounded-lg p-4 border border-slate-700 space-y-2">
                  {[
                    { icon:'🏷️', title:'상태 관리', desc:'관심 / 협의중 / 완료 / 보류로 채널을 분류하고, 왼쪽 목록 상단 필터로 빠르게 검색하세요.' },
                    { icon:'#️⃣', title:'태그', desc:'건강, 맘채널, 요리 등 자유로운 키워드로 채널을 묶어 관리합니다.' },
                    { icon:'📝', title:'메모', desc:'담당자, 협의 내용, 특이사항 등을 자유롭게 기록합니다. 요약 탭 상단에 항상 표시됩니다.' },
                    { icon:'💬', title:'댓글 분석', desc:'요약 탭 하단 "🔍 댓글 분석 실행" 버튼으로 구매의도 댓글 비율, 품질 점수를 분석합니다.' },
                    { icon:'🔄', title:'자동 갱신', desc:'매일 새벽 3시(KST)에 모든 채널이 자동으로 갱신됩니다. 수동 갱신은 채널 카드의 갱신 버튼을 이용하세요.' },
                  ].map(item => (
                    <div key={item.title} className="flex gap-3 items-start">
                      <span className="text-xl shrink-0 mt-0.5">{item.icon}</span>
                      <div>
                        <p className="text-white font-semibold">{item.title}</p>
                        <p className="text-slate-400">{item.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 자주 묻는 질문 */}
              <section>
                <h3 className="text-cyan-400 font-bold text-base mb-3">❓ 자주 묻는 질문</h3>
                <div className="space-y-2">
                  {[
                    { q:'갱신 버튼을 눌렀는데 오류가 납니다.', a:'서버가 잠시 잠들어 있을 수 있습니다. 10~30초 후 다시 시도하세요. (서버는 5분마다 자동으로 깨어납니다)' },
                    { q:'구독자 변화 그래프가 보이지 않아요.', a:'갱신을 2번 이상 해야 데이터 포인트가 쌓여 그래프가 표시됩니다.' },
                    { q:'롱폼 영상이 실제보다 적게 나와요.', a:'갱신 버튼을 눌러 전체 영상을 다시 수집하세요. 최초 등록 시에는 일부만 수집될 수 있습니다.' },
                    { q:'댓글 분석은 얼마나 걸리나요?', a:'최근 영상 5개 기준 약 30~60초 소요됩니다. 분석 중 다른 작업은 계속 할 수 있습니다.' },
                    { q:'Excel 내보내기가 안 됩니다.', a:'팝업 차단 설정을 확인하세요. 브라우저에서 이 사이트의 팝업을 허용해 주세요.' },
                  ].map(item => (
                    <details key={item.q} className="bg-slate-800 border border-slate-700 rounded-lg">
                      <summary className="px-4 py-3 text-white cursor-pointer hover:text-blue-300 transition font-medium">{item.q}</summary>
                      <p className="px-4 pb-3 text-slate-400">{item.a}</p>
                    </details>
                  ))}
                </div>
              </section>

            </div>

            {/* 하단 닫기 */}
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end">
              <button onClick={() => setShowGuide(false)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold transition">
                확인
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
