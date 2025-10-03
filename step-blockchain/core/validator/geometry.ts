/**
 * Geometry and Heuristics Validation Module
 * 
 * Implements geospatial checks and basic anti-spoof heuristics for location proofs.
 * 
 * Why Turf.js:
 * - Small triangles (~1-2km at level 10) make planar approximation acceptable
 * - Geodesic error at this scale is < 0.1% (negligible vs 50m GPS accuracy threshold)
 * - Much faster than spherical geometry for point-in-polygon checks
 * 
 * Anti-Spoof Strategy (Phase 2 - MVP):
 * - GPS accuracy gate: Reject proofs with accuracy > 50m
 * - Speed gate: Reject if user moved too fast between proofs (> 15 m/s ~= 54 km/h)
 * - Moratorium: Minimum time between proofs from same account (10 seconds)
 * 
 * Future (Phase 3+):
 * - Multi-sensor fusion (WiFi, cell tower, accelerometer)
 * - Hardware attestation (TEE/Secure Enclave)
 * - Witness network (cross-validate with nearby miners)
 * 
 * Configuration via environment:
 * - GPS_MAX_ACCURACY_M: Maximum allowed GPS accuracy in meters (default: 50)
 * - PROOF_SPEED_LIMIT_MPS: Maximum speed between proofs in m/s (default: 15)
 * - PROOF_MORATORIUM_MS: Minimum time between proofs in milliseconds (default: 10000)
 */

import { booleanPointInPolygon, point, polygon } from '@turf/turf';
import type { Position, Polygon as GeoJsonPolygon } from 'geojson';

// Configuration with defaults
// Why env-based: Allows quick policy adjustments without code changes
const GPS_MAX_ACCURACY_M = parseInt(process.env.GPS_MAX_ACCURACY_M || '50', 10);
const PROOF_SPEED_LIMIT_MPS = parseFloat(process.env.PROOF_SPEED_LIMIT_MPS || '15');
const PROOF_MORATORIUM_MS = parseInt(process.env.PROOF_MORATORIUM_MS || '10000', 10);

/**
 * Check if GPS coordinates are within triangle boundary.
 * 
 * Uses Turf's booleanPointInPolygon with planar approximation.
 * 
 * Why planar is acceptable:
 * - Triangle edges are short (< 2km at level 10)
 * - At this scale, Earth's curvature introduces < 0.1% error
 * - GPS accuracy (±50m) dominates any geometric error
 * 
 * GeoJSON coordinate order: [lon, lat] (not [lat, lon]!)
 * 
 * @param lat - WGS84 latitude (-90 to 90)
 * @param lon - WGS84 longitude (-180 to 180)
 * @param trianglePolygon - GeoJSON Polygon with [lon, lat] coordinates
 * @returns True if point is inside or on boundary of triangle
 */
export function isPointInTriangle(
  lat: number,
  lon: number,
  trianglePolygon: GeoJsonPolygon
): boolean {
  // Create GeoJSON point (lon, lat order)
  const pt = point([lon, lat]);
  
  // Check if point is in polygon
  // Turf uses planar approximation (acceptable for small triangles)
  return booleanPointInPolygon(pt, trianglePolygon);
}

/**
 * Calculate distance between two GPS coordinates using Haversine formula.
 * 
 * Haversine accounts for Earth's curvature (spherical approximation).
 * Error vs true geodesic distance is < 0.5% for distances < 100km.
 * 
 * Formula:
 * a = sin²(Δlat/2) + cos(lat1) * cos(lat2) * sin²(Δlon/2)
 * c = 2 * atan2(√a, √(1−a))
 * d = R * c  (R = Earth radius = 6371 km)
 * 
 * @param lat1 - First point latitude
 * @param lon1 - First point longitude
 * @param lat2 - Second point latitude
 * @param lon2 - Second point longitude
 * @returns Distance in meters
 */
export function haversineDistanceMeters(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  
  // Convert to radians
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;
  
  // Haversine formula
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  
  return R * c; // Distance in meters
}

/**
 * Compute speed in meters per second between two locations.
 * 
 * Speed = distance / time
 * 
 * Why this check:
 * - Prevents teleportation attacks (spoofed GPS jumping across globe)
 * - Prevents bot farms submitting from multiple locations simultaneously
 * 
 * Limitations:
 * - Doesn't catch slow-moving spoofing (e.g., fake GPS walking speed)
 * - Doesn't catch coordinated attacks from nearby locations
 * - Future: Add acceleration checks, WiFi/cell tower correlation
 * 
 * @param prevLat - Previous proof latitude
 * @param prevLon - Previous proof longitude
 * @param prevTimestamp - Previous proof timestamp (ISO 8601)
 * @param currLat - Current proof latitude
 * @param currLon - Current proof longitude
 * @param currTimestamp - Current proof timestamp (ISO 8601)
 * @returns Speed in m/s, or null if invalid timestamps
 */
export function computeSpeedMps(
  prevLat: number,
  prevLon: number,
  prevTimestamp: string,
  currLat: number,
  currLon: number,
  currTimestamp: string
): number | null {
  // Calculate distance
  const distanceMeters = haversineDistanceMeters(prevLat, prevLon, currLat, currLon);
  
  // Calculate time delta
  const prevTime = new Date(prevTimestamp).getTime();
  const currTime = new Date(currTimestamp).getTime();
  const deltaMs = currTime - prevTime;
  
  // Validate time delta (must be positive and reasonable)
  if (deltaMs <= 0) {
    return null; // Time went backwards or zero (clock issues)
  }
  
  // Convert to seconds and compute speed
  const deltaSeconds = deltaMs / 1000;
  return distanceMeters / deltaSeconds;
}

