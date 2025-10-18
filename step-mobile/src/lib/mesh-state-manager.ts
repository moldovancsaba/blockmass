/**
 * Mesh State Manager - Global Sync with Backend API
 * 
 * Purpose: Manage triangle click counts and subdivision state synchronized with global backend.
 * Provides a single source of truth for mesh state shared across all users.
 * 
 * Features:
 * - Fetch global mesh state from backend API on app startup
 * - Submit mining actions to backend (POST /mesh/mine)
 * - Cache in AsyncStorage for offline mode
 * - Periodic polling to sync with other users' mining
 * 
 * Storage Strategy:
 * - Backend (MongoDB) is authoritative source
 * - AsyncStorage as cache/fallback for offline
 * - Optimistic updates: apply locally immediately, sync with backend asynchronously
 * - All users see the same global state (not per-device)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  MeshTriangle,
  generateBaseIcosahedron,
  subdivideTriangle,
  getActiveTriangles,
} from './icosahedron-mesh';
import { Vector3 } from './icosahedron';
import { Platform } from 'react-native';

// Backend API configuration
const USE_LOCAL_DEV = false; // Set to true for local development
const PRODUCTION_API_URL = 'https://step-blockchain-api.onrender.com';
const isWeb = Platform.OS === 'web';
const MESH_API_BASE_URL = USE_LOCAL_DEV && __DEV__
  ? (isWeb ? 'http://localhost:5500' : 'http://192.168.100.146:5500')
  : PRODUCTION_API_URL;

// AsyncStorage key for mesh state persistence
const MESH_STATE_KEY = 'STEP_MESH_STATE';

// Current state version (for future migration compatibility)
const STATE_VERSION = '1.0.0';

/**
 * MeshState represents the complete persistent state of the mesh.
 * Serialized to JSON and stored in AsyncStorage.
 */
interface MeshState {
  version: string;              // State format version
  lastUpdated: string;          // ISO 8601 timestamp of last modification
  triangles: Record<string, SerializedTriangle>; // All triangles (including subdivided)
}

/**
 * SerializedTriangle is the JSON-serializable form of MeshTriangle.
 * Vertices stored as plain objects (not Vector3 class instances).
 */
interface SerializedTriangle {
  id: string;
  vertices: [[number, number, number], [number, number, number], [number, number, number]];
  baseColor: string;
  clicks: number;
  subdivided: boolean;
  children: string[];
  parent: string | null;
  level: number;
}

/**
 * Convert MeshTriangle to serializable format for storage.
 */
function serializeTriangle(triangle: MeshTriangle): SerializedTriangle {
  return {
    id: triangle.id,
    vertices: [
      [triangle.vertices[0].x, triangle.vertices[0].y, triangle.vertices[0].z],
      [triangle.vertices[1].x, triangle.vertices[1].y, triangle.vertices[1].z],
      [triangle.vertices[2].x, triangle.vertices[2].y, triangle.vertices[2].z],
    ],
    baseColor: triangle.baseColor,
    clicks: triangle.clicks,
    subdivided: triangle.subdivided,
    children: triangle.children,
    parent: triangle.parent,
    level: triangle.level,
  };
}

/**
 * Convert serialized triangle back to MeshTriangle format.
 */
function deserializeTriangle(serialized: SerializedTriangle): MeshTriangle {
  return {
    id: serialized.id,
    vertices: [
      { x: serialized.vertices[0][0], y: serialized.vertices[0][1], z: serialized.vertices[0][2] },
      { x: serialized.vertices[1][0], y: serialized.vertices[1][1], z: serialized.vertices[1][2] },
      { x: serialized.vertices[2][0], y: serialized.vertices[2][1], z: serialized.vertices[2][2] },
    ],
    baseColor: serialized.baseColor,
    clicks: serialized.clicks,
    subdivided: serialized.subdivided,
    children: serialized.children,
    parent: serialized.parent,
    level: serialized.level,
  };
}

