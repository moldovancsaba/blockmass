/**
 * Point-in-Triangle Lookup - Find triangle containing a GPS coordinate
 * 
 * Core function: pointToTriangle(lat, lon, level)
 * 
 * Algorithm:
 * 1. Start with all 20 level-1 triangles
 * 2. Test which triangle contains the point (point-in-polygon)
 * 3. Subdivide that triangle into 4 children
 * 4. Repeat until we reach the target level
 * 5. Return the final triangle ID
 * 
 * Performance: O(4 × level) polygon tests
 * - Level 1: 20 tests
 * - Level 5: 20 + 4 + 4 + 4 + 4 = 36 tests
 * - Level 10: 20 + (4 × 9) = 56 tests
 * 
 * Why efficient: Only tests 4 children at each level (not all triangles).
 */

import * as turf from '@turf/turf';
import { TriangleId, createLevel1Id, getChildrenIds } from './addressing.js';
import { triangleIdToPolygon, GeoJSONPolygon } from './polygon.js';
import { sphericalToCartesian, isPointInSphericalTriangle, Vector3 } from './icosahedron.js';

/**
 * Find the triangle at a given level that contains a GPS point.
 * 
 * Returns null if point is not on Earth's surface (invalid lat/lon).
 * 
 * @param lat - Latitude in degrees (-90 to +90)
 * @param lon - Longitude in degrees (-180 to +180)
 * @param level - Target subdivision level (1-21)
 * @returns Triangle ID containing the point, or null if invalid
 * 
 * @example
 * // Find level 10 triangle containing Budapest
 * const id = pointToTriangle(47.4979, 19.0402, 10);
 * // Result: { face: 7, level: 10, path: [0,1,3,2,0,1,2,3,1] }
 */
export function pointToTriangle(
  lat: number,
  lon: number,
  level: number
): TriangleId | null {
  // Validate inputs
  if (lat < -90 || lat > 90) {
    throw new Error(`Invalid latitude: ${lat}. Must be -90 to +90.`);
  }
  if (lon < -180 || lon > 180) {
    throw new Error(`Invalid longitude: ${lon}. Must be -180 to +180.`);
  }
  if (level < 1 || level > 21) {
    throw new Error(`Invalid level: ${level}. Must be 1-21.`);
  }

  // Create Turf point for testing
  const point = turf.point([lon, lat]); // GeoJSON format: [lon, lat]

  // Start at level 1: test all 20 base triangles
  let currentId: TriangleId | null = null;

  for (let face = 0; face < 20; face++) {
    const id = createLevel1Id(face);
    const polygon = triangleIdToPolygon(id);

    if (pointInTriangle(point, polygon)) {
      currentId = id;
      break;
    }
  }

  // If not found in any level-1 triangle, point is invalid
  if (!currentId) {
    return null;
  }

  // If target is level 1, we're done
  if (level === 1) {
    return currentId;
  }

  // Subdivide down to target level
  for (let currentLevel = 1; currentLevel < level; currentLevel++) {
    const children = getChildrenIds(currentId);
    
    // Find all children that contain the point (may be multiple due to edge cases)
    const candidateChildren: TriangleId[] = [];
    
    for (const childId of children) {
      const childPolygon = triangleIdToPolygon(childId);
      
      if (pointInTriangle(point, childPolygon)) {
        candidateChildren.push(childId);
      }
    }

    // If exactly one child contains point, use it
    if (candidateChildren.length === 1) {
      currentId = candidateChildren[0];
    }
    // If multiple children contain point (on edge/vertex), pick closest by centroid
    else if (candidateChildren.length > 1) {
      currentId = findClosestTriangle(point, candidateChildren);
    }
    // If no child contains point (numerical precision gap), pick closest by centroid
    else {
      // Fallback: find the child with centroid closest to the point
      currentId = findClosestTriangle(point, children);
    }
  }

  return currentId;
}

/**
 * Find the triangle with centroid closest to a given point.
 * 
 * Used when multiple children contain a point (edge case) or
 * when no child contains the point (precision gap).
 * 
 * @param point - GeoJSON Point to test
 * @param triangles - Array of candidate triangle IDs
 * @returns Triangle ID with closest centroid
 */
function findClosestTriangle(
  point: turf.helpers.Feature<turf.helpers.Point>,
  triangles: TriangleId[]
): TriangleId {
  let closestId = triangles[0];
  let minDistance = Infinity;

  for (const triangleId of triangles) {
    const dist = distanceToTriangle(point, triangleId);
    if (dist < minDistance) {
      minDistance = dist;
      closestId = triangleId;
    }
  }

  return closestId;
}

