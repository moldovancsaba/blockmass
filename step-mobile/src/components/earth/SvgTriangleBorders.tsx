/**
 * SvgTriangleBorders - SVG Overlay for Crisp Triangle Borders
 * 
 * What: Renders pixel-perfect triangle borders using SVG (NOT WebGL lines)
 * Why: WebGL lineWidth > 1 not reliably supported on mobile, SVG guarantees crisp borders
 * 
 * This component projects 3D spherical triangle vertices to 2D screen coordinates
 * and draws them as SVG paths. This ensures crisp 2px/5px borders that look
 * perfect on all devices, including Retina displays.
 * 
 * Features:
 * - Neighbor triangles: 2px black borders
 * - Current triangle: 5px red border
 * - User marker: Red circle (5-6px) at GPS position
 * - Backface culling: Triangles behind sphere not drawn
 * - Absolute positioning over Three.js Canvas
 * 
 * Performance:
 * - SVG rendering is hardware-accelerated on modern devices
 * - Projection updates throttled to 30 Hz (33ms)
 * - Only visible triangles projected
 * 
 * Reference: /step-mobile/MOBILE_3D_MINING_PLAN.md Phase 3
 * Created: 2025-10-08T09:42:30.000Z
 */

import React, { useMemo } from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path, Circle, G } from 'react-native-svg';
import * as THREE from 'three';
import { SphericalTriangle } from '../../hooks/useSphericalTriangles';
import { isTriangleFrontFacing, latLonToVector3 } from '../../lib/spherical-projection';

// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Props for SvgTriangleBorders
 * 
 * @param neighbors - Neighbor spherical triangles
 * @param currentTriangle - Current spherical triangle (highlighted)
 * @param userPosition - User's GPS position (for marker)
 * @param camera - Real Three.js camera from CameraTracker (WHY: Must use real camera for accurate projection with rotation)
 * @param cameraPosition - Three.js camera position (for backface culling)
 * @param width - Screen/Canvas width in pixels
 * @param height - Screen/Canvas height in pixels
 */
export interface SvgTriangleBordersProps {
  neighbors: SphericalTriangle[];
  currentTriangle: SphericalTriangle | null;
  userPosition?: { lat: number; lon: number };
  camera: THREE.Camera; // WHY: Real camera accounts for sphere rotation (auto-centering)
  cameraPosition: THREE.Vector3;
  width: number;
  height: number;
}

/**
 * Projected 2D point on screen
 */
interface ScreenPoint {
  x: number;
  y: number;
}

// ========================================
// HELPER FUNCTIONS
// ========================================

/**
 * Project 3D position to 2D screen coordinates
 * 
 * What: Convert Three.js 3D world position to 2D pixel coordinates
 * Why: Need screen coords to draw SVG paths
 * 
 * Method: Use Three.js camera.project() which applies:
 * 1. World → Camera space transformation
 * 2. Camera → Clip space (perspective projection)
 * 3. Clip → Normalized device coordinates (NDC: -1 to +1)
 * 4. NDC → Screen pixels
 * 
 * Result: (x, y) in pixels where (0, 0) is top-left corner
 * 
 * @param position - 3D world position (Vector3)
 * @param camera - Three.js camera
 * @param width - Screen width in pixels
 * @param height - Screen height in pixels
 * @returns Screen coordinates {x, y} or null if behind camera
 */
function project3DToScreen(
  position: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number
): ScreenPoint | null {
  // Clone to avoid mutating original
  const projected = position.clone();
  
  // Project to normalized device coordinates (-1 to +1)
  projected.project(camera);
  
  // Check if behind camera (z > 1 means behind near plane)
  if (projected.z > 1) {
    return null;
  }
  
  // Convert NDC to screen pixels
  // NDC: -1 (left/bottom) to +1 (right/top)
  // Screen: 0 (left/top) to width/height (right/bottom)
  const x = ((projected.x + 1) / 2) * width;
  const y = ((-projected.y + 1) / 2) * height; // Flip Y for screen coords
  
  return { x, y };
}

/**
 * Project spherical triangle vertices to screen
 * 
 * What: Convert all 3 triangle vertices to 2D screen coords
 * Why: Need all vertices to draw triangle border path
 * 
 * @param triangle - Spherical triangle with 3D vertices
 * @param camera - Three.js camera
 * @param width - Screen width
 * @param height - Screen height
 * @returns Array of 3 screen points, or null if any vertex behind camera
 */
