import { api } from './client.js';

export const auctionsApi = {
  create: (data) => api.post('/auctions', data),
  list: () => api.get('/auctions'),
  getById: (id) => api.get(`/auctions/${id}`),
  placeBid: (id, data) => api.post(`/auctions/${id}/bid`, data),
  finalize: (id, data) => api.post(`/auctions/${id}/finalize`, data),
  getInsights: (id) => api.get(`/auctions/${id}/insights`),
};
