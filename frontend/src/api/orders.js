import { api } from './client.js';

export const ordersApi = {
  procureFixed: (data) => api.post('/orders/procure-fixed', data),
  procureComposite: (data) => api.post('/orders/procure-composite', data),
  list: () => api.get('/orders'),
  getById: (id) => api.get(`/orders/${id}`),
};
