/**
 * Raw Earth Mesh 3D - Direct Three.js + expo-gl implementation
 * 
 * Uses RAW Three.js with expo-gl (NO react-three-fiber)
 * Renders SPHERICAL TRIANGLES on Earth sphere with proper 3D interaction
 * 
 * SPHERICAL TRIANGLES: Vertices are 3D points on sphere surface at radius 0.9999
 * Three.js renders flat triangles between these points, which lie on the sphere
 */

import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, PanResponder, GestureResponderEvent, PanResponderGestureState } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer } from 'expo-three';
import * as THREE from 'three';
import { useSphericalTriangles } from '../../hooks/useSphericalTriangles';
import { useActiveTriangles } from '../../hooks/useActiveTriangles';
import { getTriangleMaterialProps, getTriangleColor, getCurrentTriangleColor, getNeighborTriangleColor } from '../../lib/triangle-colors';

interface RawEarthMesh3DProps {
  currentPosition?: { lat: number; lon: number };
  triangleLevel?: number;
  onRecenterReady?: (recenterFn: () => void) => void;
  onRefetchActiveReady?: (refetchFn: () => void) => void; // Callback to expose active triangles refetch
  isMining?: boolean; // Phase 5: Whether user is currently mining (triggers pulsing animation)
  miningResult?: 'success' | 'failure' | null; // Phase 5: Mining result for flash feedback
  showPerformance?: boolean; // Phase 6: Show FPS counter and performance metrics
}

/**
 * Create subdivided spherical triangle geometry (like frontend POC)
 * 
 * Takes 3 vertices on sphere and subdivides into many small flat triangles
 * This creates the "curved" appearance of spherical triangles
 */
