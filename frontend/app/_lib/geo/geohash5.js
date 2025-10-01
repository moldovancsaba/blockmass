const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

// Minimal 5-character geohash using base32 with alternating lon/lat refinement.
// What: Privacy-friendly coarse bucket for spatial queries; no external dependencies.
// Why: Provides stable indexing without storing raw lat/lon precision.
export function toGeohash5(lat, lon) {
  let latMin = -90, latMax = 90;
  let lonMin = -180, lonMax = 180;
  let isLon = true;
  let bit = 0;
  let ch = 0;
  let geohash = "";

  while (geohash.length < 5) {
    if (isLon) {
      const mid = (lonMin + lonMax) / 2;
      if (lon >= mid) {
        ch |= 1 << (4 - bit);
        lonMin = mid;
      } else {
        lonMax = mid;
      }
    } else {
      const mid = (latMin + latMax) / 2;
      if (lat >= mid) {
        ch |= 1 << (4 - bit);
        latMin = mid;
      } else {
        latMax = mid;
      }
    }
    isLon = !isLon;
    if (bit < 4) {
      bit++;
    } else {
      geohash += BASE32[ch];
      bit = 0;
      ch = 0;
    }
  }
  return geohash;
}

export default toGeohash5;
