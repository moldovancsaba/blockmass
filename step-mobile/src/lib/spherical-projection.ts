/**
 * Spherical Projection Utilities
 * 
 * What: Convert GPS coordinates (lat/lon) to 3D positions on unit sphere
 * Why: Render spherical triangles on Earth sphere surface (NO flat map)
 * 
 * This module provides coordinate conversion functions for mapping
 * geographic coordinates (latitude/longitude) to 3D Cartesian coordinates
 * on a unit sphere (radius = 1.0).
 * 
 * Critical: This uses true spherical geometry with NO distortion.
 * The web Three.js implementation uses the same math.
 * 
 * Reference: 
 * - /frontend/app/mesh-mining-3d/page.tsx (web implementation)
 * - /step-mobile/MOBILE_3D_MINING_PLAN.md Phase 2
 * 
 * Created: 2025-10-08T09:33:00.000Z
 */

import * as THREE from 'three';

// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Geographic coordinate (GPS format)
 * 
 * @param lat - Latitude in degrees (-90 to +90)
 * @param lon - Longitude in degrees (-180 to +180)
 */
export interface GeoCoordinate {
  lat: number;
  lon: number;
}

/**
 * 3D Cartesian coordinate on unit sphere
 * 
 * @param x - X coordinate (-1 to +1)
 * @param y - Y coordinate (-1 to +1)
 * @param z - Z coordinate (-1 to +1)
 * 
 * Constraint: x² + y² + z² = 1 (unit sphere)
 */
export interface CartesianCoordinate {
  x: number;
  y: number;
  z: number;
}

// ========================================
// COORDINATE CONVERSION
// ========================================

/**
 * Convert latitude/longitude to 3D position on sphere surface
 * 
 * What: Transforms GPS coordinates to 3D Cartesian (x, y, z)
 * Why: Render spherical triangles at correct positions on Earth sphere
 * 
 * Math (Spherical to Cartesian conversion):
 * - phi (polar angle) = (90° - lat) converted to radians
 * - theta (azimuthal angle) = (lon + 180°) converted to radians
 * - x = -sin(phi) × cos(theta)
 * - y = cos(phi)
 * - z = sin(phi) × sin(theta)
 * 
 * Coordinate System:
 * - Y-axis: North Pole (+Y) to South Pole (-Y)
 * - X-axis: Prime Meridian (0° lon) at +X direction
 * - Z-axis: 90° East longitude at +Z direction
 * 
 * IMPORTANT: Mesh radius is 0.9999 (slightly inside conceptual Earth at 1.0)
 * This allows camera to get very close (down to 1.0) without penetrating mesh.
 * Matches frontend POC implementation.
 * 
 * @param lat - Latitude in degrees (-90 to +90)
 * @param lon - Longitude in degrees (-180 to +180)
 * @returns Three.js Vector3 at radius 0.9999
 * 
 * @example
 * ```typescript
 * // San Francisco: 37.7749° N, 122.4194° W
 * const sfPosition = latLonToVector3(37.7749, -122.4194);
 * // Returns: Vector3 { x: -0.60, y: 0.61, z: -0.51 } at radius 0.9999
 * ```
 */