/**
 * Test if a point is inside a triangle polygon using proper spherical geometry.
 * 
 * This replaces Turf.js planar approximation with true spherical math.
 * Benefits:
 * - Accurate for any triangle size on sphere (including large level-1 triangles)
 * - No antimeridian issues
 * - Consistent results near poles
 * - Faster (no external library overhead)
 * 
 * @param point - GeoJSON Point [lon, lat]
 * @param polygon - GeoJSON Polygon (triangle with 3 vertices)
 * @returns True if point is inside or on boundary
 */
function pointInTriangle(
  point: turf.helpers.Feature<turf.helpers.Point>,
  polygon: GeoJSONPolygon
): boolean {
  // Extract lat/lon from GeoJSON Point
  const [lon, lat] = point.geometry.coordinates;
  
  // Convert point to Cartesian (unit sphere)
  const pointCartesian = sphericalToCartesian(lat, lon);
  
  // Convert triangle vertices to Cartesian
  // Polygon format: [[[lon0, lat0], [lon1, lat1], [lon2, lat2], [lon0, lat0]]]
  const coords = polygon.coordinates[0];
  const v0 = sphericalToCartesian(coords[0][1], coords[0][0]);
  const v1 = sphericalToCartesian(coords[1][1], coords[1][0]);
  const v2 = sphericalToCartesian(coords[2][1], coords[2][0]);
  
  // Use spherical geometry test
  return isPointInSphericalTriangle(pointCartesian, v0, v1, v2);
}

/**
 * Find all triangles at a given level that intersect a bounding box.
 * 
 * Useful for viewport queries: "Show me all triangles visible on screen."
 * 
 * Algorithm:
 * 1. Start with all 20 level-1 triangles
 * 2. For each triangle:
 *    a. If it intersects bbox, subdivide and test children
 *    b. Recurse until target level
 * 3. Return all triangles at target level that intersect bbox
 * 
 * Performance: O(triangles in bbox × level)
 * - Small bbox at level 10: ~10-100 triangles
 * - Large bbox (continent) at level 10: ~1000-10,000 triangles
 * 
 * @param bbox - Bounding box [west, south, east, north] in degrees
 * @param level - Target subdivision level (1-21)
 * @param maxResults - Maximum number of triangles to return (prevents runaway queries)
 * @returns Array of triangle IDs that intersect the bbox
 * 
 * @example
 * // Find level 10 triangles in Hungary
 * const triangles = trianglesInBbox([16.0, 45.0, 23.0, 49.0], 10);
 * // Result: [...triangle IDs...]
 */
export function trianglesInBbox(
  bbox: [number, number, number, number],
  level: number,
  maxResults: number = 10000
): TriangleId[] {
  const [west, south, east, north] = bbox;

  // Validate bbox
  if (west < -180 || west > 180 || east < -180 || east > 180) {
    throw new Error('Invalid longitude in bbox. Must be -180 to +180.');
  }
  if (south < -90 || south > 90 || north < -90 || north > 90) {
    throw new Error('Invalid latitude in bbox. Must be -90 to +90.');
  }
  if (south > north) {
    throw new Error(`Invalid bbox: south (${south}) > north (${north}).`);
  }

  // Create Turf bounding box polygon
  const bboxPolygon = turf.bboxPolygon([west, south, east, north]);

  const results: TriangleId[] = [];

  // Helper function for recursive search
  function searchLevel(id: TriangleId) {
    // Stop if we've hit max results
    if (results.length >= maxResults) {
      return;
    }

    // Get triangle polygon
    const polygon = triangleIdToPolygon(id);
    const turfPolygon = turf.polygon(polygon.coordinates);

    // Check if triangle intersects bbox
    if (!triangleIntersectsBbox(turfPolygon, bboxPolygon)) {
      return; // Skip this triangle and its children
    }

    // If we're at target level, add to results
    if (id.level === level) {
      results.push(id);
      return;
    }

    // Otherwise, subdivide and search children
    const children = getChildrenIds(id);
    for (const child of children) {
      searchLevel(child);
    }
  }

  // Start search from all 20 level-1 triangles
  for (let face = 0; face < 20; face++) {
    searchLevel(createLevel1Id(face));
  }

  return results;
}

/**
 * Test if a triangle intersects a bounding box.
 * 
 * Uses Turf.js booleanIntersects for robust geometry testing.
 * 
 * @param triangle - Turf polygon
 * @param bbox - Turf bbox polygon
 * @returns True if triangle intersects or is contained by bbox
 */
function triangleIntersectsBbox(
  triangle: turf.helpers.Feature<turf.helpers.Polygon>,
  bbox: turf.helpers.Feature<turf.helpers.Polygon>
): boolean {
  // Check for intersection or containment
  // Use booleanOverlap and booleanWithin for compatibility
  try {
    return (
      turf.booleanOverlap(triangle, bbox) ||
      turf.booleanWithin(triangle, bbox) ||
      turf.booleanWithin(bbox, triangle)
    );
  } catch {
    // Fallback: check if any vertex of triangle is in bbox
    const triCoords = triangle.geometry.coordinates[0];
    return triCoords.some(coord => {
      const pt = turf.point(coord);
      return turf.booleanPointInPolygon(pt, bbox);
    });
  }
}

