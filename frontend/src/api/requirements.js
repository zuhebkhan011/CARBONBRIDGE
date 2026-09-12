import { api } from './client.js';

export const requirementsApi = {
  create: (data) => api.post('/requirements', data),
  list: () => api.get('/requirements'),
  getById: (id) => api.get(`/requirements/${id}`),
  cancel: (id) => api.patch(`/requirements/${id}/cancel`),
};