export function latLonToVector3(lat: number, lon: number): THREE.Vector3 {
  // Convert degrees to radians
  const phi = (90 - lat) * (Math.PI / 180);    // Polar angle from North Pole
  const theta = (lon + 180) * (Math.PI / 180); // Azimuthal angle from -180°
  
  // MESH_RADIUS: Triangle mesh at radius 0.9999 (like frontend POC)
  // WHY: Allows camera to get very close (1.0) without penetrating
  const MESH_RADIUS = 0.9999;
  
  // Spherical to Cartesian conversion at mesh radius
  const x = -Math.sin(phi) * Math.cos(theta) * MESH_RADIUS;
  const y = Math.cos(phi) * MESH_RADIUS;
  const z = Math.sin(phi) * Math.sin(theta) * MESH_RADIUS;
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Convert 3D position back to latitude/longitude
 * 
 * What: Inverse transformation from Cartesian to GPS coordinates
 * Why: Useful for debugging, user position display, API queries
 * 
 * Math (Cartesian to Spherical):
 * - lat = 90° - acos(y) × (180°/π)
 * - lon = atan2(z, -x) × (180°/π) - 180°
 * 
 * @param vector - Three.js Vector3 on unit sphere
 * @returns Geographic coordinate {lat, lon} in degrees
 * 
 * @example
 * ```typescript
 * const pos = new THREE.Vector3(-0.60, 0.61, -0.51);
 * const coords = vector3ToLatLon(pos);
 * // Returns: { lat: 37.77, lon: -122.42 } (approx San Francisco)
 * ```
 */
export function vector3ToLatLon(vector: THREE.Vector3): GeoCoordinate {
  // Normalize vector to ensure it's on unit sphere
  const normalized = vector.clone().normalize();
  
  // Cartesian to Spherical
  const lat = 90 - Math.acos(normalized.y) * (180 / Math.PI);
  const lon = Math.atan2(normalized.z, -normalized.x) * (180 / Math.PI) - 180;
  
  return { lat, lon };
}

/**
 * Convert GeoJSON polygon coordinates to Vector3 array
 * 
 * What: Transform spherical triangle vertices from API format to 3D
 * Why: API returns GeoJSON polygons, we need 3D positions for rendering
 * 
 * GeoJSON Format: [[lon1, lat1], [lon2, lat2], [lon3, lat3], [lon1, lat1]]
 * - Coordinates are [longitude, latitude] (NOT lat/lon!)
 * - First and last point are identical (closed ring)
 * 
 * This function extracts the 3 unique vertices and converts to 3D.
 * 
 * @param coordinates - GeoJSON polygon ring [[lon, lat], ...]
 * @returns Array of 3 Three.js Vector3 (triangle vertices)
 * 
 * @example
 * ```typescript
 * const geoJson = {
 *   type: 'Polygon',
 *   coordinates: [[
 *     [-122.5, 37.8],
 *     [-122.4, 37.7],
 *     [-122.3, 37.8],
 *     [-122.5, 37.8] // Closing point
 *   ]]
 * };
 * const vertices = polygonToVector3Array(geoJson.coordinates[0]);
 * // Returns: [Vector3, Vector3, Vector3] (3 triangle vertices)
 * ```
 */
export function polygonToVector3Array(
  coordinates: number[][]
): THREE.Vector3[] {
  // GeoJSON polygon rings are closed (first point = last point)
  // Extract first 3 unique points (triangle vertices)
  const uniquePoints = coordinates.slice(0, 3);
  
  // Convert [lon, lat] to Vector3
  return uniquePoints.map(([lon, lat]) => latLonToVector3(lat, lon));
}

/**
 * Compute centroid of spherical triangle
 * 
 * What: Calculate center point of triangle on sphere surface
 * Why: Useful for triangle labeling, backface culling, LOD calculations
 * 
 * Method: Average the 3 vertices in Cartesian space, then normalize
 * back to sphere surface. This is an approximation of the true
 * spherical centroid but sufficient for our purposes.
 * 
 * @param v1 - First triangle vertex
 * @param v2 - Second triangle vertex
 * @param v3 - Third triangle vertex
 * @returns Centroid position on unit sphere
 * 
 * @example
 * ```typescript
 * const v1 = latLonToVector3(37.7, -122.5);
 * const v2 = latLonToVector3(37.8, -122.4);
 * const v3 = latLonToVector3(37.9, -122.5);
 * const center = getTriangleCentroid(v1, v2, v3);
 * // Returns: Vector3 at approximate center of triangle
 * ```
 */
export function getTriangleCentroid(
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  v3: THREE.Vector3
): THREE.Vector3 {
  // Average vertices in Cartesian space
  const centroid = new THREE.Vector3(
    (v1.x + v2.x + v3.x) / 3,
    (v1.y + v2.y + v3.y) / 3,
    (v1.z + v2.z + v3.z) / 3
  );
  
  // Normalize back to unit sphere surface
  return centroid.normalize();
}

/**
 * Check if triangle is front-facing (visible from camera)
 * 
 * What: Backface culling test for spherical triangles
 * Why: Don't render triangles on back side of sphere (not visible)
 * 
 * Method: Compute triangle normal, check if it points toward camera.
 * For a unit sphere, the normal at any point is just the normalized
 * position vector (points outward from center).
 * 
 * We check if the centroid-to-camera vector has a positive dot product
 * with the outward normal. If positive, triangle faces camera.
 * 
 * @param v1 - First triangle vertex
 * @param v2 - Second triangle vertex
 * @param v3 - Third triangle vertex
 * @param cameraPosition - Camera position in 3D space
 * @returns True if triangle is front-facing (visible)
 * 
 * @example
 * ```typescript
 * const tri = [v1, v2, v3];
 * const camera = new THREE.Vector3(0, 0, 2); // Camera 2 units away
 * if (isTriangleFrontFacing(tri[0], tri[1], tri[2], camera)) {
 *   // Render this triangle
 * }
 * ```
 */
export function isTriangleFrontFacing(
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  v3: THREE.Vector3,
  cameraPosition: THREE.Vector3
): boolean {
  // Compute triangle centroid
  const centroid = getTriangleCentroid(v1, v2, v3);
  
  // Outward normal (for unit sphere, this is just the centroid direction)
  const normal = centroid.clone().normalize();
  
  // Vector from centroid to camera
  const toCam = cameraPosition.clone().sub(centroid).normalize();
  
  // Dot product > 0 means normal points toward camera (front-facing)
  return toCam.dot(normal) > 0;
}

/**
 * Calculate distance between two points on sphere surface (great circle distance)
 * 
 * What: Compute shortest path distance along sphere surface
 * Why: Useful for proximity queries, LOD decisions, neighbor detection
 * 
 * Method: Use the haversine formula for great circle distance.
 * Result is in the same units as sphere radius (for unit sphere: radians).
 * 
 * To convert to real-world distance: multiply by Earth radius (6,371 km).
 * 
 * @param p1 - First point on unit sphere
 * @param p2 - Second point on unit sphere
 * @returns Angular distance in radians (multiply by 6,371,000 for meters)
 * 
 * @example
 * ```typescript
 * const sf = latLonToVector3(37.7749, -122.4194);
 * const la = latLonToVector3(34.0522, -118.2437);
 * const angularDist = greatCircleDistance(sf, la);
 * const distKm = angularDist * 6371; // ~559 km
 * ```
 */
export function greatCircleDistance(
  p1: THREE.Vector3,
  p2: THREE.Vector3
): number {
  // Dot product gives cos(angle) for unit vectors
  const dot = p1.dot(p2);
  
  // Clamp to [-1, 1] to avoid numerical errors in acos
  const clamped = Math.max(-1, Math.min(1, dot));
  
  // Angular distance in radians
  return Math.acos(clamped);
}

/**
 * Convert angular distance on sphere to real-world meters
 * 
 * What: Scale angular distance (radians) to Earth surface distance
 * Why: Display distances in km/m to users
 * 
 * Formula: distance (m) = angular distance (rad) × Earth radius (6,371 km)
 * 
 * @param angularDistanceRadians - Angular distance on unit sphere
 * @returns Distance in meters on Earth surface
 * 
 * @example
 * ```typescript
 * const angular = greatCircleDistance(sf, la);
 * const meters = angularToMeters(angular);
 * console.log(`Distance: ${(meters / 1000).toFixed(0)} km`);
 * // Output: "Distance: 559 km"
 * ```
 */
export function angularToMeters(angularDistanceRadians: number): number {
  const EARTH_RADIUS_M = 6371000; // Earth radius: 6,371 km
  return angularDistanceRadians * EARTH_RADIUS_M;
}

/**
 * Estimate side length of spherical triangle
 * 
 * What: Calculate approximate triangle size based on level
 * Why: LOD decisions, visibility culling, performance optimization
 * 
 * Formula (from backend addressing.ts):
 * - Base length at level 1: ~8,000 km
 * - Each subdivision: length ÷ 2
 * - Level N: 8,000 km / 2^(N-1)
 * 
 * Examples:
 * - Level 1: ~8,000 km (massive)
 * - Level 10: ~15.6 km (city-scale)
 * - Level 17: ~115 m (block-scale)
 * - Level 21: ~7.2 m (room-scale)
 * 
 * @param level - Triangle subdivision level (1-21)
 * @returns Approximate side length in meters
 */
export function estimateTriangleSideLength(level: number): number {
  const BASE_LENGTH_M = 8_000_000; // 8,000 km at level 1
  return BASE_LENGTH_M / Math.pow(2, level - 1);
}