/**
 * Repair and normalize mesh integrity in-place.
 * - Ensures subdivided parents have 4 children present (creates missing children deterministically)
 * - Ensures parent.children follows the "<parent>-0..3" pattern
 * - Ensures non-subdivided parents have empty children array
 */
function repairMeshIntegrity(triangles: Map<string, MeshTriangle>): Map<string, MeshTriangle> {
  let repaired = false;

  for (const parent of triangles.values()) {
    if (parent.subdivided) {
      // Expected child IDs
      const expectedIds = [0,1,2,3].map(i => `${parent.id}-${i}`);
      // If children list is missing or wrong, normalize it
      if (!parent.children || parent.children.length !== 4 || parent.children.some((id, i) => id !== expectedIds[i])) {
        parent.children = expectedIds;
        repaired = true;
      }
      // Create any missing child triangles
      const existingKids = expectedIds.filter(id => triangles.has(id));
      if (existingKids.length !== 4) {
        // Generate canonical children from parent's vertices
        const generated = subdivideTriangle({ ...parent });
        const byId: Record<string, MeshTriangle> = {};
        for (const c of generated) byId[c.id] = c;
        for (const cid of expectedIds) {
          if (!triangles.has(cid)) {
            const add = byId[cid];
            if (add) {
              triangles.set(cid, add);
              repaired = true;
            }
          }
        }
      }
    } else {
      if (parent.children && parent.children.length > 0) {
        parent.children = [];
        repaired = true;
      }
    }
  }

  if (repaired) {
    console.warn('[MeshStateManager] Integrity issues found and repaired');
  }
  return triangles;
}

/**
 * Initialize mesh: Fetch global state from backend API.
 * Falls back to AsyncStorage cache if API is unavailable.
 * 
 * @returns Map of all triangles (keyed by ID)
 */
