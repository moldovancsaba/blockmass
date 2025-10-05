/**
 * STEP Mobile - Phase 2.5 Test Mode
 * 
 * Provides simulated data for testing ProofPayloadV2 collection and UI
 * without needing real hardware attestation, GNSS, or cell tower APIs.
 * 
 * Usage:
 *   Enable in development to test:
 *   - UI progress indicators
 *   - Confidence score display
 *   - Score breakdown visualization
 *   - Different confidence levels
 * 
 * Version: 1.1.0
 * Created: 2025-10-05T17:05:00.000Z
 */

import { Platform } from 'react-native';
import { getCurrentLocation } from './location';
import {
  ProofPayloadV2,
  ProofCollectionResult,
  ProofSubmissionResponseV2,
  GnssSatellite,
  ProofCollectionOptions,
} from '../types/proof-v2';

/**
 * Test mode configuration
 */
export const TEST_MODE = {
  enabled: __DEV__, // Automatically enable in development
  
  // Simulate different scenarios
  scenarios: {
    PERFECT_ANDROID: 'perfect_android',       // 100/100 score
    GOOD_ANDROID: 'good_android',             // 95/100 score
    PERFECT_IOS: 'perfect_ios',               // 90/100 score
    NO_ATTESTATION: 'no_attestation',         // 65/100 score
    LOW_GPS: 'low_gps',                       // 55/100 score
    FAILURE: 'failure',                       // Collection failure
  },
  
  // Current scenario (change this to test different cases)
  currentScenario: 'good_android' as string,
  
  // Simulate slow collection for UI testing
  simulateDelay: true,
  delayMs: 500, // Delay between collection steps
};

/**
 * Generate simulated GNSS satellite data
 * 
 * Creates realistic satellite data for GPS spoofing detection testing
 */
function generateSimulatedGnssSatellites(): GnssSatellite[] {
  const constellations = ['GPS', 'GLONASS', 'GALILEO', 'BEIDOU'];
  const satellites: GnssSatellite[] = [];
  
  // Generate 8-12 satellites with realistic signal strengths
  const count = Math.floor(Math.random() * 5) + 8;
  
  for (let i = 0; i < count; i++) {
    const constellation = constellations[Math.floor(Math.random() * constellations.length)];
    
    satellites.push({
      svid: Math.floor(Math.random() * 32) + 1,
      cn0: 35 + Math.random() * 15, // 35-50 dB-Hz (realistic range)
      az: Math.random() * 360,
      el: Math.random() * 90,
      constellation,
    });
  }
  
  return satellites;
}

/**
 * Collect proof data in TEST MODE
 * 
 * Simulates the full collection process with artificial delays
 * for UI testing purposes.
 * 
 * @param account - Wallet address
 * @param triangleId - Triangle ID
 * @param options - Collection options
 * @returns Simulated collection result
 */
