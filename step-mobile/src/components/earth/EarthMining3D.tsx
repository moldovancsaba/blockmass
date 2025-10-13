/**
 * EarthMining3D - Complete 3D Mining Visualization
 * 
 * What: Integrates SphereMesh3D (WebGL) + SvgTriangleBorders (SVG overlay)
 * Why: Need both 3D rendering AND crisp 2D borders in single component
 * 
 * This is the main component that combines:
 * 1. SphereMesh3D: 3D Earth sphere with spherical triangles (WebGL)
 * 2. SvgTriangleBorders: Pixel-perfect borders and user marker (SVG)
 * 
 * The SVG overlay is absolutely positioned over the Canvas to provide
 * crisp 2px/5px borders that WebGL lineWidth cannot reliably deliver on mobile.
 * 
 * Features:
 * - Complete Phase 1-3 implementation
 * - Spherical triangles with WebGL fills
 * - SVG borders (2px black neighbors, 5px red current)
 * - User marker (red circle with glow)
 * - Touch gestures (rotate, zoom)
 * - Auto-centering on user position (Phase 4)
 * 
 * Reference: /step-mobile/MOBILE_3D_MINING_PLAN.md Phase 1-3
 * Created: 2025-10-08T09:45:00.000Z
 */

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import SphereMesh3D from './SphereMesh3D';
import SvgTriangleBorders from './SvgTriangleBorders';
import { useSphericalTriangles } from '../../hooks/useSphericalTriangles';
import { useAutoCenter } from '../../hooks/useAutoCenter';
import * as THREE from 'three';

// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Props for EarthMining3D
 * 
 * @param currentPosition - User's GPS position
 * @param triangleLevel - Triangle subdivision level (1-21, default 10)
 * @param miningTriangleId - ID of triangle being mined (for pulsing highlight)
 * @param autoCentering - Enable auto-centering on user position (default true)
 * @param onReady - Callback when 3D engine initialized
 * @param onError - Callback for errors
 */
export interface EarthMining3DProps {
  currentPosition?: { lat: number; lon: number };
  triangleLevel?: number;
  miningTriangleId?: string;
  autoCentering?: boolean; // WHY: Allow manual rotation without auto-centering fighting
  onReady?: () => void;
  onError?: (error: Error) => void;
}

// ========================================
// MAIN COMPONENT
// ========================================

/**
 * EarthMining3D - Complete 3D mining visualization
 * 
 * What: Combined WebGL + SVG rendering for optimal quality
 * Why: WebGL provides 3D depth, SVG provides crisp 2D borders
 * 
 * Architecture:
 * ```
 * <View> (container)
 *   ├── <SphereMesh3D> (WebGL Canvas - 3D sphere + triangle fills)
 *   └── <SvgTriangleBorders> (SVG overlay - borders + user marker)
 * ```
 * 
 * The SVG overlay is absolutely positioned with `pointer Events="none"`
 * so touch gestures pass through to the Canvas below.
 * 
 * @param props - GPS position, triangle level, callbacks
 * @returns Complete 3D mining visualization
 */
export default function EarthMining3D({
  currentPosition,
  triangleLevel = 10,
  miningTriangleId,
  autoCentering = true,
  onReady,
  onError,
}: EarthMining3DProps) {
  // Screen dimensions for SVG overlay
  const [dimensions, setDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  });

  // Camera state (updated from CameraTracker in SphereMesh3D)
  // WHY: Need real camera object for accurate SVG projection (includes rotation)
  // Phase 3 used fixed estimate camera, Phase 4 uses real camera from Three.js
  const [camera, setCamera] = useState<THREE.Camera | null>(null);
  const [cameraPosition, setCameraPosition] = useState(new THREE.Vector3(0, 0, 1.5));
  const [cameraRotation, setCameraRotation] = useState(new THREE.Euler());

  // Auto-centering rotation (Phase 4)
  // WHY: Smoothly rotates sphere so user position faces camera
  // Uses quaternion slerp for smooth animation (5% per frame = ~1 sec for 180°)
  const autoCenterRotation = useAutoCenter({
    userPosition: currentPosition || { lat: 0, lon: 0 },
    enabled: autoCentering && !!currentPosition,
    speed: 0.05, // 5% per frame (smooth, not jarring)
  });

  // Fetch spherical triangles
  const {
    currentTriangle,
    neighbors,
    isLoading,
    error: trianglesError,
    triangleCount,
  } = useSphericalTriangles({
    position: currentPosition || null,
    level: triangleLevel,
    maxNeighbors: 512,
    enabled: !!currentPosition,
  });

  // Handle camera updates from CameraTracker (Phase 4)
  // WHY: Real camera object needed for accurate SVG projection with rotation
  const handleCameraUpdate = (cam: THREE.Camera, position: THREE.Vector3, rotation: THREE.Euler) => {
    setCamera(cam);
    setCameraPosition(position);
    setCameraRotation(rotation);
  };

  // Update dimensions on window resize
  useEffect(() => {
    const subscription = Dimensions.addEventListener('change', ({ window }) => {
      setDimensions({
        width: window.width,
        height: window.height,
      });
    });

    return () => subscription?.remove();
  }, []);

  // Debug logging disabled to prevent excessive output at 60 Hz
  // console.log(
  //   `[EarthMining3D] Rendering: ${triangleCount} triangles, ` +
  //   `camera at (${cameraPosition.x.toFixed(2)}, ${cameraPosition.y.toFixed(2)}, ${cameraPosition.z.toFixed(2)})`
  // );

  return (
    <View style={styles.container}>
      {/* WebGL 3D rendering (sphere + triangle fills) */}
      <SphereMesh3D
        currentPosition={currentPosition}
        triangleLevel={triangleLevel}
        rotation={autoCentering ? autoCenterRotation : undefined}
        onCameraUpdate={handleCameraUpdate}
        onReady={onReady}
        onError={onError}
      />

      {/* SVG overlay (borders + user marker) */}
      {currentPosition && camera && (
        <SvgTriangleBorders
          neighbors={neighbors}
          currentTriangle={currentTriangle}
          userPosition={currentPosition}
          camera={camera}
          cameraPosition={cameraPosition}
          width={dimensions.width}
          height={dimensions.height}
        />
      )}
    </View>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    position: 'relative',
    backgroundColor: '#000000',
  },
});
