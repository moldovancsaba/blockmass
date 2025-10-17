/**
 * useActiveTriangles Hook
 * 
 * Fetches all active spherical triangles at the current mining level with their click counts.
 * This enables visualization of the entire icosahedron mesh showing mining progress.
 * 
 * Why this exists:
 * - Mobile app needs to render all mined triangles with color gradients based on clicks (0-10)
 * - Backend /mesh/active endpoint returns MongoDB state with click counts
 * - Hook manages fetching, caching, and refreshing of active triangle data
 * 
 * Usage:
 * ```tsx
 * const { triangles, loading, error, refetch } = useActiveTriangles(10);
 * ```
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { Triangle } from '../types';
import { Platform } from 'react-native';

// Configuration
// Use same logic as mesh-client.ts for consistent API targeting
const USE_LOCAL_DEV = true;
const PRODUCTION_API_URL = 'https://step-blockchain-api.onrender.com';
const isWeb = Platform.OS === 'web';
const API_BASE_URL = USE_LOCAL_DEV && __DEV__
  ? (isWeb ? 'http://localhost:5500' : 'http://192.168.100.144:5500')
  : PRODUCTION_API_URL;

interface UseActiveTrianglesResult {
  triangles: Triangle[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

/**
 * Hook to fetch active spherical triangles at a given level with click counts.
 * 
 * @param level - Subdivision level (1-21), typically 10 for mining
 * @param maxResults - Maximum triangles to fetch (default 256, reduced from 512 for performance)
 * @param includePolygon - Whether to fetch full polygon geometry (default true for 3D rendering)
 * @param autoRefresh - Auto-refresh interval in milliseconds (0 = disabled)
 * @returns Active triangles with loading/error state and refetch function
 */
export function useActiveTriangles(
  level: number,
  maxResults: number = 256, // Hard performance limit: maximum visible triangles (reduced from 512)
  includePolygon: boolean = true,
  autoRefresh: number = 0 // 0 = no auto-refresh, 30000 = refresh every 30s
): UseActiveTrianglesResult {
  const [triangles, setTriangles] = useState<Triangle[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  
  // Track mount state to prevent state updates after unmount
  const isMountedRef = useRef(true);
  const refreshTimerRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Fetch active triangles from backend API.
   * 
   * Why this logic:
   * - Calls new /mesh/active endpoint that queries MongoDB for triangles with clicks > 0
   * - Returns only mined triangles (not all 20,480 at level 10) for efficient rendering
   * - Includes polygon geometry for 3D mesh rendering on sphere
   * - Limited to 256 triangles for performance (reduced from 512)
   */
  const fetchActiveTriangles = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const url = new URL(`${API_BASE_URL}/mesh/active`);
      url.searchParams.append('level', level.toString());
      url.searchParams.append('maxResults', maxResults.toString());
      url.searchParams.append('includePolygon', includePolygon.toString());

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error?.message || `HTTP ${response.status}: ${response.statusText}`
        );
      }

      const data = await response.json();

      if (!data.ok || !data.result) {
        throw new Error(data.error?.message || 'Invalid response format');
      }

      // Map backend response to Triangle type
      const fetchedTriangles: Triangle[] = data.result.triangles.map((t: any) => ({
        triangleId: t.triangleId,
        level,
        centroid: t.centroid,
        polygon: t.polygon,
        clicks: t.clicks || 0,
        state: t.state || 'active',
      }));

      if (isMountedRef.current) {
        setTriangles(fetchedTriangles);
        setLoading(false);
      }
    } catch (err: any) {
      console.error('useActiveTriangles: Fetch failed', err);
      if (isMountedRef.current) {
        setError(err.message || 'Failed to fetch active triangles');
        setLoading(false);
      }
    }
  }, [level, maxResults, includePolygon]);

  /**
   * Manual refetch function exposed to caller.
   * Useful for refreshing after mining completes.
   */
  const refetch = useCallback(() => {
    fetchActiveTriangles();
  }, [fetchActiveTriangles]);

  /**
   * Effect: Initial fetch on mount or when level changes.
   */
  useEffect(() => {
    isMountedRef.current = true;
    fetchActiveTriangles();

    return () => {
      isMountedRef.current = false;
    };
  }, [fetchActiveTriangles]);

  /**
   * Effect: Auto-refresh timer if enabled.
   * Why this exists:
   * - Mining is a shared activity - other users may mine triangles
   * - Auto-refresh keeps visualization up-to-date showing global mining progress
   * - Disabled by default to save battery/bandwidth
   */
  useEffect(() => {
    if (autoRefresh > 0) {
      refreshTimerRef.current = setInterval(() => {
        fetchActiveTriangles();
      }, autoRefresh);
    }

    return () => {
      if (refreshTimerRef.current) {
        clearInterval(refreshTimerRef.current);
      }
    };
  }, [autoRefresh, fetchActiveTriangles]);

  return {
    triangles,
    loading,
    error,
    refetch,
  };
}
