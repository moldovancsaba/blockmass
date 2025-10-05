/**
 * STEP Mobile - Phase 2.5 Proof Collector
 * 
 * Comprehensive data collection for ProofPayloadV2 format.
 * Collects location, GNSS raw data (Android), cell tower info,
 * device details, and hardware attestation tokens.
 * 
 * Version: 1.1.0
 * Created: 2025-10-05T17:00:00.000Z
 */

import { Platform } from 'react-native';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import * as Cellular from 'expo-cellular';
import * as Crypto from 'expo-crypto';
import { getCurrentLocation } from './location';
import {
  ProofPayloadV2,
  GnssSatellite,
  CellTowerData,
  GnssCollectionResult,
  AttestationResult,
  ProofCollectionOptions,
  ProofCollectionProgress,
  ProofCollectionResult,
} from '../types/proof-v2';

/**
 * Main proof collector class
 * 
 * Usage:
 *   const collector = new ProofCollector();
 *   const result = await collector.collectProof({
 *     account: walletAddress,
 *     triangleId: triangleId,
 *     onProgress: (progress) => console.log(progress)
 *   });
 */
export class ProofCollector {
  private appVersion: string;

  constructor() {
    // Get app version from package.json or default
    this.appVersion = '1.1.0'; // Will be updated from app.json
  }

  /**
   * Collect complete proof data for submission
   * 
   * This orchestrates all data collection steps:
   * 1. GPS location (required)
   * 2. GNSS raw data (Android only)
   * 3. Cell tower info (both platforms)
   * 4. Device information
   * 5. Hardware attestation token
   * 6. Generate nonce and timestamp
   * 
   * @param account - User's wallet address
   * @param triangleId - STEP triangle identifier
   * @param options - Collection options
   * @returns Complete proof collection result
   */
  async collectProof(
    account: string,
    triangleId: string,
    options: ProofCollectionOptions = {}
  ): Promise<ProofCollectionResult> {
    const startTime = Date.now();
    const warnings: string[] = [];

    try {
      // Step 1: Get GPS location (required)
      this.reportProgress(options, 'location', 'Getting GPS location...', 10);
      const location = await this.collectLocation();

      // Step 2: Collect GNSS raw data (Android only, optional)
      let gnssData: GnssCollectionResult | undefined;
      if (options.includeGnss !== false && Platform.OS === 'android') {
        this.reportProgress(options, 'gnss', 'Collecting GNSS satellite data...', 30);
        try {
          gnssData = await this.collectGnssData();
        } catch (error) {
          warnings.push(`GNSS collection failed: ${error}`);
          console.warn('GNSS collection failed, continuing without it:', error);
        }
      }

      // Step 3: Collect cell tower data (both platforms, optional)
      let cellData: CellTowerData | undefined;
      if (options.includeCell !== false) {
        this.reportProgress(options, 'cell', 'Getting cell tower info...', 50);
        try {
          cellData = await this.collectCellTowerData();
        } catch (error) {
          warnings.push(`Cell tower collection failed: ${error}`);
          console.warn('Cell tower collection failed, continuing without it:', error);
        }
      }

      // Step 4: Collect device information
      const deviceInfo = await this.collectDeviceInfo();

      // Step 5: Generate hardware attestation token
      this.reportProgress(options, 'attestation', 'Generating attestation token...', 70);
      const attestation = await this.generateAttestation(
        options.attestationTimeout || 10000
      );

      // Step 6: Build payload
      this.reportProgress(options, 'signing', 'Building proof payload...', 90);
      const timestamp = new Date().toISOString();
      const nonce = await this.generateNonce();

    // Build ProofPayloadV2 with BOTH nested and flat location fields
    // Why both: Backend validation bug checks flat fields before extractLocation()
    // Once backend is fixed, we can remove lat/lon/accuracy from root
    const payload: ProofPayloadV2 = {
      version: 'STEP-PROOF-v2',
      account,
      triangleId,
      location: {
        lat: location.latitude,
        lon: location.longitude,
        alt: location.altitude || undefined,
        accuracy: location.accuracy,
      },
      // WORKAROUND: Include flat fields for backend validation
      // @ts-ignore - these aren't in the type but backend needs them
      lat: location.latitude,
      lon: location.longitude,
      accuracy: location.accuracy,
        gnss: gnssData
          ? {
              satellites: gnssData.satellites,
              rawAvailable: gnssData.rawAvailable,
            }
          : undefined,
        cell: cellData
          ? {
              mcc: cellData.mcc,
              mnc: cellData.mnc,
              cellId: cellData.cellId,
              tac: cellData.tac,
              rsrp: cellData.rsrp,
            }
          : undefined,
        device: deviceInfo,
        attestation: attestation.token,
        timestamp,
        nonce,
      };

      this.reportProgress(options, 'complete', 'Proof collection complete!', 100);

      const collectionTime = Date.now() - startTime;
      console.log(`[ProofCollector] Collection complete in ${collectionTime}ms`);
      console.log(`[ProofCollector] GNSS: ${gnssData ? 'YES' : 'NO'}, Cell: ${cellData ? 'YES' : 'NO'}`);

      return {
        success: true,
        payload,
        collectionTime,
        warnings: warnings.length > 0 ? warnings : undefined,
      };
    } catch (error) {
      console.error('[ProofCollector] Collection failed:', error);
      this.reportProgress(
        options,
        'complete',
        `Collection failed: ${error}`,
        100,
        String(error)
      );

      return {
        success: false,
        error: String(error),
        collectionTime: Date.now() - startTime,
        warnings,
      };
    }
  }

