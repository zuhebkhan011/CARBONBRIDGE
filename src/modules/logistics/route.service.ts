import { calculateDistanceKm, GeoCoordinate } from '../../common/utils/geo.js';
import { RouteLeg } from './types.js';
import { CostService } from './cost.service.js';

export class RouteService {
  /**
   * Road network winding factor for commercial freight highways
   * In India, highway road distance averages ~1.22x the Haversine straight-line distance.
   */
  public static readonly ROAD_NETWORK_FACTOR = 1.22;

  /**
   * Standard traffic disclosure when real-time API is not connected.
   */
  public static readonly TRAFFIC_DISCLOSURE =
    'Traffic data unavailable — estimate based on normal travel conditions.';

  /**
   * Calculates realistic road distance between two geographic coordinates
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
   * Computes a route leg with distance, travel time, toll estimate, and route geometry
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

    // Generate intermediate path points for map visualization
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
   * Interpolates smooth waypoints along the route between two coordinates
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
      // Slight highway curvature offset
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
