/**
 * STEP Mobile - Type Definitions
 * 
 * Core types for location proof, mesh triangles, wallet, and tokens.
 */

// Wallet types
export interface Wallet {
  address: string; // Ethereum-style address (0x...)
  publicKey: string; // Hex-encoded public key
  // Private key is NEVER stored here - kept in secure enclave
}

// Location proof types
export interface LocationProof {
  lat: number; // GPS latitude
  lon: number; // GPS longitude
  accuracy: number; // GPS accuracy in meters
  timestamp: number; // Unix timestamp (milliseconds)
  triangleId: string; // STEP-TRI-v1 identifier
  deviceId: string; // Unique device identifier
  signature: string; // Signed proof (hex)
}

// Triangle mesh types
export interface Triangle {
  triangleId: string; // STEP-TRI-v1 format
  level: number; // 1-21
  centroid: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  polygon?: {
    type: 'Polygon';
    coordinates: [number, number][][]; // GeoJSON polygon
  };
  status?: 'active' | 'partially_mined' | 'exhausted';
  remainingRewards?: number; // STEP tokens left
  clicks?: number; // Number of successful mines (0-10 before subdivision)
  state?: 'pending' | 'active' | 'partially_mined' | 'exhausted' | 'subdivided';
}

// Token types
export interface TokenBalance {
  address: string;
  balance: string; // Big number as string to avoid precision loss
  stakedBalance?: string;
}

export interface Transaction {
  txHash: string;
  from: string;
  to: string;
  amount: string; // Big number as string
  timestamp: number;
  status: 'pending' | 'confirmed' | 'failed';
  type: 'mine' | 'transfer' | 'stake';
}

// Mining types
export interface MiningAttempt {
  timestamp: number;
  triangleId: string;
  success: boolean;
  reward?: string; // STEP amount earned
  errorMessage?: string;
}

// API response types
export interface ApiResponse<T> {
  ok: boolean;
  result?: T;
  error?: string;
}

// Mesh API types
export interface TriangleAtResponse {
  triangleId: string;
  level: number;
  centroid: {
    type: 'Point';
    coordinates: [number, number];
  };
  polygon?: {
    type: 'Polygon';
    coordinates: [number, number][][];
  };
}

// Proof submission response
export interface ProofSubmissionResponse {
  success: boolean;
  reward?: string; // STEP tokens earned
  newBalance?: string;
  message?: string;
  triangleStatus?: 'active' | 'partially_mined' | 'exhausted';
}
