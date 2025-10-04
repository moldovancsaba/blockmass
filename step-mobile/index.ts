/**
 * STEP Mobile App Entry Point
 * 
 * CRITICAL SETUP ORDER:
 * 1. react-native-get-random-values - MUST be first! Sets up crypto.getRandomValues
 * 2. Buffer polyfill - Required by wallet library for key operations
 * 3. HMAC setup for @noble/secp256k1 - Required for RFC 6979 signing
 * 4. App registration
 * 
 * React Native doesn't include Node.js globals (Buffer) or Web Crypto API,
 * so we provide them via polyfills. The wallet library uses Buffer extensively
 * for cryptographic operations:
 * - Private/public key generation and conversion
 * - EIP-191 message signing (prefix + message concatenation)
 * - Signature assembly (r + s + v)
 * - Address derivation from public key hash
 * 
 * @noble/secp256k1 v2 requires HMAC-SHA256 for RFC 6979 deterministic
 * nonce generation. We provide this via @noble/hashes, which will be used
 * instead of crypto.subtle since react-native-get-random-values only provides
 * getRandomValues, not the full subtle API.
 */
import 'react-native-get-random-values';
import { Buffer } from 'buffer';

// Set up Buffer global
global.Buffer = Buffer;

// Configure HMAC for @noble/secp256k1 v2
import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac.js';
import { sha256 } from '@noble/hashes/sha2.js';

secp.etc.hmacSha256Sync = (key, ...msgs) => {
  const h = hmac.create(sha256, key);
  msgs.forEach(msg => h.update(msg));
  return h.digest();
};

import { registerRootComponent } from 'expo';
import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
