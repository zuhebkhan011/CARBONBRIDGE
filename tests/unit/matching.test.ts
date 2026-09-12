import { describe, it, expect } from 'vitest';
import { calculateDistanceKm, GeoCoordinate } from '../../src/common/utils/geo.js';

describe('Smart Matching & Multi-Supplier Pooling Heuristic Unit Tests', () => {
  const buyerDemand = {
    targetQuantity: 500, // 500 Metric Tons
    minPurity: 70.0,
    coordinates: { latitude: 23.0225, longitude: 72.5714 } as GeoCoordinate, // Ahmedabad
  };

  const sellerBatches = [
    {
      id: 'batch-a',
      batchNumber: 'CB-BATCH-A',
      availableQuantity: 100,
      purityPercentage: 78.0,
      pricePerTon: 2400,
      coordinates: { latitude: 21.6264, longitude: 73.0033 } as GeoCoordinate, // Ankleshwar
    },
    {
      id: 'batch-b',
      batchNumber: 'CB-BATCH-B',
      availableQuantity: 200,
      purityPercentage: 72.0,
      pricePerTon: 2350,
      coordinates: { latitude: 21.1167, longitude: 72.6500 } as GeoCoordinate, // Hazira
    },
    {
      id: 'batch-c',
      batchNumber: 'CB-BATCH-C',
      availableQuantity: 200,
      purityPercentage: 74.0,
      pricePerTon: 2380,
      coordinates: { latitude: 21.7118, longitude: 72.5855 } as GeoCoordinate, // Dahej
    },
    {
      id: 'batch-d-substandard',
      batchNumber: 'CB-BATCH-D',
      availableQuantity: 300,
      purityPercentage: 65.0, // Fails minPurity >= 70%
      pricePerTon: 1800,
      coordinates: { latitude: 22.0, longitude: 72.0 } as GeoCoordinate,
    },
  ];

  it('should filter out lots failing the minimum purity constraint (purity < 70%)', () => {
    const validLots = sellerBatches.filter(
      (b) => b.purityPercentage >= buyerDemand.minPurity && b.availableQuantity > 0
    );

    expect(validLots).toHaveLength(3);
    expect(validLots.map((b) => b.batchNumber)).not.toContain('CB-BATCH-D');
  });

  it('should detect when no single supplier can fulfill the entire 500T demand', () => {
    const singleMatches = sellerBatches.filter(
      (b) =>
        b.purityPercentage >= buyerDemand.minPurity &&
        b.availableQuantity >= buyerDemand.targetQuantity
    );

    expect(singleMatches).toHaveLength(0);
  });

  it('should aggregate multi-supplier lots to achieve 100% demand fulfillment (100T + 200T + 200T = 500T)', () => {
    const validLots = sellerBatches.filter(
      (b) => b.purityPercentage >= buyerDemand.minPurity && b.availableQuantity > 0
    );

    let accumulatedTons = 0;
    const pooledLots: Array<(typeof sellerBatches)[0] & { contributingQuantity: number }> = [];

    for (const lot of validLots) {
      if (accumulatedTons >= buyerDemand.targetQuantity) break;
      const needed = buyerDemand.targetQuantity - accumulatedTons;
      const take = Math.min(lot.availableQuantity, needed);
      if (take > 0) {
        pooledLots.push({ ...lot, contributingQuantity: take });
        accumulatedTons += take;
      }
    }

    expect(accumulatedTons).toBe(500);
    expect(pooledLots).toHaveLength(3);
    expect(pooledLots[0].contributingQuantity).toBe(100);
    expect(pooledLots[1].contributingQuantity).toBe(200);
    expect(pooledLots[2].contributingQuantity).toBe(200);

    // Compute weighted average purity
    const weightedPurity =
      pooledLots.reduce((acc, p) => acc + p.purityPercentage * p.contributingQuantity, 0) /
      accumulatedTons;

    // (78*100 + 72*200 + 74*200) / 500 = (7800 + 14400 + 14800) / 500 = 37000 / 500 = 74.0%
    expect(weightedPurity).toBeCloseTo(74.0, 1);
  });
});
