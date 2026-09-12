import { describe, it, expect } from 'vitest';
import { PricingService } from '../../src/modules/pricing/pricing.service.js';

describe('Strictly Rule-Based Deterministic Advisory Pricing Service', () => {
  it('should calculate benchmark price corridor for standard flue gas (75% purity, 100T)', () => {
    const result = PricingService.calculateAdvisoryPrice({
      purityPercentage: 75,
      batchQuantity: 100,
    });

    expect(result.recommendedLowerPrice).toBe(2200);
    expect(result.recommendedUpperPrice).toBe(2500);
    expect(result.medianPrice).toBe(2350);
    expect(result.deterministicFactors.purityPremiumPerTon).toBe(0);
    expect(result.deterministicFactors.volumeScaleAdjustmentPercentage).toBe(0);
  });

  it('should apply deterministic purity premium for high-concentration capture (85% purity)', () => {
    const result = PricingService.calculateAdvisoryPrice({
      purityPercentage: 85,
      batchQuantity: 100,
    });

    // 85% is 5% above 80% threshold -> 5 * ₹30 = +₹150/T
    expect(result.deterministicFactors.purityPremiumPerTon).toBe(150);
    expect(result.recommendedLowerPrice).toBe(2350);
    expect(result.recommendedUpperPrice).toBe(2650);
    expect(result.medianPrice).toBe(2500);
  });

  it('should apply volume scale efficiency discount for bulk lots (>= 500T)', () => {
    const result = PricingService.calculateAdvisoryPrice({
      purityPercentage: 75,
      batchQuantity: 500,
    });

    // 8% discount on base 2200-2500 -> 2200 * 0.92 = 2024, 2500 * 0.92 = 2300
    expect(result.deterministicFactors.volumeScaleAdjustmentPercentage).toBe(-8);
    expect(result.recommendedLowerPrice).toBe(2024);
    expect(result.recommendedUpperPrice).toBe(2300);
  });

  it('should confirm purely advisory note and zero AI/ML claims', () => {
    const result = PricingService.calculateAdvisoryPrice({
      purityPercentage: 80,
      batchQuantity: 150,
    });

    expect(result.advisoryNote).toContain('Advisory benchmark only');
  });
});