export async function collectProofDataTestMode(
  account: string,
  triangleId: string,
  options: ProofCollectionOptions = {}
): Promise<ProofCollectionResult> {
  const startTime = Date.now();
  const scenario = TEST_MODE.currentScenario;
  
  console.log(`[TestMode] Running scenario: ${scenario}`);
  
  try {
    // Step 1: Location (10%)
    if (options.onProgress) {
      options.onProgress({
        step: 'location',
        message: 'Getting GPS location...',
        percentage: 10,
      });
    }
    if (TEST_MODE.simulateDelay) {
      await new Promise(resolve => setTimeout(resolve, TEST_MODE.delayMs));
    }
    
    const location = await getCurrentLocation();
    
    // Step 2: GNSS (30%)
    if (options.onProgress) {
      options.onProgress({
        step: 'gnss',
        message: 'Collecting GNSS satellite data...',
        percentage: 30,
      });
    }
    if (TEST_MODE.simulateDelay) {
      await new Promise(resolve => setTimeout(resolve, TEST_MODE.delayMs));
    }
    
    // Simulate GNSS data collection (Android only)
    const gnssData = Platform.OS === 'android' && scenario !== 'NO_ATTESTATION'
      ? {
          satellites: generateSimulatedGnssSatellites(),
          rawAvailable: true,
        }
      : undefined;
    
    // Step 3: Cell Tower (50%)
    if (options.onProgress) {
      options.onProgress({
        step: 'cell',
        message: 'Getting cell tower info...',
        percentage: 50,
      });
    }
    if (TEST_MODE.simulateDelay) {
      await new Promise(resolve => setTimeout(resolve, TEST_MODE.delayMs));
    }
    
    // Simulate cell tower data
    const cellData = scenario !== 'FAILURE'
      ? {
          mcc: 310, // US
          mnc: 260, // T-Mobile
          cellId: 12345678,
          tac: 54321,
          rsrp: -85, // Good signal
        }
      : undefined;
    
    // Step 4: Attestation (70%)
    if (options.onProgress) {
      options.onProgress({
        step: 'attestation',
        message: 'Generating attestation token...',
        percentage: 70,
      });
    }
    if (TEST_MODE.simulateDelay) {
      await new Promise(resolve => setTimeout(resolve, TEST_MODE.delayMs * 2)); // Attestation takes longer
    }
    
    // Simulate attestation
    const attestation = scenario !== 'NO_ATTESTATION'
      ? `test-mode-attestation-${Date.now()}-${Math.random().toString(36).substring(7)}`
      : 'test-mode-no-attestation';
    
    // Step 5: Build Payload (90%)
    if (options.onProgress) {
      options.onProgress({
        step: 'signing',
        message: 'Building proof payload...',
        percentage: 90,
      });
    }
    if (TEST_MODE.simulateDelay) {
      await new Promise(resolve => setTimeout(resolve, TEST_MODE.delayMs));
    }
    
    // Handle failure scenario
    if (scenario === 'FAILURE') {
      return {
        success: false,
        error: 'Simulated collection failure (test mode)',
        collectionTime: Date.now() - startTime,
      };
    }
    
    // Build payload with BOTH nested and flat location fields
    // Why both: Backend validation bug checks flat fields before extractLocation()
    const locationAccuracy = scenario === 'LOW_GPS' ? 75 : location.accuracy;
    const payload: ProofPayloadV2 = {
      version: 'STEP-PROOF-v2',
      account,
      triangleId,
      location: {
        lat: location.latitude,
        lon: location.longitude,
        alt: location.altitude || undefined,
        accuracy: locationAccuracy,
      },
      // WORKAROUND: Include flat fields for backend validation
      // @ts-ignore - these aren't in the type but backend needs them
      lat: location.latitude,
      lon: location.longitude,
      accuracy: locationAccuracy,
      gnss: gnssData,
      cell: cellData,
      device: {
        model: Platform.OS === 'ios' ? 'iPhone Simulator' : 'Android Emulator',
        os: Platform.OS === 'ios' ? `iOS ${Platform.Version}` : `Android ${Platform.Version}`,
        appVersion: '1.1.0',
        mockLocationEnabled: false,
      },
      attestation,
      timestamp: new Date().toISOString(),
      nonce: `test-nonce-${Date.now()}-${Math.random().toString(36).substring(7)}`,
    };
    
    // Step 6: Complete (100%)
    if (options.onProgress) {
      options.onProgress({
        step: 'complete',
        message: 'Proof collection complete!',
        percentage: 100,
      });
    }
    
    const collectionTime = Date.now() - startTime;
    console.log(`[TestMode] Collection complete in ${collectionTime}ms`);
    
    return {
      success: true,
      payload,
      collectionTime,
      warnings: ['TEST MODE: Using simulated data'],
    };
  } catch (error) {
    return {
      success: false,
      error: `Test mode error: ${error}`,
      collectionTime: Date.now() - startTime,
    };
  }
}

/**
 * Submit proof in TEST MODE
 * 
 * Returns simulated API responses based on the current scenario
 * 
 * @param payload - Proof payload
 * @param signature - Signature (ignored in test mode)
 * @returns Simulated API response
 */
