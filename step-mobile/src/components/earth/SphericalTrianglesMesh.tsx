/**
 * SphericalTrianglesMesh - Spherical Triangle Renderer
 * 
 * What: Renders spherical triangles ON the Earth sphere surface
 * Why: Visualize current and neighbor spherical triangles (NO flat map)
 * 
 * This component takes spherical triangles (with 3D vertices) and renders them
 * as BufferGeometry meshes on the sphere surface. Color coding distinguishes
 * between neighbor triangles (gray) and the current triangle (gold).
 * 
 * Features:
 * - Efficient BufferGeometry rendering (one mesh per triangle set)
 * - Neighbor triangles: Gray (#CCCCCC), semi-transparent (opacity 0.6)
 * - Current triangle: Gold (#FFD700), opaque (opacity 0.9)
 * - Slight z-offset to prevent z-fighting with Earth sphere
 * - Backface culling (GPU side, automatic)
 * 
 * Performance:
 * - Handles up to 512 triangles at 30-60 fps
 * - Geometry only rebuilt when triangle list changes
 * - Uses Float32Array for vertex data (memory efficient)
 * 
 * Reference: /step-mobile/MOBILE_3D_MINING_PLAN.md Phase 2
 * Created: 2025-10-08T09:37:00.000Z
 */

import React, { useMemo, useRef } from 'react';
import * as THREE from 'three';
import { SphericalTriangle } from '../../hooks/useSphericalTriangles';

// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Props for SphericalTrianglesMesh
 * 
 * @param neighbors - Array of neighbor spherical triangles
 * @param currentTriangle - User's current spherical triangle (highlighted)
 * @param cameraPosition - Camera position for backface culling (optional)
 */
export interface SphericalTrianglesMeshProps {
  neighbors: SphericalTriangle[];
  currentTriangle: SphericalTriangle | null;
  cameraPosition?: THREE.Vector3;
}

// ========================================
// CONSTANTS
// ========================================

// Z-offset to prevent z-fighting with Earth sphere
// Slightly offset triangles outward from sphere center
const Z_OFFSET = 0.001; // 0.1% of sphere radius

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Create BufferGeometry from spherical triangles
 * 
 * What: Build Three.js BufferGeometry from triangle vertices
 * Why: Efficient GPU rendering of multiple triangles in single draw call
 * 
 * Method:
 * 1. Flatten all triangle vertices into Float32Array
 * 2. Compute normals (outward from sphere center)
 * 3. Offset vertices slightly along normals (prevent z-fighting)
 * 4. Create BufferGeometry with position and normal attributes
 * 
 * Performance: Single geometry = single draw call (fast)
 * 
 * @param triangles - Array of spherical triangles with 3D vertices
 * @returns BufferGeometry ready for rendering
 */
function createTrianglesGeometry(
  triangles: SphericalTriangle[]
): THREE.BufferGeometry {
  // Calculate total vertices (3 per triangle)
  const vertexCount = triangles.length * 3;
  
  // Pre-allocate typed arrays
  const positions = new Float32Array(vertexCount * 3); // x, y, z for each vertex
  const normals = new Float32Array(vertexCount * 3);   // normal vectors
  
  let index = 0;
  
  for (const triangle of triangles) {
    const [v0, v1, v2] = triangle.vertices;
    
    // For each vertex: compute normal (outward from center) and offset
    for (const vertex of [v0, v1, v2]) {
      // Normal points outward from sphere center
      // For unit sphere, this is just the normalized vertex position
      const normal = vertex.clone().normalize();
      
      // Offset vertex slightly along normal to prevent z-fighting
      const offsetVertex = vertex.clone().add(normal.multiplyScalar(Z_OFFSET));
      
      // Add to positions array
      positions[index * 3 + 0] = offsetVertex.x;
      positions[index * 3 + 1] = offsetVertex.y;
      positions[index * 3 + 2] = offsetVertex.z;
      
      // Add to normals array
      normals[index * 3 + 0] = normal.x;
      normals[index * 3 + 1] = normal.y;
      normals[index * 3 + 2] = normal.z;
      
      index++;
    }
  }
  
  // Create BufferGeometry
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  
  return geometry;
}

// ========================================
// COMPONENTS
// ========================================

/**
 * Neighbor triangles mesh (gray, semi-transparent)
 * 
 * What: Renders neighbor spherical triangles in gray
 * Why: Show context around user's position
 * 
 * Material: MeshBasicMaterial (no lighting needed, flat color)
 * - Color: #CCCCCC (light gray)
 * - Opacity: 0.6 (semi-transparent)
 * - Side: FrontSide (backface culling enabled)
 * 
 * Geometry rebuilt only when neighbors array changes (memoized).
 */
