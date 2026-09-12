import { describe, it, expect } from 'vitest';
import {
  calculateDistanceKm,
  computeRouteSavings,
  GeoCoordinate,
} from '../../src/common/utils/geo.js';

describe('Geospatial & Dynamic Route Consolidation Engine', () => {
  it('should accurately calculate Haversine distance between Gujarat industrial nodes', () => {
    // Ankleshwar (Seller A plant) to Ahmedabad (Buyer plant)
    const ankleshwar: GeoCoordinate = { latitude: 21.6264, longitude: 73.0033 };
    const ahmedabad: GeoCoordinate = { latitude: 23.0225, longitude: 72.5714 };

    const distance = calculateDistanceKm(ankleshwar, ahmedabad);

    // Realistic distance between Ankleshwar and Ahmedabad is ~160km
    expect(distance).toBeGreaterThan(140);
    expect(distance).toBeLessThan(180);
  });

  it('should calculate non-hardcoded dynamic route savings for one seller to multiple regional buyers', () => {
    const origin: GeoCoordinate = { latitude: 21.6264, longitude: 73.0033 }; // Ankleshwar Hub

    const destinations: GeoCoordinate[] = [
      { latitude: 22.3072, longitude: 73.1812 }, // Vadodara Buyer (en-route)
      { latitude: 23.0225, longitude: 72.5714 }, // Ahmedabad Buyer 1
      { latitude: 23.0500, longitude: 72.5900 }, // Ahmedabad Buyer 2
    ];

    const result = computeRouteSavings(origin, destinations);

    expect(result.independentDistanceKm).toBeGreaterThan(result.consolidatedDistanceKm);
    expect(result.distanceSavedKm).toBeGreaterThan(0);
    expect(result.savingsPercentage).toBeGreaterThan(0);

    // Verify dynamic calculation is not a static constant like 28.00%
    const expectedRatio =
      (result.distanceSavedKm / result.independentDistanceKm) * 100;
    expect(result.savingsPercentage).toBeCloseTo(expectedRatio, 1);
  });
});
