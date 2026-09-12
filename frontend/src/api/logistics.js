import { api } from './client.js';

export const logisticsApi = {
  getConsolidation: () => api.get('/logistics/consolidation'),
  getActiveShipments: () => api.get('/logistics/active-shipments'),
  optimizeRoute: (payload) => api.post('/logistics/optimize-route', payload),
  selectRoute: (payload) => api.post('/logistics/select-route', payload),
};