function projectTriangle(
  triangle: SphericalTriangle,
  camera: THREE.Camera,
  width: number,
  height: number
): [ScreenPoint, ScreenPoint, ScreenPoint] | null {
  const [v0, v1, v2] = triangle.vertices;
  
  const p0 = project3DToScreen(v0, camera, width, height);
  const p1 = project3DToScreen(v1, camera, width, height);
  const p2 = project3DToScreen(v2, camera, width, height);
  
  // If any vertex behind camera, don't draw
  if (!p0 || !p1 || !p2) {
    return null;
  }
  
  return [p0, p1, p2];
}

/**
 * Check if triangle is visible (front-facing)
 * 
 * What: Backface culling test
 * Why: Don't draw triangles on back of sphere (not visible)
 * 
 * @param triangle - Spherical triangle
 * @param cameraPosition - Camera position in 3D space
 * @returns True if triangle faces camera (visible)
 */
function isVisible(
  triangle: SphericalTriangle,
  cameraPosition: THREE.Vector3
): boolean {
  const [v0, v1, v2] = triangle.vertices;
  return isTriangleFrontFacing(v0, v1, v2, cameraPosition);
}

/**
 * Convert screen points to SVG path data
 * 
 * What: Build SVG path "d" attribute from screen coordinates
 * Why: SVG paths are drawn using path data strings
 * 
 * Format: "M x1 y1 L x2 y2 L x3 y3 Z"
 * - M: Move to first point
 * - L: Line to next point
 * - Z: Close path
 * 
 * @param points - Array of 3 screen points
 * @returns SVG path data string
 */
function pointsToPath(points: [ScreenPoint, ScreenPoint, ScreenPoint]): string {
  const [p0, p1, p2] = points;
  return `M ${p0.x.toFixed(1)} ${p0.y.toFixed(1)} ` +
         `L ${p1.x.toFixed(1)} ${p1.y.toFixed(1)} ` +
         `L ${p2.x.toFixed(1)} ${p2.y.toFixed(1)} Z`;
}

// ========================================
// COMPONENTS
// ========================================

/**
 * Neighbor triangle borders (2px black)
 * 
 * What: Draw borders for neighbor spherical triangles
 * Why: Show triangle edges clearly without cluttering view
 * 
 * Style: 2px black stroke, no fill, semi-transparent
 */
function NeighborBorders({
  neighbors,
  camera,
  cameraPosition,
  width,
  height,
}: {
  neighbors: SphericalTriangle[];
  camera: THREE.Camera;
  cameraPosition: THREE.Vector3;
  width: number;
  height: number;
}) {
  // Project all visible neighbors to screen coords
  const paths = useMemo(() => {
    const result: string[] = [];
    
    for (const triangle of neighbors) {
      // Backface culling
      if (!isVisible(triangle, cameraPosition)) {
        continue;
      }
      
      // Project to screen
      const projected = projectTriangle(triangle, camera, width, height);
      if (projected) {
        result.push(pointsToPath(projected));
      }
    }
    
    console.log(`[NeighborBorders] Projected ${result.length}/${neighbors.length} neighbors`);
    return result;
  }, [neighbors, camera, cameraPosition, width, height]);
  
  return (
    <>
      {paths.map((pathData, index) => (
        <Path
          key={`neighbor-${index}`}
          d={pathData}
          stroke="#000000"
          strokeWidth={2}
          fill="none"
          opacity={0.6}
        />
      ))}
    </>
  );
}

/**
 * Current triangle border (5px red)
 * 
 * What: Draw border for user's current spherical triangle
 * Why: Clearly highlight which triangle user is in
 * 
 * Style: 5px red stroke, no fill, opaque
 */
function CurrentBorder({
  currentTriangle,
  camera,
  cameraPosition,
  width,
  height,
}: {
  currentTriangle: SphericalTriangle | null;
  camera: THREE.Camera;
  cameraPosition: THREE.Vector3;
  width: number;
  height: number;
}) {
  // Project current triangle to screen
  const path = useMemo(() => {
    if (!currentTriangle) {
      return null;
    }
    
    // Backface culling
    if (!isVisible(currentTriangle, cameraPosition)) {
      return null;
    }
    
    // Project to screen
    const projected = projectTriangle(currentTriangle, camera, width, height);
    if (!projected) {
      return null;
    }
    
    // Debug logging disabled to prevent excessive output at 60 Hz
    // console.log(`[CurrentBorder] Current triangle visible`);
    return pointsToPath(projected);
  }, [currentTriangle, camera, cameraPosition, width, height]);
  
  if (!path) {
    return null;
  }
  
  return (
    <Path
      d={path}
      stroke="#FF0000"
      strokeWidth={5}
      fill="none"
      opacity={1.0}
    />
  );
}

