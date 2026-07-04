import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 120000  // 채널 추가 시 YouTube API 다중 호출로 시간 소요
});

// 로그인 토큰을 매 요청마다 자동으로 실어 보낸다 (localStorage에 저장된 토큰 사용).
api.interceptors.request.use(config => {
  const token = localStorage.getItem('authToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 토큰이 만료/무효화된 경우(401) 자동으로 로그인 화면으로 돌려보내기 위한 훅.
// App 컴포넌트가 로그인 성공 시 이 핸들러를 등록해두면, 어떤 API 호출에서 401이 나든
// 즉시 로그아웃 처리 + 로그인 화면 전환이 되도록 한다.
let unauthorizedHandler = null;
export const setUnauthorizedHandler = (fn) => { unauthorizedHandler = fn; };

api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      if (unauthorizedHandler) unauthorizedHandler();
    }
    return Promise.reject(err);
  }
);

// ── 인증 ──────────────────────────────────────────────
export const getSetupStatus = async () => {
  const response = await api.get('/auth/setup-status');
  return response.data; // { needsSetup }
};

export const setupAdmin = async ({ name, email, password }) => {
  const response = await api.post('/auth/setup-admin', { name, email, password });
  return response.data; // { token, user }
};

export const login = async ({ email, password }) => {
  const response = await api.post('/auth/login', { email, password });
  return response.data; // { token, user }
};

export const getMe = async () => {
  const response = await api.get('/auth/me');
  return response.data; // { user }
};

// ── 팀원 관리 ─────────────────────────────────────────
export const getUsers = async () => {
  const response = await api.get('/users');
  return response.data;
};

export const createUser = async ({ name, email, password, role }) => {
  const response = await api.post('/users', { name, email, password, role });
  return response.data;
};

export const addChannel = async (channelId) => {
  const response = await api.post('/channels', { channelId });
  return response.data;
};

// ownerId를 넘기면 그 팀원의 채널을, 'all'을 넘기면(관리자 전용) 전체 채널을, 생략하면 내 채널을 가져온다.
export const getChannels = async (ownerId) => {
  const response = await api.get('/channels', { params: ownerId ? { ownerId } : {} });
  return response.data;
};

export const refreshChannel = async (channelId) => {
  const response = await api.post(`/channels/${channelId}/refresh`);
  return response.data;
};

export const deleteChannel = async (channelId) => {
  const response = await api.delete(`/channels/${channelId}`);
  return response.data;
};

export const analyzeComments = async (channelId) => {
  const response = await api.post(`/channels/${channelId}/analyze-comments`);
  return response.data;
};

export const searchChannels = async (keyword) => {
  const response = await api.get('/search', { params: { keyword } });
  return response.data;
};

// 품목 관리
export const getItems = async () => {
  const response = await api.get('/items');
  return response.data;
};

export const addItem = async (item) => {
  const response = await api.post('/items', item);
  return response.data;
};

export const updateItem = async (itemId, item) => {
  const response = await api.put(`/items/${itemId}`, item);
  return response.data;
};

export const deleteItem = async (itemId) => {
  const response = await api.delete(`/items/${itemId}`);
  return response.data;
};

// 캠페인 실적 기록
export const addCampaignLog = async (channelId, log) => {
  const response = await api.post(`/channels/${channelId}/campaign-logs`, log);
  return response.data;
};

export const deleteCampaignLog = async (channelId, logId) => {
  const response = await api.delete(`/channels/${channelId}/campaign-logs/${logId}`);
  return response.data;
};

// 영상별 "우리 캠페인 진행" 수동 체크
export const setVideoCampaignFlag = async (channelId, videoId, ourCampaign) => {
  const response = await api.patch(`/channels/${channelId}/videos/${videoId}/campaign-flag`, { ourCampaign });
  return response.data;
};

// 요약 탭 공유 링크
export const getShareLink = async (channelId, type) => {
  const response = await api.post(`/channels/${channelId}/share`, { type });
  return response.data; // { type, token }
};

export const revokeShareLink = async (channelId, type) => {
  const response = await api.delete(`/channels/${channelId}/share/${type}`);
  return response.data;
};

export const getPublicSummary = async (token) => {
  const response = await api.get(`/public/summary/${token}`);
  return response.data;
};

// 딜 조건 변경 이력 수정/삭제
export const updateSettingsHistory = async (channelId, historyId, fields) => {
  const response = await api.patch(`/channels/${channelId}/settings-history/${historyId}`, fields);
  return response.data;
};

export const deleteSettingsHistory = async (channelId, historyId) => {
  const response = await api.delete(`/channels/${channelId}/settings-history/${historyId}`);
  return response.data;
};

export default api;
