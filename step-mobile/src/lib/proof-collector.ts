/**
 * STEP Phase 2.5 Proof Data Collector
 * 
 * What: Collects comprehensive location proof data for anti-spoofing
 * Why: Phase 2 (v1) uses only GPS coordinates, Phase 2.5 (v2) adds multiple signal validation
 * 
 * Data Collection Components:
 * 1. Device Metadata - Model, OS version, app version
 * 2. Cell Tower Information - MCC, MNC, CellID, signal strength
 * 3. GNSS Raw Data - Satellite measurements (Android only)
 * 4. Hardware Attestation - Play Integrity (Android) / DeviceCheck (iOS)
 * 
 * Security Impact:
 * - Phase 2 (GPS only): 85/100 confidence score
 * - Phase 2.5 (multi-signal): 95-100/100 confidence score (Android), 85-90/100 (iOS)
 * 
 * Platform Support:
 * - Device Metadata: Both iOS and Android
 * - Cell Tower: Both (limited on iOS)
 * - GNSS Raw: Android only (iOS doesn't expose)
 * - Attestation: Platform-specific (Play Integrity vs DeviceCheck)
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Cellular from 'expo-cellular'; // Phase 2.5: Installed
import * as Crypto from 'expo-crypto';
import {
  ProofPayloadV2,
  DeviceMetadata,
  CellTowerData,
  GnssData,
} from '../types/proof-v2';

/**
 * Collect device metadata for proof payload
 * 
 * What: Device model, OS version, app version, and environment info
 * Why: Detects emulators, rooted devices, and suspicious configurations
 * 
 * Platform: Both iOS and Android
 * 
 * @returns DeviceMetadata object
 */
export async function collectDeviceMetadata(): Promise<DeviceMetadata> {
  console.log('[ProofCollector] Collecting device metadata...');

  // Get device info from expo-device
  const deviceModel = Device.modelName || Device.deviceName || 'Unknown';
  const osName = Platform.OS === 'ios' ? 'iOS' : 'Android';
  const osVersion = Device.osVersion || 'Unknown';
  
  // Get app version from package.json (would need to import)
  // For now, hardcode - in production, read from app.json or package.json
  const appVersion = '1.0.0';

  // Check for mock location (Android only)
  // This requires native module - for now, return undefined
  // TODO: Implement native module to detect mock location
  const mockLocationEnabled: boolean | undefined = Platform.OS === 'android'
    ? undefined // TODO: Check via native module
    : undefined; // iOS doesn't have this concept

  const metadata: DeviceMetadata = {
    model: deviceModel,
    os: `${osName} ${osVersion}`,
    appVersion,
    mockLocationEnabled,
  };

  console.log('[ProofCollector] Device metadata collected:', metadata);
  return metadata;
}

/**
 * Collect cell tower information for triangulation
 * 
 * What: MCC, MNC, CellID, signal strength (RSRP), neighboring cells
 * Why: Cross-validates GPS location using cell tower database
 * 
 * Platform: Both iOS and Android (limited on iOS)
 * 
 * Limitations:
 * - expo-cellular provides MCC/MNC but not CellID or signal strength
 * - CellID requires native module (TelephonyManager on Android, CoreTelephony on iOS)
 * - iOS is more restrictive than Android for cell tower access
 * 
 * @returns CellTowerData object or undefined if unavailable
 */
export async function collectCellTowerData(): Promise<CellTowerData | undefined> {
  console.log('[ProofCollector] Collecting cell tower data...');

  try {
    // Phase 2.5: expo-cellular now installed
    const carrier = Cellular.carrier;
    
    // Check if cellular service is available (WiFi-only devices return null)
    if (!carrier) {
      console.log('[ProofCollector] No cellular carrier (WiFi-only or simulator)');
      return undefined;
    }
    
    const mcc = Cellular.mobileCountryCode;
    const mnc = Cellular.mobileNetworkCode;
    
    // MCC/MNC may be null on simulators
    if (!mcc || !mnc) {
      console.log('[ProofCollector] MCC/MNC unavailable');
      return undefined;
    }
    
    // Note: CellID and RSRP still require native modules
    const cellData: CellTowerData = {
      mcc: parseInt(mcc, 10),
      mnc: parseInt(mnc, 10),
      cellId: 0, // TODO: Requires native module
      tac: undefined, // TODO: Requires native module
      rsrp: undefined, // TODO: Requires native module
      neighbors: undefined, // TODO: Requires native module
    };
    
    console.log('[ProofCollector] Cell tower data collected (partial):', cellData);
    return cellData;
  } catch (error) {
    console.warn('[ProofCollector] Cell tower collection failed:', error);
    return undefined;
  }
}