/**
 * Find the N nearest triangles to a point at a given level.
 * 
 * Useful for "show nearby mineable triangles."
 * 
 * Algorithm:
 * 1. Find the triangle containing the point
 * 2. Get that triangle's siblings (same parent)
 * 3. Get parent's siblings' children at target level
 * 4. Sort by distance from point to triangle centroid
 * 5. Return top N
 * 
 * Performance: O(N log N) for sorting
 * 
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param level - Target subdivision level
 * @param count - Number of nearest triangles to return
 * @returns Array of triangle IDs sorted by distance (closest first)
 * 
 * @example
 * // Find 10 nearest level 15 triangles to current location
 * const nearest = nearestTriangles(47.4979, 19.0402, 15, 10);
 */
export function nearestTriangles(
  lat: number,
  lon: number,
  level: number,
  count: number = 10
): TriangleId[] {
  // Find the triangle containing this point
  const centerTriangle = pointToTriangle(lat, lon, level);
  if (!centerTriangle) {
    return [];
  }

  // For MVP, implement simple approach:
  // 1. Find center triangle
  // 2. Get its 4 children (if not max level)
  // 3. Get parent's other 3 children
  // This gives ~7-8 triangles around the point

  const candidates: TriangleId[] = [centerTriangle];

  // Add siblings (if not level 1)
  if (centerTriangle.level > 1) {
    // Get parent, then all its children (4 total, including centerTriangle)
    const parentPath = centerTriangle.path.slice(0, -1);
    const parent = {
      face: centerTriangle.face,
      level: centerTriangle.level - 1,
      path: parentPath,
    };

    const siblings = getChildrenIds(parent);
    candidates.push(...siblings);
  }

  // Remove duplicates (in case centerTriangle is already in siblings)
  const uniqueCandidates = candidates.filter(
    (id, index, self) =>
      index === self.findIndex((t) => JSON.stringify(t) === JSON.stringify(id))
  );

  // Sort by distance from input point
  const point = turf.point([lon, lat]);
  const sorted = uniqueCandidates.sort((a, b) => {
    const distA = distanceToTriangle(point, a);
    const distB = distanceToTriangle(point, b);
    return distA - distB;
  });

  // Return top N
  return sorted.slice(0, count);
}

/**
 * Compute distance from a point to a triangle's centroid.
 * 
 * Uses Turf.js distance (great circle / Haversine).
 * 
 * @param point - GeoJSON Point
 * @param triangleId - Triangle ID
 * @returns Distance in meters
 */
function distanceToTriangle(
  point: turf.helpers.Feature<turf.helpers.Point>,
  triangleId: TriangleId
): number {
  const polygon = triangleIdToPolygon(triangleId);

  // Compute centroid
  const turfPolygon = turf.polygon(polygon.coordinates);
  const centroid = turf.centroid(turfPolygon);

  // Compute distance
  return turf.distance(point, centroid, { units: 'meters' });
}

/**
 * Get all triangles along a line (great circle path between two points).
 * 
 * Useful for routing or "triangles I'll pass through on this journey."
 * 
 * @param start - [lon, lat] starting point
 * @param end - [lon, lat] ending point
 * @param level - Target subdivision level
 * @returns Array of triangle IDs along the path (in order)
 */
export function trianglesAlongPath(
  start: [number, number],
  end: [number, number],
  level: number
): TriangleId[] {
  // Create great circle line
  const line = turf.greatCircle(turf.point(start), turf.point(end));

  // Sample points along the line
  const lineFeature = Array.isArray(line.geometry.coordinates[0][0])
    ? turf.lineString(line.geometry.coordinates[0] as any)
    : line as any;
  
  const length = turf.length(lineFeature, { units: 'meters' });
  const stepSize = Math.max(1000, length / 100); // Sample every 1km or 1% of length

  const triangles: TriangleId[] = [];
  const seenIds = new Set<string>();

  // Sample points and find triangles
  for (let dist = 0; dist <= length; dist += stepSize) {
    const point = turf.along(lineFeature, dist, { units: 'meters' });
    const [lon, lat] = point.geometry.coordinates;

    const triangleId = pointToTriangle(lat, lon, level);
    if (triangleId) {
      const idStr = JSON.stringify(triangleId);
      if (!seenIds.has(idStr)) {
        seenIds.add(idStr);
        triangles.push(triangleId);
      }
    }
  }

  return triangles;
}
