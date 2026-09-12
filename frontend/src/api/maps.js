import { api } from './client.js';

export const mapsApi = {
  getActive: () => api.get('/maps/active'),
};
