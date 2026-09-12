import { api } from './client.js';
import { parsePurity } from '../utils/formatters.js';

export function normalizeBatch(b) {
  if (!b || typeof b !== 'object') return b;
  const purityVal = parsePurity(b.purityPercentage ?? b.purity);
  return {
    ...b,
    purityPercentage: purityVal,
    purity: purityVal,
    capturedQuantity: b.capturedQuantity != null ? Number(b.capturedQuantity) : b.capturedQuantity,
    availableQuantity: b.availableQuantity != null ? Number(b.availableQuantity) : b.availableQuantity,
    allocatedQuantity: b.allocatedQuantity != null ? Number(b.allocatedQuantity) : b.allocatedQuantity,
    totalListedQuantity: b.totalListedQuantity != null ? Number(b.totalListedQuantity) : 0,
    storageLocationCity: b.storageLocationCity || b.seller?.address?.split(',')?.[0]?.trim() || '',
    storageLocationState: b.storageLocationState || '',
  };
}

export function normalizeBatches(res) {
  if (!res) return res;
  if (Array.isArray(res)) {
    return res.map(normalizeBatch);
  }
  if (res.data && Array.isArray(res.data)) {
    return {
      ...res,
      data: res.data.map(normalizeBatch),
    };
  }
  return res;
}

export const batchesApi = {
  create: (data) => api.post('/batches', data),
  list: () => api.get('/batches').then(res => normalizeBatches(res)),
  getById: (id) => api.get(`/batches/${id}`).then(res => {
    if (res?.data) {
      return { ...res, data: normalizeBatch(res.data) };
    }
    return normalizeBatch(res);
  }),
};
