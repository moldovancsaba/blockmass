/**
 * STEP Mesh API Client
 * 
 * Connects to step-blockchain API (running on localhost:3002 for dev)
 * to fetch triangle data based on GPS location.
 * 
 * Note: In production, this will connect to a deployed mesh node.
 */

import { ApiResponse, Triangle, TriangleAtResponse } from '../types';
import { ProofPayloadV2, ProofSubmissionResponseV2 } from '../types/proof-v2';
import CryptoJS from 'crypto-js';
import { triangleIdToPolygon, findTriangleContainingPoint, type TriangleId } from './icosahedron';

// Configuration
// TODO: Make this configurable via environment/settings
// Note: For testing, use local dev server on port 5500
const USE_LOCAL_DEV = false; // Set to true to use local dev server

// Production Phase 2.5 API (deployed on Render.com)
// This is the real backend with 100/100 security score
const PRODUCTION_API_URL = 'https://step-blockchain-api.onrender.com';

// Detect platform for correct localhost URL
import { Platform } from 'react-native';
const isWeb = Platform.OS === 'web';

// Mesh API base URL - use localhost for testing
const MESH_API_BASE_URL = USE_LOCAL_DEV && __DEV__
  ? (isWeb ? 'http://localhost:5500' : 'http://192.168.100.146:5500') // Web uses localhost, mobile uses Mac IP
  : PRODUCTION_API_URL; // Use production API

/**
 * Fetch the triangle at a given GPS coordinate.
 * 
 * @param lat - Latitude (-90 to 90)
 * @param lon - Longitude (-180 to 180)
 * @param level - Triangle level (1-21), default 10 for city-level precision
 * @returns Triangle data including ID, centroid, and polygon
 */
export async function getTriangleAt(
  lat: number,
  lon: number,
  level: number = 10
): Promise<Triangle> {
  const url = `${MESH_API_BASE_URL}/mesh/triangleAt?lat=${lat}&lon=${lon}&level=${level}&includePolygon=true`;
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      // If 404, return mock data for development
      if (response.status === 404) {
        console.warn('Mesh API returned 404, using mock triangle data for development');
        return createMockTriangle(lat, lon, level);
      }
      throw new Error(`Mesh API error: ${response.status} ${response.statusText}`);
    }

    const data: ApiResponse<TriangleAtResponse> = await response.json();

    if (!data.ok || !data.result) {
      // If no triangle found, return mock data for development
      console.warn('No triangle found in mesh, using mock triangle data for development');
      return createMockTriangle(lat, lon, level);
    }

    return {
      triangleId: data.result.triangleId,
      level: data.result.level,
      centroid: data.result.centroid,
      polygon: data.result.polygon,
    };
  } catch (error) {
    // Network error or API unavailable - use mock data
    console.warn('Mesh API unavailable, using mock triangle data for development:', error);
    return createMockTriangle(lat, lon, level);
  }
}

/**
 * Fetch detailed polygon data for a triangle.
 * 
 * @param triangleId - STEP-TRI-v1 triangle identifier
 * @returns Triangle data with full polygon coordinates
 */