  /**
   * Collect GPS location data
   * 
   * Uses existing location service from Phase 2
   * Requires high accuracy for mining
   */
  private async collectLocation() {
    try {
      const location = await getCurrentLocation();
      console.log(
        `[ProofCollector] Location: (${location.latitude}, ${location.longitude}) ±${location.accuracy}m`
      );
      return location;
    } catch (error) {
      throw new Error(`Location collection failed: ${error}`);
    }
  }

  /**
   * Collect GNSS raw satellite data (Android only)
   * 
   * Requires:
   * - Android API 24+ (Android 7.0+)
   * - GnssMeasurement API support
   * - GPS must be enabled
   * 
   * Returns satellite data for spoofing detection:
   * - Carrier-to-Noise density (C/N0)
   * - Elevation/Azimuth angles
   * - Constellation types
   * 
   * Note: This is Android-only. iOS does not expose raw GNSS data.
   */
  private async collectGnssData(): Promise<GnssCollectionResult> {
    if (Platform.OS !== 'android') {
      throw new Error('GNSS raw data only available on Android');
    }

    // TODO: Implement native module for GNSS data collection
    // For MVP, we'll simulate or return empty data
    // Full implementation requires:
    // 1. Native Android module using GnssMeasurement API
    // 2. LocationManager.registerGnssMeasurementsCallback()
    // 3. Parse GnssMeasurement objects into satellite array
    
    console.warn('[ProofCollector] GNSS collection not yet implemented (requires native module)');
    
    // Return placeholder data for now
    // In production, this will be real satellite data
    return {
      satellites: [],
      rawAvailable: false,
      constellations: [],
      averageCn0: 0,
      satelliteCount: 0,
    };

    /* FUTURE IMPLEMENTATION:
    
    const satellites: GnssSatellite[] = [];
    
    // Native module call (to be implemented)
    const gnssData = await NativeModules.GnssModule.getMeasurements();
    
    for (const measurement of gnssData.measurements) {
      satellites.push({
        svid: measurement.svid,
        cn0: measurement.cn0DbHz,
        az: measurement.azimuthDegrees,
        el: measurement.elevationDegrees,
        constellation: this.mapConstellation(measurement.constellationType),
      });
    }
    
    const averageCn0 = satellites.reduce((sum, sat) => sum + sat.cn0, 0) / satellites.length;
    const constellations = [...new Set(satellites.map(s => s.constellation))];
    
    return {
      satellites,
      rawAvailable: true,
      constellations,
      averageCn0,
      satelliteCount: satellites.length,
    };
    */
  }

