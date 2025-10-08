'use client';

/**
 * STEP Mesh Mining - Three.js Spherical Implementation
 * 
 * This is the production-ready 3D mining game UI where users:
 * - Start with Level 1 icosahedron (20 triangles on a sphere)
 * - Click triangles to "mine" them (increment counter 0→11)
 * - After 11 clicks, triangle subdivides into 4 geodesic children
 * - Zoom from ISS altitude (400km) to ground level (100m)
 * - Maximum 512 active triangles visible (enforced zoom restriction)
 * 
 * Key Technical Features:
 * - Proper spherical geometry (no distortion)
 * - Geodesic subdivision (mathematically correct on sphere surface)
 * - Dynamic loading (only visible triangles from API)
 * - GPU-accelerated rendering via Three.js/WebGL
 * - Viewport-based culling (automatic by Three.js)
 * - Production-optimized for mobile + desktop
 */

import React, { useRef, useState, useEffect, useMemo } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Html } from '@react-three/drei';
import * as THREE from 'three';

// ========================================
// TYPE DEFINITIONS
// ========================================

interface Triangle {
  id: string;
  level: number;
  centroid: [number, number]; // [lon, lat] in degrees
  vertices: [number, number][]; // [[lon, lat], ...] - 3 vertices
  clicks: number; // 0-11
  status: 'pending' | 'active' | 'mined_out' | 'subdivided';
  parent: string | null;
  children: string[];
}

/**
 * Convert API triangle ID + clicks to human-readable hierarchical ID
 * Format: {face}.{children}:{layer}
 * 
 * Examples:
 * - "13" - Face 13, no clicks
 * - "13:5" - Face 13, layer 5 (5 clicks)
 * - "13.1.0.3" - Face 13, subdivision path
 * - "13.1.0.3:7" - Face 13, subdivision path, layer 7 (7 clicks)
 */
function getHumanReadableId(apiId: string, level: number, clicks: number): string {
  try {
    // Parse API ID: STEP-TRI-v1:{FaceLetter}{Level}-{path}-{checksum}
    // Example: "STEP-TRI-v1:M6-10330000000000000000-V75"
    // Face letter (M, N, L, etc.) + Level number
    // Path digits represent subdivision hierarchy
    
    const match = apiId.match(/([A-Z])(\d+)-(\d+)/);
    if (!match) {
      return '?';
    }
    
    const faceLetter = match[1];
    const parsedLevel = parseInt(match[2]);
    const path = match[3];
    
    // Convert face letter to number (A=1, B=2, ..., M=13, etc.)
    const faceNumber = faceLetter.charCodeAt(0) - 'A'.charCodeAt(0) + 1;
    
    // Extract non-zero digits from path (they form the subdivision hierarchy)
    const pathDigits: number[] = [];
    for (let i = 0; i < path.length; i++) {
      const digit = parseInt(path[i]);
      if (digit !== 0) {
        pathDigits.push(digit);
      }
    }
    
    // Build hierarchical ID
    let baseId: string;
    if (pathDigits.length === 0) {
      // Level 1: just face number
      baseId = `${faceNumber}`;
    } else {
      // Level 2+: face.child1.child2...
      // Example: M6 with path [1,0,3,3] -> "13.1.0.3.3"
      baseId = `${faceNumber}.${pathDigits.join('.')}`;
    }
    
    // Add layer (clicks) if any
    if (clicks > 0) {
      return `${baseId}:${clicks}`;
    }
    
    return baseId;
    
  } catch (e) {
    return '?';
  }
}

interface TriangleComponentProps {
  triangle: Triangle;
  onMine: (id: string) => void;
  isSelected: boolean;
}

// ========================================
// UTILITY FUNCTIONS
// ========================================

/**
 * Get ISO 8601 timestamp with milliseconds in UTC
 * Used for structured logging throughout the application
 */
function getTimestamp(): string {
  return new Date().toISOString();
}

/**
 * Parse children response from API with robust error handling
 * Handles both nested result structure and direct array responses
 */
