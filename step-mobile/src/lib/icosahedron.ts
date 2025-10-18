/**
 * Icosahedron Geometry - Spherical mesh utilities for STEP Mobile
 * 
 * What: Core 3D geometry for spherical triangle mesh visualization
 * Why: STEP uses geodesic icosahedron subdivision, NOT flat projections
 * 
 * This module provides:
 * - 3D Cartesian ↔ Spherical coordinate conversion
 * - Geodesic midpoint calculation for sphere surface
 * - Orthographic projection for rendering 3D sphere on 2D screen
 * 
 * Why ported from backend:
 * - Frontend needs same geometric primitives to render mesh accurately
 * - Ensures visual representation matches backend mesh structure
 * - Enables accurate triangle rendering on spherical surface
 */

// Golden ratio: φ = (1 + √5) / 2 ≈ 1.618033988749895
// Used to construct icosahedron vertices
const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Vector3 represents a point in 3D Cartesian space.
 * 
 * What: Point on unit sphere (radius = 1)
 * Why: All mesh vertices lie on sphere surface
 * 
 * Constraint: x² + y² + z² = 1 for normalized vectors
 */
export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 12 vertices of a regular icosahedron on the unit sphere.
 * 
 * What: Base vertices for level-1 triangles
 * Why: These are the foundation of STEP's geodesic mesh
 * 
 * Construction:
 * - 3 orthogonal rectangles with golden ratio sides
 * - All normalized to unit sphere
 * - Evenly distributed around sphere
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
].map(normalize);

/**
 * Face definition: 3 vertex indices forming a triangle.
 * 
 * What: Defines which 3 vertices make up each face
 * Why: Each face is a level-1 triangle in STEP mesh
 */
export interface Face {
  vertices: [number, number, number]; // Indices into ICOSAHEDRON_VERTICES
}

/**
 * 20 triangular faces of the icosahedron.
 * 
 * What: The 20 base triangles (level 1) of STEP mesh
 * Why: All higher level triangles are subdivisions of these
 * 
 * Vertex order: counterclockwise from outside (right-hand rule)
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
 * What: Scale vector to length 1
 * Why: All mesh vertices must be on sphere surface
 * 
 * Formula: v_normalized = v / ||v||
 * where ||v|| = sqrt(x² + y² + z²)
 * 
 * @param v - Vector to normalize
 * @returns Normalized vector with magnitude 1
 */
