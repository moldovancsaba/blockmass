// Haversine formula to calculate distance between two lat/lon points in meters.
// What: Computes great-circle distance on Earth's surface assuming spherical model.
// Why: Allows verification that a user is within X meters of a target location without needing map providers.

const EARTH_RADIUS_M = 6371000; // Earth's mean radius in meters

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

/**
 * Calculate distance between two geographic points using Haversine formula.
 * @param {number} lat1 - Latitude of point 1 (decimal degrees)
 * @param {number} lon1 - Longitude of point 1 (decimal degrees)
 * @param {number} lat2 - Latitude of point 2 (decimal degrees)
 * @param {number} lon2 - Longitude of point 2 (decimal degrees)
 * @returns {number} Distance in meters
 */
export function calculateDistance(lat1, lon1, lat2, lon2) {
  const φ1 = toRadians(lat1);
  const φ2 = toRadians(lat2);
  const Δφ = toRadians(lat2 - lat1);
  const Δλ = toRadians(lon2 - lon1);

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_M * c;
}

export default calculateDistance;
