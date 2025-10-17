/**
 * Global Mesh Subdivision Helper
 * 
 * Purpose: Generate 4 child triangles when a parent reaches 10 clicks.
 * Uses geodesic midpoint subdivision on sphere surface.
 * 
 * Why separate from mobile code:
 * - Backend needs to generate children and store in MongoDB
 * - Reuses mobile app's subdivision algorithm for consistency
 * - Thread-safe for concurrent mining operations
 */

/**
 * Vector3 interface (matches mobile app)
 */
interface Vector3 {
  x: number;
  y: number;
  z: number;
}

/**
 * 20 vibrant colors for base icosahedron (matches mobile app exactly)
 */
const VIBRANT_COLORS = [
  '#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231',
  '#911EB4', '#46F0F0', '#F032E6', '#BCF60C', '#FABEBE',
  '#008080', '#E6BEFF', '#9A6324', '#FFFAC8', '#800000',
  '#AAFFC3', '#808000', '#FFD8B1', '#000075', '#808080',
];

/**
 * Get a random color from the vibrant palette.
 */
function getRandomColor(): string {
  return VIBRANT_COLORS[Math.floor(Math.random() * VIBRANT_COLORS.length)];
}

/**
 * Normalize a vector to lie on the unit sphere.
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
 * Compute geodesic midpoint between two points on unit sphere.
 */
function geodesicMidpoint(v1: Vector3, v2: Vector3): Vector3 {
  const mid = {
    x: (v1.x + v2.x) / 2,
    y: (v1.y + v2.y) / 2,
    z: (v1.z + v2.z) / 2,
  };
  return normalize(mid);
}

/**
 * Subdivide a triangle stored in MongoDB into 4 children.
 * 
 * Algorithm:
 * 1. Find midpoints of the 3 edges (geodesic midpoints on sphere)
 * 2. Create 4 new triangles:
 *    - 3 corner triangles (each uses 1 original vertex + 2 midpoints)
 *    - 1 center triangle (uses all 3 midpoints)
 * 3. Assign random colors to each child
 * 4. Set clicks = 0, level = parent.level + 1
 * 
 * @param parent - Parent triangle from GlobalMeshTriangleModel
 * @returns Array of 4 child triangle documents (not yet saved)
 */
export async function subdivideTriangleMesh(parent: any): Promise<any[]> {
  const [v0Arr, v1Arr, v2Arr] = parent.vertices;
  
  // Convert to Vector3
  const v0: Vector3 = { x: v0Arr[0], y: v0Arr[1], z: v0Arr[2] };
  const v1: Vector3 = { x: v1Arr[0], y: v1Arr[1], z: v1Arr[2] };
  const v2: Vector3 = { x: v2Arr[0], y: v2Arr[1], z: v2Arr[2] };
  
  // Calculate geodesic midpoints
  const m0 = geodesicMidpoint(v0, v1); // Midpoint of edge v0-v1
  const m1 = geodesicMidpoint(v1, v2); // Midpoint of edge v1-v2
  const m2 = geodesicMidpoint(v2, v0); // Midpoint of edge v2-v0
  
  const children = [
    // Corner triangle 0: v0, m0, m2
    {
      triangleId: `${parent.triangleId}-0`,
      vertices: [[v0.x, v0.y, v0.z], [m0.x, m0.y, m0.z], [m2.x, m2.y, m2.z]],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.triangleId,
      level: parent.level + 1,
      createdAt: new Date(),
      lastMined: null,
    },
    // Corner triangle 1: v2, m2, m1
    {
      triangleId: `${parent.triangleId}-1`,
      vertices: [[v2.x, v2.y, v2.z], [m2.x, m2.y, m2.z], [m1.x, m1.y, m1.z]],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.triangleId,
      level: parent.level + 1,
      createdAt: new Date(),
      lastMined: null,
    },
    // Corner triangle 2: v1, m1, m0
    {
      triangleId: `${parent.triangleId}-2`,
      vertices: [[v1.x, v1.y, v1.z], [m1.x, m1.y, m1.z], [m0.x, m0.y, m0.z]],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.triangleId,
      level: parent.level + 1,
      createdAt: new Date(),
      lastMined: null,
    },
    // Center triangle 3: m0, m1, m2
    {
      triangleId: `${parent.triangleId}-3`,
      vertices: [[m0.x, m0.y, m0.z], [m1.x, m1.y, m1.z], [m2.x, m2.y, m2.z]],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.triangleId,
      level: parent.level + 1,
      createdAt: new Date(),
      lastMined: null,
    },
  ];
  
  return children;
}
