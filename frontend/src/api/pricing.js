import { api } from './client.js';

export const pricingApi = {
  getAdvisory: (params) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/pricing/recommendation${query}`);
  },
};
