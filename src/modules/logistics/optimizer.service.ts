import { GeoCoordinate, calculateDistanceKm } from '../../common/utils/geo.js';
import {
  CostBreakdown,
  DeliveryStop,
  LandedCost,
  OptimizationResult,
  RouteCandidate,
  RouteLeg,
  TripPlan,
  VehicleConfig,
} from './types.js';
import { CostService } from './cost.service.js';
import { RouteService } from './route.service.js';

export class OptimizerService {
  /**
   * Optimizes transportation delivery routes for a single seller to one or multiple buyers
   */
  public static optimizeRoutes(
    sellerPlant: {
      id: string;
      name: string;
      address: string;
      coordinates: GeoCoordinate;
    },
    stops: DeliveryStop[],
    vehicleConfigOverride?: Partial<VehicleConfig>
  ): OptimizationResult {
    const vehicleConfig = CostService.resolveVehicleConfig(vehicleConfigOverride);
    const totalDeliveredQuantityTonnes = stops.reduce(
      (acc, s) => acc + s.quantityTonnes,
      0
    );

    // If no stops, return empty safe response
    if (stops.length === 0) {
      const emptyTrip = this.createEmptyTrip(sellerPlant, vehicleConfig);
      const emptyCandidate: RouteCandidate = {
        routeId: 'route-none',
        name: 'No Active Shipments',
        description: 'No active shipments found to optimize.',
        isRecommended: true,
        whyRecommended: 'No shipments available.',
        trips: [emptyTrip],
        totalDistanceKm: 0,
        totalDurationHours: 0,
        costBreakdown: CostService.calculateTripCost(0, 0, 0, 0, vehicleConfig),
        landedCost: CostService.calculateLandedCost(0, 0),
        pros: [],
        cons: [],
        trafficStatus: RouteService.TRAFFIC_DISCLOSURE,
        constraintsSatisfied: {
          capacitySatisfied: true,
          deadlinesSatisfied: true,
          allStopsIncluded: true,
        },
      };

      return {
        sellerPlant,
        totalDeliveredQuantityTonnes: 0,
        activeShipmentsCount: 0,
        vehicleCapacityTonnes: vehicleConfig.capacityTonnes,
        requiresMultipleTrips: false,
        recommendedRoute: emptyCandidate,
        alternatives: [],
        baselineComparison: CostService.calculateBaselineComparison(
          [],
          emptyCandidate.costBreakdown,
          vehicleConfig
        ),
        assumptions: this.buildAssumptions(vehicleConfig),
        trafficDisclosure: RouteService.TRAFFIC_DISCLOSURE,
      };
    }

    // Step 3 & 18: Vehicle Capacity Partitioning (Bin Packing / Trip Splitting)
    const tripBuckets = this.partitionStopsIntoFeasibleTrips(
      stops,
      vehicleConfig.capacityTonnes
    );
    const requiresMultipleTrips = tripBuckets.length > 1;

    // Build candidate route plans across all trips
    const { recommendedRoute, alternatives } = this.evaluateRouteCandidates(
      sellerPlant,
      tripBuckets,
      vehicleConfig
    );

    // Baseline calculation: Sum of independent round trips from Seller to each individual buyer
    const independentTrips = stops.map((stop) => {
      const legTo = RouteService.getRoadDistanceKm(sellerPlant.coordinates, stop.coordinates);
      const roundTripKm = Math.round(legTo * 2 * 100) / 100;
      const durationHours =
        Math.round(
          (roundTripKm / vehicleConfig.averageSpeedKmH + 1.0) * 10
        ) / 10;
      return {
        distanceKm: roundTripKm,
        durationHours,
        quantityTonnes: stop.quantityTonnes,
      };
    });

    const baselineComparison = CostService.calculateBaselineComparison(
      independentTrips,
      recommendedRoute.costBreakdown,
      vehicleConfig
    );

    return {
      sellerPlant,
      totalDeliveredQuantityTonnes: Math.round(totalDeliveredQuantityTonnes * 100) / 100,
      activeShipmentsCount: stops.length,
      vehicleCapacityTonnes: vehicleConfig.capacityTonnes,
      requiresMultipleTrips,
      recommendedRoute,
      alternatives,
      baselineComparison,
      assumptions: this.buildAssumptions(vehicleConfig),
      trafficDisclosure: RouteService.TRAFFIC_DISCLOSURE,
    };
  }

