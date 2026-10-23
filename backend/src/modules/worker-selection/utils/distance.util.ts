/**
 * backend/src/modules/worker-selection/utils/distance.util.ts
 *
 * Geographic distance calculations using the standard Haversine formula.
 *
 * NOTE: Geographic distance is straight-line spherical distance and
 * is not necessarily road-travel distance.
 */

export interface CoordinateLocation {
  lat?: number;
  lng?: number;
}

/**
 * Validates whether latitude and longitude are valid finite numbers within geographical bounds.
 */
export function isValidCoordinate(lat?: unknown, lng?: unknown): boolean {
  if (typeof lat !== 'number' || typeof lng !== 'number') {
    return false;
  }
  if (!isFinite(lat) || !isFinite(lng) || isNaN(lat) || isNaN(lng)) {
    return false;
  }
  if (lat < -90 || lat > 90) {
    return false;
  }
  if (lng < -180 || lng > 180) {
    return false;
  }
  return true;
}

/**
 * Calculates straight-line distance in kilometers between two coordinates
 * using the Haversine formula.
 *
 * Earth's mean radius = 6,371 km.
 */
export function calculateHaversineDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const EARTH_RADIUS_KM = 6371;

  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  const distance = EARTH_RADIUS_KM * c;
  // Round to 3 decimal places (meter precision) to avoid floating point anomalies
  return Math.round(distance * 1000) / 1000;
}

/**
 * Normalizes distance to a 0–100 scale:
 * distanceScore = 100 * (1 - actualDistanceKm / maxDistanceKm)
 *
 * Higher score = closer distance (100 = 0 km away, 0 = at max distance).
 */
export function calculateDistanceScore(actualDistanceKm: number, maxDistanceKm: number): number {
  if (maxDistanceKm <= 0) return 0;
  if (actualDistanceKm < 0) return 100;
  if (actualDistanceKm >= maxDistanceKm) return 0;

  const score = 100 * (1 - actualDistanceKm / maxDistanceKm);
  const bounded = Math.max(0, Math.min(100, score));
  return Math.round(bounded * 100) / 100;
}
