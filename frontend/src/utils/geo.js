/**
 * Authoritative Indian Industrial Cities & Hubs Registry
 * Single Source of Truth for CarbonBridge Geographical Resolution
 */
export const AUTHORITATIVE_CITIES = [
  { city: 'Ahmedabad', state: 'Gujarat', latitude: 23.0225, longitude: 72.5714, aliases: ['ahmedabad', 'ahmedaba', 'ahmdabad', 'amdavad'] },
  { city: 'Rajkot', state: 'Gujarat', latitude: 22.3039, longitude: 70.8022, aliases: ['rajkot', 'rajcot'] },
  { city: 'Surat', state: 'Gujarat', latitude: 21.1702, longitude: 72.8311, aliases: ['surat'] },
  { city: 'Vadodara', state: 'Gujarat', latitude: 22.3072, longitude: 73.1812, aliases: ['vadodara', 'baroda', 'vadodra'] },
  { city: 'Dahej', state: 'Gujarat', latitude: 21.7051, longitude: 72.5841, aliases: ['dahej'] },
  { city: 'Hazira', state: 'Gujarat', latitude: 21.1167, longitude: 72.6500, aliases: ['hazira', 'hajira'] },
  { city: 'Ankleshwar', state: 'Gujarat', latitude: 21.6264, longitude: 73.0033, aliases: ['ankleshwar', 'ankleswar'] },
  { city: 'Jamnagar', state: 'Gujarat', latitude: 22.4707, longitude: 70.0577, aliases: ['jamnagar'] },
  { city: 'Gandhinagar', state: 'Gujarat', latitude: 23.2156, longitude: 72.6369, aliases: ['gandhinagar', 'gandhi nagar'] },
  { city: 'Bharuch', state: 'Gujarat', latitude: 21.7051, longitude: 72.9959, aliases: ['bharuch', 'broach'] },
  { city: 'Mumbai', state: 'Maharashtra', latitude: 19.0760, longitude: 72.8777, aliases: ['mumbai', 'bombay', 'navi mumbai'] },
  { city: 'Pune', state: 'Maharashtra', latitude: 18.5204, longitude: 73.8567, aliases: ['pune', 'poona'] },
  { city: 'Nagpur', state: 'Maharashtra', latitude: 21.1458, longitude: 79.0882, aliases: ['nagpur'] },
  { city: 'Delhi', state: 'Delhi', latitude: 28.6139, longitude: 77.2090, aliases: ['delhi', 'new delhi', 'ncr'] },
  { city: 'Jaipur', state: 'Rajasthan', latitude: 26.9124, longitude: 75.7873, aliases: ['jaipur'] },
  { city: 'Chennai', state: 'Tamil Nadu', latitude: 13.0827, longitude: 80.2707, aliases: ['chennai', 'madras'] },
  { city: 'Bengaluru', state: 'Karnataka', latitude: 12.9716, longitude: 77.5946, aliases: ['bengaluru', 'bangalore'] },
  { city: 'Hyderabad', state: 'Telangana', latitude: 17.3850, longitude: 78.4867, aliases: ['hyderabad', 'secunderabad'] },
  { city: 'Kolkata', state: 'West Bengal', latitude: 22.5726, longitude: 88.3639, aliases: ['kolkata', 'calcutta'] },
  { city: 'Indore', state: 'Madhya Pradesh', latitude: 22.7196, longitude: 75.8577, aliases: ['indore'] },
  { city: 'Bhopal', state: 'Madhya Pradesh', latitude: 23.2599, longitude: 77.4126, aliases: ['bhopal'] },
  { city: 'Visakhapatnam', state: 'Andhra Pradesh', latitude: 17.6868, longitude: 83.2185, aliases: ['visakhapatnam', 'vizag'] },
];

/**
 * Checks if coordinates are the generic central India centroid fallback (~20.59, 78.96)
 */
export function isBogusCentroidCoordinate(lat, lng) {
  if (lat == null || lng == null) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  return Math.abs(numLat - 20.59) < 0.1 && Math.abs(numLng - 78.96) < 0.1;
}

/**
 * Resolves location coordinates with normalization, alias matching, and bogus coordinate detection.
 */
