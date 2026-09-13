import { GeoCoordinate } from '../../common/utils/geo.js';
export { GeoCoordinate };

export interface DeliveryStop {
  id: string;
  buyerId: string;
  buyerName: string;
  address: string;
  coordinates: GeoCoordinate;
  quantityTonnes: number;
  requiredDeliveryDate?: string | Date | null;
  orderId?: string;
  orderNumber?: string;
  shipmentId?: string;
  co2PricePerTon?: number;
}

export interface VehicleConfig {
  capacityTonnes: number;
  mileageKmPerLitre?: number;
  fuelPricePerLitre?: number;
  operatingCostPerKm?: number;
  driverCostPerHour?: number;
  tollRatePerKm?: number;
  loadingCostPerTonne?: number;
  unloadingCostPerStop?: number;
  averageSpeedKmH?: number;
}

export interface CostBreakdown {
  distanceKm: number;
  durationHours: number;
  fuelLitres: number;
  fuelCost: number;
  vehicleOperatingCost: number;
  driverCost: number;
  tollCost: number;
  loadingCost: number;
  unloadingCost: number;
  totalEstimatedCost: number;
  costPerTonne: number;
}

export interface LandedCost {
  co2PurchaseCost: number;
  totalLogisticsCost: number;
  totalLandedCost: number;
  landedCostPerTonne: number;
  averageCo2PricePerTon: number;
}

export interface RouteLeg {
  from: string;
  to: string;
  fromCoordinates: GeoCoordinate;
  toCoordinates: GeoCoordinate;
  distanceKm: number;
  durationHours: number;
  trafficStatus: string;
  tollEstimate: number;
  geometry?: [number, number][];
  geoJsonGeometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
}

export interface TripPlan {
  tripNumber: number;
  vehicleCapacityTonnes: number;
  allocatedTonnage: number;
  stops: DeliveryStop[];
  legs: RouteLeg[];
  totalDistanceKm: number;
  totalDurationHours: number;
  costBreakdown: CostBreakdown;
  landedCost: LandedCost;
  routeSequence: string[];
  geometry: [number, number][];
  geoJsonGeometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  isRoadRoute: boolean;
  routeType: 'ROAD_NETWORK' | 'STRAIGHT_LINE_APPROXIMATION';
  routeStatus: 'OPTIMAL_ROAD_ROUTE' | 'ROAD_ROUTE_UNAVAILABLE';
  routingProvider: 'OSRM' | 'FALLBACK_DIRECT';
}

export interface RouteCandidate {
  routeId: string;
  name: string;
  description: string;
  isRecommended: boolean;
  whyRecommended: string;
  trips: TripPlan[];
  totalDistanceKm: number;
  totalDurationHours: number;
  costBreakdown: CostBreakdown;
  landedCost: LandedCost;
  pros: string[];
  cons: string[];
  trafficStatus: string;
  constraintsSatisfied: {
    capacitySatisfied: boolean;
    deadlinesSatisfied: boolean;
    allStopsIncluded: boolean;
  };
  geometry: [number, number][];
  geoJsonGeometry?: {
    type: 'LineString';
    coordinates: [number, number][];
  };
  isRoadRoute: boolean;
  routeType: 'ROAD_NETWORK' | 'STRAIGHT_LINE_APPROXIMATION';
  routeStatus: 'OPTIMAL_ROAD_ROUTE' | 'ROAD_ROUTE_UNAVAILABLE';
  routingProvider: 'OSRM' | 'FALLBACK_DIRECT';
}

export interface BaselineComparison {
  independentTripsCount: number;
  independentDistanceKm: number;
  independentHours: number;
  independentTotalCost: number;
  independentCostPerTonne: number;
  consolidatedTripsCount: number;
  consolidatedDistanceKm: number;
  consolidatedHours: number;
  consolidatedTotalCost: number;
  consolidatedCostPerTonne: number;
  savingsAmount: number;
  savingsPercentage: number;
  distanceSavedKm: number;
  hoursSaved: number;
  isGenuinelyCalculated: boolean;
}

export interface OptimizationResult {
  sellerPlant: {
    id: string;
    name: string;
    address: string;
    coordinates: GeoCoordinate;
  };
  totalDeliveredQuantityTonnes: number;
  activeShipmentsCount: number;
  vehicleCapacityTonnes: number;
  requiresMultipleTrips: boolean;
  recommendedRoute: RouteCandidate;
  alternatives: RouteCandidate[];
  baselineComparison: BaselineComparison;
  assumptions: {
    fuelPricePerLitre: number;
    mileageKmPerLitre: number;
    operatingCostPerKm: number;
    driverCostPerHour: number;
    tollRatePerKm: number;
    loadingCostPerTonne: number;
    unloadingCostPerStop: number;
    averageSpeedKmH: number;
    disclaimer: string;
  };
  trafficDisclosure: string;
}

export interface OptimizeRouteInput {
  sellerId?: string;
  shipmentIds?: string[];
  vehicle?: Partial<VehicleConfig>;
  customStops?: {
    buyerId?: string;
    buyerName?: string;
    address?: string;
    latitude: number;
    longitude: number;
    quantityTonnes: number;
    requiredDeliveryDate?: string | null;
    co2PricePerTon?: number;
  }[];
}

export interface SelectRouteInput {
  routeId: string;
  routeName?: string;
  tripPlans: {
    tripNumber: number;
    stops: string[];
    distanceKm: number;
    totalCost: number;
  }[];
  shipmentIds?: string[];
  notes?: string;
}
