/**
 * Icosahedron Mesh Generator - Standalone Interactive Mesh
 * 
 * Purpose: Generate and manage the 20-triangle icosahedron mesh with click tracking
 * and recursive subdivision for standalone mining simulation.
 * 
 * Features:
 * - 20 base triangles (level 0)
 * - Click tracking (0-2 clicks per triangle)
 * - Automatic subdivision at 2 clicks (1 → 4 triangles)
 * - Recursive subdivision up to level 21 (~27m triangles)
 * - Level-based coloring (no click overlays)
 * - No backend dependency - pure local state
 */

import { Vector3, ICOSAHEDRON_VERTICES, ICOSAHEDRON_FACES, normalize, geodesicMidpoint } from './icosahedron';

/**
 * 20 vibrant colors for base icosahedron faces.
 * Each of the 20 base triangles gets a unique color from this palette.
 */
export const VIBRANT_COLORS = [
  '#E6194B', // Red
  '#3CB44B', // Green
  '#FFE119', // Yellow
  '#4363D8', // Blue
  '#F58231', // Orange
  '#911EB4', // Purple
  '#46F0F0', // Cyan
  '#F032E6', // Magenta
  '#BCF60C', // Lime
  '#FABEBE', // Pink
  '#008080', // Teal
  '#E6BEFF', // Lavender
  '#9A6324', // Brown
  '#FFFAC8', // Beige
  '#800000', // Maroon
  '#AAFFC3', // Mint
  '#808000', // Olive
  '#FFD8B1', // Apricot
  '#000075', // Navy
  '#808080', // Gray
];

/**
 * DEPRECATED: Click overlays no longer used.
 * System now uses level-based coloring instead.
 * Kept for backward compatibility only.
 */
export const CLICK_OVERLAYS = [
  '#44444444', // 1 click (deprecated)
  '#444444FF', // 2 clicks (deprecated)
];

/**
 * MeshTriangle represents a single spherical triangle in the mesh.
 * 
 * Lifecycle:
 * 1. Created with 0 clicks (color determined by level)
 * 2. User taps → clicks increment
 * 3. At 2 clicks → subdivides into 4 children
 * 4. Parent marked as subdivided, children become active (level+1)
 * 5. Children can be clicked and subdivide recursively (up to level 21)
 */
export interface MeshTriangle {
  id: string;                    // Unique ID (e.g., "ICO-0", "ICO-0-2", "ICO-0-2-3")
  vertices: [Vector3, Vector3, Vector3]; // 3 vertices on unit sphere
  baseColor: string;             // DEPRECATED: Use level for coloring instead
  clicks: number;                // 0-2 (auto-subdivides at 2)
  subdivided: boolean;           // True if this triangle has been split
  children: string[];            // IDs of 4 child triangles (if subdivided)
  parent: string | null;         // ID of parent triangle (null for base 20)
  level: number;                 // 0 = base icosahedron, 1+ = subdivisions
}

/**
 * Get a random color from the vibrant palette.
 * Used when subdividing to assign colors to child triangles.
 */
function getRandomColor(): string {
  return VIBRANT_COLORS[Math.floor(Math.random() * VIBRANT_COLORS.length)];
}

/**
 * Generate the 20 base triangles of the icosahedron.
 * Each triangle gets:
 * - Vertices from ICOSAHEDRON_VERTICES and ICOSAHEDRON_FACES
 * - Unique color from VIBRANT_COLORS palette
 * - Initial state: 0 clicks, not subdivided
 * 
 * @returns Array of 20 base triangles
 */
export function generateBaseIcosahedron(): MeshTriangle[] {
  const triangles: MeshTriangle[] = [];

  for (let i = 0; i < ICOSAHEDRON_FACES.length; i++) {
    const face = ICOSAHEDRON_FACES[i];
    const v0 = ICOSAHEDRON_VERTICES[face.vertices[0]];
    const v1 = ICOSAHEDRON_VERTICES[face.vertices[1]];
    const v2 = ICOSAHEDRON_VERTICES[face.vertices[2]];

    triangles.push({
      id: `ICO-${i}`,
      vertices: [v0, v1, v2],
      baseColor: VIBRANT_COLORS[i], // Each base triangle gets unique color
      clicks: 0,
      subdivided: false,
      children: [],
      parent: null,
      level: 0,
    });
  }

  return triangles;
}

/**
 * Subdivide a spherical triangle into 4 smaller triangles using midpoint subdivision.
 * 
 * Algorithm:
 * 1. Find midpoints of the 3 edges
 * 2. Project midpoints to sphere surface (geodesic midpoints)
 * 3. Create 4 new triangles:
 *    - 3 corner triangles (each uses 1 original vertex + 2 midpoints)
 *    - 1 center triangle (uses all 3 midpoints)
 * 4. Assign random colors to each child
 * 5. Set clicks = 0, level = parent.level + 1
 * 
 * Diagram:
 *          v0
 *          /\
 *         /  \
 *      m2 ----m0
 *       /\  4 /\
 *      /1 \  /3 \
 *     /____\/____\
 *    v2    m1    v1
 * 
 * Triangles: 0=corner v0, 1=corner v2, 2=corner v1, 3=center
 * 
 * @param parent - Triangle to subdivide
 * @returns Array of 4 child triangles
 */
