/**
 * Icosahedron Geometry - Seed vertices and faces for STEP mesh
 * 
 * A regular icosahedron has:
 * - 12 vertices
 * - 20 triangular faces
 * - 30 edges
 * 
 * Vertices are positioned using the golden ratio (φ) for perfect symmetry.
 * All vertices lie on the unit sphere (radius = 1).
 * 
 * Why icosahedron:
 * - Most uniform distribution of points on sphere among Platonic solids
 * - Subdivides cleanly into triangles (no squares/pentagons)
 * - Minimizes distortion across recursive subdivision levels
 */

// Golden ratio: φ = (1 + √5) / 2 ≈ 1.618033988749895
const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Vector3 represents a point in 3D Cartesian space.
 * For sphere, coordinates satisfy: x² + y² + z² = 1
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 12 vertices of a regular icosahedron on the unit sphere.
 * 
 * Construction method:
 * - 3 orthogonal rectangles with sides in golden ratio (1:φ)
 * - Normalize all points to unit sphere
 * 
 * Vertex indices: 0-11
 * Coordinate pattern ensures even distribution around sphere.
 */
export const ICOSAHEDRON_VERTICES: Vector3[] = [
  // Rectangle in XY plane
  { x: -1, y: PHI, z: 0 },
  { x: 1, y: PHI, z: 0 },
  { x: -1, y: -PHI, z: 0 },
  { x: 1, y: -PHI, z: 0 },

  // Rectangle in YZ plane
  { x: 0, y: -1, z: PHI },
  { x: 0, y: 1, z: PHI },
  { x: 0, y: -1, z: -PHI },
  { x: 0, y: 1, z: -PHI },

  // Rectangle in XZ plane
  { x: PHI, y: 0, z: -1 },
  { x: PHI, y: 0, z: 1 },
  { x: -PHI, y: 0, z: -1 },
  { x: -PHI, y: 0, z: 1 },
].map(normalize); // Normalize all to unit sphere

/**
 * Face definition: 3 vertex indices forming a triangle.
 * Winding order: counterclockwise when viewed from outside sphere.
 */
export interface Face {
  vertices: [number, number, number]; // Indices into ICOSAHEDRON_VERTICES
}

/**
 * 20 triangular faces of the icosahedron.
 * 
 * Each face is defined by 3 vertex indices.
 * Vertices are ordered counterclockwise (right-hand rule).
 * This ensures consistent normal vector pointing outward.
 * 
 * Face indices: 0-19 (the "level 1" triangles in STEP mesh)
 */
export const ICOSAHEDRON_FACES: Face[] = [
  // 5 faces around vertex 0 (top)
  { vertices: [0, 11, 5] },
  { vertices: [0, 5, 1] },
  { vertices: [0, 1, 7] },
  { vertices: [0, 7, 10] },
  { vertices: [0, 10, 11] },

  // 5 adjacent faces (upper band)
  { vertices: [1, 5, 9] },
  { vertices: [5, 11, 4] },
  { vertices: [11, 10, 2] },
  { vertices: [10, 7, 6] },
  { vertices: [7, 1, 8] },

  // 5 faces forming lower band
  { vertices: [3, 9, 4] },
  { vertices: [3, 4, 2] },
  { vertices: [3, 2, 6] },
  { vertices: [3, 6, 8] },
  { vertices: [3, 8, 9] },

  // 5 faces around vertex 3 (bottom)
  { vertices: [4, 9, 5] },
  { vertices: [2, 4, 11] },
  { vertices: [6, 2, 10] },
  { vertices: [8, 6, 7] },
  { vertices: [9, 8, 1] },
];

/**
 * Normalize a vector to lie on the unit sphere.
 * 
 * Formula: v_normalized = v / ||v||
 * where ||v|| = sqrt(x² + y² + z²)
 * 
 * @param v - Vector to normalize
 * @returns Normalized vector with magnitude 1
 */
function normalize(v: Vector3): Vector3 {
  const magnitude = Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
  return {
    x: v.x / magnitude,
    y: v.y / magnitude,
    z: v.z / magnitude,
  };
}

/**
 * Convert Cartesian (x, y, z) to Spherical (lat, lon) coordinates.
 * 
 * Used to convert 3D mesh vertices to geographic coordinates.
 * 
 * @param v - Vector3 on unit sphere
 * @returns {lat, lon} in degrees
 *   - lat: -90 (South Pole) to +90 (North Pole)
 *   - lon: -180 (West) to +180 (East)
 */
export function cartesianToSpherical(v: Vector3): { lat: number; lon: number } {
  // Latitude: angle from equatorial plane
  // lat = arcsin(z)
  const lat = (Math.asin(v.z) * 180) / Math.PI;

  // Longitude: angle in XY plane from +X axis
  // lon = arctan2(y, x)
  const lon = (Math.atan2(v.y, v.x) * 180) / Math.PI;

  return { lat, lon };
}

/**
 * Convert Spherical (lat, lon) to Cartesian (x, y, z) on unit sphere.
 * 
 * @param lat - Latitude in degrees (-90 to +90)
 * @param lon - Longitude in degrees (-180 to +180)
 * @returns Vector3 on unit sphere
 */
export function sphericalToCartesian(
  lat: number,
  lon: number
): Vector3 {
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;

  const cosLat = Math.cos(latRad);

  return {
    x: cosLat * Math.cos(lonRad),
    y: cosLat * Math.sin(lonRad),
    z: Math.sin(latRad),
  };
}

/**
 * Compute geodesic midpoint between two points on unit sphere.
 * 
 * This is the "great circle" midpoint (shortest path on sphere surface),
 * NOT the Euclidean midpoint in 3D space.
 * 
 * Method: Average the two vectors and normalize back to sphere.
 * 
 * @param v1 - First point on unit sphere
 * @param v2 - Second point on unit sphere
 * @returns Midpoint on unit sphere
 */
