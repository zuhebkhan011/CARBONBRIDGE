import { describe, it, expect } from 'vitest';
import {
  calculateMatchScore,
  calculateDeliveryFeasibility,
  generateWhyThisMatch,
  ScoreBreakdown,
  DeliveryFeasibility,
} from '../../src/modules/matching/matching.service.js';
import { PricingService } from '../../src/modules/pricing/pricing.service.js';
import { computeRouteSavings, GeoCoordinate } from '../../src/common/utils/geo.js';

describe('CarbonBridge Intelligence Engine Unit Tests', () => {
  describe('Explainable 0–100 Match Scoring', () => {
    it('should generate an explainable score and detailed breakdown for high-quality match', () => {
      const feasibility: DeliveryFeasibility = {
        status: 'FEASIBLE',
        label: '✓ Feasible',
        estimatedTransitHours: 3.5,
        explanation: 'Regional cryogenic road transit comfortably meets requirements.',
      };

      const result = calculateMatchScore({
        fulfilledQuantity: 500,
        targetQuantity: 500,
        purityPercentage: 98.0,
        minPurity: 70.0,
        landedCostPerTon: 2350,
        distanceKm: 65,
        hasCertificate: true,
        feasibility,
      });

      expect(result.totalScore).toBeGreaterThanOrEqual(90);
      expect(result.totalScore).toBeLessThanOrEqual(100);
      expect(result.rating).toBe('Excellent');

      // Check breakdown dimensions
      expect(result.breakdown.quantityFit.score).toBe(25);
      expect(result.breakdown.quantityFit.rating).toBe('Excellent');
      expect(result.breakdown.purityFit.score).toBe(20);
      expect(result.breakdown.purityFit.rating).toBe('Excellent');
      expect(result.breakdown.priceCompetitiveness.score).toBe(20);
      expect(result.breakdown.distanceEfficiency.score).toBe(15);
      expect(result.breakdown.availability.score).toBe(10);
      expect(result.breakdown.deliveryFeasibility.score).toBe(10);
    });

    it('should proportionally degrade score when quantity is partially fulfilled and distance is high', () => {
      const feasibility: DeliveryFeasibility = {
        status: 'TIGHT',
        label: '⚠ Tight delivery window',
        estimatedTransitHours: 14.2,
        explanation: 'Long-distance transit requires careful driver rotation.',
      };

      const result = calculateMatchScore({
        fulfilledQuantity: 250,
        targetQuantity: 500,
        purityPercentage: 72.0,
        minPurity: 70.0,
        landedCostPerTon: 3100,
        distanceKm: 480,
        hasCertificate: false,
        feasibility,
      });

      expect(result.totalScore).toBeLessThan(75);
      expect(result.breakdown.quantityFit.score).toBe(13); // 50% of 25 = ~13
      expect(result.breakdown.quantityFit.rating).toBe('Moderate');
      expect(result.breakdown.deliveryFeasibility.score).toBe(6);
    });
  });

  describe('Delivery Feasibility Intelligence', () => {
    it('should assess short regional distance as FEASIBLE with transit time', () => {
      const feasibility = calculateDeliveryFeasibility(85, null, 45);

      expect(feasibility.status).toBe('FEASIBLE');
      expect(feasibility.label).toContain('Feasible');
      expect(feasibility.estimatedTransitHours).toBeGreaterThan(0);
      expect(feasibility.explanation).toContain('85 km');
    });

    it('should detect tight turnaround when delivery deadline is constrained', () => {
      // Set deadline 6 hours from now for a 120km route (transit ~2.7h + 4h buffer = 6.7h)
      const tightDeadline = new Date(Date.now() + 8 * 3600 * 1000);
      const feasibility = calculateDeliveryFeasibility(120, tightDeadline, 45);

      expect(['TIGHT', 'UNLIKELY']).toContain(feasibility.status);
      expect(feasibility.explanation).toContain('dispatch');
    });
  });

  describe('Explainable "Why This Match?" Factor Generator', () => {
    it('should generate transparent, truthful bullets without claiming unverified certification', () => {
      const feasibility: DeliveryFeasibility = {
        status: 'FEASIBLE',
        label: '✓ Feasible',
        estimatedTransitHours: 4.5,
        explanation: 'Feasible road route.',
      };

      const reasons = generateWhyThisMatch({
        isSingle: true,
        fulfilledQuantity: 500,
        targetQuantity: 500,
        purityPercentage: 98.5,
        minPurity: 75.0,
        landedCostPerTon: 2420,
        distanceKm: 92,
        hasCertificate: true,
        feasibility,
      });

      expect(reasons).toBeInstanceOf(Array);
      expect(reasons.some((r) => r.includes('Meets required purity (98.5% vs min 75%)'))).toBe(true);
      expect(reasons.some((r) => r.includes('100% quantity available'))).toBe(true);
      expect(reasons.some((r) => r.includes('Competitive landed cost'))).toBe(true);
      expect(reasons.some((r) => r.includes('Nearby supplier logistics'))).toBe(true);
      expect(reasons.some((r) => r.includes('Delivery window feasible'))).toBe(true);

      // Exact phrase requested by the user:
      expect(reasons).toContain('✓ Certificate of Analysis (CoA) available');
      // Must NOT claim unverified/certified
      expect(reasons.some((r) => r.includes('verified & available'))).toBe(false);
    });

    it('should handle multi-supplier pooled fulfillment phrasing', () => {
      const feasibility: DeliveryFeasibility = {
        status: 'FEASIBLE',
        label: '✓ Feasible',
        estimatedTransitHours: 5.0,
        explanation: 'Feasible pooled route.',
      };

      const reasons = generateWhyThisMatch({
        isSingle: false,
        fulfilledQuantity: 500,
        targetQuantity: 500,
        purityPercentage: 74.0,
        minPurity: 70.0,
        landedCostPerTon: 2480,
        distanceKm: 110,
        hasCertificate: false,
        feasibility,
      });

      expect(reasons.some((r) => r.includes('Pooled multi-supplier fulfillment achieves 100%'))).toBe(true);
      expect(reasons.some((r) => r.includes('CoA available'))).toBe(false);
    });
  });

  describe('Deterministic Advisory Pricing with Explainable Breakdown', () => {
    it('should include full itemized factor breakdown and strict non-ML disclaimer', () => {
      const result = PricingService.calculateAdvisoryPrice({
        purityPercentage: 85,
        batchQuantity: 500,
      });

      expect(result.methodologyLabel).toBe('Rule-Based Advisory — Not AI/ML');
      expect(result.advisoryNote).toContain('Rule-Based Advisory — Not AI/ML');
      expect(result.advisoryNote).toContain('Advisory benchmark only');
      expect(result.breakdown).toBeDefined();
      expect(result.breakdown.baseBenchmark.min).toBe(2200);
      expect(result.breakdown.baseBenchmark.max).toBe(2500);
      expect(result.breakdown.purityAdjustment.amount).toBe(150); // (85 - 80) * 30
      expect(result.breakdown.volumeAdjustment.percentage).toBe(-8);
    });
  });

  describe('Dynamic Route Consolidation & Mileage Savings', () => {
    it('should compute real non-hardcoded mileage savings and ordered path', () => {
      const origin: GeoCoordinate = { latitude: 21.6264, longitude: 73.0033 }; // Ankleshwar depot
      const destinations: GeoCoordinate[] = [
        { latitude: 21.1702, longitude: 72.8311 }, // Surat buyer (approx 55 km south)
        { latitude: 21.0965, longitude: 72.6322 }, // Hazira buyer (approx 25 km west of Surat)
      ];

      const savings = computeRouteSavings(origin, destinations);

      expect(savings.independentDistanceKm).toBeGreaterThan(0);
      expect(savings.consolidatedDistanceKm).toBeGreaterThan(0);
      // Consolidated loop must save miles vs 2 separate round trips
      expect(savings.distanceSavedKm).toBeGreaterThan(0);
      expect(savings.savingsPercentage).toBeGreaterThan(0);
      expect(savings.orderedPath).toHaveLength(destinations.length + 2); // origin -> dest1 -> dest2 -> origin
    });
  });
});
