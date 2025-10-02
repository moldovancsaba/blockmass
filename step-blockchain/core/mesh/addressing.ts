/**
 * STEP-TRI-v1 Triangle Addressing Scheme
 * 
 * Globally unique identifier for each of 2.8 trillion triangles.
 * 
 * Format: face + level + path
 * - face: 0-19 (which of 20 icosahedron faces)
 * - level: 1-21 (subdivision depth)
 * - path: quaternary digits (2 bits per level, 0-3 for each subdivision choice)
 * 
 * Example triangle ID at level 5:
 * - face=7, level=5, path=[0,1,3,2] (chose child 0, then 1, then 3, then 2)
 * - Encoded as: STEP-TRI-v1:G5-01320000000000000000-ABC (base32 with checksum)
 * 
 * Why this design:
 * - Deterministic: same triangle always has same ID
 * - Hierarchical: can extract parent triangle from child ID
 * - Compact: fits in 64 chars with checksum
 * - Future-proof: version prefix allows upgrades
 */

import { sha256 } from '@noble/hashes/sha256';

/**
 * TriangleId represents a unique triangle in the STEP mesh.
 * 
 * Components:
 * - face: Which of 20 icosahedron faces (0-19)
 * - level: Subdivision depth (1-21)
 * - path: Array of child choices at each subdivision step
 *   - Level 1: path is empty (base icosahedron face)
 *   - Level 2: path has 1 digit (e.g., [2] means "3rd child of face 7")
 *   - Level 3: path has 2 digits (e.g., [2,0] means "3rd child, then 1st child")
 *   - Level N: path has N-1 digits
 * 
 * Each path digit is 0-3 (which of 4 children).
 */
export interface TriangleId {
  face: number;    // 0-19
  level: number;   // 1-21
  path: number[];  // Array of 0-3, length = level - 1
}

/**
 * Encode TriangleId to STEP-TRI-v1 string format.
 * 
 * Format: STEP-TRI-v1:{face}{level}-{path}-{checksum}
 * 
 * Examples:
 * - Level 1, face 0: "STEP-TRI-v1:A1-00000000000000000000-XYZ"
 * - Level 5, face 7, path [0,1,3,2]: "STEP-TRI-v1:H5-01320000000000000000-ABC"
 * 
 * @param id - TriangleId to encode
 * @returns String representation with checksum
 */
export function encodeTriangleId(id: TriangleId): string {
  // Validate inputs
  if (id.face < 0 || id.face > 19) {
    throw new Error(`Invalid face: ${id.face}. Must be 0-19.`);
  }
  if (id.level < 1 || id.level > 21) {
    throw new Error(`Invalid level: ${id.level}. Must be 1-21.`);
  }
  if (id.path.length !== id.level - 1) {
    throw new Error(
      `Path length mismatch: level=${id.level} requires path length=${id.level - 1}, got ${id.path.length}`
    );
  }
  for (const digit of id.path) {
    if (digit < 0 || digit > 3) {
      throw new Error(`Invalid path digit: ${digit}. Must be 0-3.`);
    }
  }

  // Encode face as base32 letter (A=0, B=1, ..., T=19)
  const faceChar = String.fromCharCode(65 + id.face); // 'A' + face

  // Encode level as decimal (1-21)
  const levelStr = id.level.toString();

  // Encode path as zero-padded quaternary string (20 digits max)
  // Level 21 needs 20 path digits, so always pad to 20
  const pathStr = id.path
    .concat(Array(20 - id.path.length).fill(0)) // Pad with zeros
    .join('');

  // Compute checksum (first 3 chars of base32-encoded SHA-256)
  const payload = `${faceChar}${levelStr}-${pathStr}`;
  const checksum = computeChecksum(payload);

  return `STEP-TRI-v1:${payload}-${checksum}`;
}

/**
 * Decode STEP-TRI-v1 string to TriangleId.
 * 
 * @param encoded - String in STEP-TRI-v1 format
 * @returns Decoded TriangleId
 * @throws Error if format invalid or checksum fails
 */
