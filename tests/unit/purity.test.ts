// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { parsePurity, formatPurity, getBatchPurity, formatBatchPurity } from '../../frontend/src/utils/formatters.js';
import { normalizeBatch, normalizeBatches } from '../../frontend/src/api/batches.js';
import { normalizeListing, normalizeListings } from '../../frontend/src/api/listings.js';

describe('Purity parsing, normalization and formatting suite', () => {
  describe('parsePurity', () => {
    it('correctly parses numbers and decimal strings from Prisma', () => {
      expect(parsePurity(78)).toBe(78);
      expect(parsePurity('78')).toBe(78);
      expect(parsePurity('78.00')).toBe(78);
      expect(parsePurity('81.5')).toBe(81.5);
      expect(parsePurity('81.50')).toBe(81.5);
    });

    it('returns null for missing, null, undefined, empty, or NaN inputs', () => {
      expect(parsePurity(null)).toBeNull();
      expect(parsePurity(undefined)).toBeNull();
      expect(parsePurity('')).toBeNull();
      expect(parsePurity('NaN')).toBeNull();
      expect(parsePurity(NaN)).toBeNull();
      expect(parsePurity('invalid')).toBeNull();
    });
  });

  describe('formatPurity', () => {
    it('formats valid numbers with percentage symbol without trailing zeroes if integer', () => {
      expect(formatPurity(78)).toBe('78%');
      expect(formatPurity('78')).toBe('78%');
      expect(formatPurity('78.00')).toBe('78%');
      expect(formatPurity(78.5)).toBe('78.5%');
    });

    it('safely formats null, undefined, NaN into em-dash "—" and NEVER displays "NaN%", "undefined%", or "null%"', () => {
      expect(formatPurity(null)).toBe('—');
      expect(formatPurity(undefined)).toBe('—');
      expect(formatPurity(NaN)).toBe('—');
      expect(formatPurity('NaN')).toBe('—');
      expect(formatPurity('')).toBe('—');
      expect(formatPurity('undefined')).toBe('—');
      expect(formatPurity('null')).toBe('—');
    });
  });

  describe('getBatchPurity & formatBatchPurity', () => {
    it('extracts purity from real backend batch object with purityPercentage (Prisma Decimal string)', () => {
      const backendBatch = {
        id: 'batch-1',
        capturedQuantity: '900.0000',
        availableQuantity: '900.0000',
        purityPercentage: '78.00',
        status: 'ACTIVE',
      };
      expect(getBatchPurity(backendBatch)).toBe(78);
      expect(formatBatchPurity(backendBatch)).toBe('78%');
    });

    it('extracts purity from batch object with purity property', () => {
      const batchWithPurity = {
        id: 'batch-2',
        purity: 74,
      };
      expect(getBatchPurity(batchWithPurity)).toBe(74);
      expect(formatBatchPurity(batchWithPurity)).toBe('74%');
    });

    it('extracts purity from listing with nested batch', () => {
      const listing = {
        id: 'listing-1',
        batch: {
          id: 'batch-3',
          purityPercentage: '72.00',
        },
      };
      expect(getBatchPurity(listing)).toBe(72);
      expect(formatBatchPurity(listing)).toBe('72%');
    });

    it('safely handles missing batch or purity without displaying NaN%', () => {
      expect(formatBatchPurity(null)).toBe('—');
      expect(formatBatchPurity({})).toBe('—');
      expect(formatBatchPurity({ batch: null })).toBe('—');
      expect(formatBatchPurity({ batch: { purityPercentage: null } })).toBe('—');
      expect(formatBatchPurity({ purityPercentage: undefined, purity: undefined })).toBe('—');
    });
  });

  describe('normalizeBatch & normalizeBatches', () => {
    it('normalizes raw backend batch and exposes numeric purity and purityPercentage', () => {
      const rawBatch = {
        id: 'cb-123',
        batchNumber: 'CB-BATCH-2026-001',
        capturedQuantity: '900.0000',
        availableQuantity: '900.0000',
        purityPercentage: '78.00',
      };
      const normalized = normalizeBatch(rawBatch);
      expect(normalized.purity).toBe(78);
      expect(normalized.purityPercentage).toBe(78);
      expect(normalized.capturedQuantity).toBe(900);
      expect(normalized.availableQuantity).toBe(900);
    });

    it('normalizes API response wrapper { success: true, data: [...] }', () => {
      const apiResponse = {
        success: true,
        data: [
          {
            id: 'cb-123',
            batchNumber: 'CB-BATCH-2026-001',
            capturedQuantity: '900.0000',
            availableQuantity: '900.0000',
            purityPercentage: '78.00',
          },
        ],
      };
      const normalized = normalizeBatches(apiResponse);
      expect(normalized.data[0].purity).toBe(78);
      expect(normalized.data[0].purityPercentage).toBe(78);
    });
  });

  describe('normalizeListing & normalizeListings', () => {
    it('normalizes listings API response wrapper with items array', () => {
      const apiResponse = {
        success: true,
        data: {
          items: [
            {
              id: 'list-1',
              sellingMethod: 'FIXED_PRICE',
              batch: {
                id: 'batch-1',
                availableQuantity: '500.0000',
                purityPercentage: '80.00',
              },
            },
          ],
          nextCursor: null,
        },
      };
      const normalized = normalizeListings(apiResponse);
      expect(normalized.data.items[0].batch.purity).toBe(80);
      expect(normalized.data.items[0].batch.purityPercentage).toBe(80);
      expect(formatBatchPurity(normalized.data.items[0])).toBe('80%');
    });
  });
});