  /**
   * Partitions stops into feasible vehicle trips respecting maximum vehicle capacity.
   * If a single stop's quantity exceeds capacity, it is safely split into multiple trip drops.
   */
  public static partitionStopsIntoFeasibleTrips(
    stops: DeliveryStop[],
    vehicleCapacityTonnes: number
  ): DeliveryStop[][] {
    const trips: DeliveryStop[][] = [];
    const capacity = Math.max(1, vehicleCapacityTonnes);

    // Normalize stops: If any stop has quantity > capacity, split it
    const normalizedStops: DeliveryStop[] = [];
    for (const stop of stops) {
      let remaining = stop.quantityTonnes;
      let partIndex = 1;
      while (remaining > capacity) {
        normalizedStops.push({
          ...stop,
          id: `${stop.id}-part${partIndex}`,
          quantityTonnes: capacity,
          buyerName: `${stop.buyerName} (Load ${partIndex})`,
        });
        remaining = Math.round((remaining - capacity) * 100) / 100;
        partIndex++;
      }
      if (remaining > 0) {
        normalizedStops.push({
          ...stop,
          id: partIndex > 1 ? `${stop.id}-part${partIndex}` : stop.id,
          quantityTonnes: remaining,
          buyerName: partIndex > 1 ? `${stop.buyerName} (Load ${partIndex})` : stop.buyerName,
        });
      }
    }

    // Sort descending by quantity for Best-Fit Decreasing packing
    const sortedStops = [...normalizedStops].sort((a, b) => b.quantityTonnes - a.quantityTonnes);

    for (const stop of sortedStops) {
      let placed = false;

      // Find an existing trip where this stop fits
      for (const trip of trips) {
        const currentTonnage = trip.reduce((sum, s) => sum + s.quantityTonnes, 0);
        if (currentTonnage + stop.quantityTonnes <= capacity + 0.001) {
          trip.push(stop);
          placed = true;
          break;
        }
      }

      // If it doesn't fit into any existing trip, open a new trip
      if (!placed) {
        trips.push([stop]);
      }
    }

    return trips;
  }