/**
 * Collect GNSS raw satellite data (Android only)
 * 
 * What: Raw measurements from GPS, GLONASS, Galileo, BeiDou satellites
 * Why: Validates GPS authenticity by checking signal variance and multi-constellation presence
 * 
 * Platform: Android 7.0+ only (requires GnssMeasurement API)
 * 
 * Data Collected:
 * - Satellite Vehicle ID (SVID)
 * - Carrier-to-noise density (CN0) - signal strength
 * - Azimuth and elevation angles
 * - Constellation type (GPS, GLONASS, etc.)
 * 
 * Spoofing Detection:
 * - Real GPS shows multiple constellations with varying signal strengths
 * - Spoofed GPS typically shows only GPS constellation with uniform signals
 * - Signal variance analysis detects fake data
 * 
 * Limitations:
 * - iOS doesn't expose raw GNSS data (CoreLocation doesn't provide)
 * - Requires native module bridging Java/Kotlin GnssMeasurement API
 * - Not available in iOS simulator or Android emulator
 * 
 * @returns GnssData object or undefined if unavailable
 */
export async function collectGnssRawData(): Promise<GnssData | undefined> {
  console.log('[ProofCollector] Collecting GNSS raw data...');

  // iOS doesn't support raw GNSS data
  if (Platform.OS === 'ios') {
    console.log('[ProofCollector] GNSS raw data not available on iOS');
    return {
      satellites: [],
      rawAvailable: false,
    };
  }

  // Android: Requires native module
  // GnssMeasurement API is not exposed by Expo or React Native by default
  console.log('[ProofCollector] GNSS raw data collection requires native Android module (not yet implemented)');
  
  return {
    satellites: [],
    rawAvailable: false,
  };

  /*
  // Future implementation (after creating native module):
  try {
    // Call native module to get GnssMeasurement data
    // const measurements = await NativeModules.GnssCollector.getRawMeasurements();
    
    const gnssData: GnssData = {
      satellites: measurements.map((m: any) => ({
        svid: m.svid,
        cn0: m.cn0DbHz,
        az: m.azimuthDegrees,
        el: m.elevationDegrees,
        constellation: m.constellationType, // 'GPS', 'GLONASS', 'GALILEO', 'BEIDOU'
      })),
      rawAvailable: true,
    };

    console.log(`[ProofCollector] Collected ${gnssData.satellites.length} satellite measurements`);
    return gnssData;
  } catch (error) {
    console.warn('[ProofCollector] GNSS collection failed:', error);
    return {
      satellites: [],
      rawAvailable: false,
    };
  }
  */
}

/**
 * Generate hardware attestation token
 * 
 * What: Cryptographic proof that app is running on genuine, unmodified hardware
 * Why: Prevents emulators, rooted devices, and modified apps from spoofing
 * 
 * Platform-Specific:
 * - Android: Google Play Integrity API (JWT token)
 * - iOS: Apple DeviceCheck / App Attest (base64 token)
 * 
 * How It Works:
 * - App generates nonce (random challenge)
 * - Platform API signs nonce with device-specific key
 * - Backend verifies signature with Google/Apple API
 * - Backend confirms device is genuine and app is unmodified
 * 
 * Security:
 * - 25 points (out of 100) in confidence scoring
 * - Critical for Phase 2.5 security model
 * - Mandatory in production (optional in development)
 * 
 * Limitations:
 * - Requires Play Integrity setup (Android) or App Attest enrollment (iOS)
 * - Native module bridging required
 * - Google Play Console project needed (Android)
 * - Apple Developer account needed (iOS)
 * 
 * @param nonce - Random challenge for attestation (UUID v4)
 * @returns Attestation token string or mock token for development
 */
