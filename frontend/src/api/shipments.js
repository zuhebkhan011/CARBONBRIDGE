import { api } from './client.js';

export const shipmentsApi = {
  list: () => api.get('/shipments'),
  getById: (id) => api.get(`/shipments/${id}`),
  updateStatus: (id, data) => api.patch(`/shipments/${id}/status`, data),
};
