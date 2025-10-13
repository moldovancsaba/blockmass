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

import { useEffect, useRef } from 'react';
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
   * @param camera - Real Three.js camera object (for projection)
   * @param position - Current camera position (cloned Vector3)
   * @param rotation - Current camera rotation (cloned Euler)
   */
  onCameraUpdate: (camera: THREE.Camera, position: THREE.Vector3, rotation: THREE.Euler) => void;
}

/**
 * CameraTracker - Extracts camera position/rotation from Three.js context.
 * 
 * WHY: SVG overlay needs real camera state for accurate 3D→2D projection.
 * Phase 3 used fixed estimate which caused misalignment after rotation/zoom.
 * 
 * WHAT:
 * - Accesses Three.js camera via useThree() hook (only works inside <Canvas>)
 * - Tracks camera changes and notifies parent only when camera actually moves
 * - Uses threshold to avoid spam updates on tiny floating-point changes
 * - Invisible component (returns null)
 * 
 * PERFORMANCE:
 * - Checks at render rate but only calls callback on significant changes
 * - Position threshold: 0.001 units (~6m at Earth scale)
 * - Rotation threshold: 0.01 radians (~0.57 degrees)
 * - Typical update rate: 5-10 Hz during interaction, 0 Hz when static
 * 
 * @param props - CameraTracker props
 * @returns null (invisible component)
 */
export default function CameraTracker({ onCameraUpdate }: CameraTrackerProps) {
  // Access Three.js camera from context
  // WHY: useThree() only works inside <Canvas>, provides access to scene/camera/renderer
  const { camera } = useThree();

  // Store last reported camera state to detect changes
  // WHY: Only update parent when camera actually moves, not every frame
  const lastPositionRef = useRef(camera.position.clone());
  const lastRotationRef = useRef(camera.rotation.clone());

  // Track camera only when it changes significantly
  // WHY: Camera only changes during user interaction or auto-centering
  // No need to spam updates at 60 Hz when camera is static
  useFrame(() => {
    const position = camera.position;
    const rotation = camera.rotation;

    // Check if camera moved significantly
    // WHY: Avoid spam updates from floating-point noise
    const positionChanged = position.distanceTo(lastPositionRef.current) > 0.001; // ~6m threshold
    const rotationChanged = Math.abs(rotation.x - lastRotationRef.current.x) > 0.01 ||
                           Math.abs(rotation.y - lastRotationRef.current.y) > 0.01 ||
                           Math.abs(rotation.z - lastRotationRef.current.z) > 0.01; // ~0.57° threshold

    if (positionChanged || rotationChanged) {
      // Camera moved - update parent
      lastPositionRef.current.copy(position);
      lastRotationRef.current.copy(rotation);

      // Clone values to prevent mutation
      onCameraUpdate(camera, position.clone(), rotation.clone());
    }
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
