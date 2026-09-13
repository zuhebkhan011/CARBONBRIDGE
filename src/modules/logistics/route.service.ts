import { calculateDistanceKm, GeoCoordinate } from '../../common/utils/geo.js';
import { config } from '../../config/env.js';
import { DeliveryStop, RouteLeg } from './types.js';

export interface RoadCircuitResult {
  totalDistanceKm: number;
  totalDurationHours: number;
  geometry: [number, number][]; // [latitude, longitude][] for Leaflet
  geoJsonGeometry: {
    type: 'LineString';
    coordinates: [number, number][]; // [longitude, latitude][]
  };
  legs: (RouteLeg & {
    geometry: [number, number][];
    geoJsonGeometry: {
      type: 'LineString';
      coordinates: [number, number][];
    };
  })[];
  isRoadRoute: boolean;
  routeType: 'ROAD_NETWORK' | 'STRAIGHT_LINE_APPROXIMATION';
  routeStatus: 'OPTIMAL_ROAD_ROUTE' | 'ROAD_ROUTE_UNAVAILABLE';
  routingProvider: 'OSRM' | 'FALLBACK_DIRECT';
}

export class RouteService {
  /**
   * Road network winding factor for commercial freight highways.
   * In India, highway road distance averages ~1.22x the Haversine straight-line distance.
   */
  public static readonly ROAD_NETWORK_FACTOR = 1.22;

  /**
   * Standard traffic disclosure when real-time API is not connected.
   */
  public static readonly TRAFFIC_DISCLOSURE =
    'Traffic data unavailable — estimate based on normal travel conditions.';

  /**
   * Standard toll disclosure clarifying that tolls are based on configured model assumptions.
   */
  public static readonly TOLL_DISCLOSURE =
    'Estimated Toll — based on configured assumptions.';

  // In-memory cache for OSRM routes to avoid redundant network requests during candidate evaluations
  private static routeCache = new Map<string, RoadCircuitResult>();
  private static p2pCache = new Map<string, {
    distanceKm: number;
    durationHours: number;
    geometry: [number, number][];
    isRoadRoute: boolean;
    routeType: 'ROAD_NETWORK' | 'STRAIGHT_LINE_APPROXIMATION';
    routeStatus: 'OPTIMAL_ROAD_ROUTE' | 'ROAD_ROUTE_UNAVAILABLE';
    routingProvider: 'OSRM' | 'FALLBACK_DIRECT';
  }>();

  // Mock routing handler for testing offline/failure scenarios and deterministic tests
  private static mockRoutingHandler: ((coords: string) => Promise<any> | any) | null = null;

  /**
   * Clears the in-memory routing cache
   */
  public static clearCache(): void {
    this.routeCache.clear();
    this.p2pCache.clear();
  }

  /**
   * Sets or clears a mock routing handler for testing
   */
  public static setMockRoutingHandler(
    handler: ((coords: string) => Promise<any> | any) | null
  ): void {
    this.mockRoutingHandler = handler;
  }

  /**
   * Calculates realistic road distance between two geographic coordinates (Haversine * winding factor)
   */
  public static getRoadDistanceKm(origin: GeoCoordinate, destination: GeoCoordinate): number {
    const haversineKm = calculateDistanceKm(origin, destination);
    return Math.round(haversineKm * this.ROAD_NETWORK_FACTOR * 100) / 100;
  }

  /**
   * Calculates travel duration in hours given road distance and average speed
   */
  public static getTravelDurationHours(distanceKm: number, averageSpeedKmH: number = 45): number {
    if (distanceKm <= 0 || averageSpeedKmH <= 0) return 0;
    return Math.round((distanceKm / averageSpeedKmH) * 10) / 10;
  }