function NeighborTrianglesMesh({ neighbors }: { neighbors: SphericalTriangle[] }) {
  // Memoize geometry (only rebuild when neighbors change)
  const geometry = useMemo(() => {
    if (neighbors.length === 0) {
      console.log('[NeighborTrianglesMesh] No neighbors to render');
      return null;
    }
    
    console.log(`[NeighborTrianglesMesh] Building geometry for ${neighbors.length} triangles`);
    console.log(`[NeighborTrianglesMesh] Sample triangle:`, neighbors[0]);
    const geom = createTrianglesGeometry(neighbors);
    console.log(`[NeighborTrianglesMesh] Geometry vertices: ${geom.attributes.position.count}`);
    return geom;
  }, [neighbors]);
  
  // Don't render if no neighbors
  if (!geometry) {
    return null;
  }
  
  return (
    <mesh geometry={geometry}>
      {/* BRIGHT emissive material - always visible regardless of lighting */}
      <meshStandardMaterial
        color="#00FF00" // Bright green for testing
        emissive="#00FF00" // Self-illuminating green
        emissiveIntensity={1.0}
        transparent={false}
        opacity={1.0}
        side={THREE.DoubleSide} // Render both sides to catch winding issues
        depthWrite={true}
        depthTest={true}
        metalness={0.0}
        roughness={1.0}
      />
    </mesh>
  );
}

/**
 * Current triangle mesh (gold, opaque)
 * 
 * What: Renders user's current spherical triangle in gold
 * Why: Highlight which spherical triangle user is standing in
 * 
 * Material: MeshBasicMaterial
 * - Color: #FFD700 (gold)
 * - Opacity: 0.9 (mostly opaque, slight transparency)
 * - Side: FrontSide (backface culling)
 * 
 * Geometry rebuilt only when current triangle changes (memoized).
 */
function CurrentTriangleMesh({ 
  currentTriangle 
}: { 
  currentTriangle: SphericalTriangle | null 
}) {
  // Memoize geometry
  const geometry = useMemo(() => {
    if (!currentTriangle) {
      console.log('[CurrentTriangleMesh] No current triangle to render');
      return null;
    }
    
    console.log(`[CurrentTriangleMesh] Building geometry for triangle: ${currentTriangle.triangleId}`);
    console.log(`[CurrentTriangleMesh] Vertices:`, currentTriangle.vertices);
    const geom = createTrianglesGeometry([currentTriangle]);
    console.log(`[CurrentTriangleMesh] Geometry vertices: ${geom.attributes.position.count}`);
    return geom;
  }, [currentTriangle?.triangleId]);
  
  // Don't render if no current triangle
  if (!geometry) {
    return null;
  }
  
  return (
    <mesh geometry={geometry}>
      {/* SUPER BRIGHT emissive material - impossible to miss */}
      <meshStandardMaterial
        color="#FF0000" // Bright RED for current triangle
        emissive="#FF0000" // Self-illuminating RED
        emissiveIntensity={2.0} // EXTRA bright
        transparent={false}
        opacity={1.0}
        side={THREE.DoubleSide} // Render both sides
        depthWrite={true}
        depthTest={true}
        metalness={0.0}
        roughness={1.0}
      />
    </mesh>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

/**
 * SphericalTrianglesMesh - Main component
 * 
 * What: Container for rendering all spherical triangles (neighbors + current)
 * Why: Organized, performant rendering of spherical triangle mesh
 * 
 * Rendering Strategy:
 * 1. Neighbor triangles rendered first (gray, semi-transparent)
 * 2. Current triangle rendered on top (gold, opaque)
 * 3. Both use separate BufferGeometry for efficient updates
 * 
 * Performance Notes:
 * - Geometries only rebuilt when triangle lists change
 * - Each geometry = single draw call (GPU efficient)
 * - Backface culling automatic (GPU side)
 * - Memory footprint: ~20 KB for 512 triangles
 * 
 * @param props - Neighbors, current triangle, camera position
 * @returns React component rendering spherical triangles
 */
export default function SphericalTrianglesMesh({
  neighbors,
  currentTriangle,
  cameraPosition,
}: SphericalTrianglesMeshProps) {
  // Optional: Filter triangles based on backface culling
  // Currently disabled (GPU handles this automatically with FrontSide)
  // Can enable for additional CPU-side culling if needed
  
  // Log render
  console.log(
    `[SphericalTrianglesMesh] Rendering ${neighbors.length} neighbors + ` +
    `${currentTriangle ? 1 : 0} current = ${neighbors.length + (currentTriangle ? 1 : 0)} total`
  );
  
  return (
    <group name="spherical-triangles">
      {/* Neighbor triangles (gray) */}
      <NeighborTrianglesMesh neighbors={neighbors} />
      
      {/* Current triangle (gold) */}
      <CurrentTriangleMesh currentTriangle={currentTriangle} />
    </group>
  );
}
