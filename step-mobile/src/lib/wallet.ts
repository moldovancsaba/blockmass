/**
 * STEP Wallet Library
 * 
 * Handles wallet creation, key management, and cryptographic signatures.
 * Uses @noble/secp256k1 v2 for Ethereum-compatible keys and signatures.
 * Private keys are stored in device secure storage (Keychain/Keystore).
 * 
 * Note: Uses v2 API with HMAC-SHA256 (configured in index.ts) instead of
 * v3 which requires full crypto.subtle Web Crypto API not available in RN.
 */

import * as secp from '@noble/secp256k1';
import * as Crypto from 'expo-crypto';
import * as SecureStore from './storage'; // Cross-platform storage
import { keccak256 } from 'js-sha3';
import { Wallet } from '../types';

// Secure storage keys
const PRIVATE_KEY_STORAGE_KEY = 'step_wallet_private_key';
const PUBLIC_KEY_STORAGE_KEY = 'step_wallet_public_key';
const ADDRESS_STORAGE_KEY = 'step_wallet_address';

/**
 * Generate a new wallet with random private key.
 * 
 * Flow:
 * 1. Generate random 32-byte private key
 * 2. Derive public key from private key (secp256k1)
 * 3. Compute Ethereum-style address from public key (keccak256 hash)
 * 4. Store private key in secure enclave
 * 5. Return wallet info (address + public key)
 * 
 * @returns New wallet with address and public key
 */
export async function generateWallet(): Promise<Wallet> {
  // Generate random private key (32 bytes) using expo-crypto
  // @noble/secp256k1 v2 also removed utils.randomPrivateKey()
  const randomBytes = await Crypto.getRandomBytesAsync(32);
  const privateKeyBytes = new Uint8Array(randomBytes);
  const privateKeyHex = Buffer.from(privateKeyBytes).toString('hex');
  
  // Derive public key (uncompressed format, 65 bytes)
  // v2 API: await is required for getPublicKey
  const publicKeyBytes = await secp.getPublicKey(privateKeyBytes, false);
  const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');
  
  // Compute Ethereum-style address from public key
  // Address = last 20 bytes of keccak256(public_key[1:])
  // (skip first byte which is 0x04 prefix for uncompressed keys)
  const publicKeyForHash = publicKeyBytes.slice(1); // Remove 0x04 prefix
  const hashHex = keccak256(publicKeyForHash); // Returns hex string
  const address = '0x' + hashHex.slice(-40); // Last 20 bytes (40 hex chars)
  
  // Store in secure enclave
  await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privateKeyHex);
  await SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, publicKeyHex);
  await SecureStore.setItemAsync(ADDRESS_STORAGE_KEY, address);
  
  console.log(`Generated new wallet: ${address}`);
  
  return {
    address,
    publicKey: publicKeyHex,
  };
}

/**
 * Load existing wallet from secure storage.
 * 
 * @returns Wallet info, or null if no wallet exists
 */
export async function loadWallet(): Promise<Wallet | null> {
  const address = await SecureStore.getItemAsync(ADDRESS_STORAGE_KEY);
  const publicKey = await SecureStore.getItemAsync(PUBLIC_KEY_STORAGE_KEY);
  
  if (!address || !publicKey) {
    return null;
  }
  
  return { address, publicKey };
}

/**
 * Check if wallet exists in secure storage.
 * 
 * @returns True if wallet exists
 */
export async function hasWallet(): Promise<boolean> {
  const address = await SecureStore.getItemAsync(ADDRESS_STORAGE_KEY);
  return address !== null;
}

/**
 * Sign a message with the wallet's private key using EIP-191 (Ethereum personal_sign).
 * 
 * EIP-191 format:
 * keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
 * 
 * Why EIP-191:
 * - Standard used by MetaMask and all Ethereum wallets
 * - Prevents signed messages from being valid transactions
 * - Compatible with backend signature verification
 * - Prefix makes signing intent explicit
 * 
 * Returns 65-byte signature (r, s, v) as 130-char hex string with 0x prefix.
 * 
 * @param message - Plain text message to sign
 * @returns Signature as 0x-prefixed hex string (65 bytes = 130 hex chars)
 */