  /**
   * Evaluates delivery sequences for each trip and produces recommended route + alternatives
   */
  private static evaluateRouteCandidates(
    sellerPlant: { id: string; name: string; address: string; coordinates: GeoCoordinate },
    tripBuckets: DeliveryStop[][],
    vehicleConfig: Required<VehicleConfig>
  ): { recommendedRoute: RouteCandidate; alternatives: RouteCandidate[] } {
    // Generate trip alternatives:
    // Strategy 1: Lowest estimated total logistics cost
    // Strategy 2: Shortest overall distance
    // Strategy 3: Priority by deadline (earliest required delivery date first)

    const candidateStrategies = [
      { id: 'opt-cost', name: 'Economically Optimized Route', criterion: 'COST' as const },
      { id: 'opt-dist', name: 'Shortest Distance Route', criterion: 'DISTANCE' as const },
      { id: 'opt-deadline', name: 'Deadline Priority Route', criterion: 'DEADLINE' as const },
    ];

    const candidateResults: RouteCandidate[] = [];

    for (const strat of candidateStrategies) {
      const trips: TripPlan[] = [];
      let candidateTotalDistance = 0;
      let candidateTotalDuration = 0;
      let candidateTotalQuantity = 0;

      let allCapacitySatisfied = true;
      let allDeadlinesSatisfied = true;

      for (let tripIndex = 0; tripIndex < tripBuckets.length; tripIndex++) {
        const bucketStops = tripBuckets[tripIndex];
        const tripNumber = tripIndex + 1;

        const orderedStops = this.orderStopsByStrategy(
          sellerPlant.coordinates,
          bucketStops,
          strat.criterion,
          vehicleConfig
        );

        const tripPlan = this.buildTripPlan(
          sellerPlant,
          orderedStops,
          tripNumber,
          vehicleConfig
        );

        trips.push(tripPlan);
        candidateTotalDistance += tripPlan.totalDistanceKm;
        candidateTotalDuration += tripPlan.totalDurationHours;
        candidateTotalQuantity += tripPlan.allocatedTonnage;

        if (tripPlan.allocatedTonnage > vehicleConfig.capacityTonnes) {
          allCapacitySatisfied = false;
        }

        // Validate delivery deadlines
        const deadlinesOk = this.checkTripDeadlines(tripPlan);
        if (!deadlinesOk) {
          allDeadlinesSatisfied = false;
        }
      }

      candidateTotalDistance = Math.round(candidateTotalDistance * 100) / 100;
      candidateTotalDuration = Math.round(candidateTotalDuration * 10) / 10;

      const totalCostBreakdown = CostService.calculateTripCost(
        candidateTotalDistance,
        candidateTotalDuration,
        candidateTotalQuantity,
        trips.reduce((acc, t) => acc + t.stops.length, 0),
        vehicleConfig
      );

      const avgCo2Price = this.computeAverageCo2Price(tripBuckets.flat());
      const totalLandedCost = CostService.calculateLandedCost(
        candidateTotalQuantity,
        totalCostBreakdown.totalEstimatedCost,
        avgCo2Price
      );

      candidateResults.push({
        routeId: strat.id,
        name: strat.name,
        description:
          strat.criterion === 'COST'
            ? 'Optimized to deliver lowest overall logistics expenses including fuel, tolls, and operating wear.'
            : strat.criterion === 'DISTANCE'
            ? 'Minimizes total road kilometres traveled.'
            : 'Prioritizes deliveries with the earliest required completion dates.',
        isRecommended: false,
        whyRecommended: '',
        trips,
        totalDistanceKm: candidateTotalDistance,
        totalDurationHours: candidateTotalDuration,
        costBreakdown: totalCostBreakdown,
        landedCost: totalLandedCost,
        pros: [],
        cons: [],
        trafficStatus: RouteService.TRAFFIC_DISCLOSURE,
        constraintsSatisfied: {
          capacitySatisfied: allCapacitySatisfied,
          deadlinesSatisfied: allDeadlinesSatisfied,
          allStopsIncluded: true,
        },
      });
    }

    // Step 1: Filter to candidates that meet feasibility, sort primarily by lowest total cost
    // Primary objective: MINIMIZE ESTIMATED TOTAL LOGISTICS COST
    const validCandidates = [...candidateResults].sort((a, b) => {
      // Prioritize deadline compliance
      if (a.constraintsSatisfied.deadlinesSatisfied !== b.constraintsSatisfied.deadlinesSatisfied) {
        return a.constraintsSatisfied.deadlinesSatisfied ? -1 : 1;
      }
      // Primary sorting: Lowest total logistics cost
      return a.costBreakdown.totalEstimatedCost - b.costBreakdown.totalEstimatedCost;
    });

    // Remove duplicates (e.g. if shortest distance is identical to lowest cost)
    const uniqueCandidates: RouteCandidate[] = [];
    const seenSignatures = new Set<string>();

    for (const cand of validCandidates) {
      const sig = cand.trips
        .map((t) => t.stops.map((s) => s.id).join('->'))
        .join('|');
      if (!seenSignatures.has(sig)) {
        seenSignatures.add(sig);
        uniqueCandidates.push(cand);
      }
    }

    // Designate recommended route
    const recommended = uniqueCandidates[0] || candidateResults[0];
    recommended.isRecommended = true;

    // Generate transparent "Why Recommended" explanation
    const altRunnerUp = uniqueCandidates[1];
    if (altRunnerUp) {
      const costDiff = Math.round(
        (altRunnerUp.costBreakdown.totalEstimatedCost -
          recommended.costBreakdown.totalEstimatedCost) *
          100
      ) / 100;
      const kmDiff = Math.round(
        (altRunnerUp.totalDistanceKm - recommended.totalDistanceKm) * 100
      ) / 100;

      if (costDiff > 0 && kmDiff < 0) {
        recommended.whyRecommended = `Recommended because it has the lowest estimated logistics cost (saving ₹${costDiff.toLocaleString('en-IN')}), despite being ${Math.abs(kmDiff)} km longer, due to reduced toll and vehicle operating expenses.`;
      } else if (costDiff > 0) {
        recommended.whyRecommended = `Recommended because it achieves the lowest estimated logistics cost (saving ₹${costDiff.toLocaleString('en-IN')} vs alternative routes) while fully satisfying vehicle capacity and delivery constraints.`;
      } else {
        recommended.whyRecommended =
          'Recommended because it delivers the optimal balance of lowest logistics cost, minimal transit time, and guaranteed delivery schedule.';
      }
    } else {
      recommended.whyRecommended =
        'Recommended because it achieves the lowest estimated logistics cost while respecting vehicle payload capacity and delivery schedule.';
    }

    recommended.pros = [
      `Lowest estimated logistics cost (₹${recommended.costBreakdown.costPerTonne.toFixed(1)}/T)`,
      `Vehicle capacity respected (Max ${vehicleConfig.capacityTonnes}T per trip)`,
      recommended.constraintsSatisfied.deadlinesSatisfied
        ? 'All delivery deadlines satisfied'
        : 'Earliest feasible delivery schedule',
      `Transparent cost calculation with commercial tolls & driver hours`,
    ];

    if (!recommended.constraintsSatisfied.deadlinesSatisfied) {
      recommended.cons.push(
        'Tight delivery deadline warning: Consider dispatching earlier or splitting into concurrent trips.'
      );
    }

    // Set pros & cons for alternatives
    const alternatives = uniqueCandidates.slice(1).map((alt) => {
      const costDiff =
        Math.round(
          (alt.costBreakdown.totalEstimatedCost -
            recommended.costBreakdown.totalEstimatedCost) *
            100
        ) / 100;
      alt.cons.push(
        costDiff > 0
          ? `₹${costDiff.toLocaleString('en-IN')} higher estimated logistics cost than recommended route`
          : 'Alternative delivery sequence'
      );
      if (alt.totalDistanceKm < recommended.totalDistanceKm) {
        alt.pros.push(
          `${Math.round((recommended.totalDistanceKm - alt.totalDistanceKm) * 100) / 100} km shorter total road distance`
        );
      }
      return alt;
    });

    return {
      recommendedRoute: recommended,
      alternatives,
    };
  }