export function resolveLocationCoordinates(addressOrCity, existingLat, existingLng) {
  const text = (addressOrCity || '').trim();
  const lower = text.toLowerCase();

  let matchedCity = undefined;
  for (const c of AUTHORITATIVE_CITIES) {
    if (c.city.toLowerCase() === lower || c.aliases.some((a) => a.toLowerCase() === lower)) {
      matchedCity = c;
      break;
    }
  }

  if (!matchedCity && text) {
    for (const c of AUTHORITATIVE_CITIES) {
      if (c.aliases.some((a) => lower.includes(a.toLowerCase())) || lower.includes(c.city.toLowerCase())) {
        matchedCity = c;
        break;
      }
    }
  }

  const hasExisting =
    existingLat != null &&
    existingLng != null &&
    !isNaN(Number(existingLat)) &&
    !isNaN(Number(existingLng));
  const isBogus = hasExisting && isBogusCentroidCoordinate(Number(existingLat), Number(existingLng));

  if (matchedCity) {
    if (!hasExisting || isBogus) {
      return {
        city: matchedCity.city,
        state: matchedCity.state,
        latitude: matchedCity.latitude,
        longitude: matchedCity.longitude,
        isAuthoritative: true,
        normalizedAddress: text || `${matchedCity.city}, ${matchedCity.state}`,
      };
    }

    return {
      city: matchedCity.city,
      state: matchedCity.state,
      latitude: Number(existingLat),
      longitude: Number(existingLng),
      isAuthoritative: true,
      normalizedAddress: text,
    };
  }

  if (hasExisting && !isBogus) {
    return {
      city: text.split(',')[0]?.trim() || 'Custom Facility',
      state: text.split(',')[1]?.trim() || '',
      latitude: Number(existingLat),
      longitude: Number(existingLng),
      isAuthoritative: false,
      normalizedAddress: text,
    };
  }

  const defaultCity = AUTHORITATIVE_CITIES[0]; // Ahmedabad default hub
  return {
    city: defaultCity.city,
    state: defaultCity.state,
    latitude: defaultCity.latitude,
    longitude: defaultCity.longitude,
    isAuthoritative: false,
    normalizedAddress: text || `${defaultCity.city}, ${defaultCity.state}`,
  };
}

/**
 * Convenience helper returning { lat, lng } for form inputs
 */
export function getCityCoords(cityName) {
  const resolved = resolveLocationCoordinates(cityName);
  return { lat: resolved.latitude, lng: resolved.longitude };
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees) {
  return (degrees * Math.PI) / 180;
}

export function calculateDistanceKm(coord1, coord2) {
  const lat1 = Number(coord1.latitude ?? coord1.lat ?? coord1[0]);
  const lon1 = Number(coord1.longitude ?? coord1.lng ?? coord1[1]);
  const lat2 = Number(coord2.latitude ?? coord2.lat ?? coord2[0]);
  const lon2 = Number(coord2.longitude ?? coord2.lng ?? coord2[1]);

  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2));

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(EARTH_RADIUS_KM * c * 100) / 100;
}

/**
 * Calculates an exact point along a road route geometry based on ratio (0 to 1).
 * Traverses cumulative segment distances using the Haversine formula and interpolates
 * along the active road polyline segment — NEVER in a straight line.
 */
export function calculatePositionAlongGeometry(geometry, ratio) {
  if (!Array.isArray(geometry) || geometry.length === 0) {
    return null;
  }

  const clampedRatio = Math.max(0, Math.min(1, isNaN(ratio) ? 0 : ratio));

  if (geometry.length === 1) {
    return {
      position: geometry[0],
      travelledGeometry: [geometry[0]],
      remainingGeometry: [geometry[0]],
      totalGeometryDistanceKm: 0,
      coveredDistanceKm: 0,
    };
  }

  const segmentDistances = [];
  let totalDistance = 0;

  for (let i = 0; i < geometry.length - 1; i++) {
    const p1 = geometry[i];
    const p2 = geometry[i + 1];
    const dist = calculateDistanceKm(
      { latitude: p1[0], longitude: p1[1] },
      { latitude: p2[0], longitude: p2[1] }
    );
    segmentDistances.push(dist);
    totalDistance += dist;
  }

  totalDistance = Math.round(totalDistance * 100) / 100;

  if (totalDistance === 0) {
    return {
      position: geometry[0],
      travelledGeometry: [geometry[0]],
      remainingGeometry: [...geometry],
      totalGeometryDistanceKm: 0,
      coveredDistanceKm: 0,
    };
  }

  const targetDistance = clampedRatio * totalDistance;
  let accumulated = 0;

  for (let i = 0; i < segmentDistances.length; i++) {
    const segDist = segmentDistances[i];
    if (accumulated + segDist >= targetDistance || i === segmentDistances.length - 1) {
      const segFraction = segDist > 0 ? (targetDistance - accumulated) / segDist : 0;
      const clampedFraction = Math.max(0, Math.min(1, segFraction));

      const p1 = geometry[i];
      const p2 = geometry[i + 1];

      const interpLat = p1[0] + clampedFraction * (p2[0] - p1[0]);
      const interpLng = p1[1] + clampedFraction * (p2[1] - p1[1]);
      const interpPos = [
        Math.round(interpLat * 1e6) / 1e6,
        Math.round(interpLng * 1e6) / 1e6,
      ];

      const travelledGeometry = geometry.slice(0, i + 1);
      travelledGeometry.push(interpPos);

      const remainingGeometry = [interpPos];
      for (let j = i + 1; j < geometry.length; j++) {
        remainingGeometry.push(geometry[j]);
      }

      return {
        position: interpPos,
        travelledGeometry,
        remainingGeometry,
        totalGeometryDistanceKm: totalDistance,
        coveredDistanceKm: Math.round(targetDistance * 10) / 10,
      };
    }
    accumulated += segDist;
  }

  const lastPoint = geometry[geometry.length - 1];
  return {
    position: lastPoint,
    travelledGeometry: [...geometry],
    remainingGeometry: [lastPoint],
    totalGeometryDistanceKm: totalDistance,
    coveredDistanceKm: totalDistance,
  };
}