/**
 * Validate GPS accuracy is within acceptable threshold.
 * 
 * Why this check:
 * - Low-accuracy GPS (> 50m) makes location proof unreliable
 * - Indoor GPS often has 100-1000m accuracy (unusable for mining)
 * - Spoofers may not replicate realistic accuracy values
 * 
 * Threshold rationale:
 * - 50m allows outdoor mobile mining in most conditions
 * - Stricter than typical (±10m) to account for mesh precision needs
 * - Configurable via env for policy tuning
 * 
 * @param accuracyMeters - GPS accuracy in meters
 * @param maxAllowed - Maximum allowed accuracy (default from env)
 * @returns True if accuracy is acceptable
 */
export function validateGpsAccuracy(
  accuracyMeters: number,
  maxAllowed: number = GPS_MAX_ACCURACY_M
): boolean {
  return accuracyMeters > 0 && accuracyMeters <= maxAllowed;
}

/**
 * Validate speed between consecutive proofs.
 * 
 * Checks if user moved faster than physically reasonable.
 * 
 * Default limit: 15 m/s (54 km/h)
 * - Walking: ~1.4 m/s (5 km/h)
 * - Running: ~3-5 m/s (10-18 km/h)
 * - Cycling: ~5-8 m/s (18-29 km/h)
 * - Car: ~15+ m/s (54+ km/h)
 * 
 * Why 15 m/s:
 * - Allows cycling and slow car travel
 * - Catches teleportation (GPS jumping across city)
 * - Prevents bot farms with coordinated spoofing
 * 
 * Future:
 * - Dynamic limits based on transport mode hints
 * - Acceleration checks (can't go 0 → 50 m/s instantly)
 * 
 * @param prevEvent - Previous proof event with location and timestamp
 * @param currPayload - Current proof payload
 * @param speedLimitMps - Speed limit in m/s (default from env)
 * @returns Validation result with speed if computed
 */
export function validateSpeedGate(
  prevEvent: {
    lat: number;
    lon: number;
    timestamp: string;
  } | null,
  currPayload: {
    lat: number;
    lon: number;
    timestamp: string;
  },
  speedLimitMps: number = PROOF_SPEED_LIMIT_MPS
): {
  ok: boolean;
  speed?: number;
  error?: string;
} {
  // No previous event = first proof for this account (pass)
  if (!prevEvent) {
    return { ok: true };
  }
  
  // Compute speed
  const speed = computeSpeedMps(
    prevEvent.lat,
    prevEvent.lon,
    prevEvent.timestamp,
    currPayload.lat,
    currPayload.lon,
    currPayload.timestamp
  );
  
  // Handle invalid time delta
  if (speed === null) {
    return {
      ok: false,
      error: 'Invalid timestamps (time went backwards or zero delta)',
    };
  }
  
  // Check speed limit
  if (speed > speedLimitMps) {
    return {
      ok: false,
      speed,
      error: `Speed ${speed.toFixed(1)} m/s exceeds limit ${speedLimitMps} m/s`,
    };
  }
  
  return { ok: true, speed };
}

/**
 * Validate minimum time between proofs (moratorium).
 * 
 * Prevents rapid-fire proof submissions from same account.
 * 
 * Default: 10 seconds
 * 
 * Why this check:
 * - Prevents bot spamming (automated high-frequency submissions)
 * - Rate-limits each account to reasonable human interaction speed
 * - Gives GPS time to stabilize between readings
 * 
 * Clock skew tolerance:
 * - Allow small negative deltas (< 2 minutes) to account for clock drift
 * - Prevents false rejections from slightly out-of-sync clocks
 * - Still store original timestamps for audit trail
 * 
 * @param lastProofTimestamp - Previous proof timestamp (ISO 8601)
 * @param currProofTimestamp - Current proof timestamp (ISO 8601)
 * @param minDeltaMs - Minimum time delta in milliseconds (default from env)
 * @returns Validation result with delta if computed
 */
export function validateMoratorium(
  lastProofTimestamp: string | null,
  currProofTimestamp: string,
  minDeltaMs: number = PROOF_MORATORIUM_MS
): {
  ok: boolean;
  deltaMs?: number;
  error?: string;
} {
  // No previous proof = first proof for this account (pass)
  if (!lastProofTimestamp) {
    return { ok: true };
  }
  
  // Compute time delta
  const lastTime = new Date(lastProofTimestamp).getTime();
  const currTime = new Date(currProofTimestamp).getTime();
  const deltaMs = currTime - lastTime;
  
  // Allow small clock drift (2 minutes) for out-of-sync clocks
  const CLOCK_DRIFT_TOLERANCE_MS = 2 * 60 * 1000;
  
  if (deltaMs < -CLOCK_DRIFT_TOLERANCE_MS) {
    return {
      ok: false,
      deltaMs,
      error: `Time went backwards by ${Math.abs(deltaMs / 1000).toFixed(1)}s (beyond clock drift tolerance)`,
    };
  }
  
  // Check moratorium
  if (deltaMs < minDeltaMs) {
    return {
      ok: false,
      deltaMs,
      error: `Moratorium not satisfied: ${(deltaMs / 1000).toFixed(1)}s < ${(minDeltaMs / 1000).toFixed(1)}s`,
    };
  }
  
  return { ok: true, deltaMs };
}

/**
 * Get current configuration values.
 * 
 * Useful for logging and debugging policy settings.
 * 
 * @returns Current env-based configuration
 */
export function getConfig() {
  return {
    GPS_MAX_ACCURACY_M,
    PROOF_SPEED_LIMIT_MPS,
    PROOF_MORATORIUM_MS,
  };
}
