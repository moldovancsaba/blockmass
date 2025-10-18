/**
 * Platform-agnostic secure storage
 * 
 * Uses expo-secure-store on native (iOS/Android)
 * Uses localStorage on web (NOT secure, but sufficient for development)
 * 
 * WARNING: localStorage is NOT secure on web. For production:
 * - Use IndexedDB with encryption
 * - Or require users to use mobile app only
 */

import { Platform } from 'react-native';

// Lazy load expo-secure-store (only on native)
let SecureStore: any = null;
if (Platform.OS !== 'web') {
  SecureStore = require('expo-secure-store');
}

/**
 * Store a key-value pair securely
 */
export async function setItemAsync(key: string, value: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Web: use localStorage (NOT secure, development only)
    localStorage.setItem(key, value);
  } else {
    // Native: use secure enclave
    await SecureStore.setItemAsync(key, value);
  }
}

/**
 * Retrieve a value by key
 */
export async function getItemAsync(key: string): Promise<string | null> {
  if (Platform.OS === 'web') {
    // Web: use localStorage
    return localStorage.getItem(key);
  } else {
    // Native: use secure enclave
    return await SecureStore.getItemAsync(key);
  }
}

/**
 * Delete a key-value pair
 */
export async function deleteItemAsync(key: string): Promise<void> {
  if (Platform.OS === 'web') {
    // Web: remove from localStorage
    localStorage.removeItem(key);
  } else {
    // Native: delete from secure enclave
    await SecureStore.deleteItemAsync(key);
  }
}
