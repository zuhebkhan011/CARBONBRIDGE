export interface GeoCoordinate {
  latitude: number;
  longitude: number;
}

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees: number): number => {
  return (degrees * Math.PI) / 180;
};

/**
 * Computes great-circle distance between two points using the Haversine formula
 */
export const calculateDistanceKm = (coord1: GeoCoordinate, coord2: GeoCoordinate): number => {
  const dLat = toRadians(coord2.latitude - coord1.latitude);
  const dLon = toRadians(coord2.longitude - coord1.longitude);

  const lat1 = toRadians(coord1.latitude);
  const lat2 = toRadians(coord2.latitude);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const distance = EARTH_RADIUS_KM * c;

  return Math.round(distance * 100) / 100; // Round to 2 decimal places
};

/**
 * Computes independent round-trip distances from an origin to multiple destinations:
 * D_separate = sum(2 * distance(Origin, Dest_i))
 */
export const calculateIndependentRoundTripKm = (
  origin: GeoCoordinate,
  destinations: GeoCoordinate[]
): number => {
  let totalKm = 0;
  for (const dest of destinations) {
    totalKm += 2 * calculateDistanceKm(origin, dest);
  }
  return Math.round(totalKm * 100) / 100;
};

/**
 * Computes consolidated multi-drop circuit distance:
 * Origin -> Dest_1 -> Dest_2 -> ... -> Dest_n -> Origin
 * Simple nearest-neighbor heuristic for ordering multi-drop sequence.
 */
export const calculateConsolidatedRouteKm = (
  origin: GeoCoordinate,
  destinations: GeoCoordinate[]
): { totalDistanceKm: number; orderedPath: GeoCoordinate[] } => {
  if (destinations.length === 0) {
    return { totalDistanceKm: 0, orderedPath: [origin] };
  }

  const unvisited = [...destinations];
  let current = origin;
  const orderedPath: GeoCoordinate[] = [origin];
  let totalDistance = 0;

  while (unvisited.length > 0) {
    let nearestIdx = 0;
    let minDistance = Infinity;

    for (let i = 0; i < unvisited.length; i++) {
      const dist = calculateDistanceKm(current, unvisited[i]);
      if (dist < minDistance) {
        minDistance = dist;
        nearestIdx = i;
      }
    }

    totalDistance += minDistance;
    current = unvisited[nearestIdx];
    orderedPath.push(current);
    unvisited.splice(nearestIdx, 1);
  }

  // Return to origin
  const returnDist = calculateDistanceKm(current, origin);
  totalDistance += returnDist;
  orderedPath.push(origin);

  return {
    totalDistanceKm: Math.round(totalDistance * 100) / 100,
    orderedPath,
  };
};

/**
 * Dynamically computes mileage savings:
 * Savings = (D_separate - D_consolidated) / D_separate * 100
 * No hard-coding!
 */
export const computeRouteSavings = (
  origin: GeoCoordinate,
  destinations: GeoCoordinate[]
): {
  independentDistanceKm: number;
  consolidatedDistanceKm: number;
  distanceSavedKm: number;
  savingsPercentage: number;
  orderedPath: GeoCoordinate[];
} => {
  const independentDistanceKm = calculateIndependentRoundTripKm(origin, destinations);
  const { totalDistanceKm: consolidatedDistanceKm, orderedPath } = calculateConsolidatedRouteKm(
    origin,
    destinations
  );

  const distanceSavedKm = Math.max(
    0,
    Math.round((independentDistanceKm - consolidatedDistanceKm) * 100) / 100
  );

  const savingsPercentage =
    independentDistanceKm > 0
      ? Math.round((distanceSavedKm / independentDistanceKm) * 10000) / 100
      : 0;

  return {
    independentDistanceKm,
    consolidatedDistanceKm,
    distanceSavedKm,
    savingsPercentage,
    orderedPath,
  };
};
