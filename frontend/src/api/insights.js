import { api } from './client.js';

export const insightsApi = {
  getMarketplace: () => api.get('/insights/marketplace'),
  getSellerOpportunities: () => api.get('/insights/seller'),
  getBuyerInsights: (requirementId) => api.get(`/insights/buyer/${requirementId}`),
};