  /**
   * Fetches an actual road network route circuit (Origin -> Stops -> Origin) using OSRM
   */
  public static async getRoadRouteCircuit(
    origin: GeoCoordinate,
    stops: DeliveryStop[],
    averageSpeedKmH: number = 45,
    tollRatePerKm: number = 2.40
  ): Promise<RoadCircuitResult> {
    if (stops.length === 0) {
      return this.getEmptyCircuit(origin);
    }

    // Build coordinate string for OSRM: lon,lat;lon,lat;...
    // Circuit: Origin -> Stop 1 -> Stop 2 -> ... -> Origin
    const waypoints: GeoCoordinate[] = [
      origin,
      ...stops.map((s) => s.coordinates),
      origin,
    ];

    const coordStr = waypoints
      .map((w) => `${w.longitude},${w.latitude}`)
      .join(';');

    // Check in-memory cache
    const cacheKey = `${coordStr}_${averageSpeedKmH}_${tollRatePerKm}`;
    if (this.routeCache.has(cacheKey)) {
      return this.routeCache.get(cacheKey)!;
    }

    try {
      let data: any;

      if (this.mockRoutingHandler) {
        data = await this.mockRoutingHandler(coordStr);
      } else {
        const osrmBaseUrl = config.OSRM_ROUTER_URL || 'https://router.project-osrm.org';
        const url = `${osrmBaseUrl}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=true`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'CarbonBridge-Logistics-Engine/1.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          throw new Error(`OSRM API responded with status ${response.status}`);
        }

        data = await response.json();
      }

      if (data?.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error(data?.message || 'No drivable road route found by OSRM');
      }

      const osrmRoute = data.routes[0];
      const roadDistanceKm = Math.round((osrmRoute.distance / 1000) * 100) / 100;
      const drivingDurationHours = Math.round((osrmRoute.duration / 3600) * 10) / 10;
      // Total duration = driving duration + 1.0 hour offload/manifold connection handling per customer stop
      const totalDurationHours = Math.round((drivingDurationHours + stops.length * 1.0) * 10) / 10;

      const rawGeoJsonCoords: [number, number][] = osrmRoute.geometry?.coordinates || [];
      const leafletCoords: [number, number][] = rawGeoJsonCoords.map(([lng, lat]) => [lat, lng]);

      // Parse individual legs (Origin -> Stop 1, Stop 1 -> Stop 2, ..., Stop N -> Origin)
      const legs: (RouteLeg & {
        geometry: [number, number][];
        geoJsonGeometry: { type: 'LineString'; coordinates: [number, number][] };
      })[] = [];

      const osrmLegs: any[] = osrmRoute.legs || [];

      for (let i = 0; i < waypoints.length - 1; i++) {
        const fromCoord = waypoints[i];
        const toCoord = waypoints[i + 1];
        const fromName = i === 0 ? 'Origin Depot' : stops[i - 1].buyerName;
        const toName = i < stops.length ? stops[i].buyerName : 'Return Depot';

        const osrmLeg = osrmLegs[i];
        let legDistanceKm = 0;
        let legDurationHours = 0;
        let legGeoJson: [number, number][] = [];

        if (osrmLeg) {
          legDistanceKm = Math.round((osrmLeg.distance / 1000) * 100) / 100;
          legDurationHours = Math.round((osrmLeg.duration / 3600) * 10) / 10;
          if (osrmLeg.steps && Array.isArray(osrmLeg.steps)) {
            for (const step of osrmLeg.steps) {
              if (step.geometry?.coordinates && Array.isArray(step.geometry.coordinates)) {
                for (const c of step.geometry.coordinates) {
                  legGeoJson.push([c[0], c[1]]);
                }
              }
            }
          }
        } else {
          legDistanceKm = this.getRoadDistanceKm(fromCoord, toCoord);
          legDurationHours = this.getTravelDurationHours(legDistanceKm, averageSpeedKmH);
        }

        if (legGeoJson.length === 0) {
          legGeoJson = [
            [fromCoord.longitude, fromCoord.latitude],
            [toCoord.longitude, toCoord.latitude],
          ];
        }

        const legLeaflet: [number, number][] = legGeoJson.map(([lng, lat]) => [lat, lng]);
        const tollEstimate = Math.round(legDistanceKm * tollRatePerKm * 100) / 100;

        legs.push({
          from: fromName,
          to: toName,
          fromCoordinates: fromCoord,
          toCoordinates: toCoord,
          distanceKm: legDistanceKm,
          durationHours: legDurationHours,
          trafficStatus: this.TRAFFIC_DISCLOSURE,
          tollEstimate,
          geometry: legLeaflet,
          geoJsonGeometry: {
            type: 'LineString',
            coordinates: legGeoJson,
          },
        });
      }

      const result: RoadCircuitResult = {
        totalDistanceKm: roadDistanceKm,
        totalDurationHours,
        geometry: leafletCoords,
        geoJsonGeometry: {
          type: 'LineString',
          coordinates: rawGeoJsonCoords,
        },
        legs,
        isRoadRoute: true,
        routeType: 'ROAD_NETWORK',
        routeStatus: 'OPTIMAL_ROAD_ROUTE',
        routingProvider: 'OSRM',
      };

      this.routeCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn(
        `[RouteService] OSRM road routing unavailable: ${err instanceof Error ? err.message : String(err)}. Using fallback direct visualization.`
      );
      // Fall back gracefully with clear non-road metadata
      const fallbackResult = this.getFallbackCircuit(
        origin,
        stops,
        averageSpeedKmH,
        tollRatePerKm
      );
      return fallbackResult;
    }
  }

  /**
   * Fetches a single point-to-point road route between origin and destination using OSRM.
   * Dedicated for Buyer Active Delivery Map where each seller -> buyer shipment is an independent route.
   */
  public static async getPointToPointRoadRoute(
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    averageSpeedKmH: number = 45
  ): Promise<{
    distanceKm: number;
    durationHours: number;
    geometry: [number, number][]; // [latitude, longitude][] for Leaflet
    isRoadRoute: boolean;
    routeType: 'ROAD_NETWORK' | 'STRAIGHT_LINE_APPROXIMATION';
    routeStatus: 'OPTIMAL_ROAD_ROUTE' | 'ROAD_ROUTE_UNAVAILABLE';
    routingProvider: 'OSRM' | 'FALLBACK_DIRECT';
  }> {
    const coordStr = `${origin.longitude},${origin.latitude};${destination.longitude},${destination.latitude}`;
    const cacheKey = `p2p_${coordStr}_${averageSpeedKmH}`;

    if (this.p2pCache.has(cacheKey)) {
      return this.p2pCache.get(cacheKey)!;
    }

    try {
      let data: any;

      if (this.mockRoutingHandler) {
        data = await this.mockRoutingHandler(coordStr);
      } else {
        const osrmBaseUrl = config.OSRM_ROUTER_URL || 'https://router.project-osrm.org';
        const url = `${osrmBaseUrl}/route/v1/driving/${coordStr}?overview=full&geometries=geojson&steps=false`;

        const response = await fetch(url, {
          headers: {
            'User-Agent': 'CarbonBridge-Logistics-Engine/1.0',
            Accept: 'application/json',
          },
          signal: AbortSignal.timeout(5000),
        });

        if (!response.ok) {
          throw new Error(`OSRM API responded with status ${response.status}`);
        }

        data = await response.json();
      }

      if (data?.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error(data?.message || 'No drivable road route found by OSRM');
      }

      const osrmRoute = data.routes[0];
      const roadDistanceKm = Math.round((osrmRoute.distance / 1000) * 100) / 100;
      const drivingDurationHours = Math.round((osrmRoute.duration / 3600) * 10) / 10;
      const rawGeoJsonCoords: [number, number][] = osrmRoute.geometry?.coordinates || [];
      const leafletCoords: [number, number][] = rawGeoJsonCoords.map(([lng, lat]) => [lat, lng]);

      const result = {
        distanceKm: roadDistanceKm,
        durationHours: drivingDurationHours,
        geometry: leafletCoords.length > 0 ? leafletCoords : [
          [origin.latitude, origin.longitude],
          [destination.latitude, destination.longitude],
        ] as [number, number][],
        isRoadRoute: true,
        routeType: 'ROAD_NETWORK' as const,
        routeStatus: 'OPTIMAL_ROAD_ROUTE' as const,
        routingProvider: 'OSRM' as const,
      };

      this.p2pCache.set(cacheKey, result);
      return result;
    } catch (err) {
      console.warn(
        `[RouteService] OSRM point-to-point routing unavailable: ${err instanceof Error ? err.message : String(err)}. Using fallback direct visualization.`
      );

      const straightDistance = calculateDistanceKm(origin, destination);
      const fallbackDistanceKm = Math.round(straightDistance * this.ROAD_NETWORK_FACTOR * 100) / 100;
      const fallbackDurationHours = this.getTravelDurationHours(fallbackDistanceKm, averageSpeedKmH);

      return {
        distanceKm: fallbackDistanceKm,
        durationHours: fallbackDurationHours,
        geometry: [
          [origin.latitude, origin.longitude],
          [destination.latitude, destination.longitude],
        ],
        isRoadRoute: false,
        routeType: 'STRAIGHT_LINE_APPROXIMATION' as const,
        routeStatus: 'ROAD_ROUTE_UNAVAILABLE' as const,
        routingProvider: 'FALLBACK_DIRECT' as const,
      };
    }
  }

  /**
   * Graceful fallback when road routing service is unreachable or errors.
   * Explicitly sets isRoadRoute: false and tags STRAIGHT_LINE_APPROXIMATION.
   */
  public static getFallbackCircuit(
    origin: GeoCoordinate,
    stops: DeliveryStop[],
    averageSpeedKmH: number = 45,
    tollRatePerKm: number = 2.40
  ): RoadCircuitResult {
    const waypoints: GeoCoordinate[] = [
      origin,
      ...stops.map((s) => s.coordinates),
      origin,
    ];

    let totalDistanceKm = 0;
    let totalDurationHours = 0;
    const legs: (RouteLeg & {
      geometry: [number, number][];
      geoJsonGeometry: { type: 'LineString'; coordinates: [number, number][] };
    })[] = [];

    const leafletCoords: [number, number][] = [];
    const geoJsonCoords: [number, number][] = [];

    for (let i = 0; i < waypoints.length - 1; i++) {
      const fromCoord = waypoints[i];
      const toCoord = waypoints[i + 1];
      const fromName = i === 0 ? 'Origin Depot' : stops[i - 1].buyerName;
      const toName = i < stops.length ? stops[i].buyerName : 'Return Depot';

      const legDistanceKm = this.getRoadDistanceKm(fromCoord, toCoord);
      const legDurationHours = this.getTravelDurationHours(legDistanceKm, averageSpeedKmH);

      totalDistanceKm += legDistanceKm;
      totalDurationHours += legDurationHours + (i < stops.length ? 1.0 : 0);

      const legLeaflet: [number, number][] = [
        [fromCoord.latitude, fromCoord.longitude],
        [toCoord.latitude, toCoord.longitude],
      ];
      const legGeoJson: [number, number][] = [
        [fromCoord.longitude, fromCoord.latitude],
        [toCoord.longitude, toCoord.latitude],
      ];

      if (i === 0) {
        leafletCoords.push(legLeaflet[0]);
        geoJsonCoords.push(legGeoJson[0]);
      }
      leafletCoords.push(legLeaflet[1]);
      geoJsonCoords.push(legGeoJson[1]);

      legs.push({
        from: fromName,
        to: toName,
        fromCoordinates: fromCoord,
        toCoordinates: toCoord,
        distanceKm: legDistanceKm,
        durationHours: legDurationHours,
        trafficStatus: this.TRAFFIC_DISCLOSURE,
        tollEstimate: Math.round(legDistanceKm * tollRatePerKm * 100) / 100,
        geometry: legLeaflet,
        geoJsonGeometry: {
          type: 'LineString',
          coordinates: legGeoJson,
        },
      });
    }

    return {
      totalDistanceKm: Math.round(totalDistanceKm * 100) / 100,
      totalDurationHours: Math.round(totalDurationHours * 10) / 10,
      geometry: leafletCoords,
      geoJsonGeometry: {
        type: 'LineString',
        coordinates: geoJsonCoords,
      },
      legs,
      isRoadRoute: false,
      routeType: 'STRAIGHT_LINE_APPROXIMATION',
      routeStatus: 'ROAD_ROUTE_UNAVAILABLE',
      routingProvider: 'FALLBACK_DIRECT',
    };
  }

  private static getEmptyCircuit(origin: GeoCoordinate): RoadCircuitResult {
    return {
      totalDistanceKm: 0,
      totalDurationHours: 0,
      geometry: [[origin.latitude, origin.longitude]],
      geoJsonGeometry: {
        type: 'LineString',
        coordinates: [[origin.longitude, origin.latitude]],
      },
      legs: [],
      isRoadRoute: true,
      routeType: 'ROAD_NETWORK',
      routeStatus: 'OPTIMAL_ROAD_ROUTE',
      routingProvider: 'OSRM',
    };
  }

  /**
   * Legacy method for backwards compatibility with single leg tests
   */
  public static getRouteLeg(
    fromName: string,
    toName: string,
    origin: GeoCoordinate,
    destination: GeoCoordinate,
    averageSpeedKmH: number = 45,
    tollRatePerKm: number = 2.40
  ): RouteLeg & { geometry: [number, number][] } {
    const distanceKm = this.getRoadDistanceKm(origin, destination);
    const durationHours = this.getTravelDurationHours(distanceKm, averageSpeedKmH);
    const tollEstimate = Math.round(distanceKm * tollRatePerKm * 100) / 100;
    const geometry = this.interpolatePath(origin, destination);

    return {
      from: fromName,
      to: toName,
      fromCoordinates: origin,
      toCoordinates: destination,
      distanceKm,
      durationHours,
      trafficStatus: this.TRAFFIC_DISCLOSURE,
      tollEstimate,
      geometry,
    };
  }

  /**
   * Interpolates smooth waypoints between two coordinates (for fallback/legacy use)
   */
  public static interpolatePath(
    start: GeoCoordinate,
    end: GeoCoordinate,
    numSteps: number = 5
  ): [number, number][] {
    const points: [number, number][] = [];
    points.push([start.latitude, start.longitude]);

    for (let i = 1; i < numSteps; i++) {
      const fraction = i / numSteps;
      const lat = start.latitude + (end.latitude - start.latitude) * fraction;
      const lng = start.longitude + (end.longitude - start.longitude) * fraction;
      const offset = Math.sin(fraction * Math.PI) * 0.03;
      points.push([
        Math.round((lat + offset) * 10000) / 10000,
        Math.round((lng + offset) * 10000) / 10000,
      ]);
    }

    points.push([end.latitude, end.longitude]);
    return points;
  }
}