export function decodeTriangleId(encoded: string): TriangleId {
  // Check prefix
  if (!encoded.startsWith('STEP-TRI-v1:')) {
    throw new Error(`Invalid triangle ID format: missing STEP-TRI-v1 prefix`);
  }

  // Remove prefix
  const parts = encoded.slice('STEP-TRI-v1:'.length).split('-');
  if (parts.length !== 3) {
    throw new Error(`Invalid triangle ID format: expected 3 dash-separated parts`);
  }

  const [faceLevel, pathStr, providedChecksum] = parts;

  // Verify checksum
  const payload = `${faceLevel}-${pathStr}`;
  const computedChecksum = computeChecksum(payload);
  if (computedChecksum !== providedChecksum) {
    throw new Error(
      `Checksum mismatch: expected ${computedChecksum}, got ${providedChecksum}`
    );
  }

  // Decode face (first char)
  const faceChar = faceLevel[0];
  const face = faceChar.charCodeAt(0) - 65; // 'A' = 0
  if (face < 0 || face > 19) {
    throw new Error(`Invalid face character: ${faceChar}`);
  }

  // Decode level (remaining chars)
  const level = parseInt(faceLevel.slice(1), 10);
  if (isNaN(level) || level < 1 || level > 21) {
    throw new Error(`Invalid level: ${faceLevel.slice(1)}`);
  }

  // Decode path (remove trailing zeros)
  const pathDigits = pathStr.split('').map((c) => parseInt(c, 10));
  const path = pathDigits.slice(0, level - 1); // Only take meaningful digits

  return { face, level, path };
}

/**
 * Compute 3-character checksum for triangle ID.
 * 
 * Method: SHA-256 hash → take first 15 bits → encode as base32 (3 chars).
 * 
 * Why 3 characters:
 * - 3 base32 chars = 15 bits = 32,768 possible values
 * - Collision probability: ~0.003% for random errors
 * - Sufficient for typo detection
 * 
 * @param payload - String to checksum (format: "{face}{level}-{path}")
 * @returns 3-character base32 checksum
 */
function computeChecksum(payload: string): string {
  // Compute SHA-256 hash
  const hash = sha256(new TextEncoder().encode(payload));

  // Take first 15 bits (2 bytes minus 1 bit)
  const value = (hash[0] << 7) | (hash[1] >> 1);

  // Encode as base32 (3 characters)
  return encodeBase32(value, 3);
}

/**
 * Encode number as base32 string (uppercase A-Z, 2-7).
 * 
 * Base32 alphabet: A-Z (26) + 2-7 (6) = 32 characters.
 * Standard: RFC 4648 without padding.
 * 
 * @param value - Number to encode
 * @param length - Desired string length (zero-padded)
 * @returns Base32 string
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
 * Get the parent triangle ID (one level up).
 * 
 * Example:
 * - Child: face=7, level=5, path=[0,1,3,2]
 * - Parent: face=7, level=4, path=[0,1,3]
 * 
 * @param id - Child triangle ID
 * @returns Parent triangle ID
 * @throws Error if already at level 1 (no parent)
 */
export function getParentId(id: TriangleId): TriangleId {
  if (id.level === 1) {
    throw new Error('Level 1 triangles have no parent');
  }

  return {
    face: id.face,
    level: id.level - 1,
    path: id.path.slice(0, -1), // Remove last path digit
  };
}

/**
 * Get the 4 child triangle IDs (one level down).
 * 
 * Example:
 * - Parent: face=7, level=4, path=[0,1,3]
 * - Children:
 *   - Child 0: face=7, level=5, path=[0,1,3,0]
 *   - Child 1: face=7, level=5, path=[0,1,3,1]
 *   - Child 2: face=7, level=5, path=[0,1,3,2]
 *   - Child 3: face=7, level=5, path=[0,1,3,3]
 * 
 * @param id - Parent triangle ID
 * @returns Array of 4 child triangle IDs
 * @throws Error if already at level 21 (max depth)
 */
