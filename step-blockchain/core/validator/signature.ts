/**
 * Signature Validation Module
 * 
 * Implements EIP-191 (Ethereum personal_sign) verification for location proofs.
 * 
 * Why EIP-191:
 * - Compatible with Ethereum wallets (MetaMask, WalletConnect, etc.)
 * - Prevents signature reuse across different contexts (prefix prevents raw tx signing)
 * - Standard message format ensures deterministic encoding
 * 
 * Replay Protection:
 * - Nonce: Client-generated UUID prevents replay attacks
 * - TriangleId: Binds proof to specific location
 * - Timestamp: Time-based expiry (5 minute window)
 * 
 * Security:
 * - Signature verification uses @noble/secp256k1 (audited, battle-tested)
 * - Address recovery prevents impersonation
 * - Case-insensitive address comparison (EIP-55 checksum optional)
 */

import * as secp from '@noble/secp256k1';
import { keccak_256 } from '@noble/hashes/sha3';

/**
 * Proof Payload Interface
 * 
 * This is the canonical data structure for location proofs.
 * All fields are required and order matters for signature verification.
 * 
 * Version: STEP-PROOF-v1
 * Future versions can add fields but must increment version string.
 */
export interface ProofPayload {
  version: 'STEP-PROOF-v1';
  account: string;        // 0x-prefixed Ethereum address (42 chars)
  triangleId: string;     // STEP-TRI-v1:... mesh addressing ID
  lat: number;            // WGS84 decimal latitude (-90 to 90)
  lon: number;            // WGS84 decimal longitude (-180 to 180)
  accuracy: number;       // GPS accuracy in meters (must be ≤50)
  timestamp: string;      // ISO 8601 UTC with milliseconds
  nonce: string;          // Client-generated UUID for replay protection
}

/**
 * Build canonical signable message from proof payload.
 * 
 * Message format (strict order, no whitespace):
 * STEP-PROOF-v1|account:{account}|triangle:{triangleId}|lat:{lat}|lon:{lon}|acc:{accuracy}|ts:{timestamp}|nonce:{nonce}
 * 
 * Why this format:
 * - Deterministic: Same payload always produces same message
 * - Unambiguous: Pipe separators prevent field confusion
 * - Labeled: Field names prevent positional errors
 * - Versioned: Can evolve without breaking old proofs
 * 
 * Example:
 * STEP-PROOF-v1|account:0x1234...|triangle:STEP-TRI-v1:...|lat:47.4979|lon:19.0402|acc:12.5|ts:2025-10-03T16:40:00.000Z|nonce:uuid-here
 * 
 * @param payload - Location proof payload
 * @returns Canonical message string
 */