export async function generateAttestationToken(nonce: string): Promise<string> {
  console.log('[ProofCollector] Generating hardware attestation token...');
  console.log(`[ProofCollector] Nonce: ${nonce}`);

  // Development mode: Return mock attestation
  // This allows Phase 2.5 payload construction without native modules
  // Backend can detect mock attestations and assign 0 points for attestation score
  if (__DEV__) {
    console.warn('[ProofCollector] Development mode: Using mock attestation token');
    const mockToken = `MOCK_ATTESTATION_${Platform.OS}_${nonce.substring(0, 8)}`;
    return mockToken;
  }

  // Production: Use platform-specific attestation
  if (Platform.OS === 'android') {
    return await generatePlayIntegrityToken(nonce);
  } else if (Platform.OS === 'ios') {
    return await generateDeviceCheckToken(nonce);
  }

  throw new Error('Unsupported platform for attestation');
}

/**
 * Generate Google Play Integrity token (Android)
 * 
 * What: JWT token from Play Integrity API
 * Why: Verifies app is installed via Play Store on genuine Android device
 * 
 * Requirements:
 * - react-native-play-integrity package
 * - Google Play Console project with Play Integrity enabled
 * - Cloud project number (for API calls)
 * 
 * Token Contents:
 * - Device integrity verdict (MEETS_DEVICE_INTEGRITY, etc.)
 * - App integrity verdict (PLAY_RECOGNIZED, etc.)
 * - Account details
 * - Nonce (prevents replay attacks)
 * 
 * @param nonce - Challenge to bind to token
 * @returns Play Integrity JWT token
 */
async function generatePlayIntegrityToken(nonce: string): Promise<string> {
  console.log('[ProofCollector] Requesting Play Integrity token...');

  try {
    // TODO: Install react-native-play-integrity
    // import PlayIntegrity from 'react-native-play-integrity';
    
    /*
    const token = await PlayIntegrity.requestIntegrityToken({
      nonce: nonce,
      cloudProjectNumber: 'YOUR_CLOUD_PROJECT_NUMBER', // TODO: Configure
    });
    
    console.log('[ProofCollector] Play Integrity token obtained');
    return token;
    */

    throw new Error('Play Integrity not yet configured (native module required)');
  } catch (error) {
    console.error('[ProofCollector] Play Integrity failed:', error);
    throw new Error(`Attestation failed: ${error}`);
  }
}

/**
 * Generate Apple DeviceCheck token (iOS)
 * 
 * What: DeviceCheck or App Attest token
 * Why: Verifies app is running on genuine Apple device
 * 
 * Requirements:
 * - react-native-device-check package
 * - Apple Developer account with DeviceCheck/App Attest enabled
 * - Team ID and Bundle ID configuration
 * 
 * Token Contents:
 * - Device identifier (opaque, not UDID)
 * - App signature verification
 * - Challenge (nonce)
 * 
 * Note: App Attest is preferred over DeviceCheck (more secure)
 * 
 * @param nonce - Challenge to bind to token
 * @returns DeviceCheck/App Attest token (base64)
 */
async function generateDeviceCheckToken(nonce: string): Promise<string> {
  console.log('[ProofCollector] Requesting DeviceCheck token...');

  try {
    // TODO: Install react-native-device-check
    // import DeviceCheck from 'react-native-device-check';
    
    /*
    const token = await DeviceCheck.generateToken({
      challenge: nonce,
      teamId: 'YOUR_TEAM_ID', // TODO: Configure
      bundleId: 'com.blockmass.stepmobile',
    });
    
    console.log('[ProofCollector] DeviceCheck token obtained');
    return token;
    */

    throw new Error('DeviceCheck not yet configured (native module required)');
  } catch (error) {
    console.error('[ProofCollector] DeviceCheck failed:', error);
    throw new Error(`Attestation failed: ${error}`);
  }
}

/**
 * Build complete ProofPayloadV2 for Phase 2.5 submission
 * 
 * What: Assembles all collected data into ProofPayloadV2 structure
 * Why: Single function to collect all Phase 2.5 data for proof submission
 * 
 * Data Collection Flow:
 * 1. Device metadata (expo-device)
 * 2. Cell tower info (expo-cellular + native)
 * 3. GNSS raw data (Android native only)
 * 4. Hardware attestation (Play Integrity / DeviceCheck)
 * 
 * Error Handling:
 * - Optional data (cell, GNSS) returns undefined if unavailable
 * - Attestation is critical - throws error if fails in production
 * - Development mode uses mock attestation for testing
 * 
 * @param walletAddress - User's Ethereum-style address (0x...)
 * @param triangleId - STEP-TRI-v1 triangle identifier
 * @param location - GPS coordinates with accuracy
 * @param nonce - UUID v4 for replay protection
 * @returns Complete ProofPayloadV2 ready for signing
 */