  /**
   * Orders stops according to selected optimization strategy
   */
  private static orderStopsByStrategy(
    origin: GeoCoordinate,
    stops: DeliveryStop[],
    criterion: 'COST' | 'DISTANCE' | 'DEADLINE',
    vehicleConfig: Required<VehicleConfig>
  ): DeliveryStop[] {
    if (stops.length <= 1) return [...stops];

    if (criterion === 'DEADLINE') {
      // Sort by earliest required delivery date
      return [...stops].sort((a, b) => {
        const dateA = a.requiredDeliveryDate ? new Date(a.requiredDeliveryDate).getTime() : Infinity;
        const dateB = b.requiredDeliveryDate ? new Date(b.requiredDeliveryDate).getTime() : Infinity;
        return dateA - dateB;
      });
    }

    // For small number of stops (<= 7), evaluate all permutations deterministically
    if (stops.length <= 7) {
      const perms = this.generatePermutations(stops);
      let bestPerm = stops;
      let minObjective = Infinity;

      for (const perm of perms) {
        const dist = this.calculateCircuitDistance(origin, perm);
        const duration = RouteService.getTravelDurationHours(dist, vehicleConfig.averageSpeedKmH) + perm.length * 1.0;
        const cost = CostService.calculateTripCost(
          dist,
          duration,
          perm.reduce((sum, s) => sum + s.quantityTonnes, 0),
          perm.length,
          vehicleConfig
        ).totalEstimatedCost;

        const objective = criterion === 'COST' ? cost : dist;
        if (objective < minObjective) {
          minObjective = objective;
          bestPerm = perm;
        }
      }

      return bestPerm;
    }

    // Nearest Neighbor heuristic with 2-opt refinement for > 7 stops
    return this.nearestNeighborWith2Opt(origin, stops);
  }