export function getChildrenIds(id: TriangleId): [TriangleId, TriangleId, TriangleId, TriangleId] {
  if (id.level === 21) {
    throw new Error('Level 21 triangles cannot subdivide (max depth)');
  }

  return [
    { face: id.face, level: id.level + 1, path: [...id.path, 0] },
    { face: id.face, level: id.level + 1, path: [...id.path, 1] },
    { face: id.face, level: id.level + 1, path: [...id.path, 2] },
    { face: id.face, level: id.level + 1, path: [...id.path, 3] },
  ];
}

/**
 * Check if two triangle IDs are equal.
 * 
 * @param a - First triangle ID
 * @param b - Second triangle ID
 * @returns True if same triangle
 */
export function triangleIdEquals(a: TriangleId, b: TriangleId): boolean {
  if (a.face !== b.face || a.level !== b.level) {
    return false;
  }
  if (a.path.length !== b.path.length) {
    return false;
  }
  for (let i = 0; i < a.path.length; i++) {
    if (a.path[i] !== b.path[i]) {
      return false;
    }
  }
  return true;
}

/**
 * Create a level 1 triangle ID (base icosahedron face).
 * 
 * @param face - Face index (0-19)
 * @returns Triangle ID at level 1
 */
export function createLevel1Id(face: number): TriangleId {
  return { face, level: 1, path: [] };
}

/**
 * Encode path array as BigInt for efficient storage/comparison.
 * 
 * Each path digit is 2 bits (0-3), so 20 digits = 40 bits max.
 * 
 * Example: path=[0,1,3,2] → 0b00011110 = 30
 * 
 * @param path - Array of 0-3 digits
 * @returns BigInt encoding
 */
export function pathToBigInt(path: number[]): bigint {
  let result = 0n;
  for (const digit of path) {
    result = (result << 2n) | BigInt(digit);
  }
  return result;
}

/**
 * Decode BigInt back to path array.
 * 
 * @param encoded - BigInt encoding
 * @param length - Number of path digits
 * @returns Array of 0-3 digits
 */
export function bigIntToPath(encoded: bigint, length: number): number[] {
  const path: number[] = [];
  for (let i = 0; i < length; i++) {
    const digit = Number(encoded & 3n); // Extract last 2 bits
    path.unshift(digit); // Prepend (reverse order)
    encoded = encoded >> 2n; // Shift right 2 bits
  }
  return path;
}

/**
 * Count total number of triangles at a given level.
 * 
 * Formula: 20 × 4^(level - 1)
 * 
 * Examples:
 * - Level 1: 20 triangles
 * - Level 2: 80 triangles (20 × 4)
 * - Level 10: 5,242,880 triangles
 * - Level 21: 21,990,232,555,520 triangles (2.1 trillion)
 * 
 * @param level - Subdivision level (1-21)
 * @returns Total triangle count at that level
 */
export function triangleCountAtLevel(level: number): bigint {
  if (level < 1 || level > 21) {
    throw new Error(`Invalid level: ${level}. Must be 1-21.`);
  }
  return BigInt(20) * (4n ** BigInt(level - 1));
}

/**
 * Estimate side length of triangles at a given level.
 * 
 * Earth circumference ≈ 40,000 km.
 * Icosahedron mesh at equator is ~5 triangles wide.
 * 
 * Formula: 8000 km / 2^(level - 1)
 * 
 * Examples:
 * - Level 1: ~8000 km
 * - Level 5: ~500 km
 * - Level 10: ~15.6 km
 * - Level 17: ~115 m
 * - Level 21: ~7.2 m
 * 
 * @param level - Subdivision level (1-21)
 * @returns Approximate side length in meters
 */
export function estimateSideLength(level: number): number {
  if (level < 1 || level > 21) {
    throw new Error(`Invalid level: ${level}. Must be 1-21.`);
  }
  const baseLength = 8_000_000; // 8000 km in meters
  return baseLength / Math.pow(2, level - 1);
}
