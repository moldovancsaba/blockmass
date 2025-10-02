/**
 * Polygon Generation - Convert TriangleId to GeoJSON Polygon
 * 
 * This module computes the actual geographic coordinates of a triangle
 * by traversing the subdivision tree from level 1 down to the target level.
 * 
 * Process:
 * 1. Start with base icosahedron face (level 1)
 * 2. Follow the path array, subdividing at each step
 * 3. Return the final triangle's vertices as GeoJSON Polygon
 * 
 * Example: face=7, level=5, path=[0,1,3,2]
 * - Start with face 7 at level 1
 * - Subdivide → take child 0
 * - Subdivide → take child 1
 * - Subdivide → take child 3
 * - Subdivide → take child 2
 * - Return resulting triangle vertices as lat/lon coordinates
 */

import {
  Vector3,
  getFaceVertices,
  subdivideTriangle,
  cartesianToSpherical,
} from './icosahedron.js';
import { TriangleId } from './addressing.js';

/**
 * GeoJSON Polygon format (RFC 7946).
 * 
 * Structure:
 * - type: "Polygon"
 * - coordinates: Array of linear rings
 *   - First ring: exterior boundary (must be closed: first point = last point)
 *   - Additional rings: holes (not used in STEP mesh)
 * 
 * Coordinate format: [longitude, latitude] (NOT lat/lon!)
 * 
 * Example:
 * {
 *   "type": "Polygon",
 *   "coordinates": [
 *     [
 *       [lon1, lat1],
 *       [lon2, lat2],
 *       [lon3, lat3],
 *       [lon1, lat1]  // Closed ring
 *     ]
 *   ]
 * }
 */
export interface GeoJSONPolygon {
  type: 'Polygon';
  coordinates: number[][][]; // [[[lon, lat], [lon, lat], ...]]
}

/**
 * GeoJSON Point format.
 * 
 * Coordinate format: [longitude, latitude]
 */
export interface GeoJSONPoint {
  type: 'Point';
  coordinates: [number, number]; // [lon, lat]
}

/**
 * Convert TriangleId to GeoJSON Polygon.
 * 
 * This is the core function that computes triangle coordinates.
 * 
 * Algorithm:
 * 1. Get the 3 vertices of the base face (level 1)
 * 2. For each digit in the path:
 *    a. Subdivide current triangle into 4 children
 *    b. Select the child specified by path digit (0-3)
 *    c. Continue with that child's vertices
 * 3. Convert final 3D vertices to lat/lon
 * 4. Return as closed GeoJSON Polygon
 * 
 * @param id - Triangle ID to convert
 * @returns GeoJSON Polygon with coordinates
 */
export function triangleIdToPolygon(id: TriangleId): GeoJSONPolygon {
  // Start with base icosahedron face at level 1
  let [v0, v1, v2] = getFaceVertices(id.face);

  // Traverse subdivision path
  for (const childIndex of id.path) {
    // Subdivide current triangle into 4 children
    const children = subdivideTriangle(v0, v1, v2);

    // Select the specified child
    [v0, v1, v2] = children[childIndex];
  }

  // Convert 3D Cartesian vertices to lat/lon
  const coord0 = cartesianToSpherical(v0);
  const coord1 = cartesianToSpherical(v1);
  const coord2 = cartesianToSpherical(v2);

  // Return as closed GeoJSON Polygon (first point = last point)
  // Format: [lon, lat] per GeoJSON spec
  return {
    type: 'Polygon',
    coordinates: [
      [
        [coord0.lon, coord0.lat],
        [coord1.lon, coord1.lat],
        [coord2.lon, coord2.lat],
        [coord0.lon, coord0.lat], // Close the ring
      ],
    ],
  };
}

/**
 * Compute the centroid (center point) of a triangle.
 * 
 * Method: Average the 3 vertices in Cartesian space, then normalize to sphere.
 * 
 * Note: This is an approximation. True spherical centroid is more complex,
 * but this is sufficient for display purposes.
 * 
 * @param id - Triangle ID
 * @returns GeoJSON Point at triangle center
 */
export function triangleIdToCentroid(id: TriangleId): GeoJSONPoint {
  // Get triangle vertices (same traversal as triangleIdToPolygon)
  let [v0, v1, v2] = getFaceVertices(id.face);

  for (const childIndex of id.path) {
    const children = subdivideTriangle(v0, v1, v2);
    [v0, v1, v2] = children[childIndex];
  }

  // Compute centroid in Cartesian space
  const centroid: Vector3 = {
    x: (v0.x + v1.x + v2.x) / 3,
    y: (v0.y + v1.y + v2.y) / 3,
    z: (v0.z + v1.z + v2.z) / 3,
  };

  // Normalize to sphere surface
  const magnitude = Math.sqrt(
    centroid.x * centroid.x + centroid.y * centroid.y + centroid.z * centroid.z
  );
  const normalized: Vector3 = {
    x: centroid.x / magnitude,
    y: centroid.y / magnitude,
    z: centroid.z / magnitude,
  };

  // Convert to lat/lon
  const coord = cartesianToSpherical(normalized);

  return {
    type: 'Point',
    coordinates: [coord.lon, coord.lat],
  };
}

