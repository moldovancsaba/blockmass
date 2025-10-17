/**
 * Standalone Earth Mesh 3D - Interactive Icosahedron Mining Simulation
 * 
 * Purpose: Render 20-triangle icosahedron on 3D Earth sphere with tap-to-mine interaction.
 * No backend dependencies - complete standalone demo with persistent state.
 * 
 * Features:
 * - 20 vibrant colored triangles (base icosahedron)
 * - Double-tap any triangle to increment clicks
 * - Gray overlay shows mining progress (0-10 clicks)
 * - Auto-subdivision at 10 clicks (1 → 4 children)
 * - GPS triangle highlighted with bright edges
 * - Persistent state via AsyncStorage
 * - Smooth rotation and zoom controls
 */

import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, GestureResponderEvent, PanResponder, Text } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import * as Haptics from 'expo-haptics';

import { MeshTriangle, findTriangleContainingPoint, getActiveTriangles, generateBaseIcosahedron } from '../../lib/icosahedron-mesh';
import { isPointInSphericalTriangle, sphericalToCartesian, cartesianToSpherical } from '../../lib/icosahedron';
import { initializeMesh, incrementClicks } from '../../lib/mesh-state-manager';
import { getTriangleMaterialProps } from '../../lib/triangle-colors';

interface StandaloneEarthMesh3DProps {
  currentPosition?: { lat: number; lon: number };
  onMeshStatsUpdate?: (stats: { 
    totalTriangles: number; 
    activeTriangles: number;
    visibleTriangles: number;
    totalClicks: number;
    screenCenterGPS?: { lat: number; lon: number; altitude: number; visibleWidth: number };
  }) => void;
}

/**
 * Subdivide triangle into array of positions (for merged geometry)
 * Returns flat array: [x,y,z, x,y,z, x,y,z, ...] for all subdivided triangles
 */
function subdivideTriangleToArray(
  v0: THREE.Vector3,
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  subdivisions: number,
  radius: number
): number[] {
  const positions: number[] = [];

  function subdivide(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) {
    if (depth === 0) {
      // Scale to desired radius
      positions.push(a.x * radius, a.y * radius, a.z * radius);
      positions.push(b.x * radius, b.y * radius, b.z * radius);
      positions.push(c.x * radius, c.y * radius, c.z * radius);
    } else {
      const ab = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).normalize();
      const bc = new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5).normalize();
      const ca = new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5).normalize();

      subdivide(a, ab, ca, depth - 1);
      subdivide(b, bc, ab, depth - 1);
      subdivide(c, ca, bc, depth - 1);
      subdivide(ab, bc, ca, depth - 1);
    }
  }

  subdivide(v0, v1, v2, subdivisions);
  return positions;
}

