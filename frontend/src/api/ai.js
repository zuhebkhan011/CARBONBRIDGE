import { api } from './client.js';

export const aiApi = {
  getMatches: (requirementId, limit = 10, weights) =>
    api.post('/ai/match', { requirementId, limit, weights }),
  parseRequirement: (text) =>
    api.post('/ai/parse-requirement', { text }),
  extractCoA: (batchId, force = false) =>
    api.post(`/ai/coa/${batchId}/extract`, { force }),
  getCoAExtraction: (batchId) =>
    api.get(`/ai/coa/${batchId}`),
};