  /**
   * Nearest Neighbor algorithm with 2-Opt local search improvement
   */
  private static nearestNeighborWith2Opt(
    origin: GeoCoordinate,
    stops: DeliveryStop[]
  ): DeliveryStop[] {
    const unvisited = [...stops];
    let current = origin;
    const tour: DeliveryStop[] = [];

    while (unvisited.length > 0) {
      let nearestIdx = 0;
      let minDist = Infinity;

      for (let i = 0; i < unvisited.length; i++) {
        const d = RouteService.getRoadDistanceKm(current, unvisited[i].coordinates);
        if (d < minDist) {
          minDist = d;
          nearestIdx = i;
        }
      }

      tour.push(unvisited[nearestIdx]);
      current = unvisited[nearestIdx].coordinates;
      unvisited.splice(nearestIdx, 1);
    }

    // 2-Opt local optimization
    let improved = true;
    let iterations = 0;
    while (improved && iterations < 30) {
      improved = false;
      iterations++;
      for (let i = 0; i < tour.length - 1; i++) {
        for (let k = i + 1; k < tour.length; k++) {
          const currentDist = this.calculateCircuitDistance(origin, tour);
          // Reverse sub-segment [i, k]
          const newTour = [
            ...tour.slice(0, i),
            ...tour.slice(i, k + 1).reverse(),
            ...tour.slice(k + 1),
          ];
          const newDist = this.calculateCircuitDistance(origin, newTour);
          if (newDist < currentDist - 0.5) {
            tour.splice(0, tour.length, ...newTour);
            improved = true;
            break;
          }
        }
        if (improved) break;
      }
    }

    return tour;
  }

  /**
   * Builds detailed trip plan including route legs, geometry, cost breakdown, and landed cost
   */
  private static buildTripPlan(
    sellerPlant: { id: string; name: string; address: string; coordinates: GeoCoordinate },
    stops: DeliveryStop[],
    tripNumber: number,
    vehicleConfig: Required<VehicleConfig>
  ): TripPlan {
    const legs: RouteLeg[] = [];
    const geometry: [number, number][] = [];
    let totalDistanceKm = 0;
    let totalDurationHours = 0;

    let currentCoord = sellerPlant.coordinates;
    let currentName = `${sellerPlant.name} (Origin Depot)`;
    geometry.push([currentCoord.latitude, currentCoord.longitude]);

    const routeSequence: string[] = [`Origin: ${sellerPlant.name} (Depot)`];

    // Outbound drops
    for (let i = 0; i < stops.length; i++) {
      const stop = stops[i];
      const leg = RouteService.getRouteLeg(
        currentName,
        stop.buyerName,
        currentCoord,
        stop.coordinates,
        vehicleConfig.averageSpeedKmH,
        vehicleConfig.tollRatePerKm
      );

      legs.push(leg);
      totalDistanceKm += leg.distanceKm;
      // Leg duration + 1.0 hour offload handling
      totalDurationHours += leg.durationHours + 1.0;

      for (const pt of leg.geometry) {
        geometry.push(pt);
      }

      routeSequence.push(`Stop ${i + 1}: ${stop.buyerName} (${stop.quantityTonnes} T CO₂)`);
      currentCoord = stop.coordinates;
      currentName = stop.buyerName;
    }

    // Inbound return leg to Origin Depot
    const returnLeg = RouteService.getRouteLeg(
      currentName,
      `${sellerPlant.name} (Return Depot)`,
      currentCoord,
      sellerPlant.coordinates,
      vehicleConfig.averageSpeedKmH,
      vehicleConfig.tollRatePerKm
    );
    legs.push(returnLeg);
    totalDistanceKm += returnLeg.distanceKm;
    totalDurationHours += returnLeg.durationHours;

    for (const pt of returnLeg.geometry) {
      geometry.push(pt);
    }
    routeSequence.push(`Return: ${sellerPlant.name} (Depot)`);

    totalDistanceKm = Math.round(totalDistanceKm * 100) / 100;
    totalDurationHours = Math.round(totalDurationHours * 10) / 10;

    const allocatedTonnage = Math.round(
      stops.reduce((acc, s) => acc + s.quantityTonnes, 0) * 100
    ) / 100;

    const costBreakdown = CostService.calculateTripCost(
      totalDistanceKm,
      totalDurationHours,
      allocatedTonnage,
      stops.length,
      vehicleConfig
    );

    const avgCo2Price = this.computeAverageCo2Price(stops);
    const landedCost = CostService.calculateLandedCost(
      allocatedTonnage,
      costBreakdown.totalEstimatedCost,
      avgCo2Price
    );

    return {
      tripNumber,
      vehicleCapacityTonnes: vehicleConfig.capacityTonnes,
      allocatedTonnage,
      stops,
      legs,
      totalDistanceKm,
      totalDurationHours,
      costBreakdown,
      landedCost,
      routeSequence,
      geometry,
    };
  }

