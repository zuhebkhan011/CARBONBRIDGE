import { api } from './client.js';
import { parsePurity } from '../utils/formatters.js';

export function normalizeListing(l) {
  if (!l || typeof l !== 'object') return l;
  const rawPurity = l.batch?.purityPercentage ?? l.batch?.purity ?? l.purityPercentage ?? l.purity;
  const purityVal = parsePurity(rawPurity);
  return {
    ...l,
    listingType: l.sellingMethod || l.listingType,
    quantity: l.quantity != null ? Number(l.quantity) : (l.batch?.availableQuantity != null ? Number(l.batch.availableQuantity) : undefined),
    listedQuantity: l.quantity != null ? Number(l.quantity) : (l.batch?.availableQuantity != null ? Number(l.batch.availableQuantity) : undefined),
    pricePerUnit: l.pricePerUnit ?? (l.pricePerTon != null ? Number(l.pricePerTon) : undefined),
    batch: l.batch ? {
      ...l.batch,
      purity: purityVal,
      purityPercentage: purityVal,
      capturedQuantity: l.batch.capturedQuantity != null ? Number(l.batch.capturedQuantity) : l.batch.capturedQuantity,
      availableQuantity: l.batch.availableQuantity != null ? Number(l.batch.availableQuantity) : l.batch.availableQuantity,
      allocatedQuantity: l.batch.allocatedQuantity != null ? Number(l.batch.allocatedQuantity) : l.batch.allocatedQuantity,
      storageLocationCity: l.batch.storageLocationCity || l.seller?.address?.split(',')?.[0]?.trim() || '',
      storageLocationState: l.batch.storageLocationState || '',
      company: l.batch.company || l.seller,
    } : null,
  };
}

export function normalizeListings(res) {
  if (!res) return res;
  if (res.data?.items && Array.isArray(res.data.items)) {
    return {
      ...res,
      data: {
        ...res.data,
        items: res.data.items.map(normalizeListing),
      },
    };
  }
  if (res.data && Array.isArray(res.data)) {
    return {
      ...res,
      data: res.data.map(normalizeListing),
    };
  }
  if (res.items && Array.isArray(res.items)) {
    return {
      ...res,
      items: res.items.map(normalizeListing),
    };
  }
  if (Array.isArray(res)) {
    return res.map(normalizeListing);
  }
  return normalizeListing(res);
}

export const listingsApi = {
  create: (data) => api.post('/listings', data),
  browse: (params) => {
    const query = params ? '?' + new URLSearchParams(params).toString() : '';
    return api.get(`/listings${query}`).then(res => normalizeListings(res));
  },
  getById: (id) => api.get(`/listings/${id}`).then(res => {
    if (res?.data) {
      return { ...res, data: normalizeListing(res.data) };
    }
    return normalizeListing(res);
  }),
  deactivate: (id) => api.patch(`/listings/${id}/deactivate`),
};
