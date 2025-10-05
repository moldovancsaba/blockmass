/**
 * STEP Mobile - Phase 2.5 ProofPayloadV2 Type Definitions
 * 
 * Enhanced proof format with hardware attestation, GNSS raw data,
 * cell tower verification, and comprehensive device information.
 * 
 * Version: 1.1.0
 * Created: 2025-10-05T16:55:00.000Z
 */

/**
 * ProofPayloadV2 - Complete proof payload format for backend submission
 * 
 * This structure is sent to: POST /proof/submit
 * Backend validates and returns confidence score (0-100)
 * 
 * Expected scores:
 * - Android: 95-100 (with GNSS raw data)
 * - iOS: 85-90 (no GNSS raw data available)
 */
export interface ProofPayloadV2 {
  // Protocol version identifier
  version: 'STEP-PROOF-v2';
  
  // User wallet address (Ethereum-style 0x...)
  account: string;
  
  // STEP Triangle identifier (STEP-TRI-v1 format)
  triangleId: string;
  
  // GPS location data
  location: {
    lat: number;          // Latitude (-90 to 90)
    lon: number;          // Longitude (-180 to 180)
    alt?: number;         // Altitude in meters (optional)
    accuracy: number;     // GPS accuracy in meters
  };
  
  // GNSS raw data (Android only, API 24+)
  // Detects GPS spoofing via signal strength analysis
  // Points: +15 for valid GNSS data
  gnss?: {
    satellites: GnssSatellite[];  // Array of visible satellites
    rawAvailable: boolean;         // True if GnssMeasurement API available
  };
  
  // Cell tower data (Android + iOS)
  // Cross-validates location with cellular network
  // Points: +10 for matching cell tower location
  cell?: {
    mcc: number;          // Mobile Country Code
    mnc: number;          // Mobile Network Code
    cellId: number;       // Cell tower identifier
    tac?: number;         // Tracking Area Code (Android)
    rsrp?: number;        // Signal strength (dBm)
  };
  
  // Device information
  device: {
    model: string;                    // Device model (e.g., "iPhone 14", "Pixel 7")
    os: string;                       // OS and version (e.g., "iOS 17.2", "Android 14")
    appVersion: string;               // App version
    mockLocationEnabled?: boolean;    // Android mock location status
  };
  
  // Hardware attestation token
  // Proves device integrity (not rooted/jailbroken, not emulator)
  // Points: +25 for valid attestation
  // Format: Platform-specific JWT or token string
  attestation: string;
  
  // ISO 8601 timestamp with milliseconds (UTC)
  timestamp: string;
  
  // Random nonce for replay attack prevention
  nonce: string;
}

/**
 * GNSS Satellite data structure
 * 
 * Used for GPS spoofing detection via signal analysis:
 * - C/N0 (Carrier-to-Noise density): Real signals show natural variance (35-50 dB-Hz)
 * - Elevation: Natural distribution vs uniform pattern
 * - Constellation diversity: GPS + GLONASS/Galileo/BeiDou
 */
export interface GnssSatellite {
  svid: number;            // Satellite vehicle ID (1-32 for GPS)
  cn0: number;             // Carrier-to-Noise density (dB-Hz, typically 20-50)
  az: number;              // Azimuth angle (0-360 degrees)
  el: number;              // Elevation angle (0-90 degrees)
  constellation: string;   // 'GPS' | 'GLONASS' | 'GALILEO' | 'BEIDOU' | 'QZSS'
}

/**
 * API Response from POST /proof/submit
 * 
 * Backend returns confidence score breakdown and reward calculation
 */
export interface ProofSubmissionResponseV2 {
  ok: boolean;
  
  // Overall confidence score (0-100)
  confidence: number;
  
  // Human-readable confidence level
  confidenceLevel: 'Very High Confidence' | 'High Confidence' | 'Medium Confidence' | 'Low Confidence' | 'No Confidence';
  
  // Detailed score breakdown
  scores: {
    signature: number;        // 20 points (signature validity)
    gpsAccuracy: number;      // 15 points (accuracy <50m)
    speedGate: number;        // 10 points (movement check)
    moratorium: number;       // 5 points (time since last proof)
    attestation: number;      // 25 points (device integrity)
    gnssRaw: number;          // 15 points (GNSS data quality)
    cellTower: number;        // 10 points (location match)
    wifi: number;             // 0 points (not yet implemented)
    witness: number;          // 0 points (not yet implemented)
    total: number;            // Sum of all scores
  };
  
  // Reward information
  reward: string;             // STEP tokens earned (string to preserve precision)
  balance: string;            // New total balance
  
  // Error information (if ok: false)
  error?: string;
  message?: string;
}

/**
 * Cell Tower Data Collection Result
 * 
 * Returned by proof collector when gathering cell tower info
 */
export interface CellTowerData {
  mcc: number;
  mnc: number;
  cellId: number;
  tac?: number;
  rsrp?: number;
  networkName?: string;       // Carrier name (e.g., "Verizon", "T-Mobile")
}

/**
 * GNSS Collection Result
 * 
 * Returned by proof collector when gathering GNSS raw data
 */
export interface GnssCollectionResult {
  satellites: GnssSatellite[];
  rawAvailable: boolean;
  constellations: string[];   // List of detected constellations
  averageCn0: number;         // Average signal strength
  satelliteCount: number;     // Total visible satellites
}

/**
 * Device Attestation Result
 * 
 * Platform-specific attestation token and metadata
 */
export interface AttestationResult {
  token: string;              // JWT or token string
  platform: 'android' | 'ios';
  method: 'play-integrity' | 'safetynet' | 'devicecheck' | 'app-attest';
  timestamp: string;
  nonce: string;
  
  // Debug information (not sent to backend)
  integrity?: {
    deviceIntegrity: boolean; // Not rooted/jailbroken
    appIntegrity: boolean;    // App not modified
    accountIntegrity: boolean; // Valid Play Store account
  };
}

/**
 * Proof Collection Progress
 * 
 * Used for UI progress display during data collection
 */
export interface ProofCollectionProgress {
  step: 'location' | 'gnss' | 'cell' | 'attestation' | 'signing' | 'complete';
  message: string;
  percentage: number;         // 0-100
  error?: string;
}

/**
 * Proof Collection Options
 * 
 * Configuration for proof collector behavior
 */
export interface ProofCollectionOptions {
  includeGnss?: boolean;      // Default: true on Android, false on iOS
  includeCell?: boolean;      // Default: true
  attestationTimeout?: number; // Milliseconds (default: 10000)
  locationTimeout?: number;    // Milliseconds (default: 5000)
  
  // Callback for progress updates
  onProgress?: (progress: ProofCollectionProgress) => void;
}

/**
 * Complete Proof Collection Result
 * 
 * Everything needed to build ProofPayloadV2
 */
export interface ProofCollectionResult {
  success: boolean;
  payload?: ProofPayloadV2;
  error?: string;
  
  // Collection metadata
  collectionTime: number;     // Total milliseconds taken
  warnings?: string[];        // Non-fatal issues encountered
}
