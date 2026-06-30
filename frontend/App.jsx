import React, { useState, useEffect } from 'react';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, Users, ThumbsUp, MessageCircle, Eye, Plus, Trash2, RefreshCw, Loader, Download, ExternalLink, ArrowUp, ArrowDown, HelpCircle } from 'lucide-react';
import { addChannel, getChannels, refreshChannel, deleteChannel } from './api';

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
  const [selectedChannelId, setSelectedChannelId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [error, setError] = useState(null);
  const [refreshing, setRefreshing] = useState({});
  const [activeTab, setActiveTab] = useState('summary');
  const [settings, setSettings] = useState({ productPrice: 50000, adBudget: 1000000, expectedConversionRate: 0.03, commissionRate: 0.1 });
  const [sortConfig, setSortConfig] = useState({ key: 'uploadDate', direction: 'desc' });

  useEffect(() => { loadChannels(); }, []);

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
    }
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

  const handleSaveSettings = async () => {
    if (!selectedChannel) return;
    try {
      const response = await fetch(`http://localhost:3001/api/channels/${selectedChannel._id}/settings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings)
      });
      const updated = await response.json();
      setChannels(channels.map(ch => ch._id === selectedChannel._id ? updated : ch));
      setError('✓ 설정이 저장되었습니다');
    } catch (err) {
      setError('설정 저장 실패');
    }
  };

  const handleExportExcel = async () => {
    if (!selectedChannel) return;
    try {
      const response = await fetch(`http://localhost:3001/api/channels/${selectedChannel._id}/export`);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `PPL_분석_${selectedChannel.channelName}.xlsx`;
      a.click();
    } catch (err) {
      setError('Excel 다운로드 실패');
    }
  };

  const filterVideos = (videos, type) => {
    return (videos || []).filter(v => {
      const duration = v.duration || 0;
      if (type === 'shorts') return duration <= 60;
      if (type === 'longform') return duration > 60;
      return true;
    });
  };

  const calculatePPLRevenue = (videos) => {
    const longformVideos = filterVideos(videos, 'longform');
    if (!longformVideos || longformVideos.length === 0) {
      return { avgViews: 0, engagement: 0, expectedRevenue: 0, commission: 0, netProfit: 0, roi: 0, roas: 0, riskLevel: '평가 불가' };
    }
    const recentVideos = longformVideos.slice(0, 10);
    const engagement = recentVideos.reduce((sum, v) => sum + (parseFloat(v.engagement) || 0), 0) / recentVideos.length / 100;
    const avgViews = recentVideos.reduce((sum, v) => sum + (v.views || 0), 0) / recentVideos.length;
    const expectedRevenue = avgViews * engagement * settings.expectedConversionRate * settings.productPrice;
    const commission = expectedRevenue * settings.commissionRate;
    const netProfit = expectedRevenue - commission - settings.adBudget;
    const roi = (netProfit / settings.adBudget * 100).toFixed(2);
    const roas = (expectedRevenue / settings.adBudget * 100).toFixed(2);
    let riskLevel = '높음';
    if (roi > 200 && engagement > 0.05) riskLevel = '낮음';
    else if (roi > 100 && engagement > 0.02) riskLevel = '중간';
    return { avgViews: Math.round(avgViews), engagement: (engagement * 100).toFixed(2), expectedRevenue: Math.round(expectedRevenue), commission: Math.round(commission), netProfit: Math.round(netProfit), roi: parseFloat(roi), roas: parseFloat(roas), riskLevel };
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
  const longformVideos = selectedChannel ? filterVideos(selectedChannel.videos, 'longform') : [];
  const shortsVideos = selectedChannel ? filterVideos(selectedChannel.videos, 'shorts') : [];
  const sortedLongformVideos = getSortedVideos(longformVideos);
  const sortedShortsVideos = getSortedVideos(shortsVideos);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="bg-black bg-opacity-50 border-b border-slate-700 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-6 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="text-3xl font-bold text-white">📊 YouTube PPL 분석기 PRO</h1>
              <p className="text-slate-400 mt-1">{channels.length}개 채널 분석 중</p>
            </div>
            <button onClick={() => setShowAddForm(true)} className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg flex items-center gap-2 transition" disabled={loading}>
              <Plus size={20} /> 채널 추가
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        {error && (
          <div className={`mb-6 p-4 rounded-lg ${error.includes('✓') ? 'bg-green-900 text-green-200 border border-green-700' : 'bg-red-900 text-red-200 border border-red-700'}`}>
            {error}
            <button onClick={() => setError(null)} className="float-right text-lg">✕</button>
          </div>
        )}

        {showAddForm && (
          <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 mb-8">
            <h2 className="text-xl font-bold text-white mb-4">유튜브 채널 추가</h2>
            <div className="flex gap-4">
              <input type="text" placeholder="예: @MrBeast" value={channelInput} onChange={(e) => setChannelInput(e.target.value)} onKeyPress={(e) => e.key === 'Enter' && handleAddChannel()} className="flex-1 bg-slate-700 border border-slate-600 rounded px-4 py-3 text-white placeholder-slate-400 focus:outline-none focus:border-blue-500" disabled={loading} />
              <button onClick={handleAddChannel} disabled={loading} className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white px-6 py-3 rounded transition flex items-center gap-2">
                {loading ? <Loader size={16} className="animate-spin" /> : <Plus size={16} />}
                {loading ? '추가중...' : '추가'}
              </button>
              <button onClick={() => setShowAddForm(false)} className="bg-slate-700 hover:bg-slate-600 text-white px-6 py-3 rounded transition" disabled={loading}>닫기</button>
            </div>
          </div>
        )}

        {channels.length === 0 ? (
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
                  <div key={channel._id} onClick={() => setSelectedChannelId(channel._id)} className={`p-4 rounded-lg border cursor-pointer transition ${selectedChannelId === channel._id ? 'bg-blue-900 border-blue-500' : 'bg-slate-800 border-slate-700 hover:border-slate-600'}`}>
                    <h3 className="font-semibold text-white truncate">{channel.channelName}</h3>
                    <p className="text-sm text-slate-400 mt-1">구독자: {(channel.subscribers/1000).toFixed(0)}K</p>
                    <p className="text-xs text-slate-500 mt-1">롱폼: {filterVideos(channel.videos, 'longform').length}개 | 숏폼: {filterVideos(channel.videos, 'shorts').length}개</p>
                    <div className="flex gap-2 mt-2">
                      <button onClick={(e) => { e.stopPropagation(); handleRefreshChannel(channel._id); }} disabled={refreshing[channel._id]} className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white text-xs py-1 rounded transition flex items-center justify-center gap-1">
                        {refreshing[channel._id] ? <Loader size={12} className="animate-spin" /> : <RefreshCw size={12} />}
                        {refreshing[channel._id] ? '중...' : '갱신'}
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDeleteChannel(channel._id); }} className="bg-red-600 hover:bg-red-700 text-white p-1 rounded transition">
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {selectedChannel && (
              <div className="lg:col-span-2 space-y-6">
                <div className="flex gap-2 border-b border-slate-700 overflow-x-auto">
                  {['summary', 'longform', 'shorts', 'settings', 'trends', 'export'].map(tab => (
                    <button key={tab} onClick={() => setActiveTab(tab)} className={`px-4 py-2 font-semibold transition whitespace-nowrap ${activeTab === tab ? 'text-blue-400 border-b-2 border-blue-400' : 'text-slate-400 hover:text-slate-300'}`}>
                      {tab === 'summary' && '📊 요약'} {tab === 'longform' && '🎬 롱폼'} {tab === 'shorts' && '📱 숏폼'} {tab === 'settings' && '⚙️ 설정'} {tab === 'trends' && '📈 트렌드'} {tab === 'export' && '📥 내보내기'}
                    </button>
                  ))}
                </div>

                {activeTab === 'summary' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h2 className="text-2xl font-bold text-white mb-2">{selectedChannel.channelName}</h2>
                    <p className="text-slate-400 text-sm mb-4">✨ 최근 10개 롱폼 영상 기준 분석</p>
                    <div className="grid grid-cols-2 gap-4 mb-6">
                      <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">총 조회수</p><p className="text-2xl font-bold text-white mt-1">{(selectedChannel.totalViews / 1000000000).toFixed(1)}B</p></div>
                      <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">구독자</p><p className="text-2xl font-bold text-white mt-1">{(selectedChannel.subscribers / 1000000).toFixed(1)}M</p></div>
                      <div className="bg-slate-700 rounded p-4"><InfoTooltip content="= (좋아요 + 댓글) / 조회수 × 100%"><p className="text-slate-400 text-sm">인게이지먼트</p><p className="text-2xl font-bold text-white mt-1">{pplData.engagement}%</p></InfoTooltip></div>
                      <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">평균 조회수</p><p className="text-2xl font-bold text-white mt-1">{(pplData.avgViews/1000).toFixed(0)}K</p></div>
                    </div>
                    <div className="bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-600 rounded-lg p-6">
                      <h3 className="text-xl font-bold text-white mb-4">💰 PPL 매출 분석</h3>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-800 rounded p-4"><p className="text-slate-300 text-sm">상품 객단가</p><p className="text-xl font-bold text-blue-300">{settings.productPrice.toLocaleString()}원</p></div>
                        <div className="bg-slate-800 rounded p-4"><p className="text-slate-300 text-sm">광고비</p><p className="text-xl font-bold text-blue-300">{settings.adBudget.toLocaleString()}원</p></div>
                        <div className="bg-slate-800 rounded p-4"><InfoTooltip content="= 평균조회수 × 인게이지먼트 × 전환율(3%) × 상품가"><p className="text-slate-300 text-sm">📊 예상 매출</p><p className="text-xl font-bold text-green-400">{pplData.expectedRevenue?.toLocaleString()}원</p></InfoTooltip></div>
                        <div className="bg-slate-800 rounded p-4"><InfoTooltip content={`= 예상매출 × 수수료율(${settings.commissionRate*100}%)`}><p className="text-slate-300 text-sm">💸 수수료</p><p className="text-xl font-bold text-yellow-400">{pplData.commission?.toLocaleString()}원</p></InfoTooltip></div>
                        <div className="bg-slate-800 rounded p-4"><InfoTooltip content="= 예상매출 - 수수료 - 광고비"><p className="text-slate-300 text-sm">💵 순이익</p><p className={`text-xl font-bold ${pplData.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{pplData.netProfit?.toLocaleString()}원</p></InfoTooltip></div>
                        <div className="bg-slate-800 rounded p-4"><InfoTooltip content="= 예상매출 / 광고비 × 100%"><p className="text-slate-300 text-sm">📈 ROAS</p><p className="text-xl font-bold text-purple-400">{pplData.roas}%</p></InfoTooltip></div>
                        <div className="bg-slate-800 rounded p-4"><InfoTooltip content="= 순이익 / 광고비 × 100%"><p className="text-slate-300 text-sm">🎯 ROI</p><p className="text-xl font-bold text-cyan-400">{pplData.roi}%</p></InfoTooltip></div>
                      </div>
                      <div className={`p-4 rounded text-center font-bold text-lg mt-4 ${pplData.riskLevel === '낮음' ? 'bg-green-600 text-green-100' : pplData.riskLevel === '중간' ? 'bg-yellow-600 text-yellow-100' : 'bg-red-600 text-red-100'}`}>
                        위험도: {pplData.riskLevel} {pplData.riskLevel === '낮음' ? '✅ 강추' : pplData.riskLevel === '중간' ? '⚠️ 검토' : '❌ 신중'}
                      </div>
                    </div>
                  </div>
                )}

                {activeTab === 'longform' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">🎬 롱폼 분석 ({sortedLongformVideos.length}개)</h3>
                    {sortedLongformVideos.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {sortedLongformVideos?.map((video, idx) => (
                              <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 truncate max-w-xs">{idx + 1}. {video.title}</td>
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

                {activeTab === 'shorts' && (
                  <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
                    <h3 className="text-lg font-bold text-white mb-4">📱 숏폼 분석 ({sortedShortsVideos.length}개)</h3>
                    {sortedShortsVideos.length > 0 ? (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="border-b border-slate-600"><tr className="text-slate-300"><th className="text-left p-2">영상</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('views')}>조회수 <SortIcon column="views" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('likes')}>좋아요 <SortIcon column="likes" /></th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('comments')}>댓글 <SortIcon column="comments" /></th><th className="text-right p-2">인게이지</th><th className="text-right p-2 cursor-pointer hover:text-blue-400" onClick={() => handleSort('uploadDate')}>업로드 <SortIcon column="uploadDate" /></th><th className="text-center p-2">링크</th></tr></thead>
                          <tbody>
                            {sortedShortsVideos?.map((video, idx) => (
                              <tr key={idx} className="border-b border-slate-700 hover:bg-slate-700 transition">
                                <td className="p-2 text-slate-300 truncate max-w-xs">{idx + 1}. {video.title}</td>
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
                      <div><label className="block text-slate-300 text-sm mb-2">상품 객단가 (원)</label><input type="number" value={settings.productPrice} onChange={(e) => setSettings({...settings, productPrice: parseInt(e.target.value)})} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>
                      <div><label className="block text-slate-300 text-sm mb-2">광고비 (원)</label><input type="number" value={settings.adBudget} onChange={(e) => setSettings({...settings, adBudget: parseInt(e.target.value)})} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>
                      <div><label className="block text-slate-300 text-sm mb-2">예상 전환율 (%)</label><input type="number" step="0.01" value={settings.expectedConversionRate * 100} onChange={(e) => setSettings({...settings, expectedConversionRate: parseFloat(e.target.value) / 100})} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>
                      <div><label className="block text-slate-300 text-sm mb-2">수수료율 (%)</label><input type="number" step="0.01" value={settings.commissionRate * 100} onChange={(e) => setSettings({...settings, commissionRate: parseFloat(e.target.value) / 100})} className="w-full bg-slate-700 border border-slate-600 rounded px-4 py-2 text-white focus:outline-none focus:border-blue-500" /></div>
                      <div className="flex gap-4 pt-4"><button onClick={handleSaveSettings} className="flex-1 bg-green-600 hover:bg-green-700 text-white py-2 rounded transition font-semibold">저장</button><button onClick={() => setActiveTab('summary')} className="flex-1 bg-slate-700 hover:bg-slate-600 text-white py-2 rounded transition">취소</button></div>
                    </div>
                  </div>
                )}

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