export function buildSignableMessage(payload: ProofPayload): string {
  // Validate version
  if (payload.version !== 'STEP-PROOF-v1') {
    throw new Error(`Unsupported proof version: ${payload.version}`);
  }
  
  // Build message with strict field order
  const message = [
    payload.version,
    `account:${payload.account.toLowerCase()}`, // Normalize to lowercase for consistency
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
 * Hash message with EIP-191 prefix.
 * 
 * EIP-191 format:
 * keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
 * 
 * Why EIP-191:
 * - Prevents signatures from being valid Ethereum transactions
 * - Standard used by all major Ethereum wallets
 * - Prefix makes intent explicit (this is a signed message, not a tx)
 * 
 * @param message - Plain text message to hash
 * @returns 32-byte keccak256 hash
 */
export function hashMessageEip191(message: string): Uint8Array {
  // Convert message to bytes
  const messageBytes = new TextEncoder().encode(message);
  
  // Build EIP-191 prefix
  const prefix = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
  const prefixBytes = new TextEncoder().encode(prefix);
  
  // Concatenate prefix + message
  const prefixedMessage = new Uint8Array(prefixBytes.length + messageBytes.length);
  prefixedMessage.set(prefixBytes, 0);
  prefixedMessage.set(messageBytes, prefixBytes.length);
  
  // Hash with keccak256
  return keccak_256(prefixedMessage);
}

/**
 * Recover Ethereum address from signature.
 * 
 * Process:
 * 1. Parse signature (65 bytes: r, s, v)
 * 2. Recover public key using secp256k1
 * 3. Derive address: keccak256(publicKey)[12:] (last 20 bytes)
 * 
 * @param messageHash - 32-byte keccak256 hash of EIP-191 message
 * @param signatureHex - 130-char hex string (0x-prefixed or not)
 * @returns 0x-prefixed Ethereum address (42 chars, lowercase)
 */
export async function recoverAddressFromSig(
  messageHash: Uint8Array,
  signatureHex: string
): Promise<string> {
  // Remove 0x prefix if present
  const hex = signatureHex.startsWith('0x') ? signatureHex.slice(2) : signatureHex;
  
  // Validate signature length (65 bytes = 130 hex chars)
  if (hex.length !== 130) {
    throw new Error(
      `Invalid signature length: ${hex.length} chars. Expected 130 (65 bytes).`
    );
  }
  
  // Parse signature components
  const r = hex.slice(0, 64);
  const s = hex.slice(64, 128);
  const v = parseInt(hex.slice(128, 130), 16);
  
  // Normalize v to recovery ID (0 or 1)
  // Ethereum uses v = 27 or 28; recovery ID is v - 27
  const recoveryId = v >= 27 ? v - 27 : v;
  
  if (recoveryId !== 0 && recoveryId !== 1) {
    throw new Error(`Invalid recovery ID: ${recoveryId}. Must be 0 or 1.`);
  }
  
  // Combine r and s into 64-byte signature
  const signature = new Uint8Array(64);
  signature.set(hexToBytes(r), 0);
  signature.set(hexToBytes(s), 32);
  
  // Recover public key using v2 API
  // In v2, recoverPublicKey is actually Signature.fromCompact().recoverPublicKey()
  // But we can use the sync method Point.fromSignature
  let publicKey: Uint8Array;
  
  try {
    // v2 API: Create Signature from compact bytes, add recovery bit, then recover public key
    const sig = secp.Signature.fromCompact(signature).addRecoveryBit(recoveryId);
    const point = await sig.recoverPublicKey(messageHash);
    publicKey = point.toRawBytes(false); // false = uncompressed (65 bytes: 0x04 + x + y)
  } catch (e) {
    throw new Error(`Failed to recover public key: ${e instanceof Error ? e.message : String(e)}`);
  }
  
  // Derive address from public key
  // Address = last 20 bytes of keccak256(publicKey[1:])
  // Skip first byte (0x04 prefix for uncompressed keys)
  const publicKeyWithoutPrefix = publicKey.slice(1); // Remove 0x04 prefix
  const hash = keccak_256(publicKeyWithoutPrefix);
  const address = '0x' + bytesToHex(hash.slice(-20)); // Last 20 bytes
  
  return address.toLowerCase();
}

/**
 * Verify signature matches expected address.
 * 
 * Full verification flow:
 * 1. Build canonical message from payload
 * 2. Hash message with EIP-191 prefix
 * 3. Recover signer address from signature
 * 4. Compare recovered address with payload.account (case-insensitive)
 * 
 * Why case-insensitive:
 * - EIP-55 checksummed addresses use mixed case
 * - Users may submit lowercase, uppercase, or checksummed
 * - Underlying address is the same, only display format differs
 * 
 * @param payload - Location proof payload
 * @param signatureHex - 65-byte signature as hex string
 * @param expectedAddress - Expected signer address
 * @returns Verification result with recovered address or error
 */
export async function verifySignature(
  payload: ProofPayload,
  signatureHex: string,
  expectedAddress: string
): Promise<{
  ok: boolean;
  recoveredAddress?: string;
  error?: string;
}> {
  try {
    // Step 1: Build canonical message
    const message = buildSignableMessage(payload);
    
    // Step 2: Hash with EIP-191 prefix
    const messageHash = hashMessageEip191(message);
    
    // Step 3: Recover signer address
    const recoveredAddress = await recoverAddressFromSig(messageHash, signatureHex);
    
    // Step 4: Compare addresses (case-insensitive)
    const expectedLower = expectedAddress.toLowerCase();
    const recoveredLower = recoveredAddress.toLowerCase();
    
    if (expectedLower !== recoveredLower) {
      return {
        ok: false,
        recoveredAddress,
        error: `Address mismatch: expected ${expectedAddress}, recovered ${recoveredAddress}`,
      };
    }
    
    // Success
    return {
      ok: true,
      recoveredAddress,
    };
    
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Convert hex string to Uint8Array.
 * 
 * @param hex - Hex string (with or without 0x prefix)
 * @returns Byte array
 */
function hexToBytes(hex: string): Uint8Array {
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = new Uint8Array(cleanHex.length / 2);
  
  for (let i = 0; i < cleanHex.length; i += 2) {
    bytes[i / 2] = parseInt(cleanHex.slice(i, i + 2), 16);
  }
  
  return bytes;
}

/**
 * Convert Uint8Array to hex string.
 * 
 * @param bytes - Byte array
 * @returns Lowercase hex string (no 0x prefix)
 */
function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
}
