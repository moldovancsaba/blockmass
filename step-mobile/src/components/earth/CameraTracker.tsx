/**
 * CameraTracker Component
 * 
 * WHY: Extracts real camera position/rotation from Three.js context for SVG overlay projection.
 * Phase 3 used fixed camera estimate (0,0,1.5) which caused SVG border misalignment.
 * This component must be placed INSIDE <Canvas> to access Three.js camera via useThree() hook.
 * 
 * WHAT:
 * - Reads camera.position and camera.rotation from Three.js scene
 * - Updates parent state at 60 Hz (every frame)
 * - Invisible component (renders null)
 * - Callback-based to avoid prop drilling
 * 
 * USAGE:
 * <Canvas>
 *   <CameraTracker onCameraUpdate={(pos, rot) => setCameraState({ pos, rot })} />
 *   <mesh>...</mesh>
 * </Canvas>
 */

import { useEffect } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import * as THREE from 'three';

/**
 * Props for CameraTracker component.
 */
interface CameraTrackerProps {
  /**
   * Callback fired on every frame with current camera state.
   * 
   * WHY: Allows parent component to track camera for SVG overlay projection.
   * Called at 60 Hz in useFrame loop.
   * 
   * @param position - Current camera position (cloned Vector3)
   * @param rotation - Current camera rotation (cloned Euler)
   */
  onCameraUpdate: (position: THREE.Vector3, rotation: THREE.Euler) => void;
}

/**
 * CameraTracker - Extracts camera position/rotation from Three.js context.
 * 
 * WHY: SVG overlay needs real camera state for accurate 3D→2D projection.
 * Phase 3 used fixed estimate which caused misalignment after rotation/zoom.
 * 
 * WHAT:
 * - Accesses Three.js camera via useThree() hook (only works inside <Canvas>)
 * - Clones camera.position and camera.rotation on every frame
 * - Calls onCameraUpdate callback with cloned values (prevent mutation)
 * - Invisible component (returns null)
 * 
 * PERFORMANCE:
 * - Runs at 60 Hz (useFrame loop)
 * - Minimal overhead: 2 Vector3 clones per frame (~microseconds)
 * - No rendering, just data extraction
 * 
 * @param props - CameraTracker props
 * @returns null (invisible component)
 */
export default function CameraTracker({ onCameraUpdate }: CameraTrackerProps) {
  // Access Three.js camera from context
  // WHY: useThree() only works inside <Canvas>, provides access to scene/camera/renderer
  const { camera } = useThree();

  // Track camera on every frame (60 Hz)
  // WHY: Camera position/rotation changes every frame during user interaction
  // useFrame is called by Three.js before each render
  useFrame(() => {
    // Clone position and rotation to prevent mutation
    // WHY: Parent may store these values, we don't want shared references
    const position = camera.position.clone();
    const rotation = camera.rotation.clone();

    // Call parent callback with current camera state
    onCameraUpdate(position, rotation);
  });

  // Log initial camera info (debug)
  useEffect(() => {
    console.log('[CameraTracker] Initialized with camera type:', camera.type);
    console.log('[CameraTracker] Initial position:', camera.position.toArray());
    console.log('[CameraTracker] Initial rotation:', camera.rotation.toArray());
  }, [camera]);

  // Render nothing (invisible component)
  // WHY: This is a data-only component, no visual representation
  return null;
}