export default function StandaloneEarthMesh3D({ 
  currentPosition,
  onMeshStatsUpdate 
}: StandaloneEarthMesh3DProps) {
  // Zoom limits: safe distance with telescopic lens for close-up effect
  // CRITICAL: Camera MUST stay outside STEP_RADIUS to avoid "underground" view
  // - STEP_RADIUS = 1.07 (mesh layer)
  // - MIN_ZOOM = 1.071 (camera ~6.4km above surface)
  // - Strategy: Stay at safe distance, use narrow FOV for telescopic effect
  // - Result: Visual magnification without culling issues
  // 
  // Altitude calculation: (zoom - STEP_RADIUS) * EARTH_RADIUS_KM
  // - MIN_ZOOM 1.071 → (1.071 - 1.07) * 6371 ≈ 6.4km altitude
  const MIN_ZOOM = 1.071;      // ~6.4km altitude - safe distance
  const MAX_ZOOM = 5.0;        // ~25,500 km altitude - entire hemisphere visible
  
  // Super telephoto FOV: narrow field of view creates telescopic magnification
  // What: Narrow FOV at close zoom simulates being much closer
  // Why: Stay at safe distance (6km) but see same detail as if at 600m
  // Result: Visual zoom WITHOUT culling problems
  // 
  // FOV reference:
  // - 10° = extreme telephoto (like 800mm lens)
  // - 20° = telephoto (like 200mm lens)
  // - 50° = normal (like 50mm lens)
  // - 70° = wide angle (like 28mm lens)
  const MIN_FOV = 10; // Super telephoto for extreme magnification at 6km
  const MAX_FOV = 70; // Wide angle lens for far zoom
  

  // Rendering radii (keep consistent everywhere)
  const EARTH_RADIUS = 0.95;
  const STEP_RADIUS = 1.07; // base spherical triangles
  const EDGE_RADIUS = 1.09; // GPS edge highlight above triangles

  // Core refs
  const animationFrameRef = useRef<number | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster());
  const viewSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  
  // Mesh state
  const [meshState, setMeshState] = useState<Map<string, MeshTriangle>>(new Map());
  const meshStateRef = useRef<Map<string, MeshTriangle>>(new Map());
  const [gpsTriangleId, setGpsTriangleId] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  
  // Render trigger: force re-render on mesh changes (instant, no debounce)
  // What: Single state variable to trigger immediate geometry rebuild
  // Why: Fast single-mesh approach doesn't need debouncing
  const [renderTrigger, setRenderTrigger] = useState<number>(0);
  
  // Mesh rotation state: triggers visibility recalculation when rotation changes
  // What: Tracks current rotation to detect when mesh orientation changes
  // Why: Backface culling must update when mesh rotates to show newly visible triangles
  const [meshRotation, setMeshRotation] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const lastRotationUpdateRef = useRef<number>(0);
  const rotationAnimFrameRef = useRef<number | null>(null);
  
  // Debug logging: Enable to diagnose visibility issues
  const ENABLE_TRIANGLE_COUNT_LOGGING = true; // Track visible triangles
  const lastTriangleCountLogRef = useRef<number>(0);
  
  // Track currently visible triangle count for stats
  const [visibleTriangleCount, setVisibleTriangleCount] = useState<number>(0);
  const [screenCenterGPS, setScreenCenterGPS] = useState<{ lat: number; lon: number; altitude: number; visibleWidth: number } | undefined>(undefined);
  
  // 3D objects - SINGLE merged mesh for all triangles
  const earthSphereRef = useRef<THREE.Mesh | null>(null);
  const mergedTriangleMeshRef = useRef<THREE.Mesh | null>(null); // ONE mesh for ALL triangles
  const gpsEdgesRef = useRef<THREE.LineSegments | null>(null);
  const gpsMarkerRef = useRef<THREE.Mesh | null>(null); // Always-visible GPS marker
  
  // Interaction state
  const rotationRef = useRef({ x: 0, y: 0 });
  
  // Start at MINIMUM zoom (closest to surface)
  // What: Begin at lowest altitude showing smallest area
  // Why: Mining app should focus on immediate GPS location, not global view
  // User can zoom OUT to see more context
  const INITIAL_ZOOM = MIN_ZOOM; // Start at minimum altitude (~7km above surface)
  const zoomRef = useRef(INITIAL_ZOOM);
  const hasInitializedRotationRef = useRef<boolean>(false); // Track if we've set initial GPS rotation
  
  // Progressive mesh refinement: show levels gradually as app loads
  // What: Start with level 0 (20 triangles), gradually show deeper levels
  // Why: Creates smooth "zooming in" visual experience
  const [maxVisibleLevel, setMaxVisibleLevel] = useState<number>(0); // Start with base icosahedron
  const progressiveLoadingRef = useRef<boolean>(true); // True = still loading progressively
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const lastTapTimeRef = useRef<number>(0);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(INITIAL_ZOOM);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);
  const movedRef = useRef<boolean>(false);
  const didDoubleTapRef = useRef<boolean>(false);
  const lastVisibilityZoomRef = useRef<number>(INITIAL_ZOOM); // Track zoom for visibility updates
  
  // Pixel-locked rotation state: tracks 3D anchor point on sphere surface
  // What: Store the initial touch point projected onto the sphere
  // Why: Enables 1:1 pixel tracking - point stays under finger during drag
  const anchorPointRef = useRef<THREE.Vector3 | null>(null);

  /**
   * Initialize mesh state on mount with progressive refinement.
   * What: Start with level 0, gradually reveal deeper levels
   * Why: Creates smooth "zooming in" visual experience
   */
  useEffect(() => {
    (async () => {
      // Show base 20 Spherical Triangles immediately
      const base = generateBaseIcosahedron();
      const baseMap = new Map<string, MeshTriangle>();
      for (const t of base) baseMap.set(t.id, t);
      setMeshState(baseMap);
      meshStateRef.current = baseMap;
      console.log(`[Progressive Load] Level 0: ${baseMap.size} base triangles`);
      
      // Fetch full mesh state in background
      let fullState: Map<string, MeshTriangle>;
      try {
        fullState = await initializeMesh();
        meshStateRef.current = fullState;
        console.log(`[Progressive Load] Full mesh loaded: ${fullState.size} triangles`);
      } catch (err) {
        console.error('[Progressive Load] Failed to load mesh:', err);
        setLoading(false);
        return;
      }
      
      // Calculate max level in full mesh
      let maxLevel = 0;
      for (const tri of fullState.values()) {
        if (tri.level > maxLevel) maxLevel = tri.level;
      }
      console.log(`[Progressive Load] Max level in mesh: ${maxLevel}`);
      
      // Progressive refinement: reveal one level at a time
      // Duration: 200ms per level for smooth animation
      const LEVEL_INTERVAL_MS = 200;
      
      if (maxLevel > 0) {
        let currentLevel = 0;
        const levelInterval = setInterval(() => {
          currentLevel++;
          setMaxVisibleLevel(currentLevel);
          console.log(`[Progressive Load] Showing up to level ${currentLevel}`);
          
          if (currentLevel >= maxLevel) {
            clearInterval(levelInterval);
            progressiveLoadingRef.current = false;
            console.log('[Progressive Load] Complete - showing full mesh');
            
            // Set final full mesh state
            setMeshState(new Map(fullState));
            setLoading(false);
          }
        }, LEVEL_INTERVAL_MS);
      } else {
        // No subdivisions, just show base
        progressiveLoadingRef.current = false;
        setMeshState(new Map(fullState));
        setLoading(false);
      }
    })();
    
    // Force initial visibility calculation after a short delay
    // Why: Ensures visibility is calculated once camera and scene are ready
    setTimeout(() => {
      console.log('[Init] Triggering initial visibility calculation');
      setMeshRotation({ x: rotationRef.current.x, y: rotationRef.current.y });
    }, 500);
    
    // No cleanup needed for instant updates
  }, []);

  /**
   * Update GPS triangle when position changes.
   * ALSO: Initialize mesh rotation to center GPS position on first load.
   */
  useEffect(() => {
    console.log(`[GPS Centering] useEffect triggered - currentPosition=${currentPosition ? 'YES' : 'NO'}, meshState.size=${meshState.size}`);
    
    if (!currentPosition || meshState.size === 0) {
      console.log('[GPS Centering] Skipping - no position or empty mesh');
      setGpsTriangleId(null);
      return;
    }
    
    console.log(`[GPS Centering] GPS Position: ${currentPosition.lat.toFixed(6)}, ${currentPosition.lon.toFixed(6)}`);
    console.log(`[GPS Centering] hasInitializedRotation: ${hasInitializedRotationRef.current}`);

    const activeTriangles = getActiveTriangles(meshState);
    const triangleId = findTriangleContainingPoint(
      currentPosition.lat,
      currentPosition.lon,
      activeTriangles
    );
    
    setGpsTriangleId(triangleId);
    
    if (triangleId) {
      console.log(`[StandaloneEarthMesh3D] GPS triangle: ${triangleId}`);
    }
    
    // CRITICAL: On first load, rotate mesh to center GPS position on screen
    // What: Use proper 3D vector rotation to align GPS point with camera view
    // Why: User should see their location immediately at screen center
    if (!hasInitializedRotationRef.current && currentPosition) {
      console.log('[GPS Centering] 🎯 INITIALIZING GPS CENTERING...');
      hasInitializedRotationRef.current = true;
      
      const lat = currentPosition.lat;
      const lon = currentPosition.lon;
      
      console.log(`[GPS Centering] Target GPS: ${lat.toFixed(6)}°, ${lon.toFixed(6)}°`);
      
      // Simple Euler angle calculation to center GPS at screen center
      // Camera at (0,0,+zoom) looks along -Z axis toward (0,0,-1)
      // We want GPS point to appear at screen center
      // 
      // Strategy: Rotate mesh so GPS point moves to (0, 0, -1)
      // 1. Rotate around Y by -longitude (brings meridian to front)
      // 2. Rotate around X to bring latitude to equator (screen center)
      
      const latRad = lat * Math.PI / 180;
      const lonRad = lon * Math.PI / 180;
      
      // Y rotation: -longitude brings the GPS meridian to the front (XZ plane at y=0)
      const rotY = -lonRad;
      
      // X rotation: We want point to move from latitude to equator (screen center)
      // After Y rotation, point is at angle `lat` from equator in XZ plane
      // Screen center is at z=-1 (negative Z axis), which is 0° latitude
      // So we need to rotate by -latitude to bring point to screen center
      const rotX = -latRad;
      
      rotationRef.current = { x: rotX, y: rotY };
      
      console.log(`[GPS Centering] ✅ Calculated rotation:`);
      console.log(`  rotX = ${rotX.toFixed(4)} rad = ${(rotX * 180 / Math.PI).toFixed(2)}°`);
      console.log(`  rotY = ${rotY.toFixed(4)} rad = ${(rotY * 180 / Math.PI).toFixed(2)}°`);
      console.log(`[GPS Centering] Triggering mesh rotation update...`);
      
      // CRITICAL: Trigger visibility recalculation with new rotation
      setTimeout(() => {
        console.log('[GPS Centering] 🔄 Setting meshRotation state...');
        setMeshRotation({ x: rotX, y: rotY });
      }, 100);
    } else {
      console.log(`[GPS Centering] Skipping init - already initialized or no position`);
    }
  }, [currentPosition, meshState]);

  /**
   * Notify parent of mesh stats changes.
   */
  useEffect(() => {
    // keep ref synced for handlers
    meshStateRef.current = meshState;
    
    if (!onMeshStatsUpdate) return;
    
    const activeTriangles = getActiveTriangles(meshState);
    let totalClicks = 0;
    for (const triangle of meshState.values()) {
      totalClicks += triangle.clicks;
    }
    
    onMeshStatsUpdate({
      totalTriangles: meshState.size,
      activeTriangles: activeTriangles.length,
      visibleTriangles: visibleTriangleCount,
      totalClicks,
      screenCenterGPS,
    });
  }, [meshState, onMeshStatsUpdate, visibleTriangleCount, screenCenterGPS]);

  /**
   * Raycast from screen coordinates to sphere surface.
   * 
   * What: Converts 2D screen touch to 3D point on sphere via ray-sphere intersection
   * Why: Enables pixel-locked rotation and accurate triangle selection
   * 
   * Algorithm:
   * 1. Convert screen coords to Normalized Device Coordinates (NDC)
   * 2. Create ray from camera through screen point
   * 3. Solve quadratic equation for ray-sphere intersection
   * 4. Return the closer intersection point (front of sphere)
   * 
   * @param screenX - Screen X coordinate (pixels)
   * @param screenY - Screen Y coordinate (pixels)
   * @returns 3D point on sphere surface, or null if ray misses sphere
   */
  const raycastToSphere = (screenX: number, screenY: number): THREE.Vector3 | null => {
    if (!cameraRef.current || !viewSizeRef.current.width || !viewSizeRef.current.height) return null;
    
    // Convert screen coords to NDC (Normalized Device Coordinates: -1 to +1)
    const mouse = new THREE.Vector2();
    mouse.x = (screenX / viewSizeRef.current.width) * 2 - 1;
    mouse.y = -(screenY / viewSizeRef.current.height) * 2 + 1;
    
    // Set up raycaster from camera through screen point
    const raycaster = raycasterRef.current;
    raycaster.setFromCamera(mouse, cameraRef.current);
    
    // Solve ray-sphere intersection: |origin + t * direction|² = STEP_RADIUS²
    // This is a quadratic equation: at² + bt + c = 0
    const ray = raycaster.ray;
    const origin = ray.origin;
    const direction = ray.direction;
    
    const a = direction.dot(direction); // Always 1 for normalized direction
    const b = 2 * origin.dot(direction);
    const c = origin.dot(origin) - STEP_RADIUS * STEP_RADIUS;
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return null; // Ray misses sphere
    
    // Take the closer intersection point (in front of camera)
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    const intersection = new THREE.Vector3()
      .copy(direction)
      .multiplyScalar(t)
      .add(origin);
    
    return intersection;
  };

  /**
   * Handle double-tap on triangle to increment clicks.
   */
  const handleDoubleTap = async (screenX: number, screenY: number) => {
    console.log(`[StandaloneEarthMesh3D] Double-tap detected at (${screenX}, ${screenY})`);
    
    if (!sceneRef.current || !cameraRef.current) {
      console.log('[StandaloneEarthMesh3D] No scene or camera');
      return;
    }

    // Convert screen coordinates (relative to GLView) to NDC
    const mouse = new THREE.Vector2();
    const { width: viewW, height: viewH } = viewSizeRef.current;
    const vw = Math.max(1, viewW);
    const vh = Math.max(1, viewH);
    mouse.x = (screenX / vw) * 2 - 1;
    mouse.y = -(screenY / vh) * 2 + 1;
    console.log(`[StandaloneEarthMesh3D] NDC: (${mouse.x.toFixed(2)}, ${mouse.y.toFixed(2)})`);

    // Build ray from camera
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    sceneRef.current.updateMatrixWorld(true);

    // Use geometric ray-sphere intersection to find clicked triangle
    // Why: Merged mesh doesn't have per-triangle IDs, so we find the containing triangle geometrically
    let targetTriangleId: string | null = null;
    
    const ray = raycasterRef.current.ray; // origin, direction in world space
    // Intersect with sphere radius matching triangles
    const r = STEP_RADIUS;
    const o = ray.origin; 
    const d = ray.direction;
    const a = d.x*d.x + d.y*d.y + d.z*d.z; // =1 for normalized
    const b = 2*(o.x*d.x + o.y*d.y + o.z*d.z);
    const c = o.x*o.x + o.y*o.y + o.z*o.z - r*r;
    const disc = b*b - 4*a*c;
    console.log(`[StandaloneEarthMesh3D] Ray-sphere discriminant: ${disc.toFixed(2)}`);
    
    if (disc >= 0) {
      const sqrtDisc = Math.sqrt(disc);
      const t1 = (-b - sqrtDisc) / (2*a);
      const t2 = (-b + sqrtDisc) / (2*a);
      // Use closer intersection (front of sphere)
      const t = Math.min(t1, t2) > 0 ? Math.min(t1, t2) : Math.max(t1, t2);
      
      if (t > 0) {
        const hit = new THREE.Vector3().copy(d).multiplyScalar(t).add(o).normalize();
        
        // CRITICAL: Apply inverse rotation to hit point
        // Why: Mesh is rotated, but triangle vertices in meshState are unrotated
        // Solution: Use inverse rotation matrix to transform hit point to local space
        const hitLocal = hit.clone();
        
        // Build rotation matrix matching mesh rotation using Euler angles
        const euler = new THREE.Euler(rotationRef.current.x, rotationRef.current.y, 0, 'XYZ');
        const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);
        
        // Apply inverse rotation
        const inverseMatrix = rotationMatrix.clone().invert();
        hitLocal.applyMatrix4(inverseMatrix);
        hitLocal.normalize(); // Keep on unit sphere
        
        console.log(`[StandaloneEarthMesh3D] Hit local after inverse rotation: (${hitLocal.x.toFixed(3)}, ${hitLocal.y.toFixed(3)}, ${hitLocal.z.toFixed(3)})`);
        
        // Find which triangle contains this point
        // CRITICAL: Use meshStateRef.current, not meshState (closure issue)
        const active = getActiveTriangles(meshStateRef.current);
        console.log(`[StandaloneEarthMesh3D] Testing ${active.length} active triangles for hit at (${hitLocal.x.toFixed(3)}, ${hitLocal.y.toFixed(3)}, ${hitLocal.z.toFixed(3)})`);
        
        for (const tri of active) {
          if (isPointInSphericalTriangle(
            { x: hitLocal.x, y: hitLocal.y, z: hitLocal.z } as any,
            tri.vertices[0] as any,
            tri.vertices[1] as any,
            tri.vertices[2] as any
          )) {
            targetTriangleId = tri.id;
            console.log(`[StandaloneEarthMesh3D] Hit triangle: ${tri.id}`);
            break;
          }
        }
      }
    }

    if (targetTriangleId) {
      console.log(`[StandaloneEarthMesh3D] Mine STEP: ${targetTriangleId}`);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      const newState = await incrementClicks(targetTriangleId, meshStateRef.current);
      setMeshState(new Map(newState));
      meshStateRef.current = newState;
      
      // Check if we need to auto-zoom after subdivision
      const triangle = newState.get(targetTriangleId);
      if (triangle && triangle.subdivided && cameraRef.current) {
        // Count visible triangles with new state
        const camera = cameraRef.current;
        const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
          camera.projectionMatrix,
          camera.matrixWorldInverse
        );
        const frustum = new THREE.Frustum();
        frustum.setFromProjectionMatrix(projScreenMatrix);
        
        const actives = getActiveTriangles(newState);
        const visibleCount = countVisibleTriangles(actives, frustum);
        
        const LIMIT = 256;
        if (visibleCount > LIMIT) {
          // Auto-zoom IN to reduce visible triangles
          const zoomInFactor = 0.85; // Zoom in by 15%
          const newZoom = Math.max(MIN_ZOOM, zoomRef.current * zoomInFactor);
          zoomRef.current = newZoom;
          console.log(`[StandaloneEarthMesh3D] Auto-zoom after subdivision: ${visibleCount} → zooming in to ${newZoom.toFixed(2)}`);
        }
      }
      
      // Trigger instant re-render with merged geometry
      const triggerValue = Date.now();
      console.log(`[StandaloneEarthMesh3D] Triggering re-render: ${triggerValue}`);
      setRenderTrigger(triggerValue);
    } else {
      console.log('[StandaloneEarthMesh3D] No triangle found at click location');
    }
  };

  /**
   * Count triangles currently visible in camera frustum.
   * 
   * What: Performs frustum culling to determine which triangles are on-screen
   * Why: Enables dynamic camera constraints to enforce 256 triangle limit
   * 
   * Algorithm:
   * 1. Check if any vertex of triangle is inside frustum
   * 2. Count triangles with at least one visible vertex
   * 
   * Performance: O(n * 3) where n = number of triangles, fast enough for real-time
   */
  const countVisibleTriangles = (triangles: MeshTriangle[], frustum: THREE.Frustum): number => {
    let count = 0;
    const scale = STEP_RADIUS;
    
    for (const tri of triangles) {
      const v = tri.vertices;
      // Check if any vertex is visible
      for (let i = 0; i < 3; i++) {
        const p = new THREE.Vector3(v[i].x * scale, v[i].y * scale, v[i].z * scale);
        if (frustum.containsPoint(p)) {
          count++;
          break; // Triangle is visible, no need to check other vertices
        }
      }
    }
    
    return count;
  };

  /**
   * Validate if proposed camera position would exceed 256 triangle limit.
   * 
   * What: Simulates camera at new position and counts visible triangles
   * Why: Prevents zooming/rotating to positions where >256 triangles would be visible
   * 
   * Returns:
   * - allowed: true if position is safe (≤256 triangles)
   * - visibleCount: number of triangles that would be visible
   * - reason: human-readable explanation if not allowed
   * 
   * Performance: Called only during gestures (not every frame), acceptable overhead
   */
  const validateCameraPosition = (newZoom: number): {
    allowed: boolean;
    visibleCount: number;
    reason: string;
  } => {
    if (!cameraRef.current) {
      return { allowed: true, visibleCount: 0, reason: '' };
    }

    // Create test camera at proposed position
    const testCamera = cameraRef.current.clone();
    testCamera.position.z = newZoom;
    
    // Calculate dynamic FOV for this zoom level (same as render loop)
    const zoomT = (newZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
    const fov = MIN_FOV + (MAX_FOV - MIN_FOV) * zoomT;
    testCamera.fov = fov;
    testCamera.updateProjectionMatrix();

    // Build frustum for test camera
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
      testCamera.projectionMatrix,
      testCamera.matrixWorldInverse
    );
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(projScreenMatrix);

    // Count visible triangles at this position
    const activeTriangles = getActiveTriangles(meshStateRef.current);
    const visibleCount = countVisibleTriangles(activeTriangles, frustum);

    const TRIANGLE_LIMIT = 256; // Hard performance limit
    const allowed = visibleCount <= TRIANGLE_LIMIT;
    const reason = allowed 
      ? '' 
      : `Would show ${visibleCount} triangles (limit: ${TRIANGLE_LIMIT})`;

    return { allowed, visibleCount, reason };
  };

  /**
   * Pan responder for touch gestures.
   */
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        const touch = evt.nativeEvent as any;
        const pageX = touch.pageX;
        const pageY = touch.pageY;
        const lx = touch.locationX ?? pageX;
        const ly = touch.locationY ?? pageY;
        lastTouchRef.current = { x: lx, y: ly };
        touchStartRef.current = { x: lx, y: ly };
        movedRef.current = false;
        didDoubleTapRef.current = false;
        
        // Store anchor point on sphere surface for pixel-locked rotation
        // What: Raycast to find 3D point on sphere that finger is touching
        // Why: Enables tracking this exact point to keep it under the finger during drag
        anchorPointRef.current = raycastToSphere(lx, ly);
        
        // Check for double-tap
        const now = Date.now();
        if (now - lastTapTimeRef.current < 350) {
          // Double-tap detected (mine immediately)
          didDoubleTapRef.current = true;
          handleDoubleTap(lx, ly);
        }
        lastTapTimeRef.current = now;
      },
      
      onPanResponderMove: (evt: GestureResponderEvent) => {
        const touches = evt.nativeEvent.touches;
        
        if (touches.length === 2) {
          // Two-finger pinch zoom
          const touch1 = touches[0];
          const touch2 = touches[1];
          const dx = touch2.pageX - touch1.pageX;
          const dy = touch2.pageY - touch1.pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (initialPinchDistanceRef.current === null) {
            initialPinchDistanceRef.current = distance;
            initialZoomRef.current = zoomRef.current;
          } else {
            const scale = distance / initialPinchDistanceRef.current;
            
            // ZOOM SENSITIVITY: Reduce zoom speed for finer control
            // What: Dampen the scale change by factor of 0.25 (25% speed)
            // Why: At 100% speed, zooming from 6km → 600km happens too fast
            //      At 25% speed, gradual zoom steps: 6km → 60km → 120km → 240km...
            const ZOOM_SENSITIVITY = 0.25;
            const adjustedScale = 1 + (scale - 1) * ZOOM_SENSITIVITY;
            let newZoom = initialZoomRef.current / adjustedScale;
            
            // Clamp to min/max zoom limits
            newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
            
            // Update zoom
            zoomRef.current = newZoom;
            
            // Trigger visibility update if zoom changed significantly (>10%)
            const zoomChange = Math.abs(newZoom - lastVisibilityZoomRef.current) / lastVisibilityZoomRef.current;
            if (zoomChange > 0.1) {
              lastVisibilityZoomRef.current = newZoom;
              setRenderTrigger(Date.now());
            }
          }
        } else if (touches.length === 1 && lastTouchRef.current) {
          // Single-finger drag: pixel-locked rotation using raycasting
          // What: Track the 3D point under the finger and rotate sphere to keep it there
          // Why: Creates 1:1 pixel tracking - 100px finger drag = 100px surface movement
          const t: any = touches[0];
          const lx = t.locationX ?? t.pageX;
          const ly = t.locationY ?? t.pageY;

          const deltaX = lx - lastTouchRef.current.x;
          const deltaY = ly - lastTouchRef.current.y;
          
          // Mark as moved if exceeds small threshold
          if (Math.abs(deltaX) > 8 || Math.abs(deltaY) > 8) {
            movedRef.current = true;
          }

          // Pixel-locked rotation: calculate rotation to keep anchor point under finger
          if (anchorPointRef.current) {
            const currentPoint = raycastToSphere(lx, ly);
            
            if (currentPoint) {
              // Calculate rotation needed to align anchor with current finger position
              // Algorithm:
              // 1. Normalize both points to unit sphere
              // 2. Find rotation axis (perpendicular to both points via cross product)
              // 3. Find rotation angle (via dot product)
              // 4. Apply rotation incrementally to current rotation state
              
              const anchor = anchorPointRef.current.clone().normalize();
              const current = currentPoint.clone().normalize();
              
              // Rotation axis: perpendicular to both vectors (cross product)
              const axis = new THREE.Vector3().crossVectors(anchor, current);
              const axisLength = axis.length();
              
              if (axisLength > 0.0001) { // Avoid division by zero for tiny movements
                axis.divideScalar(axisLength); // Normalize axis
                
                // Rotation angle: angle between the two points
                const dotProduct = Math.max(-1, Math.min(1, anchor.dot(current)));
                const angle = Math.acos(dotProduct);
                
                // Create quaternion for this rotation
                const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                
                // Convert to Euler angles and apply incrementally
                const euler = new THREE.Euler().setFromQuaternion(quaternion);
                rotationRef.current.x += euler.x;
                rotationRef.current.y += euler.y;
                
                // Clamp X rotation to prevent flipping upside down
                rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x));
                
                // Update anchor for next frame (track continuously)
                anchorPointRef.current = currentPoint;
              }
            } else {
              // FALLBACK ROTATION: At narrow FOV, finger easily moves off visible sphere
              // Solution: Use pixel delta-based rotation when raycast fails
              // What: Convert pixel movement to angular rotation (traditional rotation)
              // Why: Keeps rotation working at 10° FOV when sphere is small on screen
              const ROTATION_SENSITIVITY = 0.005; // radians per pixel
              rotationRef.current.y -= deltaX * ROTATION_SENSITIVITY;
              rotationRef.current.x += deltaY * ROTATION_SENSITIVITY;
              
              // Clamp X rotation to prevent flipping upside down
              rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x));
              
              // Don't reset anchor - try to reacquire it on next frame
            }
          } else {
            // No anchor point yet - use delta-based rotation as fallback
            const ROTATION_SENSITIVITY = 0.005;
            rotationRef.current.y -= deltaX * ROTATION_SENSITIVITY;
            rotationRef.current.x += deltaY * ROTATION_SENSITIVITY;
            rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x));
          }
          
          lastTouchRef.current = { x: lx, y: ly };
          
          // Schedule visibility recalculation (throttled)
          // Why: Avoid excessive state updates during continuous rotation
          const now = Date.now();
          if (now - lastRotationUpdateRef.current > 100) { // Max 10 updates/sec
            lastRotationUpdateRef.current = now;
            
            // Use requestAnimationFrame to avoid blocking gesture handler
            if (rotationAnimFrameRef.current) {
              cancelAnimationFrame(rotationAnimFrameRef.current);
            }
            rotationAnimFrameRef.current = requestAnimationFrame(() => {
              setMeshRotation({ x: rotationRef.current.x, y: rotationRef.current.y });
            });
          }
        }
      },
      
      onPanResponderRelease: () => {
        // Single-tap fallback: if not moved and no double-tap, treat as a tap to mine
        if (!movedRef.current && !didDoubleTapRef.current && lastTouchRef.current) {
          handleDoubleTap(lastTouchRef.current.x, lastTouchRef.current.y);
        }
        lastTouchRef.current = null;
        touchStartRef.current = null;
        movedRef.current = false;
        didDoubleTapRef.current = false;
        initialPinchDistanceRef.current = null;
        anchorPointRef.current = null;
        
        // CRITICAL: Force visibility update after gesture ends
        // Update both rotation and zoom state
        const currentRotX = rotationRef.current.x;
        const currentRotY = rotationRef.current.y;
        const currentZoom = zoomRef.current;
        console.log(`[Gesture] Released - forcing visibility update: rotation x=${currentRotX.toFixed(3)}, y=${currentRotY.toFixed(3)}, zoom=${currentZoom.toFixed(2)}`);
        setMeshRotation({ x: currentRotX, y: currentRotY });
        lastVisibilityZoomRef.current = currentZoom; // Sync zoom tracker
      },
    })
  ).current;

  /**
   * GL context creation and render loop.
   */
  const onContextCreate = async (gl: any) => {
    console.log('[StandaloneEarthMesh3D] GL Context created');

    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x001133, 1.0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // Near plane 0.0001 allows camera to get VERY close without clipping triangles
    // Far plane 100 ensures we see Earth from max zoom distance
    const camera = new THREE.PerspectiveCamera(50, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.0001, 100);
    camera.position.set(0, 0, INITIAL_ZOOM); // Start at 10000km visible width
    camera.lookAt(new THREE.Vector3(0, 0, 0));
    cameraRef.current = camera;

    // Lighting - brighter for better triangle visibility
    scene.add(new THREE.AmbientLight(0xffffff, 3.0));
    const light1 = new THREE.DirectionalLight(0xffffff, 4.0);
    light1.position.set(10, 10, 5);
    scene.add(light1);
    const light2 = new THREE.DirectionalLight(0xffffff, 2.0);
    light2.position.set(-10, -10, -5);
    scene.add(light2);

    // Earth sphere background - visible, does not occlude STEPs
    const earthGeometry = new THREE.SphereGeometry(EARTH_RADIUS, 64, 64);
    const earthMaterial = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.FrontSide, depthWrite: false }); // Pure black, don't occlude triangles
    const earthSphere = new THREE.Mesh(earthGeometry, earthMaterial);
    earthSphere.visible = true;
    scene.add(earthSphere);
    earthSphereRef.current = earthSphere;

    console.log('[StandaloneEarthMesh3D] Scene setup complete');

    // Render loop
    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);

      // Update rotations
      const currentRot = rotationRef.current;
      if (earthSphereRef.current) {
        earthSphereRef.current.rotation.y = currentRot.y;
        earthSphereRef.current.rotation.x = currentRot.x;
      }

      if (mergedTriangleMeshRef.current) {
        mergedTriangleMeshRef.current.rotation.y = currentRot.y;
        mergedTriangleMeshRef.current.rotation.x = currentRot.x;
      }

      if (gpsEdgesRef.current) {
        gpsEdgesRef.current.rotation.y = currentRot.y;
        gpsEdgesRef.current.rotation.x = currentRot.x;
      }
      
      if (gpsMarkerRef.current) {
        gpsMarkerRef.current.rotation.y = currentRot.y;
        gpsMarkerRef.current.rotation.x = currentRot.x;
      }

      // Update camera zoom and dynamic FOV (telescopic lens effect)
      if (cameraRef.current) {
        // Clamp zoom distance every frame to be extra safe
        zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current));
        cameraRef.current.position.z = zoomRef.current;
        
        // Dynamic FOV: inversely proportional to zoom distance
        // What: Adjust field of view based on camera altitude
        // Why: Creates telescopic effect - close zoom gets narrow FOV (telephoto),
        //      far zoom gets wide FOV (wide angle), making triangles appear screen-sized
        //      at all zoom levels
        // 
        // Mathematics:
        // - zoomT = 0 (MIN_ZOOM=1.08) → FOV = 20° (telephoto for 7m triangles)
        // - zoomT = 1 (MAX_ZOOM=5.0) → FOV = 70° (wide angle for 7000km triangles)
        const zoomT = (zoomRef.current - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
        const fov = MIN_FOV + (MAX_FOV - MIN_FOV) * zoomT;
        
        cameraRef.current.fov = fov;
        cameraRef.current.updateProjectionMatrix(); // CRITICAL: Must call after FOV change
        
        // Optional: Log visible triangle count (throttled to every 2 seconds)
        if (ENABLE_TRIANGLE_COUNT_LOGGING) {
          const now = Date.now();
          if (now - lastTriangleCountLogRef.current > 2000) {
            const frustum = new THREE.Frustum();
            const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
              cameraRef.current.projectionMatrix,
              cameraRef.current.matrixWorldInverse
            );
            frustum.setFromProjectionMatrix(projScreenMatrix);
            const activeTriangles = getActiveTriangles(meshStateRef.current);
            const visibleCount = countVisibleTriangles(activeTriangles, frustum);
            console.log(`[VISIBLE_TRIANGLES] Current: ${visibleCount}, Limit: 256, Zoom: ${zoomRef.current.toFixed(2)}, FOV: ${fov.toFixed(1)}°`);
            lastTriangleCountLogRef.current = now;
          }
        }
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      gl.endFrameEXP();
    };

    render();
  };

  /**
   * Render visible triangles with frustum culling
   * 
   * NEW APPROACH: Only render triangles ACTUALLY IN CAMERA VIEW
   * Why: No lag, instant updates, shows exactly what should be visible
   */
  useEffect(() => {
    const actualRotX = rotationRef.current.x;
    const actualRotY = rotationRef.current.y;
    console.log(`[StandaloneEarthMesh3D] 🔄 Render useEffect triggered`);
    console.log(`  meshState: ${meshState.size} triangles`);
    console.log(`  meshRotation state: x=${meshRotation.x.toFixed(3)}, y=${meshRotation.y.toFixed(3)}`);
    console.log(`  rotationRef actual: x=${actualRotX.toFixed(3)}, y=${actualRotY.toFixed(3)}`);
    console.log(`  MISMATCH: ${Math.abs(meshRotation.x - actualRotX) > 0.001 || Math.abs(meshRotation.y - actualRotY) > 0.001 ? '⚠️ YES - USING STALE ROTATION!' : '✓ No'}`);
    
    if (!sceneRef.current || !cameraRef.current || meshState.size === 0) {
      console.log('[StandaloneEarthMesh3D] Skipping render - no scene/camera or empty mesh');
      return;
    }

    console.log('[StandaloneEarthMesh3D] 🎨 Rendering visible triangles...');
    const startTime = Date.now();

    // Build camera frustum
    const camera = cameraRef.current;
    
    // CRITICAL: Update camera matrices before calculating frustum
    // Why: Camera position/FOV change in render loop, but we're in useEffect
    // Solution: Force camera matrix update and use current zoom/FOV
    const currentZoom = zoomRef.current;
    camera.position.z = currentZoom;
    
    // Update FOV to match render loop calculation
    const zoomT = (currentZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
    const fov = MIN_FOV + (MAX_FOV - MIN_FOV) * zoomT;
    camera.fov = fov;
    camera.updateProjectionMatrix();
    camera.updateMatrixWorld(true); // Force world matrix update
    
    console.log(`[Visibility] Camera state: zoom=${currentZoom.toFixed(2)}, FOV=${fov.toFixed(1)}°, pos=(${camera.position.x.toFixed(2)}, ${camera.position.y.toFixed(2)}, ${camera.position.z.toFixed(2)})`);
    
    const projScreenMatrix = new THREE.Matrix4().multiplyMatrices(
      camera.projectionMatrix,
      camera.matrixWorldInverse
    );
    const frustum = new THREE.Frustum();
    frustum.setFromProjectionMatrix(projScreenMatrix);

    // Get camera direction for backface culling
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    
    // Build rotation matrix to transform triangle vertices to world space
    // CRITICAL: Must match Three.js Euler angle application order
    // Three.js default Euler order is 'XYZ', so we apply: Y rotation, then X rotation, then Z (unused)
    // But when we set mesh.rotation.x and mesh.rotation.y, Three.js uses its internal order
    // SOLUTION: Use Euler directly with explicit order matching how mesh rotation works
    console.log(`[Visibility] Using rotation: x=${actualRotX.toFixed(3)}, y=${actualRotY.toFixed(3)}`);
    
    const euler = new THREE.Euler(actualRotX, actualRotY, 0, 'XYZ');
    const rotationMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);

    // Find VISIBLE triangles (in frustum + facing camera)
    // CRITICAL: Use meshStateRef.current for latest state (closure issue)
    let actives = getActiveTriangles(meshStateRef.current);
    
    // PROGRESSIVE LOADING: Filter by max visible level during initial load
    // What: Only show triangles up to current progressive level
    // Why: Creates smooth level-by-level refinement visual
    if (progressiveLoadingRef.current && maxVisibleLevel >= 0) {
      actives = actives.filter(tri => tri.level <= maxVisibleLevel);
      console.log(`[Visibility] Progressive mode: showing level 0-${maxVisibleLevel}, filtered to ${actives.length} triangles`);
    } else {
    console.log(`[Visibility] Testing ${actives.length} active triangles`);
    }
    
    // Log culling strategy based on zoom level
    const FRUSTUM_CULLING_THRESHOLD = 1.5;
    const useFrustumCulling = currentZoom >= FRUSTUM_CULLING_THRESHOLD;
    console.log(`[Visibility] Culling strategy: zoom=${currentZoom.toFixed(2)}, frustum=${useFrustumCulling ? 'ENABLED' : 'DISABLED (too close)'}, backface=ENABLED`);
    
    const visibleTriangles: MeshTriangle[] = [];
    let backfaceCulled = 0;
    let frustumCulled = 0;
    
    // Debug GPS triangle specifically
    const gpsTriInActives = actives.find(t => t.id === gpsTriangleId);
    const debugGPS = !!gpsTriInActives;

    for (const tri of actives) {
      const v = tri.vertices;
      
      // Backface culling: skip triangles facing away from camera
      // CRITICAL: Apply mesh rotation to centroid before checking
      // Centroid points outward from Earth center
      // Camera direction points from camera toward Earth
      // Dot product NEGATIVE = facing camera (opposite directions)
      const cx = (v[0].x + v[1].x + v[2].x) / 3;
      const cy = (v[0].y + v[1].y + v[2].y) / 3;
      const cz = (v[0].z + v[1].z + v[2].z) / 3;
      const centroid = new THREE.Vector3(cx, cy, cz);
      centroid.applyMatrix4(rotationMatrix); // Apply mesh rotation
      centroid.normalize();
      const facing = centroid.dot(camDir);
      
      // Debug GPS triangle
      if (debugGPS && tri.id === gpsTriangleId) {
        console.log(`[GPS Debug] Backface test: facing=${facing.toFixed(3)}, camDir=(${camDir.x.toFixed(2)}, ${camDir.y.toFixed(2)}, ${camDir.z.toFixed(2)}), centroid=(${centroid.x.toFixed(2)}, ${centroid.y.toFixed(2)}, ${centroid.z.toFixed(2)})`);
      }
      
      if (facing >= 0) {
        backfaceCulled++;
        if (debugGPS && tri.id === gpsTriangleId) {
          console.log(`[GPS Debug] ❌ BACKFACE CULLED`);
        }
        continue; // Back-facing (pointing same direction as camera), skip
      }

      // Frustum culling: check if triangle is in camera view
      // CRITICAL: Must use ROTATED vertices for frustum test
      // Why: Mesh is rotated in world space, frustum test must match
      const scale = STEP_RADIUS;
      const v0Scaled = new THREE.Vector3(v[0].x * scale, v[0].y * scale, v[0].z * scale);
      const v1Scaled = new THREE.Vector3(v[1].x * scale, v[1].y * scale, v[1].z * scale);
      const v2Scaled = new THREE.Vector3(v[2].x * scale, v[2].y * scale, v[2].z * scale);
      
      // Apply rotation to vertices
      v0Scaled.applyMatrix4(rotationMatrix);
      v1Scaled.applyMatrix4(rotationMatrix);
      v2Scaled.applyMatrix4(rotationMatrix);
      
      // SMART CULLING: At close zoom, frustum math breaks down
      // Solution: Only use frustum culling when camera is reasonably far
      // What: Skip frustum test if zoom < 1.5 (camera within ~2500km of surface)
      // Why: At MIN_ZOOM=1.071, camera is 0.001 units from triangles - frustum culling fails
      //      Backface culling alone is sufficient and accurate at close range
      
      if (useFrustumCulling) {
        // Far zoom: use both frustum and backface culling
        const centerScaled = new THREE.Vector3(
          (v0Scaled.x + v1Scaled.x + v2Scaled.x) / 3,
          (v0Scaled.y + v1Scaled.y + v2Scaled.y) / 3,
          (v0Scaled.z + v1Scaled.z + v2Scaled.z) / 3
        );
        const r0 = centerScaled.distanceTo(v0Scaled);
        const r1 = centerScaled.distanceTo(v1Scaled);
        const r2 = centerScaled.distanceTo(v2Scaled);
        const radius = Math.max(r0, r1, r2);
        const sphere = new THREE.Sphere(centerScaled, radius);
        
        if (debugGPS && tri.id === gpsTriangleId) {
          console.log(`[GPS Debug] Frustum test: center=(${centerScaled.x.toFixed(2)}, ${centerScaled.y.toFixed(2)}, ${centerScaled.z.toFixed(2)}), radius=${radius.toFixed(3)}`);
        }
        
        if (!frustum.intersectsSphere(sphere)) {
          frustumCulled++;
          if (debugGPS && tri.id === gpsTriangleId) {
            console.log(`[GPS Debug] ❌ FRUSTUM CULLED`);
          }
          continue; // Not in view, skip
        }
      }
      // else: Close zoom - skip frustum test, rely on backface culling only
      
      if (debugGPS && tri.id === gpsTriangleId) {
        console.log(`[GPS Debug] ✅ VISIBLE`);
      }

      visibleTriangles.push(tri);
    }

    console.log(`[Visibility] 📊 Results:`);
    console.log(`  Total Active: ${actives.length}`);
    console.log(`  Backface Culled: ${backfaceCulled}`);
    console.log(`  Frustum Culled: ${frustumCulled} ${useFrustumCulling ? '' : '(DISABLED at this zoom)'}`);
    console.log(`  VISIBLE: ${visibleTriangles.length}`);
    
    // Update visible triangle count for stats
    setVisibleTriangleCount(visibleTriangles.length);
    
    // Calculate screen-center GPS position
    // What: Raycast from screen center to find lat/lon, calculate altitude & visible width
    // Why: Provides reference for where user is looking and scale of view
    const { width: viewW, height: viewH } = viewSizeRef.current;
    if (viewW > 0 && viewH > 0) {
      const centerX = viewW / 2;
      const centerY = viewH / 2;
      const centerPoint = raycastToSphere(centerX, centerY);
      
      if (centerPoint) {
        // Apply inverse rotation to get unrotated coordinates
        const euler = new THREE.Euler(actualRotX, actualRotY, 0, 'XYZ');
        const rotMatrix = new THREE.Matrix4().makeRotationFromEuler(euler);
        const inverseMatrix = rotMatrix.clone().invert();
        const localPoint = centerPoint.clone().applyMatrix4(inverseMatrix).normalize();
        
        // Convert to lat/lon using icosahedron coordinate system
        // From sphericalToCartesian: x=cos(lat)*cos(lon), y=cos(lat)*sin(lon), z=sin(lat)
        // Therefore: lat = asin(z), lon = atan2(y, x)
        const lat = Math.asin(localPoint.z) * 180 / Math.PI;
        const lon = Math.atan2(localPoint.y, localPoint.x) * 180 / Math.PI;
        
        // Calculate altitude (Earth radius = 6371km, camera at zoomRef.current * 6371km)
        const EARTH_RADIUS_KM = 6371;
        const altitude = (zoomRef.current - STEP_RADIUS) * EARTH_RADIUS_KM;
        
        // Calculate visible width at sphere surface
        // Use FOV and distance to calculate width
        const fov = camera.fov * Math.PI / 180; // Convert to radians
        const aspectRatio = camera.aspect;
        const horizontalFOV = 2 * Math.atan(Math.tan(fov / 2) * aspectRatio);
        const distanceToSphere = zoomRef.current * EARTH_RADIUS_KM;
        const visibleWidth = 2 * distanceToSphere * Math.tan(horizontalFOV / 2);
        
        setScreenCenterGPS({ lat, lon, altitude, visibleWidth });
        console.log(`[Screen Center] Lat: ${lat.toFixed(4)}, Lon: ${lon.toFixed(4)}, Alt: ${altitude.toFixed(1)}km, Width: ${visibleWidth.toFixed(1)}km`);
      }
    }
    
    // Log first few visible triangle IDs for debugging
    if (visibleTriangles.length > 0 && visibleTriangles.length < 50) {
      const ids = visibleTriangles.map(t => t.id).slice(0, 10).join(', ');
      console.log(`[StandaloneEarthMesh3D] Visible IDs (first 10): ${ids}`);
    }

    // Clear old mesh
    if (mergedTriangleMeshRef.current) {
      sceneRef.current.remove(mergedTriangleMeshRef.current);
      mergedTriangleMeshRef.current.geometry.dispose();
      (mergedTriangleMeshRef.current.material as THREE.Material).dispose();
      mergedTriangleMeshRef.current = null;
    }

    // Build merged geometry for ONLY visible triangles
    const positions: number[] = [];
    const colors: number[] = [];
    const color = new THREE.Color();

    for (const triangle of visibleTriangles) {
      const v0 = new THREE.Vector3(triangle.vertices[0].x, triangle.vertices[0].y, triangle.vertices[0].z);
      const v1 = new THREE.Vector3(triangle.vertices[1].x, triangle.vertices[1].y, triangle.vertices[1].z);
      const v2 = new THREE.Vector3(triangle.vertices[2].x, triangle.vertices[2].y, triangle.vertices[2].z);

      const isGPS = triangle.id === gpsTriangleId;
      const triLevel = triangle.level + 1;
      const materialProps = getTriangleMaterialProps(triLevel, isGPS);
      color.set(materialProps.color as any);

      const subdividedPositions = subdivideTriangleToArray(v0, v1, v2, 4, STEP_RADIUS);
      
      for (let i = 0; i < subdividedPositions.length; i += 9) {
        positions.push(
          subdividedPositions[i], subdividedPositions[i+1], subdividedPositions[i+2],
          subdividedPositions[i+3], subdividedPositions[i+4], subdividedPositions[i+5],
          subdividedPositions[i+6], subdividedPositions[i+7], subdividedPositions[i+8]
        );
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
        colors.push(color.r, color.g, color.b);
      }
    }

    if (positions.length > 0) {
      const mergedGeometry = new THREE.BufferGeometry();
      mergedGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
      mergedGeometry.setAttribute('color', new THREE.BufferAttribute(new Float32Array(colors), 3));
      mergedGeometry.computeVertexNormals();

      const material = new THREE.MeshBasicMaterial({
        vertexColors: true,
        side: THREE.FrontSide,
        depthTest: true,
        depthWrite: true,
      });

      const mergedMesh = new THREE.Mesh(mergedGeometry, material);
      // Apply CURRENT rotation to newly created mesh
      mergedMesh.rotation.y = actualRotY;
      mergedMesh.rotation.x = actualRotX;
      sceneRef.current.add(mergedMesh);
      mergedTriangleMeshRef.current = mergedMesh;
      console.log(`[Visibility] ✅ Created mesh with rotation: x=${actualRotX.toFixed(3)}, y=${actualRotY.toFixed(3)}`);
    }

    // Update GPS edges
    if (gpsEdgesRef.current) {
      sceneRef.current.remove(gpsEdgesRef.current);
      gpsEdgesRef.current.geometry.dispose();
      (gpsEdgesRef.current.material as THREE.Material).dispose();
      gpsEdgesRef.current = null;
    }

    const gpsTriangle = visibleTriangles.find(t => t.id === gpsTriangleId);
    if (gpsTriangle) {
      const v0 = new THREE.Vector3(gpsTriangle.vertices[0].x, gpsTriangle.vertices[0].y, gpsTriangle.vertices[0].z);
      const v1 = new THREE.Vector3(gpsTriangle.vertices[1].x, gpsTriangle.vertices[1].y, gpsTriangle.vertices[1].z);
      const v2 = new THREE.Vector3(gpsTriangle.vertices[2].x, gpsTriangle.vertices[2].y, gpsTriangle.vertices[2].z);
      
      const edgePositions = [
        v0.x * EDGE_RADIUS, v0.y * EDGE_RADIUS, v0.z * EDGE_RADIUS,
        v1.x * EDGE_RADIUS, v1.y * EDGE_RADIUS, v1.z * EDGE_RADIUS,
        v1.x * EDGE_RADIUS, v1.y * EDGE_RADIUS, v1.z * EDGE_RADIUS,
        v2.x * EDGE_RADIUS, v2.y * EDGE_RADIUS, v2.z * EDGE_RADIUS,
        v2.x * EDGE_RADIUS, v2.y * EDGE_RADIUS, v2.z * EDGE_RADIUS,
        v0.x * EDGE_RADIUS, v0.y * EDGE_RADIUS, v0.z * EDGE_RADIUS,
      ];
      const edgeGeometry = new THREE.BufferGeometry();
      edgeGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(edgePositions), 3));
      const edgeMaterial = new THREE.LineBasicMaterial({ color: 0x00FFFF, linewidth: 6 });
      const edges = new THREE.LineSegments(edgeGeometry, edgeMaterial);
      edges.rotation.y = actualRotY;
      edges.rotation.x = actualRotX;
      sceneRef.current.add(edges);
      gpsEdgesRef.current = edges;
    }

    // Update GPS marker (always visible, positioned at current GPS location)
    // CRITICAL: Only create marker if it doesn't exist yet to avoid infinite loop
    if (currentPosition && !gpsMarkerRef.current) {
      const gpsPoint = sphericalToCartesian(currentPosition.lat, currentPosition.lon);
      const GPS_MARKER_RADIUS = 1.12; // Above GPS edges
      const markerGeometry = new THREE.SphereGeometry(0.02, 16, 16); // Small sphere
      const markerMaterial = new THREE.MeshBasicMaterial({ 
        color: 0xFF0000, // Bright red
        depthTest: false, // Always visible on top
        transparent: true,
        opacity: 0.9 
      });
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.set(
        gpsPoint.x * GPS_MARKER_RADIUS,
        gpsPoint.y * GPS_MARKER_RADIUS,
        gpsPoint.z * GPS_MARKER_RADIUS
      );
      marker.rotation.y = actualRotY;
      marker.rotation.x = actualRotX;
      marker.renderOrder = 999; // Render last (on top)
      sceneRef.current.add(marker);
      gpsMarkerRef.current = marker;
      console.log(`[GPS Marker] Added at (${gpsPoint.x.toFixed(3)}, ${gpsPoint.y.toFixed(3)}, ${gpsPoint.z.toFixed(3)})`);
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`[Visibility] ⏱️ Render complete in ${elapsed}ms\n`);
  }, [meshState, gpsTriangleId, renderTrigger, meshRotation, maxVisibleLevel]); // Rebuild on state changes, rotation, progressive level (GPS marker uses currentPosition but doesn't need to trigger full rebuild)


  /**
   * Cleanup on unmount.
   */
  useEffect(() => {
    return () => {
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      if (rotationAnimFrameRef.current) {
        cancelAnimationFrame(rotationAnimFrameRef.current);
      }
      
      if (mergedTriangleMeshRef.current) {
        mergedTriangleMeshRef.current.geometry.dispose();
        (mergedTriangleMeshRef.current.material as THREE.Material).dispose();
      }
      
      if (gpsEdgesRef.current) {
        gpsEdgesRef.current.geometry.dispose();
        (gpsEdgesRef.current.material as THREE.Material).dispose();
      }
      
      if (gpsMarkerRef.current) {
        gpsMarkerRef.current.geometry.dispose();
        (gpsMarkerRef.current.material as THREE.Material).dispose();
      }
      
      if (earthSphereRef.current) {
        earthSphereRef.current.geometry.dispose();
        (earthSphereRef.current.material as THREE.Material).dispose();
      }
      
      console.log('[StandaloneEarthMesh3D] Cleanup complete');
    };
  }, []);

  return (
    <View style={styles.container}>
      <GLView
        style={styles.glView}
        {...panResponder.panHandlers}
        onLayout={({ nativeEvent }) => {
          const { width, height } = nativeEvent.layout;
          // Track layout size for accurate touch → NDC mapping.
          // Do NOT change renderer size/aspect here to avoid mismatch with GL drawing buffer.
          viewSizeRef.current = { width, height };
        }}
        onContextCreate={onContextCreate}
      />
      {loading && (
        <View style={styles.loadingOverlay} pointerEvents="none">
          <Text style={styles.loadingText}>Loading global mesh…</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  glView: { flex: 1 },
  loadingOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 40,
    alignItems: 'center',
  },
  loadingText: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: '#FFFFFF',
    fontSize: 14,
  },
});