export function subdivideTriangle(parent: MeshTriangle): MeshTriangle[] {
  const [v0, v1, v2] = parent.vertices;

  // Calculate geodesic midpoints (on sphere surface)
  const m0 = geodesicMidpoint(v0, v1); // Midpoint of edge v0-v1
  const m1 = geodesicMidpoint(v1, v2); // Midpoint of edge v1-v2
  const m2 = geodesicMidpoint(v2, v0); // Midpoint of edge v2-v0

  const children: MeshTriangle[] = [
    // Corner triangle 0: v0, m0, m2
    {
      id: `${parent.id}-0`,
      vertices: [v0, m0, m2],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.id,
      level: parent.level + 1,
    },
    // Corner triangle 1: v2, m2, m1
    {
      id: `${parent.id}-1`,
      vertices: [v2, m2, m1],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.id,
      level: parent.level + 1,
    },
    // Corner triangle 2: v1, m1, m0
    {
      id: `${parent.id}-2`,
      vertices: [v1, m1, m0],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.id,
      level: parent.level + 1,
    },
    // Center triangle 3: m0, m1, m2
    {
      id: `${parent.id}-3`,
      vertices: [m0, m1, m2],
      baseColor: getRandomColor(),
      clicks: 0,
      subdivided: false,
      children: [],
      parent: parent.id,
      level: parent.level + 1,
    },
  ];

  return children;
}

/**
 * Get only the active (non-subdivided) triangles from the full mesh state.
 * Subdivided triangles are hidden - only their children are rendered.
 * 
 * @param triangles - Full mesh state (all triangles)
 * @returns Array of active triangles to render
 */
export function getActiveTriangles(triangles: Map<string, MeshTriangle>): MeshTriangle[] {
  const active: MeshTriangle[] = [];
  
  for (const triangle of triangles.values()) {
    if (!triangle.subdivided) {
      active.push(triangle);
    }
  }
  
  return active;
}

/**
 * Find which triangle contains a given GPS coordinate.
 * Uses point-in-spherical-triangle test.
 * 
 * @param lat - Latitude in degrees
 * @param lon - Longitude in degrees
 * @param triangles - Active triangles to search
 * @returns Triangle ID if found, null otherwise
 */
export function findTriangleContainingPoint(
  lat: number,
  lon: number,
  triangles: MeshTriangle[]
): string | null {
  // Convert GPS to 3D point on sphere
  const latRad = (lat * Math.PI) / 180;
  const lonRad = (lon * Math.PI) / 180;
  const point: Vector3 = {
    x: Math.cos(latRad) * Math.cos(lonRad),
    y: Math.cos(latRad) * Math.sin(lonRad),
    z: Math.sin(latRad),
  };

  // Test each triangle
  for (const triangle of triangles) {
    if (isPointInSphericalTriangle(point, triangle.vertices)) {
      return triangle.id;
    }
  }

  return null;
}

/**
 * Test if a point lies inside a spherical triangle.
 * Uses barycentric coordinates on sphere surface.
 * 
 * @param point - Point on unit sphere
 * @param vertices - Triangle vertices [v0, v1, v2]
 * @returns True if point is inside triangle
 */
function isPointInSphericalTriangle(
  point: Vector3,
  vertices: [Vector3, Vector3, Vector3]
): boolean {
  const [v0, v1, v2] = vertices;

  // Calculate normals for the 3 edges
  // Each edge divides sphere into 2 hemispheres
  // Point is inside triangle if it's on the "inside" of all 3 edges
  
  const n0 = cross(v0, v1); // Normal to edge v0-v1
  const n1 = cross(v1, v2); // Normal to edge v1-v2
  const n2 = cross(v2, v0); // Normal to edge v2-v0

  // Test which side of each edge the point is on
  const d0 = dot(point, n0);
  const d1 = dot(point, n1);
  const d2 = dot(point, n2);

  // All dots should have same sign (all positive or all negative)
  // If mixed signs, point is outside triangle
  return (d0 >= 0 && d1 >= 0 && d2 >= 0) || (d0 <= 0 && d1 <= 0 && d2 <= 0);
}

/**
 * Cross product of two vectors.
 * Used for calculating edge normals.
 */
function cross(a: Vector3, b: Vector3): Vector3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  };
}

/**
 * Dot product of two vectors.
 * Used for point-in-triangle tests.
 */
function dot(a: Vector3, b: Vector3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}