  /**
   * Collect cell tower information
   * 
   * Works on both Android and iOS:
   * - Android: TelephonyManager (full info)
   * - iOS: CoreTelephony (limited info)
   * 
   * Used for location cross-validation via cell tower databases:
   * - Mozilla Location Service
   * - OpenCellID
   */
  private async collectCellTowerData(): Promise<CellTowerData | undefined> {
    try {
      // Get carrier and network info
      const carrier = await Cellular.getCarrierNameAsync();
      const isoCountryCode = await Cellular.getIsoCountryCodeAsync();
      
      // expo-cellular provides limited info
      // For full cell tower data, we need platform-specific implementations
      
      if (Platform.OS === 'android') {
        // Android: Can get MCC, MNC, CellID, TAC via native modules
        // For MVP, we'll use what expo-cellular provides
        
        // TODO: Implement native Android module for full cell info
        // Requires: TelephonyManager.getAllCellInfo()
        
        console.warn('[ProofCollector] Full Android cell tower data requires native module');
        
        // Placeholder: derive MCC/MNC from country code
        const mcc = this.countryCodeToMcc(isoCountryCode || 'US');
        
        return {
          mcc,
          mnc: 0, // Unknown
          cellId: 0, // Unknown
          networkName: carrier || undefined,
        };
      } else if (Platform.OS === 'ios') {
        // iOS: CoreTelephony provides limited info
        // Cannot get CellID due to privacy restrictions
        
        console.warn('[ProofCollector] iOS cell tower data is limited by platform');
        
        const mcc = this.countryCodeToMcc(isoCountryCode || 'US');
        
        return {
          mcc,
          mnc: 0, // Unknown on iOS
          cellId: 0, // Not available on iOS
          networkName: carrier || undefined,
        };
      }

      return undefined;
    } catch (error) {
      console.error('[ProofCollector] Cell tower collection failed:', error);
      return undefined;
    }
  }

  /**
   * Collect device information
   * 
   * Includes:
   * - Device model and manufacturer
   * - OS version
   * - App version
   * - Mock location status (Android)
   */
  private async collectDeviceInfo() {
    const osVersion = Platform.Version;
    const model = Device.modelName || Device.deviceName || 'Unknown';
    const os = Platform.OS === 'ios' 
      ? `iOS ${osVersion}`
      : `Android ${osVersion}`;

    // Check for mock location (Android only)
    let mockLocationEnabled: boolean | undefined;
    if (Platform.OS === 'android') {
      // TODO: Implement native check for mock location
      // Requires: Settings.Secure.getString(cr, Settings.Secure.ALLOW_MOCK_LOCATION)
      mockLocationEnabled = undefined; // Unknown for now
    }

    console.log(`[ProofCollector] Device: ${model}, OS: ${os}`);

    return {
      model,
      os,
      appVersion: this.appVersion,
      mockLocationEnabled,
    };
  }

  /**
   * Generate hardware attestation token
   * 
   * Platform-specific implementation:
   * - Android: Play Integrity API (preferred) or SafetyNet (legacy)
   * - iOS: DeviceCheck or App Attest
   * 
   * Attestation proves:
   * - Device is not rooted/jailbroken
   * - App is genuine and unmodified
   * - Request is from real device, not emulator
   * 
   * @param timeout - Max time to wait for attestation (ms)
   * @returns Attestation result with token
   */
  private async generateAttestation(timeout: number): Promise<AttestationResult> {
    const nonce = await this.generateNonce();
    const timestamp = new Date().toISOString();

    if (Platform.OS === 'android') {
      return this.generateAndroidAttestation(nonce, timestamp, timeout);
    } else if (Platform.OS === 'ios') {
      return this.generateIosAttestation(nonce, timestamp, timeout);
    } else {
      throw new Error(`Unsupported platform: ${Platform.OS}`);
    }
  }

  /**
   * Generate Android attestation token
   * 
   * Uses Play Integrity API (requires Google Play Services)
   * Falls back to SafetyNet if Play Integrity unavailable
   */
  private async generateAndroidAttestation(
    nonce: string,
    timestamp: string,
    timeout: number
  ): Promise<AttestationResult> {
    // TODO: Implement Play Integrity API via native module
    // Requires:
    // 1. Google Play Integrity library
    // 2. Cloud project with Play Integrity API enabled
    // 3. Native module to request token
    
    console.warn('[ProofCollector] Android attestation not yet implemented');
    
    // For MVP, return placeholder token
    // In production, this will be a real JWT from Play Integrity API
    const placeholderToken = `android-attestation-${nonce}`;

    return {
      token: placeholderToken,
      platform: 'android',
      method: 'play-integrity',
      timestamp,
      nonce,
      integrity: {
        deviceIntegrity: true,
        appIntegrity: true,
        accountIntegrity: true,
      },
    };

    /* FUTURE IMPLEMENTATION:
    
    const IntegrityManager = NativeModules.IntegrityManager;
    const token = await IntegrityManager.requestIntegrityToken(nonce);
    
    return {
      token,
      platform: 'android',
      method: 'play-integrity',
      timestamp,
      nonce,
    };
    */
  }

