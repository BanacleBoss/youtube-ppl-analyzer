import axios from 'axios';

const API_URL = 'http://localhost:3001/api';

const api = axios.create({
  baseURL: API_URL,
  timeout: 30000
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

export default api;