export async function buildProofPayloadV2(
  walletAddress: string,
  triangleId: string,
  location: {
    lat: number;
    lon: number;
    alt?: number;
    accuracy: number;
  },
  nonce: string
): Promise<ProofPayloadV2> {
  console.log('[ProofCollector] Building ProofPayloadV2...');
  console.log(`[ProofCollector] Account: ${walletAddress}`);
  console.log(`[ProofCollector] Triangle: ${triangleId}`);
  console.log(`[ProofCollector] Location: (${location.lat}, ${location.lon}) ±${location.accuracy}m`);

  try {
    // Collect all data in parallel for efficiency
    const [deviceMetadata, cellData, gnssData, attestation] = await Promise.all([
      collectDeviceMetadata(),
      collectCellTowerData(),
      collectGnssRawData(),
      generateAttestationToken(nonce),
    ]);

    // Build ProofPayloadV2
    const payload: ProofPayloadV2 = {
      version: 'STEP-PROOF-v2',
      account: walletAddress,
      triangleId: triangleId,
      location: {
        lat: location.lat,
        lon: location.lon,
        alt: location.alt,
        accuracy: location.accuracy,
      },
      gnss: gnssData,
      cell: cellData,
      device: deviceMetadata,
      attestation: attestation,
      timestamp: new Date().toISOString(), // ISO 8601 with milliseconds
      nonce: nonce,
    };

    console.log('[ProofCollector] ProofPayloadV2 built successfully');
    console.log(`[ProofCollector] - Device: ${deviceMetadata.model}`);
    console.log(`[ProofCollector] - Cell: ${cellData ? 'YES' : 'NO'}`);
    console.log(`[ProofCollector] - GNSS: ${gnssData?.rawAvailable ? 'YES' : 'NO'}`);
    console.log(`[ProofCollector] - Attestation: ${attestation.substring(0, 30)}...`);

    return payload;
  } catch (error) {
    console.error('[ProofCollector] Failed to build ProofPayloadV2:', error);
    throw error;
  }
}

/**
 * Get expected confidence score for current platform
 * 
 * What: Estimates confidence score based on available data sources
 * Why: Helps users understand expected security level
 * 
 * Scoring Breakdown:
 * - Signature: 20 points
 * - GPS Accuracy: 15 points
 * - Speed Gate: 10 points
 * - Moratorium: 5 points
 * - Attestation: 25 points
 * - GNSS Raw: 15 points (Android only)
 * - Cell Tower: 10 points
 * 
 * Expected Scores:
 * - Android (full features): 95-100/100
 * - iOS (no GNSS): 85-90/100
 * - Development mode (mock attestation): 60-75/100
 * 
 * @param hasGnss - True if GNSS raw data available
 * @param hasCell - True if cell tower data available
 * @param hasAttestation - True if hardware attestation successful
 * @returns Estimated confidence score (0-100)
 */
export function estimateConfidenceScore(
  hasGnss: boolean,
  hasCell: boolean,
  hasAttestation: boolean
): number {
  let score = 0;

  // Base scores (always present)
  score += 20; // Signature
  score += 15; // GPS accuracy (assuming good accuracy)
  score += 10; // Speed gate (assuming not too fast)
  score += 5;  // Moratorium (assuming compliant)

  // Optional scores
  if (hasAttestation) score += 25;
  if (hasGnss) score += 15;
  if (hasCell) score += 10;

  return score;
}

/**
 * Check if device supports full Phase 2.5 features
 * 
 * What: Determines which data sources are available on current platform
 * Why: Helps set user expectations for security score
 * 
 * @returns Object with availability flags
 */
export function getPhase25Capabilities() {
  return {
    platform: Platform.OS,
    deviceMetadata: true, // Always available via expo-device
    cellTower: !!Cellular.carrier, // Phase 2.5: Partial support (MCC/MNC only, CellID needs native module)
    gnssRaw: Platform.OS === 'android', // Android only (needs native module implementation)
    attestation: false, // TODO: Requires Play Integrity / DeviceCheck setup
    expectedScore: Platform.OS === 'android' ? '70-85' : '65-80', // Lower without full attestation
  };
}
