import { api } from './client.js';

export const documentsApi = {
  uploadCoA: (batchId, file) => {
    const formData = new FormData();
    formData.append('file', file);
    return api.upload(`/documents/coa/${batchId}/upload`, formData);
  },
  getMetadata: (batchId) => api.get(`/documents/coa/${batchId}`),
  viewCoA: async (batchId) => {
    const blob = await api.getBlob(`/documents/coa/download/${batchId}`);
    const fileURL = window.URL.createObjectURL(blob);
    const win = window.open(fileURL, '_blank');
    if (!win) {
      const a = document.createElement('a');
      a.href = fileURL;
      a.target = '_blank';
      a.download = `CoA_${batchId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
    setTimeout(() => {
      window.URL.revokeObjectURL(fileURL);
    }, 60000);
    return fileURL;
  },
  downloadUrl: (batchId) => `/api/v1/documents/coa/download/${batchId}`,
};
