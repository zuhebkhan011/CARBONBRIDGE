import { api } from './client.js';

export const aiApi = {
  getMatches: (requirementId, limit = 10, weights) =>
    api.post('/ai/match', { requirementId, limit, weights }),
  parseRequirement: (text) =>
    api.post('/ai/parse-requirement', { text }),
};
