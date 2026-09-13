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

    const expectedRatio =
      (result.distanceSavedKm / result.independentDistanceKm) * 100;
    expect(result.savingsPercentage).toBeCloseTo(expectedRatio, 1);
  });

  it('should normalize and resolve Indian industrial cities to authoritative coordinates', async () => {
    const { resolveLocationCoordinates, isBogusCentroidCoordinate, AUTHORITATIVE_CITIES } = await import(
      '../../src/common/utils/geo.js'
    );

    expect(AUTHORITATIVE_CITIES.length).toBeGreaterThanOrEqual(20);

    // Ahmedabad (case-insensitive, alias, typo)
    const ahmedabad = resolveLocationCoordinates('ahmedaba, gujarat');
    expect(ahmedabad.city).toBe('Ahmedabad');
    expect(ahmedabad.state).toBe('Gujarat');
    expect(ahmedabad.latitude).toBeCloseTo(23.0225, 3);
    expect(ahmedabad.longitude).toBeCloseTo(72.5714, 3);
    expect(ahmedabad.isAuthoritative).toBe(true);

    // Rajkot
    const rajkot = resolveLocationCoordinates('rajkot');
    expect(rajkot.city).toBe('Rajkot');
    expect(rajkot.latitude).toBeCloseTo(22.3039, 3);
    expect(rajkot.longitude).toBeCloseTo(70.8022, 3);

    // Vadodara
    const vadodara = resolveLocationCoordinates('vadodara');
    expect(vadodara.city).toBe('Vadodara');
    expect(vadodara.latitude).toBeCloseTo(22.3072, 3);
    expect(vadodara.longitude).toBeCloseTo(73.1812, 3);

    // Surat
    const surat = resolveLocationCoordinates('surat');
    expect(surat.city).toBe('Surat');
    expect(surat.latitude).toBeCloseTo(21.1702, 3);
    expect(surat.longitude).toBeCloseTo(72.8311, 3);

    // Pune & Mumbai
    const pune = resolveLocationCoordinates('pune, maharashtra');
    expect(pune.city).toBe('Pune');
    expect(pune.state).toBe('Maharashtra');
    expect(pune.latitude).toBeCloseTo(18.5204, 3);

    const mumbai = resolveLocationCoordinates('mumbai');
    expect(mumbai.city).toBe('Mumbai');
    expect(mumbai.latitude).toBeCloseTo(19.0760, 3);

    // Detect bogus centroid fallback
    expect(isBogusCentroidCoordinate(20.59, 78.96)).toBe(true);
    expect(isBogusCentroidCoordinate(20.5937, 78.9629)).toBe(true);
    expect(isBogusCentroidCoordinate(23.0225, 72.5714)).toBe(false);

    // Override bogus centroid coordinate with authoritative city
    const fixedBogus = resolveLocationCoordinates('ahmedaba, gujarat', 20.59, 78.96);
    expect(fixedBogus.city).toBe('Ahmedabad');
    expect(fixedBogus.latitude).toBeCloseTo(23.0225, 3);
    expect(fixedBogus.longitude).toBeCloseTo(72.5714, 3);
    expect(fixedBogus.isAuthoritative).toBe(true);
  });
});
