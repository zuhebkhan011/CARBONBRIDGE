import { api } from './client.js';

export const matchingApi = {
  getMatches: (requirementId) => api.get(`/matching/${requirementId}`),
};
