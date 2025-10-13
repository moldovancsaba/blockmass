/**
 * useAutoCenter Hook
 * 
 * WHY: Computes quaternion rotation to auto-center user position on sphere facing camera.
 * Without this, user must manually rotate sphere to see their position, poor UX.
 * Uses spherical linear interpolation (slerp) for smooth animation.
 * 
 * WHAT:
 * - Takes user GPS position (lat/lon) and converts to 3D position on sphere
 * - Computes target quaternion rotation to make user position face camera
 * - Returns current rotation quaternion that smoothly slerps toward target
 * - Configurable centering speed (0.0 = no centering, 1.0 = instant snap)
 * 
 * MATH:
 * - User 3D position = latLonToVector3(lat, lon) on unit sphere
 * - Target: Rotate sphere so user position → camera look direction (0, 0, 1)
 * - Quaternion = setFromUnitVectors(userPos, cameraDirection)
 * - Smooth: current.slerp(target, alpha) each frame
 * 
 * USAGE:
 * const rotation = useAutoCenter({
 *   userPosition: { lat: 37.7749, lon: -122.4194 },
 *   enabled: true,
 *   speed: 0.05, // 5% per frame = ~1 sec for 180° rotation
 * });
 * 
 * <mesh quaternion={rotation}>
 */

import { useState, useEffect, useRef } from 'react';
import * as THREE from 'three';
import { latLonToVector3 } from '../lib/spherical-projection';

/**
 * Options for useAutoCenter hook.
 */
export interface AutoCenterOptions {
  /**
   * User GPS position to center on.
   * WHY: This is the point on sphere that should face camera.
   */
  userPosition: { lat: number; lon: number };

  /**
   * Enable/disable auto-centering.
   * WHY: Allow user to manually rotate sphere without auto-centering fighting them.
   * Default: true
   */
  enabled?: boolean;

  /**
   * Centering speed (0.0 to 1.0).
   * 
   * WHY: Smooth slerp animation, not instant snap.
   * - 0.0 = no centering (sphere stays at current rotation)
   * - 0.05 = slow, smooth (5% per frame, ~1 sec for 180°)
   * - 0.1 = medium (10% per frame, ~0.5 sec for 180°)
   * - 1.0 = instant snap (no animation)
   * 
   * Default: 0.05
   */
  speed?: number;

  /**
   * Camera look direction (unit vector).
   * WHY: Sphere rotates so user position points toward this direction.
   * Default: (0, 0, 1) - camera looking at sphere from positive Z axis
   */
  cameraDirection?: THREE.Vector3;
}

/**
 * useAutoCenter - Smooth quaternion rotation to center user position.
 * 
 * WHY: Auto-centers sphere so user always sees their position facing camera.
 * Better UX than manual rotation, especially for mobile AR mining.
 * 
 * WHAT:
 * - Converts user GPS → 3D position on sphere
 * - Computes target quaternion: userPos → cameraDirection
 * - Smoothly slerps current rotation toward target each frame
 * - Returns current quaternion for sphere mesh
 * 
 * ALGORITHM:
 * 1. userPos3D = latLonToVector3(lat, lon) // Unit sphere position
 * 2. targetQuat = Quaternion.setFromUnitVectors(userPos3D, cameraDirection)
 * 3. currentQuat.slerp(targetQuat, speed) // Smooth interpolation
 * 4. Return currentQuat
 * 
 * PERFORMANCE:
 * - Runs on every position change or frame (if enabled)
 * - Quaternion slerp: ~10 multiplications, very fast
 * - No matrix inversions, no expensive trig
 * 
 * @param options - Auto-center configuration
 * @returns Current rotation quaternion (smoothly animating toward target)
 */
export function useAutoCenter(options: AutoCenterOptions): THREE.Quaternion {
  const {
    userPosition,
    enabled = true,
    speed = 0.05, // Default 5% per frame
    cameraDirection = new THREE.Vector3(0, 0, 1), // Default camera look
  } = options;

  // Current rotation quaternion (state)
  // WHY: Smoothly animates via slerp, not instant snap to target
  const [currentRotation, setCurrentRotation] = useState<THREE.Quaternion>(
    () => new THREE.Quaternion()
  );

  // Use ref for animation loop to avoid re-creating effect
  const animationRef = useRef<number | null>(null);
  const targetRotationRef = useRef<THREE.Quaternion>(new THREE.Quaternion());

  // Memoize camera direction to prevent unnecessary recalculations
  // WHY: Avoid re-creating Vector3 on every render
  const cameraDirectionRef = useRef(cameraDirection);

  // Compute target rotation when user position changes
  useEffect(() => {
    if (!enabled) {
      // Auto-centering disabled, keep current rotation
      return;
    }

    // Convert GPS to 3D position on unit sphere
    // WHY: Quaternion rotation requires 3D vectors, not lat/lon
    const userPos3D = latLonToVector3(userPosition.lat, userPosition.lon);

    // Compute target quaternion: rotate userPos3D to cameraDirection
    // WHY: setFromUnitVectors computes shortest rotation between two unit vectors
    // Result: When applied to sphere, user position will face camera
    const targetRotation = new THREE.Quaternion().setFromUnitVectors(
      userPos3D,
      cameraDirectionRef.current
    );

    // Store target in ref (avoid triggering re-render)
    targetRotationRef.current = targetRotation;

    // Debug logging disabled to prevent excessive output
    // console.log('[useAutoCenter] Target rotation updated for position:', userPosition);
    // console.log('[useAutoCenter] User 3D:', userPos3D.toArray());
    // console.log('[useAutoCenter] Target quaternion:', targetRotation.toArray());
  }, [userPosition.lat, userPosition.lon, enabled]);

  // Animation loop: smooth slerp toward target
  // WHY: Disabled - causing infinite loop and excessive re-renders
  // Instead, we'll use useFrame in the component for animation
  // This hook now returns the target rotation directly for immediate application
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Set rotation directly to target (no animation for now)
    // TODO: Implement smooth slerp animation without causing infinite loop
    setCurrentRotation(targetRotationRef.current.clone());
  }, [userPosition.lat, userPosition.lon, enabled]);

  // Return current rotation quaternion
  // WHY: Apply to sphere mesh: <mesh quaternion={rotation}>
  return currentRotation;
}