/**
 * Get the 3 corner vertices of a triangle as GeoJSON Points.
 * 
 * Useful for detailed polygon rendering or vertex-level queries.
 * 
 * @param id - Triangle ID
 * @returns Array of 3 GeoJSON Points
 */
export function triangleIdToVertices(
  id: TriangleId
): [GeoJSONPoint, GeoJSONPoint, GeoJSONPoint] {
  // Get triangle vertices
  let [v0, v1, v2] = getFaceVertices(id.face);

  for (const childIndex of id.path) {
    const children = subdivideTriangle(v0, v1, v2);
    [v0, v1, v2] = children[childIndex];
  }

  // Convert to lat/lon
  const coord0 = cartesianToSpherical(v0);
  const coord1 = cartesianToSpherical(v1);
  const coord2 = cartesianToSpherical(v2);

  return [
    { type: 'Point', coordinates: [coord0.lon, coord0.lat] },
    { type: 'Point', coordinates: [coord1.lon, coord1.lat] },
    { type: 'Point', coordinates: [coord2.lon, coord2.lat] },
  ];
}

/**
 * Compute approximate area of a triangle in square meters.
 * 
 * Uses spherical excess formula for accuracy on sphere.
 * 
 * Formula:
 * - Spherical excess E = sum of angles - π
 * - Area = R² × E, where R = Earth radius (6,371 km)
 * 
 * Note: This is approximate. Exact area requires spherical trigonometry.
 * 
 * @param id - Triangle ID
 * @returns Area in square meters
 */
export function triangleIdToArea(id: TriangleId): number {
  // Get triangle vertices
  let [v0, v1, v2] = getFaceVertices(id.face);

  for (const childIndex of id.path) {
    const children = subdivideTriangle(v0, v1, v2);
    [v0, v1, v2] = children[childIndex];
  }

  // Compute edge lengths (great circle distances)
  const a = greatCircleDistance(v1, v2);
  const b = greatCircleDistance(v0, v2);
  const c = greatCircleDistance(v0, v1);

  // Compute semi-perimeter
  const s = (a + b + c) / 2;

  // Compute spherical excess using L'Huilier's formula
  const tanE4 = Math.sqrt(
    Math.tan(s / 2) *
      Math.tan((s - a) / 2) *
      Math.tan((s - b) / 2) *
      Math.tan((s - c) / 2)
  );
  const E = 4 * Math.atan(tanE4);

  // Compute area
  const earthRadius = 6_371_000; // meters
  const area = earthRadius * earthRadius * E;

  return area;
}

/**
 * Compute great circle distance between two points on unit sphere.
 * 
 * Uses haversine formula for numerical stability.
 * 
 * @param v1 - First point (Cartesian)
 * @param v2 - Second point (Cartesian)
 * @returns Angular distance in radians
 */
function greatCircleDistance(v1: Vector3, v2: Vector3): number {
  // Dot product gives cos(angle)
  const dot = v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;

  // Clamp to [-1, 1] to avoid numerical errors in acos
  const clamped = Math.max(-1, Math.min(1, dot));

  // Angle in radians
  return Math.acos(clamped);
}

/**
 * Check if a triangle crosses the antimeridian (180° longitude).
 * 
 * Antimeridian crossing requires special handling in map rendering:
 * - Split polygon into 2 parts
 * - Or use alternative projection
 * 
 * Detection: If any edge spans more than 180° in longitude, it crosses.
 * 
 * @param polygon - GeoJSON Polygon
 * @returns True if crosses antimeridian
 */
export function crossesAntimeridian(polygon: GeoJSONPolygon): boolean {
  const ring = polygon.coordinates[0];

  for (let i = 0; i < ring.length - 1; i++) {
    const [lon1] = ring[i];
    const [lon2] = ring[i + 1];

    // If longitude difference > 180°, edge crosses antimeridian
    if (Math.abs(lon2 - lon1) > 180) {
      return true;
    }
  }

  return false;
}

/**
 * Estimate perimeter of a triangle in meters.
 * 
 * Sum of 3 great circle edge lengths.
 * 
 * @param id - Triangle ID
 * @returns Perimeter in meters
 */
export function triangleIdToPerimeter(id: TriangleId): number {
  // Get triangle vertices
  let [v0, v1, v2] = getFaceVertices(id.face);

  for (const childIndex of id.path) {
    const children = subdivideTriangle(v0, v1, v2);
    [v0, v1, v2] = children[childIndex];
  }

  // Compute edge lengths in radians
  const a = greatCircleDistance(v1, v2);
  const b = greatCircleDistance(v0, v2);
  const c = greatCircleDistance(v0, v1);

  // Convert to meters
  const earthRadius = 6_371_000;
  return (a + b + c) * earthRadius;
}