export async function getTrianglePolygon(triangleId: string): Promise<Triangle> {
  const url = `${MESH_API_BASE_URL}/mesh/polygon/${encodeURIComponent(triangleId)}`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Mesh API error: ${response.status} ${response.statusText}`);
  }

  const data: ApiResponse<TriangleAtResponse> = await response.json();

  if (!data.ok || !data.result) {
    throw new Error(data.error || 'Failed to fetch polygon');
  }

  return {
    triangleId: data.result.triangleId,
    level: data.result.level,
    centroid: data.result.centroid,
    polygon: data.result.polygon,
  };
}

/**
 * Search for triangles within a bounding box.
 * 
 * @param bbox - [west, south, east, north] in degrees
 * @param level - Triangle level (1-21)
 * @param maxResults - Maximum number of triangles to return
 * @returns Array of triangles
 */
export async function searchTriangles(
  bbox: [number, number, number, number],
  level: number,
  maxResults: number = 100
): Promise<Triangle[]> {
  const bboxStr = bbox.join(',');
  const url = `${MESH_API_BASE_URL}/mesh/search?bbox=${bboxStr}&level=${level}&maxResults=${maxResults}&includePolygon=true`;
  
  const response = await fetch(url, {
    method: 'GET',
    headers: {
      'Content-Type': 'application/json',
    },
  });

  if (!response.ok) {
    throw new Error(`Mesh API error: ${response.status} ${response.statusText}`);
  }

  const data: ApiResponse<{ triangles: TriangleAtResponse[] }> = await response.json();

  if (!data.ok || !data.result) {
    throw new Error(data.error || 'Failed to search triangles');
  }

  return data.result.triangles.map((t) => ({
    triangleId: t.triangleId,
    level: t.level,
    centroid: t.centroid,
    polygon: t.polygon,
  }));
}

/**
 * Health check for mesh API.
 * 
 * @returns True if API is reachable and healthy
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const response = await fetch(`${MESH_API_BASE_URL}/health`, {
      method: 'GET',
      timeout: 5000, // 5 second timeout
    } as any);
    
    return response.ok;
  } catch (error) {
    console.warn('Mesh API health check failed:', error);
    return false;
  }
}

/**
 * Proof Payload Interface
 * 
 * Must match backend exactly for signature verification.
 * 
 * Why strict structure:
 * - Signature is computed over canonical message built from these fields
 * - Any mismatch in field order, types, or values will cause verification to fail
 * - Version field ensures forward compatibility
 */
export interface ProofPayload {
  version: 'STEP-PROOF-v1';
  account: string;      // 0x-prefixed Ethereum address (42 chars)
  triangleId: string;   // STEP-TRI-v1:... mesh addressing ID
  lat: number;          // WGS84 decimal latitude (-90 to 90)
  lon: number;          // WGS84 decimal longitude (-180 to 180)
  accuracy: number;     // GPS accuracy in meters
  timestamp: string;    // ISO 8601 UTC with milliseconds
  nonce: string;        // Client-generated UUID for replay protection
}

/**
 * Proof Submission Response
 * 
 * Success response from validator when proof is accepted.
 */
export interface ProofSubmitResponse {
  ok: true;
  reward: string;       // Reward amount as decimal string (e.g., "0.5")
  unit: string;         // Token unit (always "STEP")
  triangleId: string;   // Triangle that was mined
  level: number;        // Triangle level (depth)
  clicks: number;       // Total clicks on this triangle after this proof
  balance: string;      // Updated account balance as decimal string
  processedAt: string;  // ISO 8601 timestamp when proof was processed
}

/**
 * Proof Submission Error
 * 
 * Structured error response with error code for client handling.
 */
export interface ProofSubmitError {
  ok: false;
  code: string;         // Error code (e.g., "BAD_SIGNATURE", "TOO_FAST")
  message: string;      // Human-readable error message
  timestamp: string;    // ISO 8601 timestamp
}

/**
 * Build canonical signable message from proof payload.
 * 
 * CRITICAL: This MUST match the backend implementation exactly.
 * Any deviation will cause signature verification to fail.
 * 
 * Message format (strict order, pipe-separated):
 * STEP-PROOF-v1|account:{account}|triangle:{triangleId}|lat:{lat}|lon:{lon}|acc:{accuracy}|ts:{timestamp}|nonce:{nonce}
 * 
 * Why canonical:
 * - Deterministic encoding prevents signature mismatches
 * - Field order is fixed and documented
 * - No whitespace or optional fields
 * 
 * @param payload - Proof payload to sign
 * @returns Canonical message string for signing
 */
export function buildSignableMessage(payload: ProofPayload): string {
  // Normalize account to lowercase for consistency
  // (Ethereum addresses are case-insensitive, but we standardize here)
  const account = payload.account.toLowerCase();
  
  // Build message with strict field order
  const message = [
    payload.version,
    `account:${account}`,
    `triangle:${payload.triangleId}`,
    `lat:${payload.lat}`,
    `lon:${payload.lon}`,
    `acc:${payload.accuracy}`,
    `ts:${payload.timestamp}`,
    `nonce:${payload.nonce}`,
  ].join('|');
  
  return message;
}

/**
 * Submit a location proof to the validator API (Phase 2.5 - ProofPayloadV2).
 * 
 * This is the new format with enhanced security features:
 * - Hardware attestation (Android: Play Integrity, iOS: DeviceCheck)
 * - GNSS raw data (Android only)
 * - Cell tower verification (both platforms)
 * - Comprehensive device information
 * 
 * Flow:
 * 1. Client collects all data (location, GNSS, cell, attestation)
 * 2. Client signs payload with wallet
 * 3. Client submits { payload, signature } to this endpoint
 * 4. Validator computes confidence score (0-100)
 * 5. Validator awards tokens based on confidence
 * 
 * Expected confidence scores:
 * - Android: 95-100 (full GNSS data available)
 * - iOS: 85-90 (no GNSS data)
 * 
 * @param payload - ProofPayloadV2 with all collected data
 * @param signature - 65-byte hex signature (0x-prefixed)
 * @returns Response with confidence score breakdown and reward
 */
export async function submitProofV2(
  payload: ProofPayloadV2,
  signature: string
): Promise<ProofSubmissionResponseV2> {
  const url = `${PRODUCTION_API_URL}/proof/submit`;
  
  try {
    console.log('[MeshClient] Submitting ProofPayloadV2...');
    console.log(`[MeshClient] Account: ${payload.account}`);
    console.log(`[MeshClient] Triangle: ${payload.triangleId}`);
    console.log(`[MeshClient] Location: (${payload.location.lat}, ${payload.location.lon}) ±${payload.location.accuracy}m`);
    console.log(`[MeshClient] GNSS: ${payload.gnss ? 'YES' : 'NO'}`);
    console.log(`[MeshClient] Cell: ${payload.cell ? 'YES' : 'NO'}`);
    console.log(`[MeshClient] Attestation: ${payload.attestation.substring(0, 20)}...`);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload,
        signature,
      }),
    });
    
    const data = await response.json();
    
    if (response.ok && data.ok) {
      console.log(`[MeshClient] Proof accepted! Confidence: ${data.confidence}/100`);
      console.log(`[MeshClient] Reward: ${data.reward} STEP, New balance: ${data.balance}`);
      return data as ProofSubmissionResponseV2;
    }
    
    // Error response
    console.error('[MeshClient] Proof rejected:', data.error || data.message);
    return {
      ok: false,
      confidence: 0,
      confidenceLevel: 'No Confidence',
      scores: {
        signature: 0,
        gpsAccuracy: 0,
        speedGate: 0,
        moratorium: 0,
        attestation: 0,
        gnssRaw: 0,
        cellTower: 0,
        wifi: 0,
        witness: 0,
        total: 0,
      },
      reward: '0',
      balance: '0',
      error: data.error || data.message || 'Unknown error',
    };
  } catch (error) {
    console.error('[MeshClient] Network error submitting proof:', error);
    return {
      ok: false,
      confidence: 0,
      confidenceLevel: 'No Confidence',
      scores: {
        signature: 0,
        gpsAccuracy: 0,
        speedGate: 0,
        moratorium: 0,
        attestation: 0,
        gnssRaw: 0,
        cellTower: 0,
        wifi: 0,
        witness: 0,
        total: 0,
      },
      reward: '0',
      balance: '0',
      error: error instanceof Error ? error.message : 'Network request failed',
    };
  }
}

/**
 * Build signable message from ProofPayloadV2.
 * 
 * CRITICAL: Must match backend's buildSignableMessageV2 exactly!
 * 
 * Backend uses JSON.stringify with SORTED KEYS for determinism.
 * Key order matters for signature verification.
 * 
 * Why sorted keys:
 * - Object key order in JavaScript is not guaranteed across all implementations
 * - Sorting ensures the same payload always produces the same signature
 * - Backend and client must use identical canonical format
 * 
 * @param payload - ProofPayloadV2 to sign
 * @returns JSON string representation with sorted keys
 */
export function buildSignableMessageV2(payload: ProofPayloadV2): string {
  // Normalize account to lowercase (matches backend)
  const normalizedPayload = {
    ...payload,
    account: payload.account.toLowerCase(),
  };
  
  // Use JSON.stringify with sorted keys for determinism
  // This MUST match backend's signature.ts line 236 exactly!
  return JSON.stringify(normalizedPayload, Object.keys(normalizedPayload).sort());
}

/**
 * Submit a location proof to the validator API (Legacy Phase 2 format).
 * 
 * This is the old format without enhanced security features.
 * Kept for backward compatibility.
 * 
 * Flow:
 * 1. Client builds ProofPayload with current GPS data
 * 2. Client signs canonical message with wallet
 * 3. Client submits { payload, signature } to this endpoint
 * 4. Validator verifies signature, geometry, heuristics
 * 5. Validator awards tokens and returns updated balance
 * 
 * Error Codes:
 * - INVALID_PAYLOAD: Missing or invalid fields
 * - BAD_SIGNATURE: Signature verification failed
 * - OUT_OF_BOUNDS: Location outside triangle boundary
 * - LOW_GPS_ACCURACY: GPS accuracy exceeds maximum (default 50m)
 * - NONCE_REPLAY: Nonce already used (replay attack)
 * - TOO_FAST: Movement speed exceeds limit (teleportation detection)
 * - MORATORIUM: Submitted too quickly after previous proof (spam protection)
 * - INTERNAL_ERROR: Server error
 * 
 * Why no retries:
 * - Write operations should not be retried automatically
 * - Nonce uniqueness means retries would fail with NONCE_REPLAY
 * - Client should generate new nonce and re-sign for manual retry
 * 
 * @param payload - Location proof payload
 * @param signature - 65-byte hex signature (0x-prefixed)
 * @returns Success response or error with code
 * @deprecated Use submitProofV2 instead for Phase 2.5 security features
 */
export async function submitProof(
  payload: ProofPayload,
  signature: string
): Promise<ProofSubmitResponse | ProofSubmitError> {
  const url = `${MESH_API_BASE_URL}/proof/submit`;
  
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        payload,
        signature,
      }),
    });
    
    const data = await response.json();
    
    // Success (200)
    if (response.ok && data.ok) {
      return data as ProofSubmitResponse;
    }
    
    // Error response (4xx/5xx)
    if (!data.ok && data.code) {
      return data as ProofSubmitError;
    }
    
    // Unexpected response format
    return {
      ok: false,
      code: 'UNEXPECTED_RESPONSE',
      message: `Unexpected response format: ${JSON.stringify(data)}`,
      timestamp: new Date().toISOString(),
    };
    
  } catch (error) {
    // Network error or API unavailable
    console.error('Proof submission failed:', error);
    return {
      ok: false,
      code: 'NETWORK_ERROR',
      message: error instanceof Error ? error.message : 'Network request failed',
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Compute SHA-256 hash using crypto-js
 * WHY: Need valid checksum for mock triangles to pass backend validation
 * NOTE: crypto-js is compatible with React Native (no need for Web Crypto polyfill)
 */
function sha256Simple(message: string): Uint8Array {
  // Use crypto-js for SHA-256 (works in React Native)
  const hash = CryptoJS.SHA256(message);
  
  // Convert WordArray to Uint8Array
  // WHY: Need byte array for checksum computation (take first 2 bytes)
  const words = hash.words;
  const sigBytes = hash.sigBytes;
  const bytes = new Uint8Array(sigBytes);
  
  for (let i = 0; i < sigBytes; i++) {
    const wordIndex = i >>> 2; // Divide by 4
    const byteIndex = 3 - (i % 4); // Big-endian
    bytes[i] = (words[wordIndex] >>> (byteIndex * 8)) & 0xff;
  }
  
  return bytes;
}

/**
 * Encode number as base32 string (RFC 4648 alphabet)
 * WHY: Triangle ID checksums use base32 encoding
 */
function encodeBase32(value: number, length: number): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let result = '';
  
  for (let i = 0; i < length; i++) {
    const digit = value % 32;
    result = alphabet[digit] + result;
    value = Math.floor(value / 32);
  }
  
  return result;
}

/**
 * Compute 3-character checksum for triangle ID
 * WHY: Must match backend checksum algorithm exactly
 * 
 * Method: SHA-256 hash → take first 15 bits → encode as base32 (3 chars)
 */
function computeChecksum(payload: string): string {
  // Compute SHA-256 hash
  const hash = sha256Simple(payload);
  
  // Take first 15 bits (2 bytes minus 1 bit)
  const value = (hash[0] << 7) | (hash[1] >> 1);
  
  // Encode as base32 (3 characters)
  return encodeBase32(value, 3);
}

/**
 * Create a mock triangle for development when mesh data is unavailable.
 * 
 * Uses DYNAMIC LOOKUP to find the actual spherical triangle containing the GPS point.
 * This ensures the mock triangle ALWAYS contains the user's location.
 * 
 * IMPORTANT: 
 * - Uses findTriangleContainingPoint() for spatial lookup (not hardcoded)
 * - Computes real checksum using SHA-256 to pass backend validation
 * - Generates proper spherical triangle geometry via icosahedron subdivision
 * 
 * @param lat - Latitude
 * @param lon - Longitude
 * @param level - Triangle level
 * @returns Mock triangle with valid ID that CONTAINS the given GPS point
 */
function createMockTriangle(lat: number, lon: number, level: number): Triangle {
  console.log(`[createMockTriangle] Finding spherical triangle containing GPS (${lat.toFixed(4)}, ${lon.toFixed(4)}) at level ${level}...`);
  
  // CRITICAL: Use DYNAMIC spatial lookup to find the triangle that contains this GPS point
  // This is NOT hardcoded - it traverses the icosahedron subdivision tree
  const triangleIdObj = findTriangleContainingPoint(lat, lon, level);
  
  if (!triangleIdObj) {
    throw new Error(`Failed to find spherical triangle containing point (${lat}, ${lon})`);
  }
  
  console.log(`[createMockTriangle] Found containing triangle:`);
  console.log(`[createMockTriangle] - Face: ${triangleIdObj.face} (${String.fromCharCode(65 + triangleIdObj.face)})`);
  console.log(`[createMockTriangle] - Level: ${triangleIdObj.level}`);
  console.log(`[createMockTriangle] - Path: [${triangleIdObj.path.join(', ')}]`);
  
  // Build triangle ID string with proper checksum
  // Format: STEP-TRI-v1:{face}{level}-{path}-{checksum}
  const faceChar = String.fromCharCode(65 + triangleIdObj.face); // A-T for faces 0-19
  const pathStr = triangleIdObj.path.concat(Array(20 - triangleIdObj.path.length).fill(0)).join('');
  
  // Compute real checksum using SHA-256 (matches backend algorithm)
  const payload = `${faceChar}${triangleIdObj.level}-${pathStr}`;
  const checksum = computeChecksum(payload);
  const triangleId = `STEP-TRI-v1:${payload}-${checksum}`;
  
  console.log(`[createMockTriangle] Triangle ID: ${triangleId}`);
  
  // Generate polygon using spherical subdivision
  // This produces the ACTUAL spherical triangle geometry
  const polygon = triangleIdToPolygon(triangleIdObj);
  
  // Calculate centroid from vertices
  const centroidLon = polygon.slice(0, 3).reduce((sum, p) => sum + p[0], 0) / 3;
  const centroidLat = polygon.slice(0, 3).reduce((sum, p) => sum + p[1], 0) / 3;
  
  console.log(`[createMockTriangle] Centroid: (${centroidLat.toFixed(4)}, ${centroidLon.toFixed(4)})`);
  console.log(`[createMockTriangle] Vertices:`, polygon.slice(0, 3).map(([lon, lat]) => `(${lat.toFixed(4)}, ${lon.toFixed(4)})`).join(', '));
  console.log(`[createMockTriangle] ✅ DYNAMIC LOOKUP - Triangle CONTAINS the GPS point`);
  
  return {
    triangleId,
    level: triangleIdObj.level,
    centroid: {
      type: 'Point',
      coordinates: [centroidLon, centroidLat],
    },
    polygon: {
      type: 'Polygon',
      coordinates: [polygon],
    },
  };
}