  /**
   * Generate iOS attestation token
   * 
   * Uses DeviceCheck API (iOS 11+) or App Attest (iOS 14+)
   * App Attest is preferred for stronger security
   */
  private async generateIosAttestation(
    nonce: string,
    timestamp: string,
    timeout: number
  ): Promise<AttestationResult> {
    // TODO: Implement DeviceCheck/App Attest via native module
    // Requires:
    // 1. DeviceCheck framework
    // 2. App Attest setup (iOS 14+)
    // 3. Native module to generate token
    
    console.warn('[ProofCollector] iOS attestation not yet implemented');
    
    // For MVP, return placeholder token
    // In production, this will be a real token from DeviceCheck/App Attest
    const placeholderToken = `ios-attestation-${nonce}`;

    return {
      token: placeholderToken,
      platform: 'ios',
      method: 'devicecheck',
      timestamp,
      nonce,
      integrity: {
        deviceIntegrity: true,
        appIntegrity: true,
        accountIntegrity: true,
      },
    };

    /* FUTURE IMPLEMENTATION:
    
    const DeviceCheckManager = NativeModules.DeviceCheckManager;
    const token = await DeviceCheckManager.generateToken();
    
    return {
      token,
      platform: 'ios',
      method: 'app-attest',
      timestamp,
      nonce,
    };
    */
  }

  /**
   * Generate cryptographic nonce for replay attack prevention
   * 
   * Uses expo-crypto for secure random generation
   */
  private async generateNonce(): Promise<string> {
    const randomBytes = await Crypto.getRandomBytesAsync(32);
    return Array.from(randomBytes)
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }

  /**
   * Report progress to callback if provided
   */
  private reportProgress(
    options: ProofCollectionOptions,
    step: ProofCollectionProgress['step'],
    message: string,
    percentage: number,
    error?: string
  ) {
    if (options.onProgress) {
      options.onProgress({
        step,
        message,
        percentage,
        error,
      });
    }
  }

  /**
   * Convert ISO country code to Mobile Country Code (MCC)
   * 
   * Simple mapping for common countries
   * Full list: https://en.wikipedia.org/wiki/Mobile_country_code
   */
  private countryCodeToMcc(countryCode: string): number {
    const mccMap: { [key: string]: number } = {
      US: 310, // United States
      CA: 302, // Canada
      GB: 234, // United Kingdom
      DE: 262, // Germany
      FR: 208, // France
      IT: 222, // Italy
      ES: 214, // Spain
      CN: 460, // China
      JP: 440, // Japan
      KR: 450, // South Korea
      IN: 404, // India
      BR: 724, // Brazil
      AU: 505, // Australia
      RU: 250, // Russia
      MX: 334, // Mexico
    };

    return mccMap[countryCode.toUpperCase()] || 999; // 999 = unknown
  }

  /**
   * Map Android constellation type to string
   * 
   * Used for GNSS data collection (future implementation)
   */
  private mapConstellation(type: number): string {
    // Android GnssStatus constellation types
    const constellations: { [key: number]: string } = {
      1: 'GPS',
      2: 'SBAS',
      3: 'GLONASS',
      4: 'QZSS',
      5: 'BEIDOU',
      6: 'GALILEO',
    };

    return constellations[type] || 'UNKNOWN';
  }
}

/**
 * Convenience function to collect proof data
 * 
 * @param account - User's wallet address
 * @param triangleId - STEP triangle identifier
 * @param options - Collection options
 * @returns Proof collection result
 */
export async function collectProofData(
  account: string,
  triangleId: string,
  options: ProofCollectionOptions = {}
): Promise<ProofCollectionResult> {
  const collector = new ProofCollector();
  return collector.collectProof(account, triangleId, options);
}