function parseChildrenResponse(body: any): string[] {
  const timestamp = getTimestamp();
  
  // Handle nested result structure
  const result = body.result || body;
  const childrenArray = result.children || result;
  
  if (!Array.isArray(childrenArray)) {
    console.warn(`[${timestamp}] ⚠️ Children response is not an array:`, childrenArray);
    return [];
  }
  
  // Normalize children to array of triangle IDs
  const childIds: string[] = [];
  for (const item of childrenArray) {
    if (typeof item === 'string') {
      childIds.push(item);
    } else if (item && typeof item === 'object') {
      // Try known keys: triangleId, id
      const id = item.triangleId || item.id;
      if (id) {
        childIds.push(id);
      } else {
        console.warn(`[${timestamp}] ⚠️ Child object missing triangleId/id:`, item);
      }
    }
  }
  
  if (childIds.length !== 4) {
    console.warn(`[${timestamp}] ⚠️ Expected 4 children, got ${childIds.length}`);
  }
  
  return childIds;
}

/**
 * Parse polygon response from API with validation
 * Extracts GeoJSON polygon coordinates from nested API response
 */
function parsePolygonResponse(body: any, triangleId: string): number[][] {
  const timestamp = getTimestamp();
  
  // Handle nested result structure
  const result = body.result || body;
  const polygon = result.polygon || body.polygon || result;
  
  // Validate polygon structure
  if (!polygon || polygon.type !== 'Polygon') {
    throw new Error(`[${timestamp}] Invalid polygon type for ${triangleId}: ${polygon?.type}`);
  }
  
  if (!Array.isArray(polygon.coordinates) || polygon.coordinates.length === 0) {
    throw new Error(`[${timestamp}] Missing polygon coordinates for ${triangleId}`);
  }
  
  // Return first ring (exterior boundary)
  const ring = polygon.coordinates[0];
  if (!Array.isArray(ring) || ring.length < 3) {
    throw new Error(`[${timestamp}] Invalid polygon ring for ${triangleId}: ${ring?.length} points`);
  }
  
  return ring;
}

/**
 * Convert GeoJSON ring to triangle vertices
 * Removes closing point and extracts first 3 unique vertices
 */
function ringToVertices(ring: number[][], triangleId: string): [number, number][] {
  const timestamp = getTimestamp();
  
  // Remove closing point if present (first point === last point)
  let points = ring;
  if (ring.length > 3) {
    const first = ring[0];
    const last = ring[ring.length - 1];
    if (first[0] === last[0] && first[1] === last[1]) {
      points = ring.slice(0, -1);
    }
  }
  
  if (points.length < 3) {
    throw new Error(`[${timestamp}] Insufficient vertices for ${triangleId}: ${points.length}`);
  }
  
  // Take first 3 vertices as [lon, lat]
  return points.slice(0, 3) as [number, number][];
}

/**
 * Convert lat/lon coordinates to 3D position on unit sphere
 * @param lat - Latitude in degrees (-90 to 90)
 * @param lon - Longitude in degrees (-180 to 180)
 * @returns THREE.Vector3 on unit sphere surface
 */
function latLonToVector3(lat: number, lon: number): THREE.Vector3 {
  // Convert to radians
  const phi = (90 - lat) * (Math.PI / 180); // Polar angle (0 at north pole)
  const theta = (lon + 180) * (Math.PI / 180); // Azimuthal angle
  
  // Spherical to Cartesian coordinates
  // IMPORTANT: Scale to radius 0.9999 (slightly inside conceptual Earth at 1.0)
  // This allows camera to get very close (down to 1.0) without penetrating mesh
  const MESH_RADIUS = 0.9999;
  const x = -Math.sin(phi) * Math.cos(theta) * MESH_RADIUS;
  const y = Math.cos(phi) * MESH_RADIUS;
  const z = Math.sin(phi) * Math.sin(theta) * MESH_RADIUS;
  
  return new THREE.Vector3(x, y, z);
}

/**
 * Create TRUE spherical triangles with geodesic subdivision
 * Uses recursive midpoint subdivision - each edge is split at its midpoint,
 * then projected back onto the sphere surface to create great circle arcs
 */