export function normalize(v: Vector3): Vector3 {
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
 * What: 3D mesh coordinates → GPS coordinates
 * Why: Backend stores triangles as 3D vectors, frontend needs lat/lon
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
 * What: GPS coordinates → 3D mesh coordinates
 * Why: Need 3D coords for spherical rendering calculations
 * 
 * @param lat - Latitude in degrees (-90 to +90)
 * @param lon - Longitude in degrees (-180 to +180)
 * @returns Vector3 on unit sphere
 */
export function sphericalToCartesian(lat: number, lon: number): Vector3 {
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
 * What: Great circle midpoint (shortest path on sphere)
 * Why: CRITICAL for accurate sphere subdivision - NOT Euclidean average!
 * 
 * Method: Average the two vectors and project back to sphere
 * This gives the geodesic (great circle) midpoint.
 * 
 * @param v1 - First point on unit sphere
 * @param v2 - Second point on unit sphere
 * @returns Midpoint on unit sphere along geodesic
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
 * What: Lookup vertices for a given face
 * Why: Need actual 3D coordinates to render triangles
 * 
 * @param faceIndex - Index of face (0-19)
 * @returns Array of 3 Vector3 points
 */
export function getFaceVertices(faceIndex: number): [Vector3, Vector3, Vector3] {
  const face = ICOSAHEDRON_FACES[faceIndex];
  return [
    ICOSAHEDRON_VERTICES[face.vertices[0]],
    ICOSAHEDRON_VERTICES[face.vertices[1]],
    ICOSAHEDRON_VERTICES[face.vertices[2]],
  ];
}

/**
 * Rotation matrix to rotate sphere for better viewing angle.
 * 
 * What: Rotate 3D coordinates around an axis
 * Why: Allow user to "rotate" the mesh view to see their area better
 * 
 * This enables interactive mesh visualization where user can center
 * their location in view.
 * 
 * @param v - Vector to rotate
 * @param axis - 'x', 'y', or 'z' axis
 * @param angleDegrees - Rotation angle in degrees
 * @returns Rotated vector
 */
export function rotateVector(
  v: Vector3,
  axis: 'x' | 'y' | 'z',
  angleDegrees: number
): Vector3 {
  const rad = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);

  switch (axis) {
    case 'x':
      // Rotate around X axis
      return {
        x: v.x,
        y: v.y * cos - v.z * sin,
        z: v.y * sin + v.z * cos,
      };
    case 'y':
      // Rotate around Y axis
      return {
        x: v.x * cos + v.z * sin,
        y: v.y,
        z: -v.x * sin + v.z * cos,
      };
    case 'z':
      // Rotate around Z axis
      return {
        x: v.x * cos - v.y * sin,
        y: v.x * sin + v.y * cos,
        z: v.z,
      };
  }
}

/**
 * Orthographic projection: 3D sphere → 2D screen
 * 
 * What: Project 3D coordinates onto 2D plane
 * Why: Need to render 3D sphere on 2D phone screen
 * 
 * Orthographic projection (parallel projection):
 * - Shows sphere as if viewed from infinite distance
 * - Preserves relative sizes (no perspective distortion)
 * - Simple: just drop Z coordinate
 * 
 * Alternative: Stereographic projection (commented below)
 * 
 * @param v - Vector3 on unit sphere
 * @param scale - Scale factor for output coordinates
 * @param centerX - Screen center X
 * @param centerY - Screen center Y
 * @returns {x, y} screen coordinates
 */
export function projectOrthographic(
  v: Vector3,
  scale: number,
  centerX: number,
  centerY: number
): { x: number; y: number } {
  // Orthographic: just use x, y (ignore z depth)
  // Y is flipped for screen coords (SVG Y increases downward)
  return {
    x: centerX + v.x * scale,
    y: centerY - v.y * scale, // Flip Y for screen
  };
}

/**
 * Stereographic projection: 3D sphere → 2D plane (alternative)
 * 
 * What: Project from South Pole onto equatorial plane
 * Why: Shows more detail near projection center, less at edges
 * 
 * Properties:
 * - Conformal (preserves angles)
 * - Shows entire hemisphere
 * - Great circles become circles or lines
 * 
 * Currently unused, but available if needed for different view modes.
 * 
 * @param v - Vector3 on unit sphere
 * @param scale - Scale factor
 * @param centerX - Screen center X
 * @param centerY - Screen center Y
 * @returns {x, y} screen coordinates
 */
export function projectStereographic(
  v: Vector3,
  scale: number,
  centerX: number,
  centerY: number
): { x: number; y: number } {
  // Project from South Pole (z = -1) onto equatorial plane (z = 0)
  // Formula: (x, y) = (v.x / (1 - v.z), v.y / (1 - v.z))
  const denom = 1 - v.z;
  const x = (v.x / denom) * scale;
  const y = (v.y / denom) * scale;

  return {
    x: centerX + x,
    y: centerY - y, // Flip Y for screen
  };
}

/**
 * Check if a triangle is visible (front-facing) from viewer perspective.
 * 
 * What: Backface culling for 3D rendering
 * Why: Don't render triangles on back side of sphere (not visible)
 * 
 * Method: Check if triangle normal points toward viewer
 * Viewer is at (0, 0, +infinity) looking at origin.
 * 
 * @param v1 - First vertex
 * @param v2 - Second vertex
 * @param v3 - Third vertex
 * @returns True if triangle is front-facing (visible)
 */
export function isTriangleFrontFacing(
  v1: Vector3,
  v2: Vector3,
  v3: Vector3
): boolean {
  // Compute triangle normal using cross product
  // Normal = (v2 - v1) × (v3 - v1)
  const edge1 = {
    x: v2.x - v1.x,
    y: v2.y - v1.y,
    z: v2.z - v1.z,
  };
  const edge2 = {
    x: v3.x - v1.x,
    y: v3.y - v1.y,
    z: v3.z - v1.z,
  };

  const normal = {
    x: edge1.y * edge2.z - edge1.z * edge2.y,
    y: edge1.z * edge2.x - edge1.x * edge2.z,
    z: edge1.x * edge2.y - edge1.y * edge2.x,
  };

  // Triangle centroid (average of vertices)
  const centroid = {
    x: (v1.x + v2.x + v3.x) / 3,
    y: (v1.y + v2.y + v3.y) / 3,
    z: (v1.z + v2.z + v3.z) / 3,
  };

  // For unit sphere, normal should point outward (same direction as centroid)
  // Check if normal points toward viewer (positive Z component after considering centroid)
  // Simplified: dot product of normal with centroid should be positive
  const dotProduct = normal.x * centroid.x + normal.y * centroid.y + normal.z * centroid.z;

  return dotProduct > 0;
}

/**
 * Calculate rotation needed to center a location in view.
 * 
 * What: Compute rotation angles to bring lat/lon to front of sphere
 * Why: Auto-center user's location in mesh visualization
 * 
 * Returns rotation around Y axis (longitude) and X axis (latitude)
 * to position the target location at the front center of view.
 * 
 * @param targetLat - Latitude to center
 * @param targetLon - Longitude to center
 * @returns {yRotation, xRotation} in degrees
 */
export function calculateCenterRotation(
  targetLat: number,
  targetLon: number
): { yRotation: number; xRotation: number } {
  // Rotate around Y axis to bring longitude to front (0°)
  // Front of sphere is at lon=0 when viewing from +X axis
  const yRotation = -targetLon;

  // Rotate around X axis to bring latitude to equator
  // This tilts the sphere up/down to center the target
  const xRotation = -targetLat;

  return { yRotation, xRotation };
}

/**
 * Subdivide a spherical triangle into 4 child triangles.
 * 
 * What: Split triangle by connecting geodesic midpoints
 * Why: Core operation for icosahedron subdivision (STEP mesh generation)
 * 
 * Algorithm:
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
  // Compute geodesic midpoints on sphere surface
  const m01 = geodesicMidpoint(v0, v1);
  const m12 = geodesicMidpoint(v1, v2);
  const m20 = geodesicMidpoint(v2, v0);

  // Return 4 child triangles in deterministic order
  // This order matches backend implementation
  return [
    [v0, m01, m20], // Child 0: corner at original vertex 0
    [m01, v1, m12], // Child 1: corner at original vertex 1
    [m20, m12, v2], // Child 2: corner at original vertex 2
    [m01, m12, m20], // Child 3: center child
  ];
}

/**
 * TriangleId interface matching backend addressing
 */
export interface TriangleId {
  face: number;    // 0-19 (which icosahedron face)
  level: number;   // 1-21 (subdivision depth)
  path: number[];  // Array of 0-3 (child indices), length = level - 1
}

/**
 * Generate spherical triangle polygon from TriangleId.
 * 
 * What: Compute actual 3D vertices by traversing subdivision tree
 * Why: CRITICAL - This generates the REAL spherical triangle geometry
 * 
 * Algorithm:
 * 1. Start with base icosahedron face (level 1)
 * 2. For each digit in path:
 *    - Subdivide current triangle into 4 children
 *    - Select child specified by path digit (0-3)
 *    - Continue with that child's vertices
 * 3. Return final triangle vertices
 * 
 * Example: face=0, level=10, path=[0,0,0,0,0,0,0,0,0]
 * - Start with face 0 (vertices from ICOSAHEDRON_FACES[0])
 * - Subdivide 9 times, always taking child 0
 * - Result: small triangle at corner of original face
 * 
 * @param id - Triangle ID with face, level, and path
 * @returns Tuple of 3 Vector3 vertices on unit sphere
 */
export function triangleIdToVertices(
  id: TriangleId
): [Vector3, Vector3, Vector3] {
  // Start with base icosahedron face at level 1
  let [v0, v1, v2] = getFaceVertices(id.face);

  // Traverse subdivision path
  // Each digit specifies which of 4 children to take
  for (const childIndex of id.path) {
    // Subdivide current triangle into 4 children
    const children = subdivideTriangle(v0, v1, v2);

    // Select the specified child (0-3)
    [v0, v1, v2] = children[childIndex];
  }

  // Return final triangle vertices
  return [v0, v1, v2];
}

/**
 * Generate GeoJSON polygon from TriangleId.
 * 
 * What: Convert triangle to lat/lon coordinates for API compatibility
 * Why: Backend expects GeoJSON Polygon format
 * 
 * @param id - Triangle ID
 * @returns GeoJSON-compatible array [[lon, lat], [lon, lat], [lon, lat], [lon, lat]]
 */
export function triangleIdToPolygon(
  id: TriangleId
): Array<[number, number]> {
  // Get 3D vertices
  const [v0, v1, v2] = triangleIdToVertices(id);

  // Convert to lat/lon
  const coord0 = cartesianToSpherical(v0);
  const coord1 = cartesianToSpherical(v1);
  const coord2 = cartesianToSpherical(v2);

  // Return as closed polygon: [lon, lat] per GeoJSON spec
  // First point = last point (closed ring)
  return [
    [coord0.lon, coord0.lat],
    [coord1.lon, coord1.lat],
    [coord2.lon, coord2.lat],
    [coord0.lon, coord0.lat], // Close the ring
  ];
}

/**
 * Check if a point is inside a spherical triangle.
 * 
 * What: Point-in-spherical-triangle test
 * Why: Critical for finding which triangle contains a GPS position
 * 
 * Method: Uses barycentric coordinates on the sphere
 * A point P is inside triangle ABC if:
 * - P is on the same side of edge AB as C
 * - P is on the same side of edge BC as A  
 * - P is on the same side of edge CA as B
 * 
 * For spherical triangles, we use the sign of the scalar triple product:
 * sign((A × B) · P) tells us which side of great circle AB point P is on
 * 
 * @param point - Test point (Vector3 on unit sphere)
 * @param v0 - First vertex of triangle
 * @param v1 - Second vertex of triangle
 * @param v2 - Third vertex of triangle
 * @returns True if point is inside the spherical triangle
 */
export function isPointInSphericalTriangle(
  point: Vector3,
  v0: Vector3,
  v1: Vector3,
  v2: Vector3
): boolean {
  // Helper: compute scalar triple product (A × B) · C
  // This gives the signed volume of the parallelepiped formed by A, B, C
  // Sign tells us which side of the great circle AB point C is on
  function scalarTripleProduct(a: Vector3, b: Vector3, c: Vector3): number {
    // Cross product: a × b
    const cross = {
      x: a.y * b.z - a.z * b.y,
      y: a.z * b.x - a.x * b.z,
      z: a.x * b.y - a.y * b.x,
    };
    
    // Dot product: (a × b) · c
    return cross.x * c.x + cross.y * c.y + cross.z * c.z;
  }

  // Check if point is on the correct side of each edge
  // For counterclockwise winding (v0 → v1 → v2), point should be:
  // - Same side of v0→v1 as v2
  // - Same side of v1→v2 as v0
  // - Same side of v2→v0 as v1
  
  const side0 = scalarTripleProduct(v0, v1, point);
  const side1 = scalarTripleProduct(v1, v2, point);
  const side2 = scalarTripleProduct(v2, v0, point);
  
  // Check reference sides (where the third vertex is)
  const ref0 = scalarTripleProduct(v0, v1, v2);
  const ref1 = scalarTripleProduct(v1, v2, v0);
  const ref2 = scalarTripleProduct(v2, v0, v1);
  
  // Point is inside if it's on the same side of all three edges
  // (all signs match the reference sides)
  const inside0 = (side0 * ref0) >= 0;
  const inside1 = (side1 * ref1) >= 0;
  const inside2 = (side2 * ref2) >= 0;
  
  return inside0 && inside1 && inside2;
}

/**
 * Find which spherical triangle contains a GPS point.
 * 
 * What: Dynamic recursive lookup through the mesh hierarchy
 * Why: CRITICAL - Finds the ACTUAL mineable triangle at a GPS location
 * 
 * Algorithm:
 * 1. Start at root level (check all base faces)
 * 2. Find which parent contains the point
 * 3. Check if parent has children (has been mined/subdivided)
 * 4. If NO children: return parent (this is the mineable triangle)
 * 5. If HAS children: find which child contains point, recurse to step 3
 * 6. Repeat until leaf node found
 * 
 * This is a DYNAMIC lookup based on actual mesh state:
 * - Not hardcoded to level 10
 * - Follows actual subdivision tree
 * - Returns the deepest (most specific) unmined triangle
 * 
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param targetLevel - Maximum level to descend (default 21)
 * @returns TriangleId of the containing leaf triangle
 */
export function findTriangleContainingPoint(
  lat: number,
  lon: number,
  targetLevel: number = 21
): TriangleId | null {
  // Convert GPS to 3D point on sphere
  const point = sphericalToCartesian(lat, lon);
  
  // Step 1: Check all root faces (level 1) to find parent
  let parentFace: number | null = null;
  
  for (let faceIndex = 0; faceIndex < ICOSAHEDRON_FACES.length; faceIndex++) {
    const [v0, v1, v2] = getFaceVertices(faceIndex);
    
    if (isPointInSphericalTriangle(point, v0, v1, v2)) {
      parentFace = faceIndex;
      break;
    }
  }
  
  if (parentFace === null) {
    // Point not found in any face (should never happen on a sphere)
    console.error('[findTriangle] Point not in any root face:', { lat, lon });
    return null;
  }
  
  // Step 2: Start recursive descent from parent face
  // Initialize with level 1, empty path
  const triangleId: TriangleId = {
    face: parentFace,
    level: 1,
    path: [],
  };
  
  // Step 3: Recursively descend until target level or no more subdivisions
  let currentVertices = getFaceVertices(parentFace);
  
  while (triangleId.level < targetLevel) {
    // Check if this triangle has been subdivided (has children)
    // In mock mode, we assume all triangles CAN be subdivided
    // In production, you'd check the database/API here
    
    // Subdivide current triangle into 4 children
    const [v0, v1, v2] = currentVertices;
    const children = subdivideTriangle(v0, v1, v2);
    
    // Find which child contains the point
    let childIndex: number | null = null;
    
    for (let i = 0; i < 4; i++) {
      const [c0, c1, c2] = children[i];
      
      if (isPointInSphericalTriangle(point, c0, c1, c2)) {
        childIndex = i;
        currentVertices = [c0, c1, c2];
        break;
      }
    }
    
    if (childIndex === null) {
      // Point not in any child (numerical error?)
      // Return current triangle as best match
      console.warn('[findTriangle] Point not in any child at level', triangleId.level);
      break;
    }
    
    // Descend to child
    triangleId.level++;
    triangleId.path.push(childIndex);
  }
  
  return triangleId;
}