export async function signMessage(message: string): Promise<string> {
  // Load private key from secure storage
  const privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
  
  if (!privateKeyHex) {
    throw new Error('No wallet found. Please create a wallet first.');
  }
  
  // Build EIP-191 prefixed message
  // Format: "\x19Ethereum Signed Message:\n" + len(message) + message
  const messageBytes = Buffer.from(message, 'utf8');
  const prefix = `\x19Ethereum Signed Message:\n${messageBytes.length}`;
  const prefixBytes = Buffer.from(prefix, 'utf8');
  
  // Concatenate prefix + message
  const prefixedMessage = Buffer.concat([prefixBytes, messageBytes]);
  
  // Hash with keccak256
  const messageHash = keccak256(prefixedMessage);
  const messageHashBytes = Buffer.from(messageHash, 'hex');
  
  // Sign with private key using @noble/secp256k1 v2 API
  // v2 sign() always returns SignatureWithRecovery object
  // No need for 'recovered' option - it's included by default
  const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
  const sig = await secp.sign(messageHashBytes, privateKeyBytes);
  
  // Extract recovery ID from signature object
  const recoveryId = sig.recovery;
  
  // Convert signature to compact bytes (64 bytes: r=32, s=32)
  const sigBytes = sig.toCompactRawBytes();
  
  // Combine signature (r,s) + recovery ID (v)
  // Ethereum uses v = recoveryId + 27
  const r = sigBytes.slice(0, 32);
  const s = sigBytes.slice(32, 64);
  const v = Buffer.from([recoveryId + 27]);
  
  // Concatenate r + s + v (65 bytes total)
  const fullSignature = Buffer.concat([Buffer.from(r), Buffer.from(s), v]);
  
  // Return as 0x-prefixed hex string
  return '0x' + fullSignature.toString('hex');
}

/**
 * Delete wallet from secure storage.
 * 
 * WARNING: This is irreversible! User will lose access to their tokens.
 * 
 * TODO: Implement wallet export/backup before allowing deletion
 */
export async function deleteWallet(): Promise<void> {
  await SecureStore.deleteItemAsync(PRIVATE_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(PUBLIC_KEY_STORAGE_KEY);
  await SecureStore.deleteItemAsync(ADDRESS_STORAGE_KEY);
  
  console.log('Wallet deleted');
}

/**
 * Export wallet private key for backup.
 * 
 * WARNING: Private key must be kept secret!
 * Only show this to user in a secure context with warnings.
 * 
 * @returns Private key as hex string
 */
export async function exportPrivateKey(): Promise<string> {
  const privateKeyHex = await SecureStore.getItemAsync(PRIVATE_KEY_STORAGE_KEY);
  
  if (!privateKeyHex) {
    throw new Error('No wallet found.');
  }
  
  return privateKeyHex;
}

/**
 * Import wallet from private key.
 * 
 * Reconstructs wallet from private key hex string.
 * 
 * @param privateKeyHex - Private key as hex string (64 characters)
 * @returns Imported wallet
 */
export async function importPrivateKey(privateKeyHex: string): Promise<Wallet> {
  // Validate private key format
  if (!/^[0-9a-fA-F]{64}$/.test(privateKeyHex)) {
    throw new Error('Invalid private key format. Must be 64 hex characters.');
  }
  
  const privateKeyBytes = Buffer.from(privateKeyHex, 'hex');
  
  // Derive public key and address
  // v2 API: await is required for getPublicKey
  const publicKeyBytes = await secp.getPublicKey(privateKeyBytes, false);
  const publicKeyHex = Buffer.from(publicKeyBytes).toString('hex');
  
  const publicKeyForHash = publicKeyBytes.slice(1);
  const hashHex = keccak256(publicKeyForHash); // Returns hex string
  const address = '0x' + hashHex.slice(-40); // Last 20 bytes (40 hex chars)
  
  // Store in secure enclave
  await SecureStore.setItemAsync(PRIVATE_KEY_STORAGE_KEY, privateKeyHex);
  await SecureStore.setItemAsync(PUBLIC_KEY_STORAGE_KEY, publicKeyHex);
  await SecureStore.setItemAsync(ADDRESS_STORAGE_KEY, address);
  
  console.log(`Imported wallet: ${address}`);
  
  return {
    address,
    publicKey: publicKeyHex,
  };
}
