import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CostService } from '../../src/modules/logistics/cost.service.js';
import { RouteService } from '../../src/modules/logistics/route.service.js';
import { OptimizerService } from '../../src/modules/logistics/optimizer.service.js';
import { DeliveryStop, VehicleConfig } from '../../src/modules/logistics/types.js';

describe('Smart Logistics — Cost Consistency & Multi-Trip Audit Suite', () => {
  const sellerPlantDahej = {
    id: 'plant-dahej',
    name: 'Dahej PCPIR Cryogenic Depot',
    address: 'Dahej PCPIR, Bharuch, Gujarat',
    coordinates: { latitude: 21.7051, longitude: 72.5855 },
  };

  const buyerVadodara: DeliveryStop = {
    id: 'demo-vadodara',
    buyerId: 'demo-vadodara',
    buyerName: 'Vadodara Bio-Chemicals Ltd',
    address: 'Nandesari GIDC, Vadodara, Gujarat',
    coordinates: { latitude: 22.3072, longitude: 73.1812 },
    quantityTonnes: 100,
    requiredDeliveryDate: new Date(Date.now() + 48 * 3600 * 1000).toISOString(),
    co2PricePerTon: 2400,
  };

  const buyerRajkot: DeliveryStop = {
    id: 'demo-rajkot',
    buyerId: 'demo-rajkot',
    buyerName: 'Rajkot Synfuels Corp',
    address: 'Shapar-Veraval, Rajkot, Gujarat',
    coordinates: { latitude: 22.3039, longitude: 70.8022 },
    quantityTonnes: 150,
    requiredDeliveryDate: new Date(Date.now() + 72 * 3600 * 1000).toISOString(),
    co2PricePerTon: 2450,
  };

  const buyerSurat: DeliveryStop = {
    id: 'demo-surat',
    buyerId: 'demo-surat',
    buyerName: 'Surat Green Polymers',
    address: 'Hazira Industrial Area, Surat, Gujarat',
    coordinates: { latitude: 21.1702, longitude: 72.8311 },
    quantityTonnes: 100,
    requiredDeliveryDate: new Date(Date.now() + 96 * 3600 * 1000).toISOString(),
    co2PricePerTon: 2480,
  };

  const demoStops = [buyerVadodara, buyerRajkot, buyerSurat];

  beforeEach(() => {
    RouteService.clearCache();
    RouteService.setMockRoutingHandler(null);
  });

  afterEach(() => {
    RouteService.clearCache();
    RouteService.setMockRoutingHandler(null);
  });

  // Test 1: 350T with 200T vehicle requires at least 2 trips
  it('1. 350T total demand with 200T vehicle capacity strictly requires at least 2 trips', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    expect(result.totalDeliveredQuantityTonnes).toBe(350);
    expect(result.vehicleCapacityTonnes).toBe(200);
    expect(result.requiresMultipleTrips).toBe(true);
    expect(result.recommendedRoute.trips.length).toBeGreaterThanOrEqual(2);

    for (const trip of result.recommendedRoute.trips) {
      expect(trip.allocatedTonnage).toBeLessThanOrEqual(200);
    }
  });

  // Test 2: Total distance includes all trips
  it('2. Total distance strictly equals the sum of distances across all individual trips', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    const sumDistance = result.recommendedRoute.trips.reduce(
      (sum, t) => sum + t.totalDistanceKm,
      0
    );
    expect(result.recommendedRoute.totalDistanceKm).toBe(
      Math.round(sumDistance * 100) / 100
    );
  });

  // Test 3: Total logistics cost includes all trips
  it('3. Total logistics cost strictly equals the sum of trip costs across all individual trips', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    const sumTripCost = result.recommendedRoute.trips.reduce(
      (sum, t) => sum + t.costBreakdown.totalEstimatedCost,
      0
    );
    expect(result.recommendedRoute.costBreakdown.totalEstimatedCost).toBe(
      Math.round(sumTripCost * 100) / 100
    );
  });

  // Test 4: Cost per tonne equals total cost / total quantity
  it('4. Cost per tonne strictly equals total logistics cost divided by total transported tonnes', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    const rec = result.recommendedRoute;
    const expectedCostPerTonne = Math.round((rec.costBreakdown.totalEstimatedCost / 350) * 100) / 100;
    expect(rec.costBreakdown.costPerTonne).toBe(expectedCostPerTonne);
  });

  // Test 5: Baseline and optimized costs are independently calculated
  it('5. Baseline and optimized costs are calculated from their own respective road routes', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    const comp = result.baselineComparison;
    expect(comp.isGenuinelyCalculated).toBe(true);
    expect(comp.independentTripsCount).toBe(3); // 3 separate buyer dispatches
    expect(comp.consolidatedTripsCount).toBe(result.recommendedRoute.trips.length);
    expect(comp.independentDistanceKm).toBeGreaterThan(0);
    expect(comp.independentTotalCost).toBeGreaterThan(0);
    expect(comp.consolidatedTotalCost).toBe(result.recommendedRoute.costBreakdown.totalEstimatedCost);
  });

  // Test 6: Savings = baseline - optimized
  it('6. Savings amount strictly equals baseline cost minus optimized cost (clamped to 0)', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    const comp = result.baselineComparison;
    const expectedSavings = Math.round(
      Math.max(0, comp.independentTotalCost - comp.consolidatedTotalCost) * 100
    ) / 100;
    expect(comp.savingsAmount).toBe(expectedSavings);
  });

  // Test 7: Savings percentage is mathematically correct
  it('7. Savings percentage strictly equals (savings / baseline) * 100', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    const comp = result.baselineComparison;
    if (comp.independentTotalCost > 0) {
      const expectedPct = Math.round((comp.savingsAmount / comp.independentTotalCost) * 10000) / 100;
      expect(comp.savingsPercentage).toBe(expectedPct);
    }
  });

  // Test 8: Zero savings is allowed when costs are equal (single stop)
  it('8. Single shipment produces exactly zero savings without inventing fake discounts', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      [buyerVadodara], // 1 stop, 100T <= 200T
      { capacityTonnes: 200 }
    );

    const comp = result.baselineComparison;
    expect(comp.independentTripsCount).toBe(1);
    expect(comp.consolidatedTripsCount).toBe(1);
    expect(comp.independentTotalCost).toBe(comp.consolidatedTotalCost);
    expect(comp.savingsAmount).toBe(0);
    expect(comp.savingsPercentage).toBe(0);
    expect(comp.distanceSavedKm).toBe(0);
  });

  // Test 9: Independent round trips properly respect vehicle capacity if a single stop exceeds capacity
  it('9. Large single stop exceeding capacity (350T with 200T vehicle) creates multiple independent dispatches', async () => {
    const hugeStop: DeliveryStop = {
      ...buyerVadodara,
      quantityTonnes: 350,
    };

    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      [hugeStop],
      { capacityTonnes: 200 }
    );

    // Baseline must have 2 trips: 200T + 150T
    expect(result.baselineComparison.independentTripsCount).toBe(2);
    expect(result.recommendedRoute.trips.length).toBe(2);
    expect(result.baselineComparison.independentTotalCost).toBe(
      result.recommendedRoute.costBreakdown.totalEstimatedCost
    );
  });

  // Test 10: Multi-trip cost breakdown components match the sum of component charges
  it('10. Multi-trip cost breakdown components (fuel, operating, driver, toll, loading, unloading) match exact total', async () => {
    const result = await OptimizerService.optimizeRoutes(
      sellerPlantDahej,
      demoStops,
      { capacityTonnes: 200 }
    );

    const cb = result.recommendedRoute.costBreakdown;
    const componentSum = Math.round(
      (cb.fuelCost +
        cb.vehicleOperatingCost +
        cb.driverCost +
        cb.tollCost +
        cb.loadingCost +
        cb.unloadingCost) * 100
    ) / 100;

    expect(cb.totalEstimatedCost).toBe(componentSum);

    // Verify loading cost is exactly delivered tonnes * 50
    expect(cb.loadingCost).toBe(350 * 50); // 17,500
    // Verify unloading cost is exactly 3 drops * 1500
    expect(cb.unloadingCost).toBe(3 * 1500); // 4,500
  });
});