export function geodesicMidpoint(v1: Vector3, v2: Vector3): Vector3 {
  // Average coordinates
  const mid = {
    x: (v1.x + v2.x) / 2,
    y: (v1.y + v2.y) / 2,
    z: (v1.z + v2.z) / 2,
  };

  // Project back to sphere surface
  return normalize(mid);
}

/**
 * Get the 3 vertices of a face as Vector3 coordinates.
 * 
 * @param faceIndex - Index of face (0-19)
 * @returns Array of 3 Vector3 points
 */
export function getFaceVertices(faceIndex: number): [Vector3, Vector3, Vector3] {
  if (faceIndex < 0 || faceIndex >= ICOSAHEDRON_FACES.length) {
    throw new Error(`Invalid face index: ${faceIndex}. Must be 0-19.`);
  }

  const face = ICOSAHEDRON_FACES[faceIndex];
  return [
    ICOSAHEDRON_VERTICES[face.vertices[0]],
    ICOSAHEDRON_VERTICES[face.vertices[1]],
    ICOSAHEDRON_VERTICES[face.vertices[2]],
  ];
}

/**
 * Subdivide a triangle into 4 child triangles.
 * 
 * Given parent triangle with vertices A, B, C:
 * 1. Compute midpoints: mAB, mBC, mCA (geodesic midpoints on sphere)
 * 2. Create 4 children:
 *    - Child 0: [A, mAB, mCA]    (corner at A)
 *    - Child 1: [mAB, B, mBC]    (corner at B)
 *    - Child 2: [mCA, mBC, C]    (corner at C)
 *    - Child 3: [mAB, mBC, mCA]  (center)
 * 
 * @param v0 - First vertex of parent triangle
 * @param v1 - Second vertex of parent triangle
 * @param v2 - Third vertex of parent triangle
 * @returns Array of 4 child triangles, each with 3 vertices
 */
export function subdivideTriangle(
  v0: Vector3,
  v1: Vector3,
  v2: Vector3
): Array<[Vector3, Vector3, Vector3]> {
  // Compute geodesic midpoints
  const m01 = geodesicMidpoint(v0, v1);
  const m12 = geodesicMidpoint(v1, v2);
  const m20 = geodesicMidpoint(v2, v0);

  // Return 4 child triangles (deterministic order)
  return [
    [v0, m01, m20], // Child at original vertex 0
    [m01, v1, m12], // Child at original vertex 1
    [m20, m12, v2], // Child at original vertex 2
    [m01, m12, m20], // Center child
  ];
}

/**
 * Cross product of two 3D vectors.
 * 
 * Result is perpendicular to both input vectors (right-hand rule).
 * Used to compute plane normals for spherical geometry.
 * 
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Cross product vector
 */
export function cross(v1: Vector3, v2: Vector3): Vector3 {
  return {
    x: v1.y * v2.z - v1.z * v2.y,
    y: v1.z * v2.x - v1.x * v2.z,
    z: v1.x * v2.y - v1.y * v2.x,
  };
}

/**
 * Dot product of two 3D vectors.
 * 
 * Measures projection of one vector onto another.
 * Used for angle computations and point-plane tests.
 * 
 * @param v1 - First vector
 * @param v2 - Second vector
 * @returns Dot product (scalar)
 */
export function dot(v1: Vector3, v2: Vector3): number {
  return v1.x * v2.x + v1.y * v2.y + v1.z * v2.z;
}

/**
 * Test if a point is inside a spherical triangle using proper spherical geometry.
 * 
 * Algorithm: Point is inside if it's on the same side of all 3 great circle edges.
 * 
 * For each edge (v1, v2):
 * 1. Compute plane normal: cross(v1, v2)
 * 2. Check which side the point is on: sign(dot(normal, point))
 * 3. Check which side the opposite vertex is on: sign(dot(normal, opposite))
 * 4. If signs match for all 3 edges, point is inside
 * 
 * This is accurate for any triangle size on a sphere, unlike planar approximations.
 * 
 * @param point - Test point (Cartesian, on unit sphere)
 * @param v0 - Triangle vertex 0 (Cartesian)
 * @param v1 - Triangle vertex 1 (Cartesian)
 * @param v2 - Triangle vertex 2 (Cartesian)
 * @returns True if point is inside triangle
 */
export function isPointInSphericalTriangle(
  point: Vector3,
  v0: Vector3,
  v1: Vector3,
  v2: Vector3
): boolean {
  // For each edge, check if point and opposite vertex are on same side of plane
  
  // Edge v0-v1, opposite vertex v2
  const normal01 = cross(v0, v1);
  const sign01Point = dot(normal01, point);
  const sign01Opposite = dot(normal01, v2);
  
  // Edge v1-v2, opposite vertex v0
  const normal12 = cross(v1, v2);
  const sign12Point = dot(normal12, point);
  const sign12Opposite = dot(normal12, v0);
  
  // Edge v2-v0, opposite vertex v1
  const normal20 = cross(v2, v0);
  const sign20Point = dot(normal20, point);
  const sign20Opposite = dot(normal20, v1);
  
  // Point is inside if signs match for all 3 edges
  // Use a small epsilon for numerical tolerance
  const epsilon = 1e-10;
  
  const inside01 = (sign01Point * sign01Opposite) >= -epsilon;
  const inside12 = (sign12Point * sign12Opposite) >= -epsilon;
  const inside20 = (sign20Point * sign20Opposite) >= -epsilon;
  
  return inside01 && inside12 && inside20;
}
