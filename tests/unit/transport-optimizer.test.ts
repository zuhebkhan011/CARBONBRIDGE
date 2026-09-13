import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CostService } from '../../src/modules/logistics/cost.service.js';
import { RouteService } from '../../src/modules/logistics/route.service.js';
import { OptimizerService } from '../../src/modules/logistics/optimizer.service.js';
import { DeliveryStop, VehicleConfig } from '../../src/modules/logistics/types.js';

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

  beforeEach(() => {
    RouteService.clearCache();
    RouteService.setMockRoutingHandler(null);
  });

  afterEach(() => {
    RouteService.clearCache();
    RouteService.setMockRoutingHandler(null);
  });

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

    it('4. Optimizes single buyer route with circuit back to origin plant', async () => {
      const result = await OptimizerService.optimizeRoutes(sellerPlant, [buyerVadodara]);

      expect(result.recommendedRoute).toBeDefined();
      expect(result.recommendedRoute.trips.length).toBe(1);
      expect(result.recommendedRoute.trips[0].stops.length).toBe(1);
      expect(result.recommendedRoute.routeId).toBeDefined();
      expect(result.totalDeliveredQuantityTonnes).toBe(100);
      expect(result.recommendedRoute.costBreakdown.totalEstimatedCost).toBeGreaterThan(0);
      expect(result.recommendedRoute.isRoadRoute).toBe(true);
      expect(result.recommendedRoute.geometry.length).toBeGreaterThan(1);
    });
  });

  // 6-9: Multi-Buyer Delivery Optimization
  describe('2. Multi-Buyer Sequence Optimization & Alternative Comparison', () => {
    it('5. Evaluates multi-buyer delivery sequences and recommends lowest-cost route', async () => {
      // 3 buyers with total 350T, vehicle capacity 400T so they fit in 1 consolidated trip
      const result = await OptimizerService.optimizeRoutes(
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

    it('6. Does not optimize only for distance: prioritizes lowest economic logistics cost', async () => {
      const result = await OptimizerService.optimizeRoutes(
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
    it('7. Fits within vehicle capacity (150T demand into 200T vehicle) in 1 trip', async () => {
      const result = await OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara], // 100T
        { capacityTonnes: 200 }
      );

      expect(result.requiresMultipleTrips).toBe(false);
      expect(result.recommendedRoute.trips.length).toBe(1);
      expect(result.recommendedRoute.trips[0].allocatedTonnage).toBeLessThanOrEqual(200);
    });

    it('8. Splits into multiple feasible trips when total demand (350T) exceeds vehicle capacity (200T)', async () => {
      const result = await OptimizerService.optimizeRoutes(
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
    it('10. Satisfies delivery deadlines when schedule is feasible', async () => {
      const result = await OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerSurat],
        { capacityTonnes: 300 }
      );

      expect(result.recommendedRoute.constraintsSatisfied.deadlinesSatisfied).toBe(true);
    });

    it('11. Flags deadline warning if required delivery date is in the past or unachievable', async () => {
      const expiredStop: DeliveryStop = {
        ...buyerVadodara,
        id: 'stop-expired',
        requiredDeliveryDate: new Date(Date.now() - 3600 * 1000), // 1h in the past
      };

      const result = await OptimizerService.optimizeRoutes(sellerPlant, [expiredStop]);
      expect(result.recommendedRoute.constraintsSatisfied.deadlinesSatisfied).toBe(false);
      expect(result.recommendedRoute.cons.some((c) => c.includes('deadline'))).toBe(true);
    });
  });

  // 16-24: Baseline vs Optimized Savings & No Fake Data
  describe('5. Baseline vs Optimized Savings & Honest Metrics', () => {
    it('12. Genuinely calculates baseline vs consolidated savings without hardcoding', async () => {
      const result = await OptimizerService.optimizeRoutes(
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

    it('13. Never invents fake live traffic data: explicitly discloses unavailabilty', async () => {
      const result = await OptimizerService.optimizeRoutes(sellerPlant, [buyerVadodara]);
      expect(result.trafficDisclosure).toContain('Traffic data unavailable');
      expect(result.trafficDisclosure).toContain('estimate based on normal travel conditions');
      expect(result.recommendedRoute.trafficStatus).not.toBe('Low Traffic');
      expect(result.recommendedRoute.trafficStatus).not.toBe('High Traffic');
    });

    it('14. Never displays fake savings if no consolidation occurred (e.g. single stop)', async () => {
      const result = await OptimizerService.optimizeRoutes(sellerPlant, [buyerVadodara]);
      // For a single stop, consolidated round trip is identical to independent round trip
      expect(result.baselineComparison.savingsPercentage).toBe(0);
      expect(result.baselineComparison.savingsAmount).toBe(0);
    });
  });

  // 15-24: Real Road Network Routing & OSRM Road Geometry (10 Requirements)
  describe('6. Real Road Network Routing, Geometry & Cost Consistency', () => {
    it('15. Routing provider returns actual road geometry (GeoJSON LineString + high-density Leaflet coordinates)', async () => {
      const circuit = await RouteService.getRoadRouteCircuit(
        sellerPlant.coordinates,
        [buyerVadodara]
      );

      expect(circuit.isRoadRoute).toBe(true);
      expect(circuit.routeType).toBe('ROAD_NETWORK');
      expect(circuit.routeStatus).toBe('OPTIMAL_ROAD_ROUTE');
      expect(circuit.routingProvider).toBe('OSRM');

      // GeoJSON LineString check
      expect(circuit.geoJsonGeometry).toBeDefined();
      expect(circuit.geoJsonGeometry.type).toBe('LineString');
      expect(Array.isArray(circuit.geoJsonGeometry.coordinates)).toBe(true);
      // High-density road coordinates along Ahmedabad-Vadodara Expressway / NH48
      expect(circuit.geoJsonGeometry.coordinates.length).toBeGreaterThan(100);

      // Leaflet coordinates check ([lat, lng][])
      expect(circuit.geometry.length).toBe(circuit.geoJsonGeometry.coordinates.length);
      const firstCoord = circuit.geometry[0];
      expect(firstCoord[0]).toBeCloseTo(sellerPlant.coordinates.latitude, 1);
      expect(firstCoord[1]).toBeCloseTo(sellerPlant.coordinates.longitude, 1);
    });

    it('16. Route distance and duration come directly from road route', async () => {
      const circuit = await RouteService.getRoadRouteCircuit(
        sellerPlant.coordinates,
        [buyerVadodara]
      );

      // Ahmedabad to Vadodara and back via NH48 is ~200-240 km road distance
      expect(circuit.totalDistanceKm).toBeGreaterThan(180);
      expect(circuit.totalDistanceKm).toBeLessThan(260);

      // Duration should be driving time + 1.0 hr offload handling
      expect(circuit.totalDurationHours).toBeGreaterThan(2.5);
      expect(circuit.totalDurationHours).toBeLessThan(6.0);
    });

    it('17. Multi-stop geometry is a continuous closed circuit connecting all waypoints', async () => {
      const circuit = await RouteService.getRoadRouteCircuit(
        sellerPlant.coordinates,
        [buyerVadodara, buyerRajkot, buyerSurat]
      );

      expect(circuit.isRoadRoute).toBe(true);
      expect(circuit.legs.length).toBe(4); // S -> Vadodara -> Rajkot -> Surat -> S
      expect(circuit.geometry.length).toBeGreaterThan(1000); // Dense road network coordinates

      // Verify each leg has its own continuous road geometry
      for (const leg of circuit.legs) {
        expect(leg.geometry).toBeDefined();
        expect(leg.geometry!.length).toBeGreaterThan(50);
        expect(leg.distanceKm).toBeGreaterThan(0);
        expect(leg.durationHours).toBeGreaterThan(0);
      }
    });

    it('18. Optimizer stop order is preserved in the circuit itinerary', async () => {
      const result = await OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerRajkot],
        { capacityTonnes: 300 }
      );

      const rec = result.recommendedRoute;
      const sequence = rec.trips[0].routeSequence;
      expect(sequence[0]).toContain('Origin:');
      expect(sequence[sequence.length - 1]).toContain('Return:');
      expect(sequence.length).toBe(4); // Origin, Stop 1, Stop 2, Return
    });

    it('19. Selected route geometry is returned correctly on candidate objects', async () => {
      const result = await OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerSurat],
        { capacityTonnes: 300 }
      );

      const rec = result.recommendedRoute;
      expect(rec.geometry).toBeDefined();
      expect(rec.geometry.length).toBeGreaterThan(100);
      expect(rec.isRoadRoute).toBe(true);
      expect(rec.routeType).toBe('ROAD_NETWORK');
      expect(rec.routingProvider).toBe('OSRM');
    });

    it('20. Routing API failure is handled gracefully with explicit non-road metadata', async () => {
      // Mock failure handler simulating offline or network error
      RouteService.setMockRoutingHandler(async () => {
        throw new Error('Simulated network timeout');
      });

      const result = await OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara],
        { capacityTonnes: 200 }
      );

      const rec = result.recommendedRoute;
      expect(rec.isRoadRoute).toBe(false);
      expect(rec.routeType).toBe('STRAIGHT_LINE_APPROXIMATION');
      expect(rec.routeStatus).toBe('ROAD_ROUTE_UNAVAILABLE');
      expect(rec.routingProvider).toBe('FALLBACK_DIRECT');

      // Even with fallback, cost breakdown and trips must exist safely
      expect(rec.costBreakdown.totalEstimatedCost).toBeGreaterThan(0);
      expect(rec.geometry.length).toBeGreaterThanOrEqual(2);
    });

    it('21. No fake straight-line route is ever labeled as a road route', async () => {
      RouteService.setMockRoutingHandler(async () => {
        return { code: 'NoRoute', message: 'No road route found' };
      });

      const circuit = await RouteService.getRoadRouteCircuit(
        sellerPlant.coordinates,
        [buyerVadodara]
      );

      // Must be flagged as non-road approximation
      expect(circuit.isRoadRoute).toBe(false);
      expect(circuit.routeType).not.toBe('ROAD_NETWORK');
      expect(circuit.routeStatus).toBe('ROAD_ROUTE_UNAVAILABLE');
    });

    it('22. Transportation cost calculation strictly uses the selected road route distance and duration', async () => {
      const result = await OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara],
        { capacityTonnes: 200 }
      );

      const rec = result.recommendedRoute;
      const trip = rec.trips[0];

      // Verify exact consistency:
      // Fuel cost must be derived from the exact same road distance
      const expectedFuelLitres = Math.round((rec.totalDistanceKm / 3.5) * 100) / 100;
      const expectedFuelCost = Math.round(expectedFuelLitres * 92.5 * 100) / 100;
      expect(rec.costBreakdown.fuelCost).toBe(expectedFuelCost);

      // Vehicle operating cost = distanceKm * 14
      const expectedOperating = Math.round(rec.totalDistanceKm * 14 * 100) / 100;
      expect(rec.costBreakdown.vehicleOperatingCost).toBe(expectedOperating);

      // Toll cost = distanceKm * 2.4
      const expectedToll = Math.round(rec.totalDistanceKm * 2.4 * 100) / 100;
      expect(rec.costBreakdown.tollCost).toBe(expectedToll);

      // Trip distance must equal candidate total distance
      expect(trip.totalDistanceKm).toBe(rec.totalDistanceKm);
      expect(trip.totalDurationHours).toBe(rec.totalDurationHours);
    });

    it('23. Route alternatives each have their own road geometry and metrics', async () => {
      const result = await OptimizerService.optimizeRoutes(
        sellerPlant,
        [buyerVadodara, buyerRajkot, buyerSurat],
        { capacityTonnes: 400 }
      );

      expect(result.alternatives.length).toBeGreaterThanOrEqual(1);
      for (const alt of result.alternatives) {
        expect(alt.geometry).toBeDefined();
        expect(alt.geometry.length).toBeGreaterThan(100);
        expect(alt.isRoadRoute).toBe(true);
        expect(alt.totalDistanceKm).toBeGreaterThan(0);
        expect(alt.costBreakdown.totalEstimatedCost).toBeGreaterThan(0);
      }
    });
  });
});
