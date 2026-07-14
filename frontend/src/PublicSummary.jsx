import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Loader } from 'lucide-react';
import { getPublicSummary } from './api';
import { formatKoreanCount, calculateEfficiencyScore, calculateViewTrend, calculatePPLRevenueFor, filterVideos, trimmedMean } from './App';

// 공유 링크(/share/:token)로 접근하는 읽기 전용 페이지.
// 로그인/앱 상태 없이 독립적으로 동작하며, App.jsx에 모듈 레벨로 export된
// 동일한 계산 함수(효율점수/BEP 등)를 그대로 재사용해 본 앱과 수치가 항상 일치하도록 한다.
export default function PublicSummary({ token }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const d = await getPublicSummary(token);
        setData(d);
      } catch (err) {
        setError(err.response?.data?.error || '링크를 불러올 수 없습니다');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="text-center">
          <Loader size={32} className="mx-auto text-blue-400 mb-3 animate-spin" />
          <p className="text-slate-400 text-sm">불러오는 중...</p>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center p-6">
        <div className="bg-slate-800 border border-slate-700 rounded-lg p-8 text-center max-w-sm">
          <p className="text-red-400 font-semibold mb-2">링크를 열 수 없습니다</p>
          <p className="text-slate-400 text-sm">{error || '유효하지 않거나 만료된 링크입니다'}</p>
        </div>
      </div>
    );
  }

  const isInternal = data.mode === 'internal';
  const eff = calculateEfficiencyScore(data);
  const d = eff.details;
  const lf = filterVideos(data.videos, 'longform');
  const recent = [...lf].sort((a, b) => new Date(b.uploadDate) - new Date(a.uploadDate)).slice(0, 10);
  // 효율 점수 계산과 동일하게 절사평균(이상치 제외)을 써서 바이럴/저조 영상 1개가 수치를 왜곡하지 않게 한다.
  const avgViews = Math.round(trimmedMean(recent.map(v => v.views || 0)));
  const engagement = trimmedMean(recent.map(v => parseFloat(v.engagement) || 0)).toFixed(2);
  const trend = calculateViewTrend(lf);
  const ppl = isInternal && data.pplSettings ? calculatePPLRevenueFor(data.videos, data.pplSettings) : null;
  const subsStats = (data.dailyStats || []).filter(s => s.subscribers).sort((a, b) => a.date.localeCompare(b.date));

  const scoreColor = eff.total >= 75 ? 'text-green-400' : eff.total >= 50 ? 'text-yellow-400' : 'text-red-400';
  const scoreBg = eff.total >= 75 ? 'from-green-900 to-green-800 border-green-600' : eff.total >= 50 ? 'from-yellow-900 to-yellow-800 border-yellow-600' : 'from-red-900 to-red-800 border-red-600';
  const grade = eff.total >= 75 ? '✅ PPL 적합' : eff.total >= 50 ? '⚠️ 검토 필요' : '❌ 비적합';

  return (
    <div className="min-h-screen bg-slate-900 text-white p-4 sm:p-8">
      <div className="max-w-3xl mx-auto space-y-6 pb-10">
        <div className="text-center">
          <span className="inline-block text-xs px-3 py-1 rounded-full bg-slate-800 border border-slate-700 text-slate-400">
            🔗 공유된 요약 리포트 · 읽기 전용{isInternal ? ' · 내부용(금액 포함)' : ''}
          </span>
        </div>

        <div className="bg-slate-800 border border-slate-700 rounded-lg p-6">
          <h1 className="text-2xl font-bold text-white mb-4">{data.channelName}</h1>

          <div className="grid grid-cols-2 gap-4 mb-6">
            <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">총 조회수</p><p className="text-2xl font-bold text-white mt-1">{formatKoreanCount(data.totalViews)}회</p></div>
            <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">구독자</p><p className="text-2xl font-bold text-white mt-1">{formatKoreanCount(data.subscribers)}명</p></div>
            <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">인게이지먼트</p><p className="text-2xl font-bold text-white mt-1">{engagement}%</p></div>
            <div className="bg-slate-700 rounded p-4"><p className="text-slate-400 text-sm">평균 조회수</p><p className="text-2xl font-bold text-white mt-1">{formatKoreanCount(avgViews)}회</p></div>
          </div>

          {/* 효율 점수 카드 */}
          <div className={`bg-gradient-to-br ${scoreBg} border rounded-lg p-5 mb-6`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">⚡ 채널 효율 점수</h2>
                <p className="text-xs text-slate-400 mt-0.5">인게이지먼트(35) · 조회수비율(25) · 일관성(15) · 업로드주기(10) · 광고비율(10) · 채널연령(5)</p>
                <p className="text-[10px] text-slate-500 mt-0.5">* 인게이지먼트는 구독자 규모별 상대 기준으로 평가합니다</p>
              </div>
              <div className="text-center flex-shrink-0">
                <p className={`text-4xl font-bold ${scoreColor}`}>{eff.total}<span className="text-lg">점</span></p>
                <p className={`text-sm font-semibold mt-1 ${scoreColor}`}>{grade}</p>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { icon: '💬', label: '인게이지먼트율', value: `${d.engRate}%`, score: d.engScore, max: 35,
                  basis: `${d.subscriberTier} 기준 (하위25% ${d.benchmarkP25}% · 중앙값 ${d.benchmarkMedian}% · 상위25% ${d.benchmarkP75}%, 출처: ${d.benchmarkSource})${d.hasCommentQuality ? ` · 댓글품질 ${d.commentQualityAdjust >= 0 ? '+' : ''}${d.commentQualityAdjust}` : ''}` },
                { icon: '👥', label: '구독자 대비 조회수', value: `${d.viewsRatio}%`, score: d.viewsScore, max: 25 },
                { icon: '📊', label: '조회수 일관성', value: d.cvPercent !== null ? `CV ${d.cvPercent}%` : '-', score: d.consistencyScore, max: 15 },
                { icon: '📅', label: '업로드 주기 (롱폼)', value: d.avgGapDays !== null ? `${d.avgGapDays}일` : '-', score: d.uploadScore, max: 10 },
                { icon: '📢', label: '최근 광고 비율', value: `${d.adRatio}%`, score: d.adScore, max: 10 },
                { icon: '📆', label: '채널 연령', value: d.channelAgeYears !== null ? `${d.channelAgeYears}년` : '-', score: d.ageScore, max: 5 },
              ].map(item => (
                <div key={item.label} className="bg-black bg-opacity-30 rounded p-3">
                  <p className="text-slate-300 text-xs">{item.icon} {item.label}</p>
                  <p className="text-xl font-bold text-white mt-1">{item.value}</p>
                  <div className="flex justify-between items-center mt-1">
                    <p className="text-xs font-bold text-yellow-400">{item.score}/{item.max}점</p>
                  </div>
                  {item.basis && <p className="text-[10px] text-slate-500 mt-0.5">근거: {item.basis}</p>}
                  <div className="w-full bg-black/40 rounded-full h-1.5 mt-2">
                    <div className={`h-1.5 rounded-full ${item.score / item.max >= 0.8 ? 'bg-green-400' : item.score / item.max >= 0.5 ? 'bg-yellow-400' : 'bg-red-400'}`} style={{ width: `${(item.score / item.max) * 100}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* 내부용에서만 노출되는 PPL 매출 분석 */}
          {isInternal && ppl && (
            <div className="bg-gradient-to-br from-blue-900 to-blue-800 border border-blue-600 rounded-lg p-6 mb-6">
              <h2 className="text-xl font-bold text-white mb-4">💰 PPL 매출 분석</h2>
              {data.pplSettings.itemMix && data.pplSettings.itemMix.length > 1 && (
                <div className="bg-slate-900/50 border border-blue-700/30 rounded-lg p-3 mb-3">
                  <p className="text-blue-200 text-xs font-semibold mb-1.5">📦 품목 구성 (믹스 가중평균 적용)</p>
                  <div className="flex flex-wrap gap-1.5">
                    {data.pplSettings.itemMix.map((m, i) => (
                      <span key={i} className="text-xs px-2 py-1 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/40">{m.itemName || '(품목명 미입력)'} {m.ratio}%</span>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-slate-800/80 rounded-lg p-4"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">우리측 MG 부담금</p><p className="text-xl font-bold text-white">{ppl.ourMGShare?.toLocaleString()}원</p></div>
                <div className="bg-slate-800/80 rounded-lg p-4"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">예상 판매수량</p><p className="text-xl font-bold text-white">{ppl.estimatedQty?.toLocaleString()}개</p></div>
                <div className="bg-slate-800/80 rounded-lg p-4"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">예상 매출</p><p className="text-xl font-bold text-white">{ppl.expectedRevenue?.toLocaleString()}원</p></div>
                <div className="bg-slate-800/80 rounded-lg p-4"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">개당 기여마진</p><p className={`text-xl font-bold ${ppl.unitMargin >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ppl.unitMargin?.toLocaleString()}원</p></div>
                <div className="bg-slate-800/80 rounded-lg p-4"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">순이익</p><p className={`text-xl font-bold ${ppl.netProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>{ppl.netProfit?.toLocaleString()}원</p></div>
                <div className="bg-slate-800/80 rounded-lg p-4"><p className="text-slate-400 text-xs uppercase tracking-wide mb-1">ROI</p><p className="text-xl font-bold text-blue-400">{ppl.roi !== null ? `${ppl.roi}%` : '계산 불가'}</p></div>
              </div>
              <div className={`p-4 rounded text-center font-bold text-lg mt-4 ${ppl.riskLevel === '낮음' ? 'bg-green-600 text-green-100' : ppl.riskLevel === '중간' ? 'bg-yellow-600 text-yellow-100' : 'bg-red-600 text-red-100'}`}>
                위험도: {ppl.riskLevel} {ppl.riskLevel === '낮음' ? '✅ 강추' : ppl.riskLevel === '중간' ? '⚠️ 검토' : ppl.riskLevel === '평가 불가' ? '' : '❌ 신중'}
              </div>
              {ppl.bepQty !== null && ppl.bepQty !== undefined && (
                <p className="text-blue-200 text-xs mt-3 text-center">BEP 판매수량 {ppl.bepQty?.toLocaleString()}개 대비 예상 판매수량 {ppl.estimatedQty?.toLocaleString()}개 {ppl.estimatedQty >= ppl.bepQty ? '— BEP 달성 예상 ✅' : '— BEP 미달 예상 ⚠️'}</p>
              )}
            </div>
          )}

          {/* 조회수 트렌드 */}
          {trend && (
            <div className="bg-slate-700 border border-slate-600 rounded-lg p-5 mb-4">
              <h2 className="text-lg font-bold text-white mb-3">📊 조회수 트렌드 분석</h2>
              <p className="text-xs text-slate-400 mb-4">롱폼 기준 최근 10개 vs 이전 10개 평균 조회수 비교</p>
              <div className="grid grid-cols-3 gap-3 mb-4">
                <div className="bg-slate-800 rounded p-3 text-center"><p className="text-slate-400 text-xs mb-1">최근 10개 평균</p><p className="text-xl font-bold text-white">{formatKoreanCount(trend.recentAvg)}회</p></div>
                <div className="bg-slate-800 rounded p-3 text-center"><p className="text-slate-400 text-xs mb-1">이전 10개 평균</p><p className="text-xl font-bold text-slate-300">{trend.prevAvg ? formatKoreanCount(trend.prevAvg) + '회' : '-'}</p></div>
                <div className="bg-slate-800 rounded p-3 text-center"><p className="text-slate-400 text-xs mb-1">변화율</p><p className="text-xl font-bold text-white">{trend.change !== null ? `${trend.change}%` : '-'}</p></div>
              </div>
              {trend.chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={160}>
                  <LineChart data={trend.chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                    <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => formatKoreanCount(v)} />
                    <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', fontSize: 12 }} formatter={v => [formatKoreanCount(v) + '회', '조회수']} />
                    <Line type="monotone" dataKey="views" stroke="#3b82f6" strokeWidth={2} dot={{ fill: '#3b82f6', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </div>
          )}

          {/* 구독자 변화 */}
          {subsStats.length >= 2 && (
            <div className="bg-slate-700 border border-slate-600 rounded-lg p-5">
              <h2 className="text-lg font-bold text-white mb-3">📈 구독자 변화 트래킹</h2>
              <ResponsiveContainer width="100%" height={140}>
                <LineChart data={subsStats.map(s => ({ date: s.date.slice(5), subscribers: s.subscribers }))}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#475569" />
                  <XAxis dataKey="date" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} tickFormatter={v => formatKoreanCount(v)} />
                  <Tooltip contentStyle={{ backgroundColor: '#1e293b', border: '1px solid #475569', color: '#e2e8f0', fontSize: 12 }} formatter={v => [formatKoreanCount(v) + '명', '구독자']} />
                  <Line type="monotone" dataKey="subscribers" stroke="#a78bfa" strokeWidth={2} dot={{ fill: '#a78bfa', r: 3 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <p className="text-center text-slate-600 text-xs">YouTube Channel Analyzer 공유 리포트</p>
      </div>
    </div>
  );
}