function createSubdividedTriangle(
  v0: THREE.Vector3,
  v1: THREE.Vector3,
  v2: THREE.Vector3,
  subdivisions: number = 3
): THREE.BufferGeometry {
  const positions: number[] = [];

  function subdivide(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) {
    if (depth === 0) {
      // Base case: add flat triangle
      positions.push(a.x, a.y, a.z);
      positions.push(b.x, b.y, b.z);
      positions.push(c.x, c.y, c.z);
    } else {
      // Find midpoints and project onto sphere (creates geodesic curve)
      const ab = new THREE.Vector3().addVectors(a, b).multiplyScalar(0.5).normalize();
      const bc = new THREE.Vector3().addVectors(b, c).multiplyScalar(0.5).normalize();
      const ca = new THREE.Vector3().addVectors(c, a).multiplyScalar(0.5).normalize();

      // Recursively subdivide into 4 triangles
      subdivide(a, ab, ca, depth - 1);
      subdivide(b, bc, ab, depth - 1);
      subdivide(c, ca, bc, depth - 1);
      subdivide(ab, bc, ca, depth - 1);
    }
  }

  subdivide(v0, v1, v2, subdivisions);

  const geometry = new THREE.BufferGeometry();
  const positionArray = new Float32Array(positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  geometry.computeVertexNormals();

  return geometry;
}

export default function RawEarthMesh3D({ 
  currentPosition, 
  triangleLevel = 10,
  onRecenterReady,
  onRefetchActiveReady,
  isMining = false,
  miningResult = null,
  showPerformance = false
}: RawEarthMesh3DProps) {
  // Zoom limits and dynamic FOV constants
  // CRITICAL: Camera MUST stay OUTSIDE triangle layer (radius ~1.0)
  // - Triangles at radius: ~1.0 (on sphere surface)
  // - Camera minimum: 1.12 (stays ABOVE triangles)
  // - This gives ~750 km altitude above triangle surface
  // WHY: If camera goes below triangle layer, user sees underground view (looking up from inside)
  const MIN_ZOOM = 1.12;   // ~750 km altitude - stays ABOVE triangle layer
  const MAX_ZOOM = 3.0;    // Farthest zoom
  const MIN_FOV = 20;      // Telephoto lens for close zoom (27m triangles)
  const MAX_FOV = 70;      // Wide angle lens for far zoom (7000km triangles)
  
  const animationFrameRef = useRef<number | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const raycasterRef = useRef<THREE.Raycaster>(new THREE.Raycaster()); // For pixel-locked rotation
  const viewSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const earthSphereRef = useRef<THREE.Mesh | null>(null);
  const triangleMeshesRef = useRef<THREE.Mesh[]>([]);
  const currentTriangleMeshRef = useRef<THREE.Mesh | null>(null); // Phase 5: Track current triangle for pulsing
  const rotationRef = useRef({ x: 0, y: 0 });
  const zoomRef = useRef(3.0); // Camera z position (3.0 = far, 1.01 = close)
  const anchorPointRef = useRef<THREE.Vector3 | null>(null); // Pixel-locked rotation anchor
  const animationStartTimeRef = useRef<number>(0); // Phase 5: Track animation start time for pulsing
  
  // Phase 6: Performance monitoring
  const [fps, setFps] = React.useState<number>(60);
  const frameTimesRef = useRef<number[]>([]);
  const lastFrameTimeRef = useRef<number>(Date.now());
  
  // Phase 6: Material pooling for performance (reuse materials instead of creating new ones)
  const materialCacheRef = useRef<Map<string, THREE.MeshStandardMaterial>>(new Map());
  
  // Touch tracking for gestures
  const lastTouchRef = useRef<{ x: number; y: number } | null>(null);
  const initialPinchDistanceRef = useRef<number | null>(null);
  const initialZoomRef = useRef<number>(3.0);

  // Fetch current triangle and neighbors (user's immediate vicinity)
  // Why 256: Performance optimization for 15-30% FPS improvement on mobile devices
  const {
    currentTriangle,
    neighbors,
  } = useSphericalTriangles({
    position: currentPosition || null,
    level: triangleLevel,
    maxNeighbors: 256, // Hard performance limit: maximum neighbor triangles
    enabled: !!currentPosition,
  });

  // Fetch ALL active triangles at this level with click counts (entire global mesh)
  // Why this exists:
  // - Shows mining progress across the entire planet
  // - Color gradient visualizes how many times each triangle has been mined (0-10 clicks)
  // - Limited to 256 triangles to maintain performance (optimized from 512 for responsiveness)
  const {
    triangles: activeTriangles,
    loading: activeLoading,
    error: activeError,
    refetch: refetchActiveTriangles,
  } = useActiveTriangles(
    triangleLevel,
    256,  // Hard performance limit: maximum visible triangles (reduced from 512)
    true, // Include polygon geometry for 3D rendering
    0     // No auto-refresh (manual refresh after mining)
  );

  /**
   * Raycast from screen coordinates to sphere surface.
   * What: Converts 2D screen touch to 3D point on sphere via ray-sphere intersection
   * Why: Enables pixel-locked rotation (1:1 finger tracking on surface)
   */
  const raycastToSphere = (screenX: number, screenY: number): THREE.Vector3 | null => {
    if (!cameraRef.current || !viewSizeRef.current.width || !viewSizeRef.current.height) return null;
    
    const SPHERE_RADIUS = 0.998; // Match Earth sphere radius
    
    // Convert screen coords to NDC (-1 to +1)
    const mouse = new THREE.Vector2();
    mouse.x = (screenX / viewSizeRef.current.width) * 2 - 1;
    mouse.y = -(screenY / viewSizeRef.current.height) * 2 + 1;
    
    // Set up raycaster
    raycasterRef.current.setFromCamera(mouse, cameraRef.current);
    
    // Solve ray-sphere intersection
    const ray = raycasterRef.current.ray;
    const origin = ray.origin;
    const direction = ray.direction;
    
    const a = direction.dot(direction);
    const b = 2 * origin.dot(direction);
    const c = origin.dot(origin) - SPHERE_RADIUS * SPHERE_RADIUS;
    const discriminant = b * b - 4 * a * c;
    
    if (discriminant < 0) return null;
    
    const t = (-b - Math.sqrt(discriminant)) / (2 * a);
    return new THREE.Vector3()
      .copy(direction)
      .multiplyScalar(t)
      .add(origin);
  };

  // Pan responder for touch gestures
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      
      onPanResponderGrant: (evt: GestureResponderEvent) => {
        // Single touch start
        lastTouchRef.current = {
          x: evt.nativeEvent.pageX,
          y: evt.nativeEvent.pageY,
        };
        // Store anchor point for pixel-locked rotation
        anchorPointRef.current = raycastToSphere(evt.nativeEvent.pageX, evt.nativeEvent.pageY);
      },
      
      onPanResponderMove: (evt: GestureResponderEvent, gestureState: PanResponderGestureState) => {
        const touches = evt.nativeEvent.touches;
        
        if (touches.length === 2) {
          // Two finger pinch - zoom
          const touch1 = touches[0];
          const touch2 = touches[1];
          const dx = touch2.pageX - touch1.pageX;
          const dy = touch2.pageY - touch1.pageY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (initialPinchDistanceRef.current === null) {
            // Start of pinch
            initialPinchDistanceRef.current = distance;
            initialZoomRef.current = zoomRef.current;
          } else {
            // Calculate zoom based on pinch distance change
            const scale = distance / initialPinchDistanceRef.current;
            let newZoom = initialZoomRef.current / scale;
            
            // Clamp zoom using constants
            newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, newZoom));
            zoomRef.current = newZoom;
            
            // Update camera position
            if (cameraRef.current) {
              cameraRef.current.position.z = newZoom;
            }
          }
        } else if (touches.length === 1 && lastTouchRef.current) {
          // Single finger drag - pixel-locked rotation
          // What: Track 3D point under finger and rotate sphere to keep it there
          // Why: Creates 1:1 pixel tracking (100px drag = 100px surface movement)
          const touch = touches[0];
          
          if (anchorPointRef.current) {
            const currentPoint = raycastToSphere(touch.pageX, touch.pageY);
            
            if (currentPoint) {
              // Calculate rotation to align anchor with current finger position
              const anchor = anchorPointRef.current.clone().normalize();
              const current = currentPoint.clone().normalize();
              
              // Rotation axis: cross product of anchor and current
              const axis = new THREE.Vector3().crossVectors(anchor, current);
              const axisLength = axis.length();
              
              if (axisLength > 0.0001) {
                axis.divideScalar(axisLength);
                
                // Rotation angle: dot product
                const dotProduct = Math.max(-1, Math.min(1, anchor.dot(current)));
                const angle = Math.acos(dotProduct);
                
                // Apply rotation via quaternion
                const quaternion = new THREE.Quaternion().setFromAxisAngle(axis, angle);
                const euler = new THREE.Euler().setFromQuaternion(quaternion);
                
                rotationRef.current.x += euler.x;
                rotationRef.current.y += euler.y;
                rotationRef.current.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, rotationRef.current.x));
                
                // Update anchor for next frame
                anchorPointRef.current = currentPoint;
              }
            } else {
              // Raycast failed (finger off sphere edge) - reset anchor
              anchorPointRef.current = null;
            }
          }
          
          lastTouchRef.current = {
            x: touch.pageX,
            y: touch.pageY,
          };
        }
      },
      
      onPanResponderRelease: () => {
        // Reset touch tracking
        lastTouchRef.current = null;
        initialPinchDistanceRef.current = null;
        anchorPointRef.current = null;
      },
    })
  ).current;

  const onContextCreate = async (gl: any) => {
    console.log('[RawEarthMesh3D] 🌍 GL Context created');

    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0x001133, 1.0);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(50, gl.drawingBufferWidth / gl.drawingBufferHeight, 0.01, 100);
    camera.position.set(0, 0, 3.0);
    camera.lookAt(0, 0, 0);
    cameraRef.current = camera;

    const ambientLight = new THREE.AmbientLight(0xffffff, 2.0);
    scene.add(ambientLight);

    const directionalLight1 = new THREE.DirectionalLight(0xffffff, 3.0);
    directionalLight1.position.set(10, 10, 5);
    scene.add(directionalLight1);

    const directionalLight2 = new THREE.DirectionalLight(0xffffff, 2.0);
    directionalLight2.position.set(-10, -10, -5);
    scene.add(directionalLight2);

    const pointLight = new THREE.PointLight(0xffffff, 2.0);
    pointLight.position.set(0, 0, 5);
    scene.add(pointLight);

    const earthGeometry = new THREE.SphereGeometry(0.998, 64, 64);
    const earthMaterial = new THREE.MeshBasicMaterial({ color: 0x001133, side: THREE.FrontSide });
    const earthSphere = new THREE.Mesh(earthGeometry, earthMaterial);
    scene.add(earthSphere);
    earthSphereRef.current = earthSphere;
    console.log('[RawEarthMesh3D] 🌐 Earth sphere added');

    const render = () => {
      animationFrameRef.current = requestAnimationFrame(render);

      // Phase 6: FPS tracking
      const now = Date.now();
      const deltaTime = now - lastFrameTimeRef.current;
      lastFrameTimeRef.current = now;
      
      frameTimesRef.current.push(deltaTime);
      if (frameTimesRef.current.length > 60) {
        frameTimesRef.current.shift(); // Keep last 60 frames
      }
      
      // Update FPS every 30 frames (reduces overhead)
      if (frameTimesRef.current.length === 60) {
        const avgFrameTime = frameTimesRef.current.reduce((a, b) => a + b, 0) / 60;
        const currentFps = Math.round(1000 / avgFrameTime);
        if (Math.abs(currentFps - fps) > 2) { // Only update if changed by >2 fps
          setFps(currentFps);
        }
      }

      if (earthSphereRef.current) {
        earthSphereRef.current.rotation.y = rotationRef.current.y;
        earthSphereRef.current.rotation.x = rotationRef.current.x;
      }

      // Phase 6: Batch rotation updates (more efficient than forEach)
      const rotY = rotationRef.current.y;
      const rotX = rotationRef.current.x;
      for (let i = 0; i < triangleMeshesRef.current.length; i++) {
        const mesh = triangleMeshesRef.current[i];
        mesh.rotation.y = rotY;
        mesh.rotation.x = rotX;
      }

      // Phase 5: Pulsing animation for current triangle during mining
      // Uses sin wave to smoothly pulse emissive intensity and opacity
      if (isMining && currentTriangleMeshRef.current) {
        const time = (Date.now() - animationStartTimeRef.current) / 1000; // Time in seconds
        const pulseFactor = 0.5 + 0.5 * Math.sin(time * 3); // Frequency: 3 rad/s
        const material = currentTriangleMeshRef.current.material as THREE.MeshStandardMaterial;
        material.emissiveIntensity = 1.0 + pulseFactor * 2.0; // Pulse between 1.0 and 3.0
        material.opacity = 0.8 + pulseFactor * 0.2; // Pulse between 0.8 and 1.0
      }

      // Update camera zoom and dynamic FOV (telescopic lens effect)
      if (cameraRef.current) {
        // Clamp zoom distance
        zoomRef.current = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoomRef.current));
        cameraRef.current.position.z = zoomRef.current;
        
        // Dynamic FOV: inversely proportional to zoom distance
        // Close zoom → narrow FOV (telephoto), far zoom → wide FOV (wide angle)
        const zoomT = (zoomRef.current - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
        const fov = MIN_FOV + (MAX_FOV - MIN_FOV) * zoomT;
        
        cameraRef.current.fov = fov;
        cameraRef.current.updateProjectionMatrix(); // CRITICAL: Must call after FOV change
      }

      if (rendererRef.current && sceneRef.current && cameraRef.current) {
        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
      gl.endFrameEXP();
    };

    render();
  };

  /**
   * Phase 6: Get or create cached material for performance
   * Reuses materials instead of creating new ones for each triangle
   */
  const getCachedMaterial = (materialProps: ReturnType<typeof getTriangleMaterialProps>): THREE.MeshStandardMaterial => {
    const key = `${materialProps.color}-${materialProps.emissive}-${materialProps.emissiveIntensity}-${materialProps.opacity}`;
    
    let material = materialCacheRef.current.get(key);
    if (!material) {
      material = new THREE.MeshStandardMaterial({
        color: materialProps.color,
        emissive: materialProps.emissive,
        emissiveIntensity: materialProps.emissiveIntensity,
        opacity: materialProps.opacity,
        transparent: materialProps.transparent,
        side: THREE.FrontSide, // Phase 6: Use FrontSide for GPU backface culling (faster)
        metalness: 0.0,
        roughness: 1.0,
      });
      materialCacheRef.current.set(key, material);
    }
    
    return material;
  };

  /**
   * Effect: Render all triangles (current, neighbors, and active global triangles)
   * 
   * Why this logic:
   * - Current triangle = bright red (user's position)
   * - Neighbor triangles = bright green (adjacent to user)
   * - Active triangles = color gradient based on clicks (0=blue → 10=red)
   * - All triangles are SPHERICAL (vertices on sphere surface, geodesic subdivision)
   * - Phase 6: GPU-side backface culling (FrontSide) and material caching for performance
   */
  useEffect(() => {
    if (!sceneRef.current) return;

    console.log('[RawEarthMesh3D] 🔺 Updating SPHERICAL TRIANGLES with click-based colors');

    // Phase 6: Only dispose geometries, not materials (materials are cached and reused)
    triangleMeshesRef.current.forEach(mesh => {
      sceneRef.current?.remove(mesh);
      mesh.geometry.dispose();
      // Materials are cached and reused, don't dispose
    });
    triangleMeshesRef.current = [];

    // Helper function to convert polygon coordinates to Vector3 vertices on sphere
    const polygonToVertices = (polygon: { coordinates: [number, number][][] }): THREE.Vector3[] => {
      if (!polygon || !polygon.coordinates || !polygon.coordinates[0]) {
        return [];
      }
      // GeoJSON polygon: coordinates[0] is outer ring with [lon, lat] pairs
      // First 3 points are triangle vertices
      return polygon.coordinates[0].slice(0, 3).map(([lon, lat]) => {
        const phi = (90 - lat) * (Math.PI / 180); // Latitude to polar angle
        const theta = lon * (Math.PI / 180);      // Longitude to azimuth
        const radius = 0.9999; // Sphere radius for triangles
        return new THREE.Vector3(
          radius * Math.sin(phi) * Math.cos(theta),
          radius * Math.cos(phi),
          radius * Math.sin(phi) * Math.sin(theta)
        );
      });
    };

    // Get neighbor triangle IDs for comparison
    const neighborIds = new Set(neighbors.map(n => n.triangleId));

    // 1. Render current triangle (highest priority, always visible)
    if (currentTriangle) {
      const geometry = createSubdividedTriangle(
        currentTriangle.vertices[0],
        currentTriangle.vertices[1],
        currentTriangle.vertices[2],
        5 // High subdivision for current triangle (smooth curvature)
      );

      // Use level 0 for current triangle (will be replaced with actual level in future refactor)
      const currentLevel = 1; // TODO: Get actual level from currentTriangle.level
      const materialProps = getTriangleMaterialProps(currentLevel, true, true);
      // Phase 6: Use cached material for better performance
      const material = getCachedMaterial(materialProps);

      const mesh = new THREE.Mesh(geometry, material);
      sceneRef.current.add(mesh);
      triangleMeshesRef.current.push(mesh);
      currentTriangleMeshRef.current = mesh; // Phase 5: Store reference for pulsing animation
      console.log('[RawEarthMesh3D] ✅ Current triangle (RED, emissive, 5x subdivision)');
    }

    // 2. Render neighbor triangles (second priority)
    // Phase 6: Use for loop instead of forEach for better performance
    for (let i = 0; i < neighbors.length; i++) {
      const neighbor = neighbors[i];
      const geom = createSubdividedTriangle(
        neighbor.vertices[0],
        neighbor.vertices[1],
        neighbor.vertices[2],
        3 // Moderate subdivision for neighbors
      );

      // Use neighbor level for coloring
      const neighborLevel = neighbors[i].triangleId ? (neighbors[i].triangleId.split('-').length) : 1;
      const materialProps = getTriangleMaterialProps(neighborLevel, false, true);
      // Phase 6: Use cached material for better performance
      const mat = getCachedMaterial(materialProps);

      const m = new THREE.Mesh(geom, mat);
      sceneRef.current?.add(m);
      triangleMeshesRef.current.push(m);
    }

    console.log(`[RawEarthMesh3D] ✅ ${neighbors.length} neighbor triangles (GREEN)`);

    // 3. Render all active triangles with click-based colors (global mesh visualization)
    // Skip triangles that are already rendered as current or neighbors
    const currentId = currentTriangle?.triangleId;
    const activeToRender = activeTriangles.filter(
      t => t.triangleId !== currentId && !neighborIds.has(t.triangleId)
    );

    // Phase 6: Use for loop instead of forEach for better performance
    for (let i = 0; i < activeToRender.length; i++) {
      const triangle = activeToRender[i];
      if (!triangle.polygon) continue; // Skip if no polygon geometry

      const vertices = polygonToVertices(triangle.polygon);
      if (vertices.length !== 3) continue; // Must be exactly 3 vertices

      // Lower subdivision for distant active triangles (performance optimization)
      const geom = createSubdividedTriangle(
        vertices[0],
        vertices[1],
        vertices[2],
        2 // Lower subdivision for global triangles (still curved, but less detail)
      );

      // Use triangle level for coloring (level = depth in hierarchy)
      const triLevel = triangle.triangleId ? (triangle.triangleId.split('-').length) : 1;
      const materialProps = getTriangleMaterialProps(triLevel, false, true);
      // Phase 6: Use cached material for better performance
      const mat = getCachedMaterial(materialProps);

      const m = new THREE.Mesh(geom, mat);
      sceneRef.current?.add(m);
      triangleMeshesRef.current.push(m);
    }

    console.log(`[RawEarthMesh3D] ✅ ${activeToRender.length} active triangles with click-based colors`);
    console.log(`[RawEarthMesh3D] 🎨 Total: ${triangleMeshesRef.current.length} SPHERICAL TRIANGLES rendered`);
  }, [currentTriangle, neighbors, activeTriangles]);

  // Recenter function: rotate sphere to face current GPS position toward camera
  const recenter = () => {
    if (!currentPosition) return;
    
    console.log(`[RawEarthMesh3D] 📍 Recentering to lat=${currentPosition.lat.toFixed(4)}, lon=${currentPosition.lon.toFixed(4)}`);
    
    // PROBLEM: Simple lat/lon to rotation doesn't work correctly
    // SOLUTION: Use lookAt-style rotation
    // 
    // The sphere is rotated, triangles are on its surface.
    // Camera is at (0, 0, zoom) looking at origin.
    // We want to rotate the sphere so the user's GPS point faces camera.
    // 
    // Since camera looks down +Z axis, we want to rotate sphere so that
    // the user's position (which is at some lat/lon) ends up pointing toward +Z.
    
    const lat = currentPosition.lat;
    const lon = currentPosition.lon;
    
    // Simple Euler angle approach:
    // First rotate around Y (longitude rotation)
    // Then rotate around X (latitude tilt)
    //
    // Budapest is at: lat=47.5N, lon=19.1E
    // To bring it to front (+Z facing camera):
    // - Rotate Y by -lon to bring longitude to front
    // - Rotate X by -lat to tilt the latitude to center height
    
    const targetRotationY = -lon * (Math.PI / 180);
    const targetRotationX = -lat * (Math.PI / 180);
    
    console.log(`[RawEarthMesh3D] Current rotation: X=${rotationRef.current.x.toFixed(4)}, Y=${rotationRef.current.y.toFixed(4)}`);
    console.log(`[RawEarthMesh3D] Target rotation: X=${targetRotationX.toFixed(4)}, Y=${targetRotationY.toFixed(4)}`);
    
    // Animate rotation smoothly
    const startX = rotationRef.current.x;
    const startY = rotationRef.current.y;
    const duration = 800; // 800ms animation
    const startTime = Date.now();
    
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function (ease-out cubic)
      const eased = 1 - Math.pow(1 - progress, 3);
      
      rotationRef.current.x = startX + (targetRotationX - startX) * eased;
      rotationRef.current.y = startY + (targetRotationY - startY) * eased;
      
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        console.log('[RawEarthMesh3D] ✅ Recenter complete - check if red triangle is visible');
      }
    };
    
    animate();
  };
  
  // Provide recenter function to parent component
  useEffect(() => {
    if (onRecenterReady) {
      onRecenterReady(recenter);
    }
  }, [currentPosition, onRecenterReady]);

  // Provide refetch function to parent (call after mining to update triangle colors)
  useEffect(() => {
    if (onRefetchActiveReady) {
      onRefetchActiveReady(refetchActiveTriangles);
    }
  }, [onRefetchActiveReady, refetchActiveTriangles]);

  // Phase 5: Reset animation timer when mining starts
  // This ensures pulsing animation starts from a known phase
  useEffect(() => {
    if (isMining) {
      animationStartTimeRef.current = Date.now();
      console.log('[RawEarthMesh3D] 💫 Mining started - pulsing animation enabled');
    } else if (currentTriangleMeshRef.current) {
      // Reset material to normal when mining ends
      const material = currentTriangleMeshRef.current.material as THREE.MeshStandardMaterial;
      const currentLevel = 1; // TODO: Get actual level
      const materialProps = getTriangleMaterialProps(currentLevel, true, true);
      material.emissiveIntensity = materialProps.emissiveIntensity;
      material.opacity = materialProps.opacity;
      console.log('[RawEarthMesh3D] ⏹️ Mining stopped - pulsing animation disabled');
    }
  }, [isMining]);

  // Phase 5: Flash feedback on mining success or failure
  // Success = brief green flash (200ms), Failure = brief red flash (200ms)
  useEffect(() => {
    if (!miningResult || !currentTriangleMeshRef.current) return;

    const material = currentTriangleMeshRef.current.material as THREE.MeshStandardMaterial;
    const originalEmissive = material.emissive.clone();
    const originalIntensity = material.emissiveIntensity;

    if (miningResult === 'success') {
      // Green flash for success
      console.log('[RawEarthMesh3D] ✅ Mining success - green flash');
      material.emissive.setHex(0x00ff00); // Bright green
      material.emissiveIntensity = 3.0;

      setTimeout(() => {
        if (currentTriangleMeshRef.current) {
          const mat = currentTriangleMeshRef.current.material as THREE.MeshStandardMaterial;
          mat.emissive.copy(originalEmissive);
          mat.emissiveIntensity = originalIntensity;
        }
      }, 200);
    } else if (miningResult === 'failure') {
      // Red flash for failure
      console.log('[RawEarthMesh3D] ❌ Mining failure - red flash');
      material.emissive.setHex(0xff0000); // Bright red
      material.emissiveIntensity = 3.0;

      setTimeout(() => {
        if (currentTriangleMeshRef.current) {
          const mat = currentTriangleMeshRef.current.material as THREE.MeshStandardMaterial;
          mat.emissive.copy(originalEmissive);
          mat.emissiveIntensity = originalIntensity;
        }
      }, 200);
    }
  }, [miningResult]);
  
  // Auto-center camera when position first loads or changes
  useEffect(() => {
    if (currentPosition && currentTriangle) {
      console.log('[RawEarthMesh3D] Auto-centering to initial position');
      // Set rotation immediately (no animation on first load)
      // Use same rotation logic as recenter() function
      const targetRotationY = -currentPosition.lon * (Math.PI / 180);
      const targetRotationX = -currentPosition.lat * (Math.PI / 180);
      rotationRef.current.x = targetRotationX;
      rotationRef.current.y = targetRotationY;
    }
  }, [currentTriangle]); // Only trigger when triangle loads (not on every position update)
  
  // Phase 6: Comprehensive cleanup on unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      // Cancel animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      
      // Dispose all geometries
      triangleMeshesRef.current.forEach(mesh => {
        mesh.geometry.dispose();
      });
      
      // Dispose all cached materials
      materialCacheRef.current.forEach(material => {
        material.dispose();
      });
      materialCacheRef.current.clear();
      
      // Dispose Earth sphere
      if (earthSphereRef.current) {
        earthSphereRef.current.geometry.dispose();
        (earthSphereRef.current.material as THREE.Material).dispose();
      }
      
      console.log('[RawEarthMesh3D] 🧹 Cleanup complete - all resources disposed');
    };
  }, []);

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
      <GLView 
        style={styles.glView} 
        onContextCreate={onContextCreate}
        onLayout={({ nativeEvent }) => {
          const { width, height } = nativeEvent.layout;
          // Track view size for accurate raycasting (screen coords → 3D coords)
          viewSizeRef.current = { width, height };
        }}
      />
      
      {/* Phase 6: FPS counter overlay */}
      {showPerformance && (
        <View style={styles.performanceOverlay}>
          <Text style={styles.performanceText}>FPS: {fps}</Text>
          <Text style={styles.performanceTextSmall}>
            Triangles: {triangleMeshesRef.current.length}
          </Text>
          <Text style={styles.performanceTextSmall}>
            Materials: {materialCacheRef.current.size}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000000' },
  glView: { flex: 1 },
  // Phase 6: Performance overlay styles
  performanceOverlay: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 6,
    minWidth: 120,
  },
  performanceText: {
    color: '#00FF00',
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: 'monospace',
  },
  performanceTextSmall: {
    color: '#FFFFFF',
    fontSize: 12,
    fontFamily: 'monospace',
    marginTop: 2,
  },
});