export const GPS_UNAVAILABLE_DISCLAIMER =
  'GPS tracking unavailable — position estimated from shipment progress';

/**
 * Calculates estimated shipment progress from dispatch timestamp and estimated duration.
 * Strictly respects constraints:
 * - NEVER claims real-time GPS tracking or exact vehicle location.
 * - Caps progress between 0% and 100%.
 * - If timestamps or duration are missing/invalid, reports "ETA unavailable" & "Estimated progress unavailable".
 * - Position is derived along road route geometry, never straight line.
 */
export function calculateEstimatedProgress({
  dispatchedAt,
  durationHours,
  distanceKm,
  geometry,
  currentTime,
}) {
  const defaultResult = {
    isCalculable: false,
    progressPercentage: null,
    elapsedRatio: null,
    elapsedHours: null,
    durationRemainingHours: null,
    distanceCoveredKm: null,
    distanceRemainingKm: null,
    etaText: 'ETA unavailable',
    progressText: 'Estimated progress unavailable',
    position: null,
    travelledGeometry: [],
    remainingGeometry: Array.isArray(geometry) ? [...geometry] : [],
    statusLabel: 'Estimated shipment progress',
    gpsDisclaimer: GPS_UNAVAILABLE_DISCLAIMER,
  };

  if (!dispatchedAt || durationHours == null || isNaN(durationHours) || Number(durationHours) <= 0) {
    return defaultResult;
  }

  const dispatchTime = new Date(dispatchedAt).getTime();
  if (isNaN(dispatchTime)) {
    return defaultResult;
  }

  const durHours = Number(durationHours);
  const now = currentTime ? new Date(currentTime).getTime() : Date.now();
  const elapsedMs = Math.max(0, now - dispatchTime);
  const elapsedHours = elapsedMs / (1000 * 60 * 60);

  const rawRatio = elapsedHours / durHours;
  const elapsedRatio = Math.max(0, Math.min(1, rawRatio));
  const progressPercentage = Math.round(elapsedRatio * 100);

  const durationRemainingHours = Math.max(0, durHours - elapsedHours);

  let etaText = 'ETA unavailable';
  if (durationRemainingHours >= 1) {
    const rounded = Math.round(durationRemainingHours * 10) / 10;
    etaText = `~${rounded}h remaining`;
  } else if (durationRemainingHours > 0) {
    const minutes = Math.max(1, Math.round(durationRemainingHours * 60));
    etaText = `~${minutes}m remaining`;
  } else {
    etaText = 'Arriving shortly';
  }

  let position = null;
  let travelledGeometry = [];
  let remainingGeometry = Array.isArray(geometry) ? [...geometry] : [];
  let distanceCoveredKm = null;
  let distanceRemainingKm = null;
  const distKm = distanceKm != null ? Number(distanceKm) : null;

  if (Array.isArray(geometry) && geometry.length > 0) {
    const geomResult = calculatePositionAlongGeometry(geometry, elapsedRatio);
    if (geomResult) {
      position = geomResult.position;
      travelledGeometry = geomResult.travelledGeometry;
      remainingGeometry = geomResult.remainingGeometry;

      if (distKm != null && distKm > 0) {
        distanceCoveredKm = Math.round(elapsedRatio * distKm * 10) / 10;
        distanceRemainingKm = Math.max(0, Math.round((distKm - distanceCoveredKm) * 10) / 10);
      } else {
        distanceCoveredKm = geomResult.coveredDistanceKm;
        distanceRemainingKm = Math.max(
          0,
          Math.round((geomResult.totalGeometryDistanceKm - geomResult.coveredDistanceKm) * 10) / 10
        );
      }
    }
  } else if (distKm != null && distKm > 0) {
    distanceCoveredKm = Math.round(elapsedRatio * distKm * 10) / 10;
    distanceRemainingKm = Math.max(0, Math.round((distKm - distanceCoveredKm) * 10) / 10);
  }

  return {
    isCalculable: true,
    progressPercentage,
    elapsedRatio,
    elapsedHours: Math.round(elapsedHours * 100) / 100,
    durationRemainingHours: Math.round(durationRemainingHours * 100) / 100,
    distanceCoveredKm,
    distanceRemainingKm,
    etaText,
    progressText: `${progressPercentage}% estimated`,
    position,
    travelledGeometry,
    remainingGeometry,
    statusLabel: 'Estimated shipment progress',
    gpsDisclaimer: GPS_UNAVAILABLE_DISCLAIMER,
  };
}