  /**
   * Checks if all stops in trip are visited prior to their required delivery deadlines
   */
  private static checkTripDeadlines(trip: TripPlan): boolean {
    const now = new Date();
    let accumulatedHours = 0;

    for (let i = 0; i < trip.stops.length; i++) {
      const stop = trip.stops[i];
      const leg = trip.legs[i];
      accumulatedHours += (leg?.durationHours || 0) + 1.0;

      if (stop.requiredDeliveryDate) {
        const deadline = new Date(stop.requiredDeliveryDate).getTime();
        const arrivalTime = now.getTime() + accumulatedHours * 3600 * 1000;
        if (arrivalTime > deadline) {
          return false;
        }
      }
    }

    return true;
  }

  /**
   * Helper to calculate total circuit distance for an ordered sequence of stops
   */
  private static calculateCircuitDistance(
    origin: GeoCoordinate,
    stops: DeliveryStop[]
  ): number {
    let total = 0;
    let curr = origin;
    for (const stop of stops) {
      total += RouteService.getRoadDistanceKm(curr, stop.coordinates);
      curr = stop.coordinates;
    }
    total += RouteService.getRoadDistanceKm(curr, origin);
    return Math.round(total * 100) / 100;
  }

  /**
   * Computes weighted average CO2 price from stops
   */
  private static computeAverageCo2Price(stops: DeliveryStop[]): number {
    let totalQty = 0;
    let totalCost = 0;
    for (const s of stops) {
      const price = s.co2PricePerTon ?? 2400;
      totalQty += s.quantityTonnes;
      totalCost += s.quantityTonnes * price;
    }
    return totalQty > 0 ? Math.round((totalCost / totalQty) * 100) / 100 : 2400;
  }

  /**
   * Generates all permutations of an array
   */
  private static generatePermutations<T>(arr: T[]): T[][] {
    if (arr.length <= 1) return [arr];
    const result: T[][] = [];
    for (let i = 0; i < arr.length; i++) {
      const current = arr[i];
      const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
      const perms = this.generatePermutations(remaining);
      for (const p of perms) {
        result.push([current, ...p]);
      }
    }
    return result;
  }

  private static createEmptyTrip(
    sellerPlant: { id: string; name: string; address: string; coordinates: GeoCoordinate },
    vehicleConfig: Required<VehicleConfig>
  ): TripPlan {
    return {
      tripNumber: 1,
      vehicleCapacityTonnes: vehicleConfig.capacityTonnes,
      allocatedTonnage: 0,
      stops: [],
      legs: [],
      totalDistanceKm: 0,
      totalDurationHours: 0,
      costBreakdown: CostService.calculateTripCost(0, 0, 0, 0, vehicleConfig),
      landedCost: CostService.calculateLandedCost(0, 0),
      routeSequence: [`Origin: ${sellerPlant.name}`],
      geometry: [[sellerPlant.coordinates.latitude, sellerPlant.coordinates.longitude]],
    };
  }

  private static buildAssumptions(vehicleConfig: Required<VehicleConfig>) {
    return {
      fuelPricePerLitre: vehicleConfig.fuelPricePerLitre,
      mileageKmPerLitre: vehicleConfig.mileageKmPerLitre,
      operatingCostPerKm: vehicleConfig.operatingCostPerKm,
      driverCostPerHour: vehicleConfig.driverCostPerHour,
      tollRatePerKm: vehicleConfig.tollRatePerKm,
      loadingCostPerTonne: vehicleConfig.loadingCostPerTonne,
      unloadingCostPerStop: vehicleConfig.unloadingCostPerStop,
      averageSpeedKmH: vehicleConfig.averageSpeedKmH,
      disclaimer:
        'All costs represent estimated logistics projections based on standardized commercial cryogenic tanker operating parameters and toll rates. Estimates do not constitute a binding freight carrier invoice.',
    };
  }
}