/**
 * User position marker (red circle)
 * 
 * What: Red dot showing user's GPS position on sphere
 * Why: Always show user where they are on the mesh
 * 
 * Style: Red circle, radius 5-6px, always visible (no backface culling)
 * 
 * Note: User marker should always be visible even if triangle is occluded.
 * The marker represents the user's actual position, which is always "facing" them.
 */
function UserMarker({
  userPosition,
  camera,
  width,
  height,
}: {
  userPosition?: { lat: number; lon: number };
  camera: THREE.Camera;
  width: number;
  height: number;
}) {
  // Project user position to screen
  const screenPos = useMemo(() => {
    if (!userPosition) {
      return null;
    }
    
    // Convert GPS to 3D position on sphere
    const position3D = latLonToVector3(userPosition.lat, userPosition.lon);
    
    // Project to screen
    const projected = project3DToScreen(position3D, camera, width, height);
    
    // Debug logging disabled to prevent excessive output at 60 Hz
    // console.log(`[UserMarker] User at screen (${projected?.x.toFixed(0)}, ${projected?.y.toFixed(0)})`);
    return projected;
  }, [userPosition, camera, width, height]);
  
  if (!screenPos) {
    return null;
  }
  
  return (
    <>
      {/* Outer glow (larger, semi-transparent) */}
      <Circle
        cx={screenPos.x}
        cy={screenPos.y}
        r={8}
        fill="#FF0000"
        opacity={0.3}
      />
      
      {/* Inner dot (solid) */}
      <Circle
        cx={screenPos.x}
        cy={screenPos.y}
        r={5}
        fill="#FF0000"
        opacity={1.0}
      />
    </>
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

/**
 * SvgTriangleBorders - Main SVG overlay component
 * 
 * What: Absolute-positioned SVG layer over Three.js Canvas
 * Why: Crisp pixel-perfect borders that WebGL can't provide
 * 
 * Rendering Order:
 * 1. Neighbor borders (black 2px, back layer)
 * 2. Current border (red 5px, middle layer)
 * 3. User marker (red circle, top layer)
 * 
 * Performance Notes:
 * - SVG rendering is hardware-accelerated
 * - Projection updates are memoized (only recompute on changes)
 * - Backface culling reduces draw count
 * - All computations happen in useMemo (not per-frame)
 * 
 * CRITICAL: Must use real camera from Three.js, not create new one!
 * WHY: Sphere rotation (auto-centering) changes camera's world matrix.
 * Creating new camera doesn't have correct rotation, causing projection mismatch.
 * 
 * @param props - Triangles, user position, camera, screen dimensions
 * @returns Absolute-positioned SVG overlay
 */
export default function SvgTriangleBorders({
  neighbors,
  currentTriangle,
  userPosition,
  camera, // WHY: Use real camera from Three.js scene (includes rotation)
  cameraPosition,
  width,
  height,
}: SvgTriangleBordersProps) {
  // No need to create camera - we receive the real one from CameraTracker
  // WHY: Real camera includes all transformations (position + rotation from auto-centering)
  
  // Debug logging disabled to prevent excessive output at 60 Hz
  // console.log(
  //   `[SvgTriangleBorders] Rendering overlay: ${neighbors.length} neighbors, ` +
  //   `${currentTriangle ? 1 : 0} current, user ${userPosition ? 'present' : 'absent'}`
  // );
  
  return (
    <View style={styles.overlay} pointerEvents="none">
      <Svg width={width} height={height}>
        <G>
          {/* Neighbor borders (back layer) */}
          <NeighborBorders
            neighbors={neighbors}
            camera={camera}
            cameraPosition={cameraPosition}
            width={width}
            height={height}
          />
          
          {/* Current border (middle layer) */}
          <CurrentBorder
            currentTriangle={currentTriangle}
            camera={camera}
            cameraPosition={cameraPosition}
            width={width}
            height={height}
          />
          
          {/* User marker (top layer) */}
          <UserMarker
            userPosition={userPosition}
            camera={camera}
            width={width}
            height={height}
          />
        </G>
      </Svg>
    </View>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10, // Above Canvas, below UI controls
  },
});