export async function initializeMesh(): Promise<Map<string, MeshTriangle>> {
  try {
    // Try to fetch from backend API first
    console.log(`[MeshStateManager] Fetching global mesh state from ${MESH_API_BASE_URL}/mesh/state`);
    const response = await fetch(`${MESH_API_BASE_URL}/mesh/state`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (response.ok) {
      const data = await response.json();
      if (data.ok && data.result && data.result.triangles) {
        // Convert API response to Map format
        const trianglesMap = new Map<string, MeshTriangle>();
        for (const [id, tri] of Object.entries<any>(data.result.triangles)) {
          trianglesMap.set(id, {
            id: tri.id,
            vertices: [
              { x: tri.vertices[0][0], y: tri.vertices[0][1], z: tri.vertices[0][2] },
              { x: tri.vertices[1][0], y: tri.vertices[1][1], z: tri.vertices[1][2] },
              { x: tri.vertices[2][0], y: tri.vertices[2][1], z: tri.vertices[2][2] },
            ],
            baseColor: tri.baseColor,
            clicks: tri.clicks,
            subdivided: tri.subdivided,
            children: tri.children,
            parent: tri.parent,
            level: tri.level,
          });
        }

        console.log(`[MeshStateManager] Loaded global mesh from API: ${trianglesMap.size} triangles`);
        
        // Repair integrity if needed (handles missing children, inconsistent flags)
        const repaired = repairMeshIntegrity(trianglesMap);
        // Cache in AsyncStorage for offline mode
        await saveMeshState(repaired);
        
        return repaired;
      }
    }
    
    console.warn(`[MeshStateManager] API returned non-OK status: ${response.status}`);
  } catch (error) {
    console.warn('[MeshStateManager] Failed to fetch from API, falling back to cache:', error);
  }

  // Fallback: Try local cache
  try {
    const cached = await loadMeshState();
    if (cached) {
      console.log(`[MeshStateManager] Using cached mesh: ${cached.size} triangles`);
      const repaired = repairMeshIntegrity(cached);
      if (repaired !== cached) {
        console.warn('[MeshStateManager] Cached mesh was inconsistent; repaired.');
        await saveMeshState(repaired);
      }
      return repaired;
    }
  } catch (error) {
    console.warn('[MeshStateManager] Cache also failed:', error);
  }

  // Last resort: Create base icosahedron locally
  console.log('[MeshStateManager] Creating new base icosahedron (20 triangles)');
  const baseTriangles = generateBaseIcosahedron();
  const trianglesMap = new Map<string, MeshTriangle>();
  
  for (const triangle of baseTriangles) {
    trianglesMap.set(triangle.id, triangle);
  }

  await saveMeshState(trianglesMap);
  return trianglesMap;
}

/**
 * Save mesh state to AsyncStorage.
 * Called after every state change (click, subdivision).
 * 
 * @param triangles - Complete mesh state to save
 */
export async function saveMeshState(triangles: Map<string, MeshTriangle>): Promise<void> {
  try {
    const serializedTriangles: Record<string, SerializedTriangle> = {};
    
    for (const [id, triangle] of triangles.entries()) {
      serializedTriangles[id] = serializeTriangle(triangle);
    }

    const state: MeshState = {
      version: STATE_VERSION,
      lastUpdated: new Date().toISOString(),
      triangles: serializedTriangles,
    };

    await AsyncStorage.setItem(MESH_STATE_KEY, JSON.stringify(state));
    console.log(`[MeshStateManager] Saved mesh state: ${triangles.size} triangles`);
  } catch (error) {
    console.error('[MeshStateManager] Failed to save mesh state:', error);
    throw error;
  }
}

/**
 * Load mesh state from AsyncStorage.
 * 
 * @returns Map of triangles if found, null if no saved state
 */
export async function loadMeshState(): Promise<Map<string, MeshTriangle> | null> {
  try {
    const json = await AsyncStorage.getItem(MESH_STATE_KEY);
    if (!json) {
      return null;
    }

    const state: MeshState = JSON.parse(json);
    
    // Version check (for future migrations)
    if (state.version !== STATE_VERSION) {
      console.warn(`[MeshStateManager] State version mismatch: ${state.version} vs ${STATE_VERSION}`);
      // For now, reject old versions (could add migration logic here)
      return null;
    }

    const trianglesMap = new Map<string, MeshTriangle>();
    
    for (const [id, serialized] of Object.entries(state.triangles)) {
      trianglesMap.set(id, deserializeTriangle(serialized));
    }

    // Basic integrity validation: ensure 20 base IDs exist (ICO-0..ICO-19)
    const baseIdsMissing: string[] = [];
    for (let i = 0; i < 20; i++) {
      const id = `ICO-${i}`;
      if (!trianglesMap.has(id)) {
        baseIdsMissing.push(id);
      }
    }
    if (baseIdsMissing.length > 0) {
      console.warn('[MeshStateManager] Invalid mesh state detected. Missing base IDs:', baseIdsMissing.join(', '));
      return null; // Force re-init to clean state
    }

    return trianglesMap;
  } catch (error) {
    console.error('[MeshStateManager] Failed to load mesh state:', error);
    return null;
  }
}

/**
 * Increment click count for a triangle.
 * Submits mining action to backend API and updates local state optimistically.
 * 
 * @param triangleId - ID of triangle to click
 * @param triangles - Current mesh state
 * @returns Updated mesh state
 */
export async function incrementClicks(
  triangleId: string,
  triangles: Map<string, MeshTriangle>
): Promise<Map<string, MeshTriangle>> {
  const triangle = triangles.get(triangleId);
  
  if (!triangle) {
    console.warn(`[MeshStateManager] Triangle not found: ${triangleId}`);
    return triangles;
  }

  if (triangle.subdivided) {
    console.warn(`[MeshStateManager] Cannot click subdivided triangle: ${triangleId}`);
    return triangles;
  }

  // Optimistic update: apply locally immediately for instant feedback
  triangle.clicks += 1;
  console.log(`[MeshStateManager] Triangle ${triangleId}: ${triangle.clicks} clicks (optimistic)`);

  // Check if subdivision needed locally (changed from 10 to 2 clicks)
  // CRITICAL: Cap subdivisions at level 16 (~100m triangle edges)
  // Why: Level 16 = 6,700km / 2^16 ≈ 102 meters per edge
  // Level 17+ would be too small for practical mining interaction
  const MAX_SUBDIVISION_LEVEL = 16;
  
  if (triangle.clicks >= 2) {
    if (triangle.level >= MAX_SUBDIVISION_LEVEL) {
      console.log(`[MeshStateManager] Triangle ${triangleId} at max level ${triangle.level} - no further subdivision`);
      // Increment clicks but don't subdivide
    } else {
      console.log(`[MeshStateManager] Subdividing triangle ${triangleId} (level ${triangle.level}) into 4 children (optimistic)`);
      
      const children = subdivideTriangle(triangle);
      triangle.subdivided = true;
      triangle.children = children.map(c => c.id);
      
      for (const child of children) {
        triangles.set(child.id, child);
      }
      
      console.log(`[MeshStateManager] Created children: ${children.map(c => c.id).join(', ')}`);
    }
  }

  triangles.set(triangleId, triangle);
  await saveMeshState(triangles);

  // Submit to backend API asynchronously (don't block UI)
  try {
    console.log(`[MeshStateManager] Submitting mine to backend: ${triangleId}`);
    const response = await fetch(`${MESH_API_BASE_URL}/mesh/mine`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triangleId, clicks: 1 }),
    });

    if (!response.ok) {
      const errorData = await response.json();
      console.warn(`[MeshStateManager] Backend mine failed: ${errorData.error?.message || response.statusText}`);
      // Don't revert local changes - user still sees their action
      return triangles;
    }

    const data = await response.json();
    if (data.ok && data.result) {
      console.log(`[MeshStateManager] Backend confirmed: ${data.result.message}`);
      
      // If backend subdivided, sync children IDs
      if (data.result.subdivided && data.result.children) {
        triangle.children = data.result.children;
        triangles.set(triangleId, triangle);
      }
    }
  } catch (error) {
    console.warn('[MeshStateManager] Failed to sync with backend (offline?), keeping local change:', error);
    // Continue with local state - will sync when online
  }

  return triangles;
}

