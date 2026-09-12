import { api } from './client.js';

export const documentsApi = {
  uploadCoA: (batchId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload(`/documents/coa/${batchId}/upload`, formData);
  },
  getMetadata: (batchId) => api.get(`/documents/coa/${batchId}`),
  downloadUrl: (batchId) => `/api/v1/documents/coa/download/${batchId}`,
};
