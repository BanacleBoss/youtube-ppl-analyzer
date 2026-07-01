import axios from 'axios';

const API_URL = process.env.REACT_APP_API_URL || 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 120000  // 채널 추가 시 YouTube API 다중 호출로 시간 소요
});

export const addChannel = async (channelId) => {
  const response = await api.post('/channels', { channelId });
  return response.data;
};

export const getChannels = async () => {
  const response = await api.get('/channels');
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

export default api;
