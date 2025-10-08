/**
 * SphereMesh3D - Core 3D Earth Sphere Component
 * 
 * What: Renders a 3D Earth sphere using WebGL via Three.js and @react-three/fiber
 * Why: Pure 3D spherical visualization (NO MAP) for STEP mining interface
 * 
 * This is Phase 1 of the 3D Mining Visualization implementation.
 * The sphere is a unit sphere (radius 1.0) representing Earth's surface.
 * All spherical triangles will be rendered ON this sphere surface.
 * 
 * Features:
 * - Blue Earth sphere (unit radius = 1.0)
 * - Hardware-accelerated WebGL rendering
 * - Touch gestures (pan/rotate via OrbitControls)
 * - Pinch-to-zoom (altitude 64 km - 3,185 km)
 * - Ambient + directional lighting
 * 
 * Reference: /step-mobile/MOBILE_3D_MINING_PLAN.md Phase 1
 * Created: 2025-10-08T09:27:00.000Z
 */

import React, { useRef, Suspense } from 'react';
import { View, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { Canvas, useFrame } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { useSphericalTriangles } from '../../hooks/useSphericalTriangles';
import SphericalTrianglesMesh from './SphericalTrianglesMesh';
import CameraTracker from './CameraTracker';

// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Props for SphereMesh3D component
 * 
 * @param currentPosition - User's GPS coordinates
 * @param triangleLevel - Triangle subdivision level (1-21, default 10)
 * @param rotation - Quaternion rotation for sphere (for auto-centering)
 * @param onCameraUpdate - Callback for real camera tracking (position + rotation)
 * @param onReady - Callback when 3D engine is initialized
 * @param onError - Callback for 3D rendering errors
 */
export interface SphereMesh3DProps {
  currentPosition?: { lat: number; lon: number };
  triangleLevel?: number;
  rotation?: THREE.Quaternion; // WHY: Allow parent to control sphere rotation (auto-centering)
  onCameraUpdate?: (position: THREE.Vector3, rotation: THREE.Euler) => void; // WHY: Extract real camera for SVG projection
  onReady?: () => void;
  onError?: (error: Error) => void;
}

// ========================================
// EARTH SPHERE COMPONENT
// ========================================

/**
 * Earth sphere mesh with material and lighting
 * 
 * What: Blue unit sphere representing Earth
 * Why: Foundation for spherical triangle mesh overlay
 * 
 * Geometry: SphereGeometry with radius 1.0 (unit sphere)
 * Material: MeshStandardMaterial responds to lights, allows PBR shading
 * Color: #2e6fdb (blue Earth color)
 * 
 * The sphere maintains a constant unit radius (1.0) which represents Earth.
 * Camera distance determines the visual "altitude" (zoom level).
 * 
 * PHASE 4: Now accepts rotation quaternion prop for auto-centering.
 * WHY: Allows parent to control sphere rotation to center user position.
 */
function EarthSphere({ rotation }: { rotation?: THREE.Quaternion }) {
  const sphereRef = useRef<THREE.Mesh>(null);

  // Apply rotation quaternion to sphere (auto-centering from Phase 4)
  // WHY: Smooth quaternion slerp animation to center user position
  useFrame(() => {
    if (sphereRef.current && rotation) {
      // Copy quaternion to sphere (don't mutate prop)
      sphereRef.current.quaternion.copy(rotation);
    }
  });

  return (
    <mesh ref={sphereRef} position={[0, 0, 0]}>
      {/* Unit sphere geometry with smooth shading (64 segments for quality) */}
      <sphereGeometry args={[1.0, 64, 64]} />
      
      {/* PBR material with blue Earth color */}
      <meshStandardMaterial
        color="#2e6fdb"
        roughness={0.7}
        metalness={0.1}
        side={THREE.FrontSide}
      />
    </mesh>
  );
}

// ========================================
// LIGHTING SETUP
// ========================================

/**
 * Lighting rig for Earth sphere
 * 
 * What: Ambient + Directional lights for proper sphere illumination
 * Why: Without lights, MeshStandardMaterial appears black
 * 
 * Ambient Light: Low-intensity global illumination (simulates scattered light)
 * Directional Light: Main light source from camera direction (simulates Sun)
 * 
 * This setup ensures the Earth sphere is always visible and properly lit
 * regardless of camera rotation.
 */
function Lights() {
  return (
    <>
      {/* Ambient light: subtle global illumination (intensity 0.5) */}
      <ambientLight intensity={0.5} />
      
      {/* Directional light: main light from front-right (simulates sunlight) */}
      <directionalLight
        position={[10, 10, 5]}
        intensity={0.8}
        castShadow={false} // Shadows disabled for performance
      />
    </>
  );
}

// ========================================
// CAMERA CONTROLS
// ========================================

/**
 * Camera controls and zoom limits
 * 
 * What: OrbitControls with altitude-based zoom restrictions
 * Why: Map camera distance to real-world altitude (64 km - 3,185 km)
 * 
 * Camera Distance Math:
 * - distance = 1.0 → Sea level (0 km altitude)
 * - distance = 1.010 → 64 km altitude (minimum zoom)
 * - distance = 1.5 → 3,185 km altitude (maximum zoom)
 * 
 * Formula: altitude (m) = (distance - 1.0) × Earth_radius (6,371 km)
 * 
 * Why these limits:
 * - Min (64 km): Prevents camera entering sphere (z-fighting, artifacts)
 * - Max (3,185 km): Entire hemisphere visible, triangles still distinguishable
 * 
 * Gestures:
 * - Touch drag: Rotate Earth (pan)
 * - Pinch: Zoom in/out (altitude adjustment)
 * - Double tap: Auto-center on user position (TODO: Phase 4)
 */
function CameraControls() {
  return (
    <OrbitControls
      enableRotate={true}
      enableZoom={true}
      enablePan={false} // Disable panning, only rotation
      
      // Zoom limits (altitude range)
      minDistance={1.010} // 64 km altitude (prevents camera penetration)
      maxDistance={1.5}   // 3,185 km altitude (entire hemisphere visible)
      
      // Zoom sensitivity
      zoomSpeed={0.015} // Slow, smooth zooming (prevents jarring jumps)
      
      // Rotation settings
      rotateSpeed={0.5} // Balanced rotation speed
      enableDamping={true} // Smooth momentum (inertia)
      dampingFactor={0.15} // Quick dampening
      
      // Touch gesture sensitivity
      touches={{
        ONE: THREE.TOUCH.ROTATE, // Single finger: rotate
        TWO: THREE.TOUCH.DOLLY_PAN, // Two fingers: zoom (pinch)
      }}
      
      // Mouse wheel sensitivity (for web testing)
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: undefined,
        RIGHT: undefined,
      }}
    />
  );
}

