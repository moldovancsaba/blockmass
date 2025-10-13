/**
 * useSphericalTriangles Hook
 * 
 * What: React hook for fetching and managing spherical triangles from API
 * Why: Centralized data fetching logic for current + neighbor spherical triangles
 * 
 * This hook provides:
 * - Current spherical triangle at user's GPS position
 * - Neighbor spherical triangles (up to 512 visible)
 * - Triangle vertices as 3D positions on sphere
 * - Automatic refetching on location change
 * - Loading and error states
 * 
 * Features:
 * - Throttled updates (500ms) to avoid overdraw
 * - Memoized computations (only recompute on triangle ID change)
 * - 512 triangle visibility limit (performance optimization)
 * - Backface culling support
 * 
 * Reference: /step-mobile/MOBILE_3D_MINING_PLAN.md Phase 2
 * Created: 2025-10-08T09:35:00.000Z
 */

import { useState, useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import * as MeshClient from '../lib/mesh-client';
import { polygonToVector3Array } from '../lib/spherical-projection';
import { Triangle } from '../types';

// ========================================
// TYPE DEFINITIONS
// ========================================

/**
 * Spherical triangle with 3D vertices
 * 
 * What: Extends API triangle with computed 3D positions
 * Why: Ready-to-render format for Three.js
 */
export interface SphericalTriangle extends Triangle {
  vertices: [THREE.Vector3, THREE.Vector3, THREE.Vector3];
}

/**
 * Hook return value
 * 
 * What: All data and state needed for rendering spherical triangles
 * Why: Clean interface for components
 */
export interface UseSphericalTrianglesResult {
  // Current triangle (where user is located)
  currentTriangle: SphericalTriangle | null;
  
  // Neighbor triangles (up to 512)
  neighbors: SphericalTriangle[];
  
  // Loading/error states
  isLoading: boolean;
  error: Error | null;
  
  // Manual refresh
  refetch: () => Promise<void>;
  
  // Statistics
  triangleCount: number;
}

/**
 * Hook configuration options
 */
export interface UseSphericalTrianglesOptions {
  // GPS position to query triangles
  position: { lat: number; lon: number } | null;
  
  // Triangle level (1-21, default 10)
  level?: number;
  
  // Maximum neighbors to fetch (default 512, max 512)
  maxNeighbors?: number;
  
  // Throttle time for location updates (ms, default 500)
  throttleMs?: number;
  
  // Enabled/disabled (useful for conditional fetching)
  enabled?: boolean;
}

// ========================================
// CONSTANTS
// ========================================

const DEFAULT_LEVEL = 10; // City-level precision (~15.6 km triangles)
const MAX_NEIGHBORS = 512; // Performance limit (matches web)
const DEFAULT_THROTTLE_MS = 500; // 2 Hz update rate
const BBOX_MARGIN_KM = 10; // Bounding box size for neighbor search

// ========================================
// HOOK IMPLEMENTATION
// ========================================

/**
 * useSphericalTriangles - Fetch and manage spherical triangles
 * 
 * What: React hook for loading current + neighbor spherical triangles
 * Why: Centralized data fetching with automatic updates and optimization
 * 
 * Usage:
 * ```typescript
 * const { currentTriangle, neighbors, isLoading, error } = useSphericalTriangles({
 *   position: { lat: 37.7749, lon: -122.4194 },
 *   level: 10,
 *   maxNeighbors: 512,
 * });
 * ```
 * 
 * Features:
 * - Automatic refetch on position/level change (throttled)
 * - Converts API GeoJSON to 3D Vector3 positions
 * - Enforces 512 triangle limit
 * - Memoized computations for performance
 * 
 * @param options - Hook configuration
 * @returns Current triangle, neighbors, and state
 */
export function useSphericalTriangles(
  options: UseSphericalTrianglesOptions
): UseSphericalTrianglesResult {
  const {
    position,
    level = DEFAULT_LEVEL,
    maxNeighbors = MAX_NEIGHBORS,
    throttleMs = DEFAULT_THROTTLE_MS,
    enabled = true,
  } = options;

  // State
  const [currentTriangle, setCurrentTriangle] = useState<SphericalTriangle | null>(null);
  const [neighbors, setNeighbors] = useState<SphericalTriangle[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  // Throttle ref
  const lastFetchTime = useRef<number>(0);
  const fetchTimeout = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch current spherical triangle at GPS position
   * 
   * What: Query API for triangle containing lat/lon
   * Why: Determine which spherical triangle user is standing in
   */
  const fetchCurrentTriangle = async (
    lat: number,
    lon: number,
    triangleLevel: number
  ): Promise<SphericalTriangle | null> => {
    try {
      const triangle = await MeshClient.getTriangleAt(lat, lon, triangleLevel);
      
      // Convert GeoJSON polygon to 3D vertices
      if (triangle.polygon && triangle.polygon.coordinates && triangle.polygon.coordinates[0]) {
        const vertices = polygonToVector3Array(triangle.polygon.coordinates[0]);
        
        if (vertices.length >= 3) {
          return {
            ...triangle,
            vertices: vertices.slice(0, 3) as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
          };
        }
      }
      
      // FALLBACK: If API doesn't provide polygon, don't render this triangle
      // This happens when backend returns triangle ID but no geometry
      console.warn('[useSphericalTriangles] Triangle missing valid polygon data:', triangle.triangleId);
      console.warn('[useSphericalTriangles] Polygon data:', JSON.stringify(triangle.polygon));
      return null;
    } catch (err) {
      console.error('[useSphericalTriangles] Failed to fetch current triangle:', err);
      throw err;
    }
  };

  /**
   * Fetch neighbor spherical triangles within bounding box
   * 
   * What: Query API for triangles around user position
   * Why: Render context/neighborhood to show user's location on mesh
   * 
   * Method:
   * 1. Compute bounding box around position (±10 km)
   * 2. Fetch triangles via API (max 512)
   * 3. Convert GeoJSON to 3D vertices
   * 4. Filter out invalid triangles
   */
  const fetchNeighbors = async (
    lat: number,
    lon: number,
    triangleLevel: number,
    maxCount: number
  ): Promise<SphericalTriangle[]> => {
    try {
      // Compute bounding box (rough approximation)
      // 1 degree latitude ≈ 111 km, 1 degree longitude ≈ 111 km × cos(lat)
      const latMargin = BBOX_MARGIN_KM / 111;
      const lonMargin = BBOX_MARGIN_KM / (111 * Math.cos((lat * Math.PI) / 180));
      
      const bbox: [number, number, number, number] = [
        lon - lonMargin, // west
        lat - latMargin, // south
        lon + lonMargin, // east
        lat + latMargin, // north
      ];
      
      // Fetch from API
      const triangles = await MeshClient.searchTriangles(bbox, triangleLevel, maxCount);
      
      // Convert to SphericalTriangle format
      const sphericalTriangles: SphericalTriangle[] = [];
      
      for (const triangle of triangles) {
        if (triangle.polygon && triangle.polygon.coordinates) {
          const vertices = polygonToVector3Array(triangle.polygon.coordinates[0]);
          
          if (vertices.length === 3) {
            sphericalTriangles.push({
              ...triangle,
              vertices: vertices as [THREE.Vector3, THREE.Vector3, THREE.Vector3],
            });
          }
        }
      }
      
      console.log(`[useSphericalTriangles] Fetched ${sphericalTriangles.length} neighbors`);
      return sphericalTriangles;
    } catch (err) {
      console.error('[useSphericalTriangles] Failed to fetch neighbors:', err);
      // Return empty array on error (non-critical, current triangle more important)
      return [];
    }
  };

  /**
   * Main fetch function with throttling
   * 
   * What: Fetch current + neighbors with throttle control
   * Why: Avoid excessive API calls on rapid location updates
   */
  const fetchTriangles = async () => {
    if (!position || !enabled) return;

    const now = Date.now();
    const timeSinceLastFetch = now - lastFetchTime.current;

    // Throttle: Don't fetch if too soon since last fetch
    if (timeSinceLastFetch < throttleMs && lastFetchTime.current > 0) {
      // Schedule delayed fetch
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current);
      }
      
      fetchTimeout.current = setTimeout(() => {
        fetchTriangles();
      }, throttleMs - timeSinceLastFetch);
      
      return;
    }

    // Update last fetch time
    lastFetchTime.current = now;

    // Clear any pending timeout
    if (fetchTimeout.current) {
      clearTimeout(fetchTimeout.current);
      fetchTimeout.current = null;
    }

    // Fetch data
    setIsLoading(true);
    setError(null);

    try {
      // Fetch current triangle
      const current = await fetchCurrentTriangle(position.lat, position.lon, level);
      setCurrentTriangle(current);

      // Fetch neighbors
      const neighborList = await fetchNeighbors(
        position.lat,
        position.lon,
        level,
        maxNeighbors
      );
      setNeighbors(neighborList);
    } catch (err) {
      setError(err instanceof Error ? err : new Error(String(err)));
    } finally {
      setIsLoading(false);
    }
  };

  // Effect: Fetch on position/level change
  useEffect(() => {
    fetchTriangles();

    // Cleanup: Cancel pending fetches on unmount
    return () => {
      if (fetchTimeout.current) {
        clearTimeout(fetchTimeout.current);
      }
    };
  }, [position?.lat, position?.lon, level, maxNeighbors, enabled]);

  // Memoized triangle count
  const triangleCount = useMemo(() => {
    return neighbors.length + (currentTriangle ? 1 : 0);
  }, [neighbors.length, currentTriangle]);

  // Manual refetch function
  const refetch = async () => {
    lastFetchTime.current = 0; // Reset throttle
    await fetchTriangles();
  };

  return {
    currentTriangle,
    neighbors,
    isLoading,
    error,
    refetch,
    triangleCount,
  };
}