/**
 * Reset mesh to initial state (20 base triangles).
 * Clears AsyncStorage and returns fresh base icosahedron.
 * Useful for testing or user-requested reset.
 * 
 * @returns Fresh base icosahedron
 */
export async function resetMesh(): Promise<Map<string, MeshTriangle>> {
  console.log('[MeshStateManager] Resetting mesh to base icosahedron');
  
  // Clear storage
  await AsyncStorage.removeItem(MESH_STATE_KEY);
  
  // Create fresh base
  const baseTriangles = generateBaseIcosahedron();
  const trianglesMap = new Map<string, MeshTriangle>();
  
  for (const triangle of baseTriangles) {
    trianglesMap.set(triangle.id, triangle);
  }

  // Save new state
  await saveMeshState(trianglesMap);
  
  console.log('[MeshStateManager] Mesh reset complete: 20 base triangles');
  return trianglesMap;
}

/**
 * Get statistics about current mesh state.
 * Useful for displaying mesh info in UI.
 * 
 * @param triangles - Current mesh state
 * @returns Statistics object
 */
export function getMeshStats(triangles: Map<string, MeshTriangle>): {
  totalTriangles: number;
  activeTriangles: number;
  totalClicks: number;
  maxLevel: number;
} {
  const active = getActiveTriangles(triangles);
  
  let totalClicks = 0;
  let maxLevel = 0;
  
  for (const triangle of triangles.values()) {
    totalClicks += triangle.clicks;
    maxLevel = Math.max(maxLevel, triangle.level);
  }

  return {
    totalTriangles: triangles.size,
    activeTriangles: active.length,
    totalClicks,
    maxLevel,
  };
}