export async function submitProofTestMode(
  payload: ProofPayloadV2,
  signature: string
): Promise<ProofSubmissionResponseV2> {
  const scenario = TEST_MODE.currentScenario;
  
  console.log(`[TestMode] Simulating API response for scenario: ${scenario}`);
  
  // Simulate API delay
  if (TEST_MODE.simulateDelay) {
    await new Promise(resolve => setTimeout(resolve, TEST_MODE.delayMs * 2));
  }
  
  // Generate response based on scenario
  switch (scenario) {
    case 'PERFECT_ANDROID':
      return {
        ok: true,
        confidence: 100,
        confidenceLevel: 'Very High Confidence',
        scores: {
          signature: 20,
          gpsAccuracy: 15,
          speedGate: 10,
          moratorium: 5,
          attestation: 25,
          gnssRaw: 15,
          cellTower: 10,
          wifi: 0,
          witness: 0,
          total: 100,
        },
        reward: '0.5',
        balance: '10.5',
      };
    
    case 'GOOD_ANDROID':
      return {
        ok: true,
        confidence: 95,
        confidenceLevel: 'Very High Confidence',
        scores: {
          signature: 20,
          gpsAccuracy: 15,
          speedGate: 10,
          moratorium: 5,
          attestation: 25,
          gnssRaw: 10, // Slightly lower GNSS score
          cellTower: 10,
          wifi: 0,
          witness: 0,
          total: 95,
        },
        reward: '0.48',
        balance: '10.48',
      };
    
    case 'PERFECT_IOS':
      return {
        ok: true,
        confidence: 90,
        confidenceLevel: 'Very High Confidence',
        scores: {
          signature: 20,
          gpsAccuracy: 15,
          speedGate: 10,
          moratorium: 5,
          attestation: 25,
          gnssRaw: 0, // No GNSS on iOS
          cellTower: 10,
          wifi: 0,
          witness: 0,
          total: 85,
        },
        reward: '0.43',
        balance: '10.43',
      };
    
    case 'NO_ATTESTATION':
      return {
        ok: true,
        confidence: 65,
        confidenceLevel: 'Medium Confidence',
        scores: {
          signature: 20,
          gpsAccuracy: 15,
          speedGate: 10,
          moratorium: 5,
          attestation: 0, // No attestation
          gnssRaw: 10,
          cellTower: 5, // Partial cell tower match
          wifi: 0,
          witness: 0,
          total: 65,
        },
        reward: '0.33',
        balance: '10.33',
      };
    
    case 'LOW_GPS':
      return {
        ok: true,
        confidence: 55,
        confidenceLevel: 'Medium Confidence',
        scores: {
          signature: 20,
          gpsAccuracy: 0, // Low GPS accuracy
          speedGate: 10,
          moratorium: 5,
          attestation: 10, // Partial attestation
          gnssRaw: 5, // Weak GNSS signals
          cellTower: 5,
          wifi: 0,
          witness: 0,
          total: 55,
        },
        reward: '0.28',
        balance: '10.28',
      };
    
    case 'FAILURE':
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
        balance: '10.0',
        error: 'Simulated failure (test mode)',
      };
    
    default:
      return {
        ok: true,
        confidence: 70,
        confidenceLevel: 'High Confidence',
        scores: {
          signature: 20,
          gpsAccuracy: 15,
          speedGate: 10,
          moratorium: 5,
          attestation: 15,
          gnssRaw: 0,
          cellTower: 5,
          wifi: 0,
          witness: 0,
          total: 70,
        },
        reward: '0.35',
        balance: '10.35',
      };
  }
}

/**
 * Switch test scenario
 * 
 * Call this to test different confidence levels in the UI
 */
export function setTestScenario(scenario: string) {
  console.log(`[TestMode] Switching to scenario: ${scenario}`);
  TEST_MODE.currentScenario = scenario;
}

/**
 * Get available test scenarios
 */
export function getTestScenarios() {
  return Object.entries(TEST_MODE.scenarios).map(([key, value]) => ({
    key,
    value,
    label: key.replace(/_/g, ' '),
  }));
}

/**
 * Check if test mode is enabled
 */
export function isTestModeEnabled(): boolean {
  return TEST_MODE.enabled;
}

/**
 * Enable/disable test mode
 */
export function setTestMode(enabled: boolean) {
  TEST_MODE.enabled = enabled;
  console.log(`[TestMode] Test mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
}
