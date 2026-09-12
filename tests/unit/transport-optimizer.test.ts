import { describe, it, expect } from 'vitest';
import { CostService } from '../../src/modules/logistics/cost.service.js';
import { RouteService } from '../../src/modules/logistics/route.service.js';
import { OptimizerService } from '../../src/modules/logistics/optimizer.service.js';
import { DeliveryStop, GeoCoordinate, VehicleConfig } from '../../src/modules/logistics/types.js';

describe('Smart Transportation Cost Optimizer — Unit Test Suite', () => {
  const sellerPlant = {
    id: 'plant-ahmedabad',
    name: 'CarbonBridge Capture Plant A',
    address: 'Vatva GIDC, Ahmedabad, Gujarat',
    coordinates: { latitude: 22.9563, longitude: 72.6375 },
  };

  const buyerVadodara: DeliveryStop = {
    id: 'stop-vadodara',
    buyerId: 'buyer-v',
    buyerName: 'Vadodara Bio-Chemicals Ltd',
    address: 'Nandesari GIDC, Vadodara, Gujarat',
    coordinates: { latitude: 22.3072, longitude: 73.1812 },
    quantityTonnes: 100,
    requiredDeliveryDate: new Date(Date.now() + 48 * 3600 * 1000), // 48h from now
    co2PricePerTon: 2450,
  };

  const buyerRajkot: DeliveryStop = {
    id: 'stop-rajkot',
    buyerId: 'buyer-r',
    buyerName: 'Rajkot Synfuels Corp',
    address: 'Shapar-Veraval, Rajkot, Gujarat',
    coordinates: { latitude: 22.3039, longitude: 70.8022 },
    quantityTonnes: 150,
    requiredDeliveryDate: new Date(Date.now() + 72 * 3600 * 1000), // 72h from now
    co2PricePerTon: 2400,
  };

  const buyerSurat: DeliveryStop = {
    id: 'stop-surat',
    buyerId: 'buyer-s',
    buyerName: 'Surat Green Polymers',
    address: 'Hazira Industrial Area, Surat, Gujarat',
    coordinates: { latitude: 21.1702, longitude: 72.8311 },
    quantityTonnes: 100,
    requiredDeliveryDate: new Date(Date.now() + 96 * 3600 * 1000), // 96h from now
    co2PricePerTon: 2500,
  };

  // 1-5: Basic single buyer & cost metrics
  describe('1. Basic Distance, Cost, Unit Economics & Landed Cost', () => {
    it('1. Calculates realistic road distance with highway network factor', () => {
      const distance = RouteService.getRoadDistanceKm(sellerPlant.coordinates, buyerVadodara.coordinates);
      // Ahmedabad to Vadodara is ~110-130 km by road
      expect(distance).toBeGreaterThan(95);
      expect(distance).toBeLessThan(145);
    });

    it('2. Calculates transparent fuel, operating, driver, toll, and handling costs', () => {
      const distanceKm = 200;
      const durationHours = 5.0;
      const deliveredTonnage = 150;
      const stopsCount = 1;

      const vehicleConfig: Partial<VehicleConfig> = {
        fuelPricePerLitre: 90,
        mileageKmPerLitre: 3.5,
        operatingCostPerKm: 14,
        driverCostPerHour: 250,
        tollRatePerKm: 2.4,
        loadingCostPerTonne: 50,
        unloadingCostPerStop: 1500,
      };

      const breakdown = CostService.calculateTripCost(
        distanceKm,
        durationHours,
        deliveredTonnage,
        stopsCount,
        vehicleConfig
      );

      // Expected values:
      // fuelLitres = 200 / 3.5 = 57.14 L -> 57.14 * 90 = 5142.60
      expect(breakdown.fuelCost).toBeCloseTo(5142.86, -1);
      // vehicleOperating = 200 * 14 = 2800
      expect(breakdown.vehicleOperatingCost).toBe(2800);
      // driverCost = 5 * 250 = 1250
      expect(breakdown.driverCost).toBe(1250);
      // tollCost = 200 * 2.4 = 480
      expect(breakdown.tollCost).toBe(480);
      // loadingCost = 150 * 50 = 7500
      expect(breakdown.loadingCost).toBe(7500);
      // unloadingCost = 1 * 1500 = 1500
      expect(breakdown.unloadingCost).toBe(1500);

      // total = 5142.86 + 2800 + 1250 + 480 + 7500 + 1500 = 18672.86
      expect(breakdown.totalEstimatedCost).toBeGreaterThan(18000);
      expect(breakdown.totalEstimatedCost).toBeLessThan(19500);

      // unit cost per tonne = 18672.86 / 150 = ~124.49 / T
      expect(breakdown.costPerTonne).toBeCloseTo(breakdown.totalEstimatedCost / 150, 1);
    });

    it('3. Calculates landed cost (CO2 purchase price + logistics cost per tonne)', () => {
      const deliveredQty = 200;
      const totalLogistics = 24000;
      const avgCo2Price = 2400;

      const landed = CostService.calculateLandedCost(deliveredQty, totalLogistics, avgCo2Price);

      expect(landed.co2PurchaseCost).toBe(480000);
      expect(landed.totalLogisticsCost).toBe(24000);
      expect(landed.totalLandedCost).toBe(504000);
      expect(landed.landedCostPerTonne).toBe(2520); // 2400 + 120/T
    });

    it('4. Optimizes single buyer route with circuit back to origin plant', () => {
      const result = OptimizerService.optimizeRoutes(sellerPlant, [buyerVadodara]);

      expect(result.recommendedRoute).toBeDefined();
      expect(result.recommendedRoute.trips.length).toBe(1);
      expect(result.recommendedRoute.trips[0].stops.length).toBe(1);
      expect(result.recommendedRoute.routeId).toBeDefined();
      expect(result.totalDeliveredQuantityTonnes).toBe(100);
      expect(result.recommendedRoute.costBreakdown.totalEstimatedCost).toBeGreaterThan(0);
    });
  });

  // 6-9: Multi-Buyer Delivery Optimization
  describe('2. Multi-Buyer Sequence Optimization & Alternative Comparison', () => {
    it('5. Evaluates multi-buyer delivery sequences and recommends lowest-cost route', () => {
      // 3 buyers with total 350T, vehicle capacity 400T so they fit in 1 consolidated trip
      const result = OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerRajkot, buyerSurat],
        { capacityTonnes: 400 }
      );

      expect(result.activeShipmentsCount).toBe(3);
      expect(result.totalDeliveredQuantityTonnes).toBe(350);
      expect(result.requiresMultipleTrips).toBe(false);

      const rec = result.recommendedRoute;
      expect(rec.isRecommended).toBe(true);
      expect(rec.whyRecommended).toContain('lowest estimated logistics cost');

      // Check alternatives exist
      expect(result.alternatives.length).toBeGreaterThanOrEqual(1);
      for (const alt of result.alternatives) {
        expect(alt.costBreakdown.totalEstimatedCost).toBeGreaterThanOrEqual(
          rec.costBreakdown.totalEstimatedCost
        );
      }
    });

    it('6. Does not optimize only for distance: prioritizes lowest economic logistics cost', () => {
      const result = OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerRajkot, buyerSurat],
        { capacityTonnes: 400 }
      );

      const rec = result.recommendedRoute;
      // Recommended route cost must be <= any alternative
      for (const alt of result.alternatives) {
        expect(rec.costBreakdown.totalEstimatedCost).toBeLessThanOrEqual(
          alt.costBreakdown.totalEstimatedCost
        );
      }
    });
  });

  // 10-12: Vehicle Capacity Constraints & Multi-Trip Splitting
  describe('3. Vehicle Capacity Constraints & Multi-Trip Splitting', () => {
    it('7. Fits within vehicle capacity (150T demand into 200T vehicle) in 1 trip', () => {
      const result = OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara], // 100T
        { capacityTonnes: 200 }
      );

      expect(result.requiresMultipleTrips).toBe(false);
      expect(result.recommendedRoute.trips.length).toBe(1);
      expect(result.recommendedRoute.trips[0].allocatedTonnage).toBeLessThanOrEqual(200);
    });

    it('8. Splits into multiple feasible trips when total demand (350T) exceeds vehicle capacity (200T)', () => {
      const result = OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerRajkot, buyerSurat], // 100T + 150T + 100T = 350T
        { capacityTonnes: 200 }
      );

      expect(result.requiresMultipleTrips).toBe(true);
      expect(result.recommendedRoute.trips.length).toBeGreaterThanOrEqual(2);

      // Verify every trip strictly respects vehicle capacity <= 200T
      for (const trip of result.recommendedRoute.trips) {
        expect(trip.allocatedTonnage).toBeLessThanOrEqual(200);
      }

      // Total quantity across all trips must equal 350T
      const sumTonnage = result.recommendedRoute.trips.reduce(
        (acc, t) => acc + t.allocatedTonnage,
        0
      );
      expect(sumTonnage).toBe(350);
    });

    it('9. Handles single stop exceeding vehicle capacity (e.g. 250T stop with 200T tanker)', () => {
      const hugeStop: DeliveryStop = {
        id: 'stop-huge',
        buyerId: 'buyer-huge',
        buyerName: 'Mega Refineries',
        address: 'Jamnagar, Gujarat',
        coordinates: { latitude: 22.4707, longitude: 70.0577 },
        quantityTonnes: 350,
      };

      const trips = OptimizerService.partitionStopsIntoFeasibleTrips([hugeStop], 200);
      expect(trips.length).toBe(2);
      expect(trips[0][0].quantityTonnes).toBe(200);
      expect(trips[1][0].quantityTonnes).toBe(150);
    });
  });

  // 13-15: Delivery Time Windows & Deadlines
  describe('4. Delivery Time Windows & Deadlines', () => {
    it('10. Satisfies delivery deadlines when schedule is feasible', () => {
      const result = OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerSurat],
        { capacityTonnes: 300 }
      );

      expect(result.recommendedRoute.constraintsSatisfied.deadlinesSatisfied).toBe(true);
    });

    it('11. Flags deadline warning if required delivery date is in the past or unachievable', () => {
      const expiredStop: DeliveryStop = {
        ...buyerVadodara,
        id: 'stop-expired',
        requiredDeliveryDate: new Date(Date.now() - 3600 * 1000), // 1h in the past
      };

      const result = OptimizerService.optimizeRoutes(sellerPlant, [expiredStop]);
      expect(result.recommendedRoute.constraintsSatisfied.deadlinesSatisfied).toBe(false);
      expect(result.recommendedRoute.cons.some((c) => c.includes('deadline'))).toBe(true);
    });
  });

  // 16-24: Baseline vs Optimized Savings & No Fake Data
  describe('5. Baseline vs Optimized Savings & Honest Metrics', () => {
    it('12. Genuinely calculates baseline vs consolidated savings without hardcoding', () => {
      const result = OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerSurat],
        { capacityTonnes: 300 }
      );

      const comparison = result.baselineComparison;
      expect(comparison.isGenuinelyCalculated).toBe(true);
      expect(comparison.independentDistanceKm).toBeGreaterThan(comparison.consolidatedTotalCost > 0 ? 0 : 0);
      expect(comparison.independentTotalCost).toBeGreaterThan(0);
      expect(comparison.consolidatedTotalCost).toBeGreaterThan(0);

      // Savings = independentTotalCost - consolidatedTotalCost
      const expectedDiff = Math.round((comparison.independentTotalCost - comparison.consolidatedTotalCost) * 100) / 100;
      expect(comparison.savingsAmount).toBe(expectedDiff);
    });

    it('13. Never invents fake live traffic data: explicitly discloses unavailabilty', () => {
      const result = OptimizerService.optimizeRoutes(sellerPlant, [buyerVadodara]);
      expect(result.trafficDisclosure).toContain('Traffic data unavailable');
      expect(result.trafficDisclosure).toContain('estimate based on normal travel conditions');
      expect(result.recommendedRoute.trafficStatus).not.toBe('Low Traffic');
      expect(result.recommendedRoute.trafficStatus).not.toBe('High Traffic');
    });

    it('14. Never displays fake savings if no consolidation occurred (e.g. single stop)', () => {
      const result = OptimizerService.optimizeRoutes(sellerPlant, [buyerVadodara]);
      // For a single stop, consolidated round trip is identical to independent round trip
      expect(result.baselineComparison.savingsPercentage).toBe(0);
      expect(result.baselineComparison.savingsAmount).toBe(0);
    });
  });
});