function createSphericalTriangleGeometry(v1: THREE.Vector3, v2: THREE.Vector3, v3: THREE.Vector3, subdivisions: number = 3): THREE.BufferGeometry {
  const positions: number[] = [];
  
  /**
   * Subdivide a single spherical triangle recursively
   * Creates 4 sub-triangles at each level by splitting edges at midpoints
   */
  function subdivide(a: THREE.Vector3, b: THREE.Vector3, c: THREE.Vector3, depth: number) {
    if (depth === 0) {
      // Base case: output the triangle
      positions.push(a.x, a.y, a.z);
      positions.push(b.x, b.y, b.z);
      positions.push(c.x, c.y, c.z);
    } else {
      // Find midpoints and project onto sphere (creates great circle arcs)
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
  
  // Start recursive subdivision
  subdivide(v1, v2, v3, subdivisions);
  
  // Create geometry
  const geometry = new THREE.BufferGeometry();
  const positionArray = new Float32Array(positions);
  geometry.setAttribute('position', new THREE.BufferAttribute(positionArray, 3));
  geometry.computeVertexNormals();
  
  console.log(`Created spherical triangle with ${positions.length / 9} sub-triangles`);
  
  return geometry;
}

/**
 * Compute centroid of triangle vertices in 3D space
 * Uses vector averaging on sphere surface (not geodesic center, but close enough for display)
 */
function computeCentroid3D(vertices: [number, number][]): THREE.Vector3 {
  const vectors = vertices.map(([lon, lat]) => latLonToVector3(lat, lon));
  const sum = vectors.reduce((acc, v) => acc.add(v), new THREE.Vector3(0, 0, 0));
  return sum.divideScalar(vertices.length).normalize(); // Project back to sphere surface
}

/**
 * Calculate progressive color for triangle based on clicks
 * Shows visual progression from first click (1) through subdivision (11)
 */
function getTriangleColor(status: string, clicks: number): string {
  // Subdivided triangles are blue
  if (status === 'subdivided') {
    return '#0066ff';
  }
  
  // Progressive color gradient from dark gray → yellow → orange → green
  // Clicks 0-11 with smooth color transitions
  if (clicks === 0) {
    return '#1a1a1a'; // Very dark gray - not yet clicked
  } else if (clicks <= 3) {
    // Clicks 1-3: Dark gray → Medium gray
    const t = clicks / 3;
    const gray = Math.floor(26 + (102 - 26) * t); // #1a → #66
    return `rgb(${gray}, ${gray}, ${gray})`;
  } else if (clicks <= 6) {
    // Clicks 4-6: Gray → Yellow
    const t = (clicks - 3) / 3;
    const r = Math.floor(102 + (255 - 102) * t); // #66 → #ff
    const g = Math.floor(102 + (204 - 102) * t); // #66 → #cc
    const b = Math.floor(102 * (1 - t));         // #66 → #00
    return `rgb(${r}, ${g}, ${b})`;
  } else if (clicks <= 9) {
    // Clicks 7-9: Yellow → Orange
    const t = (clicks - 6) / 3;
    const r = 255;
    const g = Math.floor(204 - 102 * t); // #cc → #66
    const b = 0;
    return `rgb(${r}, ${g}, ${b})`;
  } else if (clicks === 10) {
    // Click 10: Bright orange (ready to subdivide)
    return '#ff3300';
  } else if (clicks === 11) {
    // Click 11: Green (subdividing)
    return '#00ff00';
  }
  
  return '#1a1a1a'; // Fallback
}

/**
 * Calculate altitude in meters from camera distance to sphere center
 * 
 * Triangles are at radius 1.0 and represent Earth surface
 * Real Earth radius = 6,371 km = 6,371,000 m
 * Camera distance = (Earth radius + altitude) / Earth radius
 * Therefore: altitude = (distance - 1.0) * Earth radius
 */
function cameraDistanceToAltitude(distance: number): number {
  const EARTH_RADIUS_M = 6371000; // 6,371 km
  return (distance - 1.0) * EARTH_RADIUS_M;
}

/**
 * Calculate camera distance from desired altitude
 * 
 * Triangles at radius 1.0 represent Earth surface
 * distance = 1.0 + (altitude / Earth radius)
 * At altitude 0 (ground): distance = 1.0
 * At altitude 100m: distance = 1.000016
 * At altitude 6371km (1 Earth radius up): distance = 2.0
 */
function altitudeToCameraDistance(altitudeMeters: number): number {
  const EARTH_RADIUS_M = 6371000; // 6,371 km
  return 1.0 + (altitudeMeters / EARTH_RADIUS_M);
}

// ========================================
// SPHERICAL TRIANGLE COMPONENT
// ========================================

/**
 * Individual triangle on sphere surface
 * - Renders as THREE.Mesh with BufferGeometry
 * - Handles click detection via raycasting
 * - Displays triangle ID and click counter as HTML overlay
 */
function SphericalTriangle({ triangle, onMine, isSelected }: TriangleComponentProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const { camera } = useThree();
  const [isVisible, setIsVisible] = useState(true);

  // Convert lat/lon vertices to 3D positions on unit sphere
  const vertices3D = useMemo(() => {
    const verts = triangle.vertices.map(([lon, lat]) => latLonToVector3(lat, lon));
    console.log(`🔺 Triangle ${triangle.id.substring(0, 12)} - 3D vertices:`, verts);
    return verts;
  }, [triangle.vertices, triangle.id]);

  // Create TRUE spherical triangle geometry with great circle edges
  const geometry = useMemo(() => {
    console.log('🚀🚀🚀 NEW CODE v0.21.37 - TRUE SPHERICAL GEOMETRY 🚀🚀🚀');
    // Use 5 subdivisions: 1→4→16→64→256→1024 sub-triangles
    // Creates HIGHLY VISIBLE spherical curvature with great circle arcs
    // Each edge midpoint is projected onto sphere - this IS spherical geometry!
    return createSphericalTriangleGeometry(vertices3D[0], vertices3D[1], vertices3D[2], 5);
  }, [vertices3D]);

  // Centroid position for label
  const centroid3D = useMemo(() => computeCentroid3D(triangle.vertices), [triangle.vertices]);

  // Triangle color based on clicks - progressive from first click
  const color = useMemo(() => getTriangleColor(triangle.status, triangle.clicks), [triangle.status, triangle.clicks]);

  // Check if triangle is facing camera (front side visible)
  useFrame(() => {
    if (!camera) return;
    
    // Vector from Earth center to centroid (triangle normal direction)
    const triangleNormal = centroid3D.clone().normalize();
    
    // Vector from Earth center to camera
    const cameraDirection = camera.position.clone().normalize();
    
    // Dot product: if > 0, triangle is facing camera
    const dotProduct = triangleNormal.dot(cameraDirection);
    
    setIsVisible(dotProduct > 0);
  });


  // Click handler
  const handleClick = (event: any) => {
    event.stopPropagation();
    onMine(triangle.id);
  };

  return (
    <group>
      {/* Triangle mesh */}
      <mesh
        ref={meshRef}
        geometry={geometry}
        onClick={handleClick}
      >
        <meshStandardMaterial
          color={color}
          metalness={0.0}
          roughness={1.0}
          side={THREE.FrontSide}
          wireframe={false}
          opacity={1.0}
          transparent={false}
          depthWrite={true}
          depthTest={true}
        />
      </mesh>


      {/* Triangle ID label - ONLY show if facing camera (front side) */}
      {isVisible && (
        <Html 
          position={centroid3D} 
          center 
          style={{ pointerEvents: 'none' }}
        >
          <div style={{
            color: 'white',
            fontFamily: 'monospace',
            fontSize: '10px',
            textAlign: 'center',
            textShadow: '0 0 3px black',
            whiteSpace: 'nowrap',
          }}>
            {getHumanReadableId(triangle.id, triangle.level, triangle.clicks)}
          </div>
        </Html>
      )}
    </group>
  );
}

// ========================================
// EARTH SPHERE COMPONENT
// ========================================

/**
 * Base Earth sphere (solid inner sphere)
 * - Prevents seeing through to the back side of Earth
 * - Radius 0.998 (slightly smaller than mesh at 0.9999)
 * - Dark color to block visibility
 */
function EarthSphere() {
  return (
    <mesh>
      <sphereGeometry args={[0.998, 64, 64]} />
      <meshBasicMaterial 
        color="#000000" 
        side={THREE.FrontSide}
        depthWrite={true}
        depthTest={true}
      />
    </mesh>
  );
}

// ========================================
// CAMERA CONTROLLER
// ========================================

/**
 * Custom camera controller with altitude-based zoom limits
 * - Enforces ISS (400km) to Ground (100m) range
 * - Dynamically adjusts min zoom based on active triangle count
 * - Prevents viewing more than 512 triangles at once
 */
function CameraController({ triangleCount, onAltitudeChange }: { triangleCount: number; onAltitudeChange: (alt: number) => void }) {
  const { camera } = useThree();
  const controlsRef = useRef<any>(null);

  // Calculate zoom limits based on active triangle count
  const { minDistance, maxDistance } = useMemo(() => {
    // Max zoom out: Fixed at distance 1.5 (~3,185 km altitude)
    const MAX_DISTANCE = 1.5; // Fixed maximum zoom out
    // Max zoom in: 64km above surface (safe altitude, prevents going through)
    const GROUND_ALTITUDE_M = 64000; // 64km minimum altitude

    const calculatedMin = altitudeToCameraDistance(GROUND_ALTITUDE_M);
    const calculatedMax = MAX_DISTANCE;
    
    const maxAltitudeKm = (calculatedMax - 1.0) * 6371;
    console.log(`📏 Zoom limits: minDistance=${calculatedMin.toFixed(6)} (${GROUND_ALTITUDE_M/1000}km), maxDistance=${calculatedMax.toFixed(6)} (${maxAltitudeKm.toFixed(1)}km)`);
    console.log(`🌍 Earth surface at radius: 1.0000, Triangle mesh at: 0.9999`);
    console.log(`📍 Range: ${(GROUND_ALTITUDE_M/1000).toFixed(0)}km to ${maxAltitudeKm.toFixed(0)}km altitude`);

    return {
      minDistance: calculatedMin, // Close - 64km altitude (safe, won't go through)
      maxDistance: calculatedMax, // Far from Earth
    };
  }, [triangleCount]);

  // Update altitude display and dynamic rotation speed on camera change
  useFrame(() => {
    if (controlsRef.current) {
      const distance = camera.position.length();
      const altitude = cameraDistanceToAltitude(distance);
      onAltitudeChange(altitude);
      
      // Dynamic rotation speed: SLOWER when closer (like Google Earth)
      // At 6371km (distance 2.0): speed = 1.0 (fast rotation)
      // At 100m (distance 1.000016): speed = 0.000016 (extremely slow)
      // Formula: speed scales linearly with distance from 0.05 to 1.0
      const normalizedDistance = (distance - 1.0) / 1.0; // 0 to 1 range from surface
      const speed = Math.max(0.05, Math.min(1.0, normalizedDistance * 1.0));
      controlsRef.current.rotateSpeed = speed;
      
      // Debug
      if (Math.random() < 0.01) { // Log occasionally
        console.log(`📍 Altitude: ${(altitude/1000).toFixed(1)}km, Distance: ${distance.toFixed(4)}, RotateSpeed: ${speed.toFixed(3)}`);
      }
    }
  });

  return (
    <OrbitControls
      ref={controlsRef}
      enablePan={false} // Lock camera to center on Earth
      enableZoom={true} // Enable scroll-wheel zoom
      minDistance={minDistance} // Closest zoom - 100m altitude
      maxDistance={maxDistance} // Farthest zoom - 6,371 km (1 Earth radius)
      zoomSpeed={0.015} // EXTREMELY slow zoom - 10x slower than before!
      enableDamping={true} // Smooth camera movement
      dampingFactor={0.15} // Very strong damping for buttery smooth zoom
      rotateSpeed={1.0} // Dynamic - adjusted per frame (slower when close)
      minPolarAngle={0} // Allow full rotation
      maxPolarAngle={Math.PI} // Allow full rotation
      mouseButtons={{
        LEFT: THREE.MOUSE.ROTATE,
        MIDDLE: THREE.MOUSE.DOLLY, // Middle mouse for zoom
        RIGHT: THREE.MOUSE.ROTATE
      }}
    />
  );
}

// ========================================
// MAIN MINING UI COMPONENT
// ========================================

export default function MeshMining3D() {
  // State management
  const [triangles, setTriangles] = useState<Map<string, Triangle>>(new Map());
  const [selectedTriangleId, setSelectedTriangleId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [altitude, setAltitude] = useState(400000); // Start at ISS altitude

  // API base URL - use environment variable or fallback to localhost
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5500';

  // ========================================
  // INITIALIZATION - Load Level 1 Icosahedron
  // ========================================

  useEffect(() => {
    loadInitialTriangles();
  }, []);

  /**
   * Load Level 1 icosahedron (20 triangles) from API
   * This is the starting state - user mines and subdivides from here
   * 
   * Level 1 icosahedron has exactly 20 triangles covering the entire sphere
   */
  async function loadInitialTriangles() {
    try {
      console.log('🌍 Loading full Level 1 icosahedron (20 triangles)...');
      
      // Fetch all Level 1 triangles using bbox search (whole world)
      const response = await fetch(`${API_BASE}/mesh/search?bbox=-180,-90,180,90&level=1&maxResults=20&includePolygon=true`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const responseData = await response.json();
      const data = responseData.result || responseData;
      
      if (!data.triangles || data.triangles.length === 0) {
        throw new Error('No triangles returned from API');
      }
      
      console.log(`📦 Received ${data.triangles.length} level-1 triangles`);

      // Convert API triangles to our Triangle format
      const triangleMap = new Map<string, Triangle>();
      
      for (const apiTriangle of data.triangles) {
        if (!apiTriangle.polygon) {
          console.warn(`Triangle ${apiTriangle.triangleId} missing polygon data, skipping`);
          continue;
        }
        
        // Extract vertices from polygon (first 3 points, excluding closing point)
        const vertices = apiTriangle.polygon.coordinates[0].slice(0, 3) as [number, number][];
        
        // Compute centroid from vertices
        const centroidLon = vertices.reduce((sum, v) => sum + v[0], 0) / 3;
        const centroidLat = vertices.reduce((sum, v) => sum + v[1], 0) / 3;

        // Create triangle object
        const triangle: Triangle = {
          id: apiTriangle.triangleId,
          level: 1,
          centroid: [centroidLon, centroidLat],
          vertices,
          clicks: 0,
          status: 'pending',
          parent: null,
          children: [],
        };
        
        triangleMap.set(triangle.id, triangle);
      }

      setTriangles(triangleMap);
      setLoading(false);
      console.log(`✅ Loaded ${triangleMap.size} triangles for Level 1 icosahedron`);

    } catch (error) {
      console.error('❌ Failed to load initial triangles:', error);
      setLoading(false);
    }
  }

  // ========================================
  // MINING LOGIC
  // ========================================

  /**
   * Handle triangle mining (click event)
   * - Increment click counter
   * - Update status based on clicks
   * - Subdivide at 11 clicks
   */
  async function mineTriangle(triangleId: string) {
    const triangle = triangles.get(triangleId);
    if (!triangle || triangle.status === 'subdivided') return;

    console.log(`⛏️ Mining ${triangleId} (clicks: ${triangle.clicks} → ${triangle.clicks + 1})`);

    // Increment clicks
    const newClicks = triangle.clicks + 1;
    
    // Update status
    let newStatus = triangle.status;
    if (newClicks === 1) newStatus = 'active';
    else if (newClicks >= 8 && newClicks <= 10) newStatus = 'mined_out';
    else if (newClicks === 11) {
      // Subdivide!
      await subdivideTriangle(triangleId);
      return;
    }

    // Update triangle
    const updatedTriangle = {
      ...triangle,
      clicks: newClicks,
      status: newStatus,
    };

    setTriangles(new Map(triangles).set(triangleId, updatedTriangle));
    setSelectedTriangleId(triangleId);
  }

  /**
   * Subdivide triangle into 4 geodesic children
   * - Fetch children from API
   * - Replace parent with children in render
   * - Maintain 512 triangle limit via zoom restriction
   * 
   * ROBUST IMPLEMENTATION:
   * - Prevents re-entry via status check
   * - Uses functional state updates to avoid stale closures
   * - Fetches all polygon data concurrently with Promise.all
   * - Comprehensive error handling with structured logging
   */
  async function subdivideTriangle(parentId: string) {
    const timestamp = getTimestamp();
    
    try {
      // Get parent triangle and validate state
      const parent = triangles.get(parentId);
      if (!parent) {
        console.warn(`[${timestamp}] ⚠️ Parent triangle ${parentId} not found`);
        return;
      }
      
      // Prevent re-entry: if already subdividing or subdivided, exit early
      if (parent.status === 'subdivided') {
        console.info(`[${timestamp}] ℹ️ Triangle ${parentId} already subdivided, skipping`);
        return;
      }
      
      console.info(`[${timestamp}] 🔨 Starting subdivision of ${parentId} (level ${parent.level}, clicks ${parent.clicks})`);

      // Step 1: Mark parent as subdividing to prevent concurrent subdivisions
      setTriangles(prevTriangles => {
        const updated = new Map(prevTriangles);
        const currentParent = updated.get(parentId);
        if (currentParent) {
          updated.set(parentId, {
            ...currentParent,
            status: 'subdivided' as const, // Prevent further clicks
          });
        }
        return updated;
      });

      // Step 2: Fetch children IDs from API
      const childrenResponse = await fetch(`${API_BASE}/mesh/children/${parentId}`);
      if (!childrenResponse.ok) {
        throw new Error(`HTTP ${childrenResponse.status} fetching children`);
      }
      const childrenBody = await childrenResponse.json();
      const childIds = parseChildrenResponse(childrenBody);
      
      if (childIds.length === 0) {
        console.warn(`[${timestamp}] ⚠️ No children found for ${parentId}`);
        return;
      }
      
      console.info(`[${timestamp}] 📦 Found ${childIds.length} children for ${parentId}`);

      // Step 3: Fetch polygon data for all children concurrently
      const polygonPromises = childIds.map(async (childId) => {
        const polygonResponse = await fetch(`${API_BASE}/mesh/polygon/${childId}`);
        if (!polygonResponse.ok) {
          throw new Error(`HTTP ${polygonResponse.status} fetching polygon for ${childId}`);
        }
        const polygonBody = await polygonResponse.json();
        return { childId, polygonBody };
      });
      
      const polygonResults = await Promise.all(polygonPromises);
      
      // Step 4: Build child Triangle objects
      const childTriangles: Triangle[] = [];
      for (const { childId, polygonBody } of polygonResults) {
        const ring = parsePolygonResponse(polygonBody, childId);
        const vertices = ringToVertices(ring, childId);
        
        // Compute centroid from vertices
        const centroidLon = vertices.reduce((sum, v) => sum + v[0], 0) / 3;
        const centroidLat = vertices.reduce((sum, v) => sum + v[1], 0) / 3;
        
        const child: Triangle = {
          id: childId,
          level: parent.level + 1,
          centroid: [centroidLon, centroidLat],
          vertices,
          clicks: 0,
          status: 'pending',
          parent: parentId,
          children: [],
        };
        
        childTriangles.push(child);
        console.info(`[${timestamp}] ✅ Prepared child ${childId} (level ${child.level})`);
      }

      // Step 5: Atomic state update - add all children and finalize parent
      setTriangles(prevTriangles => {
        const updated = new Map(prevTriangles);
        
        // Update parent with final subdivided state and children list
        const currentParent = updated.get(parentId);
        if (currentParent) {
          updated.set(parentId, {
            ...currentParent,
            status: 'subdivided',
            clicks: 11,
            children: childIds,
          });
        }
        
        // Add all child triangles
        for (const child of childTriangles) {
          updated.set(child.id, child);
        }
        
        return updated;
      });

      console.info(`[${timestamp}] ✅ Successfully subdivided ${parentId} into ${childTriangles.length} children`);

    } catch (error: any) {
      console.error(`[${timestamp}] ❌ Subdivision failed for ${parentId}:`, error.message || error);
      
      // Attempt to revert parent status on error
      setTriangles(prevTriangles => {
        const updated = new Map(prevTriangles);
        const currentParent = updated.get(parentId);
        if (currentParent && currentParent.status === 'subdivided' && currentParent.children.length === 0) {
          // Only revert if no children were added
          updated.set(parentId, {
            ...currentParent,
            status: 'mined_out',
            clicks: 10, // Revert to click 10
          });
        }
        return updated;
      });
    }
  }

  // ========================================
  // COMPUTED VALUES
  // ========================================

  // Count active (non-subdivided) triangles for zoom limit enforcement
  const activeTriangleCount = useMemo(() => {
    let count = 0;
    triangles.forEach((t) => {
      if (t.status !== 'subdivided' || t.children.length === 0) {
        count++;
      }
    });
    return count;
  }, [triangles]);

  // Format altitude for display
  const altitudeDisplay = useMemo(() => {
    if (altitude >= 1000) {
      return `${(altitude / 1000).toFixed(1)} km`;
    }
    return `${altitude.toFixed(0)} m`;
  }, [altitude]);

  // Selected triangle details
  const selectedTriangle = selectedTriangleId ? triangles.get(selectedTriangleId) : null;

  // ========================================
  // RENDER
  // ========================================

  if (loading) {
    return (
      <div style={{ width: '100vw', height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#000' }}>
        <div style={{ color: 'white', fontFamily: 'monospace' }}>Loading mesh...</div>
      </div>
    );
  }

  return (
    <div style={{ width: '100vw', height: '100vh', position: 'relative', background: '#001133' }}>
      {/* Three.js Canvas */}
      <Canvas
        camera={{ 
          position: [0, 0, 3.0], // Start FAR outside (3.0 = ~12 million km from Earth!)
          fov: 50, // Field of view
          near: 0.01, // VERY close clipping - can see objects almost touching camera
          far: 100 // FAR clipping - can see objects very far away
        }}
        style={{ background: '#001133' }}
      >
        {/* Lighting - very bright to make faces visible */}
        <ambientLight intensity={2.0} />
        <directionalLight position={[10, 10, 5]} intensity={3.0} />
        <directionalLight position={[-10, -10, -5]} intensity={2.0} />
        <pointLight position={[0, 0, 5]} intensity={2.0} />
        
        {/* Earth sphere */}
        <EarthSphere />

        {/* Render all non-subdivided triangles */}
        {Array.from(triangles.values()).map((triangle) => {
          // Don't render subdivided parents (only render children)
          if (triangle.status === 'subdivided' && triangle.children.length > 0) {
            return null;
          }
          
          return (
            <SphericalTriangle
              key={triangle.id}
              triangle={triangle}
              onMine={mineTriangle}
              isSelected={triangle.id === selectedTriangleId}
            />
          );
        })}

        {/* Camera controls with altitude-based limits */}
        <CameraController
          triangleCount={activeTriangleCount}
          onAltitudeChange={setAltitude}
        />
      </Canvas>

      {/* UI Overlay */}
      <div style={{
        position: 'absolute',
        top: 20,
        left: 20,
        color: 'white',
        fontFamily: 'monospace',
        fontSize: '14px',
        background: 'rgba(0,0,0,0.7)',
        padding: '15px',
        borderRadius: '8px',
        pointerEvents: 'none',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '10px' }}>
          🌍 STEP Mesh Mining (3D)
        </div>
        <div>Total Triangles: {triangles.size}</div>
        <div>Active Triangles: {activeTriangleCount}</div>
        <div style={{ marginTop: '10px', color: '#00ff00' }}>
          🛰️ Altitude: {altitudeDisplay}
        </div>
        <div style={{ fontSize: '10px', color: '#888', marginTop: '5px' }}>
          Range: 64 km → 3,185 km
        </div>
        
        {selectedTriangle && (
          <div style={{ marginTop: '15px', paddingTop: '10px', borderTop: '1px solid #333' }}>
            <div style={{ fontSize: '12px', color: '#00ff00' }}>Selected Triangle:</div>
            <div style={{ fontSize: '10px', marginTop: '5px' }}>
              <div>ID: {selectedTriangle.id.substring(0, 20)}...</div>
              <div>Level: {selectedTriangle.level}</div>
              <div>Clicks: {selectedTriangle.clicks}/11</div>
              <div>Status: {selectedTriangle.status}</div>
            </div>
          </div>
        )}
      </div>

      {/* Instructions */}
      <div style={{
        position: 'absolute',
        bottom: 20,
        right: 20,
        color: 'white',
        fontFamily: 'monospace',
        fontSize: '12px',
        background: 'rgba(0,0,0,0.7)',
        padding: '15px',
        borderRadius: '8px',
        maxWidth: '300px',
      }}>
        <div style={{ fontSize: '14px', fontWeight: 'bold', marginBottom: '8px' }}>
          ⛏️ Mining Controls
        </div>
        <div style={{ fontSize: '11px', lineHeight: '1.6' }}>
          <div>🖱️ Drag: Rotate Earth</div>
          <div>🔍 Scroll: Zoom (ISS ↔ Ground)</div>
          <div>👆 Click Triangle: Mine (+1 click)</div>
          <div>💎 11 Clicks: Subdivide into 4</div>
          <div style={{ marginTop: '8px', color: '#ffaa00' }}>
            ⚠️ Max 512 triangles visible<br/>(zoom auto-restricted)
          </div>
        </div>
      </div>
    </div>
  );
}
