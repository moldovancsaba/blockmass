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
 * @param onCameraUpdate - Callback for real camera tracking (camera object + position + rotation)
 * @param onReady - Callback when 3D engine is initialized
 * @param onError - Callback for 3D rendering errors
 */
export interface SphereMesh3DProps {
  currentPosition?: { lat: number; lon: number };
  triangleLevel?: number;
  rotation?: THREE.Quaternion; // WHY: Allow parent to control sphere rotation (auto-centering)
  onCameraUpdate?: (camera: THREE.Camera, position: THREE.Vector3, rotation: THREE.Euler) => void; // WHY: Extract real camera for SVG projection
  onReady?: () => void;
  onError?: (error: Error) => void;
}

// ========================================
// EARTH SPHERE COMPONENT
// ========================================

/**
 * Earth sphere mesh with material and lighting
 * 
 * CRITICAL: Using MeshBasicMaterial with emissive color for testing
 * This ensures the sphere is ALWAYS visible regardless of lighting
 */
function EarthSphere({ rotation }: { rotation?: THREE.Quaternion }) {
  const sphereRef = useRef<THREE.Mesh>(null);

  // Log when sphere mounts
  React.useEffect(() => {
    console.log('[EarthSphere] Component mounted, ref:', !!sphereRef.current);
    if (sphereRef.current) {
      console.log('[EarthSphere] Mesh position:', sphereRef.current.position);
      console.log('[EarthSphere] Mesh visible:', sphereRef.current.visible);
    }
  }, []);

  // Apply rotation quaternion to sphere (auto-centering from Phase 4)
  useFrame(() => {
    if (sphereRef.current) {
      if (rotation) {
        sphereRef.current.quaternion.copy(rotation);
      }
    }
  });

  return (
    <mesh ref={sphereRef} position={[0, 0, 0]} visible={true}>
      {/* Smaller test sphere for visibility */}
      <sphereGeometry args={[0.998, 32, 32]} />
      
      {/* BRIGHT emissive material - impossible to miss */}
      <meshBasicMaterial
        color="#0000FF"
        side={THREE.DoubleSide}
        depthWrite={true}
        depthTest={true}
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
 * What: Very bright lights to make triangles clearly visible
 * Why: Frontend POC uses intensity 2-3 for visibility
 * 
 * Ambient Light: Bright global illumination
 * Directional Lights: Multiple lights from different angles
 * Point Light: Additional light source
 * 
 * This matches the frontend POC lighting setup for maximum visibility.
 */
function Lights() {
  return (
    <>
      {/* Very bright ambient light (like frontend POC) */}
      <ambientLight intensity={2.0} />
      
      {/* Main directional light from front-right */}
      <directionalLight
        position={[10, 10, 5]}
        intensity={3.0}
        castShadow={false}
      />
      
      {/* Back directional light for even illumination */}
      <directionalLight
        position={[-10, -10, -5]}
        intensity={2.0}
        castShadow={false}
      />
      
      {/* Point light from front */}
      <pointLight position={[0, 0, 5]} intensity={2.0} />
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
      enablePan={false} // Lock camera to center on Earth
      
      // Zoom limits (match frontend POC)
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
  const handleCreated = ({ gl, scene, camera }: { gl: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.Camera }) => {
    // Log WebGL context info for debugging
    console.log('[SphereMesh3D] WebGL context created');
    console.log(`[SphereMesh3D] Renderer: ${gl.capabilities.precision} precision`);
    console.log(`[SphereMesh3D] Max texture size: ${gl.capabilities.maxTextureSize}`);
    
    // Set background color to white for testing
    gl.setClearColor(0xffffff, 1.0);
    scene.background = new THREE.Color(0xffffff);
    console.log('[SphereMesh3D] Background set to WHITE');
    
    // Count scene objects
    console.log(`[SphereMesh3D] Scene children count: ${scene.children.length}`);
    scene.traverse((obj) => {
      console.log(`[SphereMesh3D] Scene object: ${obj.type} - ${obj.name || 'unnamed'}`);
    });
    
    // Log camera
    console.log(`[SphereMesh3D] Camera position:`, camera.position);
    console.log(`[SphereMesh3D] Camera looking at:`, (camera as THREE.PerspectiveCamera).getWorldDirection(new THREE.Vector3()));
    
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
          
          // Camera configuration (match frontend POC)
          camera={{
            position: [0, 0, 3.0], // Start FAR outside (3.0 = ~12 million km from Earth)
            fov: 50, // Field of view (degrees)
            near: 0.01, // VERY close clipping - can see objects almost touching camera
            far: 100, // Far clipping plane
          }}
          
          // Render loop mode
          frameloop="always" // WHY: Need continuous rendering for camera tracking and auto-centering
          
          // Event handlers
          onCreated={handleCreated}
          
          // React Native Canvas style
          style={styles.canvas}
        >
          {/* Lighting setup */}
          <Lights />
          
          {/* TEST SPHERE - Bright red sphere at origin for visibility test */}
          <mesh position={[0, 0, 0]}>
            <sphereGeometry args={[0.5, 32, 32]} />
            <meshStandardMaterial
              color="#FF0000"
              emissive="#FF0000"
              emissiveIntensity={3.0}
            />
          </mesh>
          
          {/* TEST CUBE - Another test object at different position */}
          <mesh position={[1.5, 0, 0]}>
            <boxGeometry args={[0.3, 0.3, 0.3]} />
            <meshStandardMaterial
              color="#00FF00"
              emissive="#00FF00"
              emissiveIntensity={3.0}
            />
          </mesh>
          
          {/* Grid Helper for orientation */}
          <gridHelper args={[10, 10, 0xff0000, 0x0000ff]} />
          
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
    width: '100%',
    height: '100%',
    backgroundColor: '#FF0000', // RED background to test visibility
  },
  canvas: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#00FF00', // GREEN background to test canvas
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
