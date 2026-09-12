import { api } from './client.js';

export const logisticsApi = {
  getConsolidation: () => api.get('/logistics/consolidation'),
};