// ========================================
// MAIN COMPONENT
// ========================================

/**
 * SphereMesh3D - Main 3D Earth sphere component
 * 
 * What: Container for Three.js Canvas with Earth sphere, lights, and controls
 * Why: Provides the 3D foundation for spherical triangle mesh overlay
 * 
 * Canvas Configuration:
 * - dpr={[1, 2]}: Device pixel ratio scaling for performance
 *   - Uses 1x on low-end devices, 2x on high-end (Retina/HiDPI)
 * - gl={{ powerPreference: 'high-performance' }}: Request high-performance GPU
 * - frameloop="demand": Only render on changes (battery optimization)
 *   - Will switch to "always" in Phase 5 for pulsing animations
 * 
 * Error Handling:
 * - Suspense fallback: Shows loading indicator during 3D initialization
 * - Error boundary: Catches WebGL context failures (TODO: implement fallback)
 * 
 * @param props - Component props (currentPosition, onReady, onError)
 * @returns React component rendering 3D Earth sphere
 */
export default function SphereMesh3D({
  currentPosition,
  triangleLevel = 10,
  rotation,
  onCameraUpdate,
  onReady,
  onError,
}: SphereMesh3DProps) {
  /**
   * Fetch spherical triangles based on GPS position
   * 
   * What: Hook that fetches current + neighbor spherical triangles from API
   * Why: Need triangle data to render on sphere surface
   */
  const {
    currentTriangle,
    neighbors,
    isLoading: trianglesLoading,
    error: trianglesError,
    triangleCount,
  } = useSphericalTriangles({
    position: currentPosition || null,
    level: triangleLevel,
    maxNeighbors: 512,
    enabled: !!currentPosition,
  });
  /**
   * Handle 3D initialization
   * 
   * What: Callback when Canvas is ready and WebGL context created
   * Why: Notify parent component that 3D engine is initialized
   */
  const handleCreated = ({ gl }: { gl: THREE.WebGLRenderer }) => {
    // Log WebGL context info for debugging
    console.log('[SphereMesh3D] WebGL context created');
    console.log(`[SphereMesh3D] Renderer: ${gl.capabilities.precision} precision`);
    console.log(`[SphereMesh3D] Max texture size: ${gl.capabilities.maxTextureSize}`);
    
    // Notify parent that 3D is ready
    onReady?.();
  };

  /**
   * Handle WebGL errors
   * 
   * What: Catches WebGL context loss or initialization failures
   * Why: Graceful degradation - can fallback to SVG-only view
   */
  const handleError = (error: Error) => {
    console.error('[SphereMesh3D] WebGL error:', error);
    onError?.(error);
  };

  return (
    <View style={styles.container}>
      <Suspense fallback={<LoadingFallback />}>
        <Canvas
          // Device pixel ratio scaling (1x low-end, 2x high-end)
          dpr={[1, 2]}
          
          // WebGL renderer options
          gl={{
            powerPreference: 'high-performance', // Request GPU acceleration
            antialias: true, // Smooth edges
            alpha: false, // No transparency (solid background)
          }}
          
          // Camera configuration
          camera={{
            position: [0, 0, 1.5], // Start at 3,185 km altitude
            fov: 50, // Field of view (degrees)
            near: 0.1, // Near clipping plane
            far: 100, // Far clipping plane
          }}
          
          // Render loop optimization
          frameloop="demand" // Only render on changes (battery-friendly)
          
          // Event handlers
          onCreated={handleCreated}
          
          // React Native Canvas style
          style={styles.canvas}
        >
          {/* Lighting setup */}
          <Lights />
          
          {/* Earth sphere (with auto-centering rotation) */}
          <EarthSphere rotation={rotation} />
          
          {/* Spherical triangles overlay */}
          <SphericalTrianglesMesh
            neighbors={neighbors}
            currentTriangle={currentTriangle}
          />
          
          {/* Camera controls */}
          <CameraControls />
          
          {/* Camera tracker for SVG projection (Phase 4) */}
          {onCameraUpdate && (
            <CameraTracker onCameraUpdate={onCameraUpdate} />
          )}
        </Canvas>
      </Suspense>
    </View>
  );
}

// ========================================
// LOADING FALLBACK
// ========================================

/**
 * Loading indicator while 3D initializes
 * 
 * What: Shows spinner during WebGL context creation
 * Why: User feedback during initialization (typically <1 second)
 */
function LoadingFallback() {
  return (
    <View style={styles.loadingContainer}>
      <ActivityIndicator size="large" color="#2e6fdb" />
      <Text style={styles.loadingText}>Initializing 3D...</Text>
    </View>
  );
}

// ========================================
// STYLES
// ========================================

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000', // Black space background
  },
  canvas: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 14,
    color: '#FFFFFF',
    fontWeight: '500',
  },
});
