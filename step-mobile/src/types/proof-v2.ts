/**
 * STEP Mobile - ProofPayloadV2 Type Definitions (Phase 2.5)
 * 
 * Phase 2.5 introduces advanced anti-spoofing mechanisms with:
 * - Hardware attestation (Android: Play Integrity, iOS: DeviceCheck)
 * - GNSS raw satellite data (Android only)
 * - Cell tower location verification (both platforms)
 * - Comprehensive device metadata
 * 
 * Why ProofPayloadV2:
 * - Enhanced security beyond basic GPS coordinates
 * - Confidence scoring (0-100) based on multiple signal sources
 * - Multi-factor location proof prevents GPS spoofing
 * - Backward compatible with Phase 2 (v1) validators via version field
 * 
 * Backend Compatibility:
 * - Production API: https://step-blockchain-api.onrender.com/proof/submit
 * - Expected security scores: Android 95-100, iOS 85-90
 * - Requires validator with Phase 2.5 confidence scoring enabled
 */

/**
 * GNSS (GPS, GLONASS, Galileo, BeiDou) Satellite Data
 * 
 * What: Raw satellite measurements from GNSS receivers
 * Why: Detects GPS spoofing by validating signal variance and multi-constellation presence
 * Platform: Android 7.0+ only (iOS doesn't expose raw GNSS data)
 */
export interface GnssData {
  /** Visible satellites with valid measurements */
  satellites: Array<{
    /** Satellite Vehicle ID (unique per constellation) */
    svid: number;
    /** Carrier-to-noise density (dB-Hz) - signal strength indicator */
    cn0: number;
    /** Azimuth angle (degrees, 0-360) */
    az: number;
    /** Elevation angle (degrees, 0-90) */
    el: number;
    /** Constellation: GPS, GLONASS, GALILEO, BEIDOU, QZSS, IRNSS */
    constellation: string;
  }>;
  /** True if raw GNSS data is available on device (false for iOS) */
  rawAvailable: boolean;
}

/**
 * Cell Tower Location Data
 * 
 * What: Cellular network tower information for triangulation
 * Why: Cross-validates GPS location using cell tower database
 * Platform: Both Android and iOS (limited on iOS)
 */
export interface CellTowerData {
  /** Mobile Country Code (e.g., 310 for USA) */
  mcc: number;
  /** Mobile Network Code (carrier identifier) */
  mnc: number;
  /** Cell Tower ID (unique per tower) */
  cellId: number;
  /** Tracking Area Code (LTE) - optional */
  tac?: number;
  /** Reference Signal Received Power (dBm) - signal strength */
  rsrp?: number;
  /** Neighboring cell towers (for triangulation) */
  neighbors?: Array<{
    cellId: number;
    rsrp: number;
  }>;
}

/**
 * Device Metadata
 * 
 * What: Device identification and environment information
 * Why: Detects emulators, rooted devices, and suspicious configurations
 */
export interface DeviceMetadata {
  /** Device model (e.g., "iPhone 14 Pro", "Pixel 7") */
  model: string;
  /** Operating system (e.g., "iOS 17.1", "Android 14") */
  os: string;
  /** App version (from package.json) */
  appVersion: string;
  /** True if mock location is enabled (Android only) */
  mockLocationEnabled?: boolean;
}

/**
 * ProofPayloadV2 - Enhanced Location Proof (Phase 2.5)
 * 
 * What: Comprehensive location proof with multi-signal validation
 * Why: 
 * - Phase 2 (v1) used only GPS coordinates + signature
 * - Phase 2.5 adds hardware attestation + GNSS + cell tower data
 * - Enables confidence scoring (0-100) instead of binary accept/reject
 * - Prevents GPS spoofing through cross-validation of multiple signals
 * 
 * Signature:
 * - Uses EIP-191 (Ethereum personal_sign) standard
 * - Message: JSON.stringify(entire payload)
 * - Signed with user's wallet private key (secp256k1)
 * - Validator recovers public key and verifies address matches payload.account
 * 
 * Backward Compatibility:
 * - Version field distinguishes v2 from v1 proofs
 * - Validators check version and apply appropriate validation logic
 * - v2 proofs can coexist with v1 during transition period
 */
export interface ProofPayloadV2 {
  /** Protocol version identifier (always "STEP-PROOF-v2") */
  version: 'STEP-PROOF-v2';
  
  /** User's Ethereum-compatible wallet address (0x-prefixed, 42 chars) */
  account: string;
  
  /** Triangle identifier (STEP-TRI-v1:L{level}:F{face}:P{path}) */
  triangleId: string;
  
  /** Primary GPS location data */
  location: {
    /** WGS84 latitude in decimal degrees (-90 to 90) */
    lat: number;
    /** WGS84 longitude in decimal degrees (-180 to 180) */
    lon: number;
    /** Altitude in meters above sea level (optional) */
    alt?: number;
    /** GPS accuracy radius in meters (smaller = better) */
    accuracy: number;
  };
  
  /** GNSS raw satellite data (Android only, undefined for iOS) */
  gnss?: GnssData;
  
  /** Cell tower location data (both platforms, may be undefined if unavailable) */
  cell?: CellTowerData;
  
  /** Device identification and environment metadata */
  device: DeviceMetadata;
  
  /** 
   * Hardware attestation token
   * 
   * What: Cryptographic proof that app is running on genuine hardware
   * Why: Prevents emulators, rooted devices, and modified apps from mining
   * 
   * Android: Play Integrity API token (JWT)
   * iOS: DeviceCheck/App Attest token (base64)
   * 
   * Format: Opaque token string verified by respective platform APIs
   * Length: Variable (typically 500-2000 chars)
   */
  attestation: string;
  
  /** 
   * Proof timestamp (ISO 8601 with milliseconds in UTC)
   * Format: YYYY-MM-DDTHH:MM:SS.sssZ
   * Example: 2025-10-06T19:54:12.789Z
   */
  timestamp: string;
  
  /** 
   * Unique nonce for replay protection (UUID v4)
   * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   * Why: Prevents resubmission of same proof (compound unique index with account)
   */
  nonce: string;
}

/**
 * Confidence Score Breakdown
 * 
 * What: Individual scores contributing to total confidence (0-100)
 * Why: Transparency in validation logic; helps debug rejected proofs
 */
export interface ConfidenceScores {
  /** Signature verification (0-20) */
  signature: number;
  /** GPS accuracy gate (0-15) */
  gpsAccuracy: number;
  /** Speed gate (0-10) */
  speedGate: number;
  /** Moratorium (0-5) */
  moratorium: number;
  /** Hardware attestation (0-25) */
  attestation: number;
  /** GNSS raw data validation (0-15, Android only) */
  gnssRaw: number;
  /** Cell tower triangulation (0-10) */
  cellTower: number;
  /** WiFi location (0-5, future) */
  wifi: number;
  /** Witness verification (0-10, future) */
  witness: number;
  /** Total confidence score (sum of all, max 100) */
  total: number;
}

/**
 * ProofSubmissionResponseV2 - Enhanced Validator Response
 * 
 * What: Response from validator API after proof submission
 * Why:
 * - Phase 2 (v1) returned binary accept/reject
 * - Phase 2.5 returns confidence score with detailed breakdown
 * - Enables graduated rewards based on proof quality
 */
export interface ProofSubmissionResponseV2 {
  /** True if proof accepted (confidence >= minimum threshold) */
  ok: boolean;
  
  /** 
   * Confidence score (0-100)
   * - 0: No confidence (likely spoofed)
   * - 1-49: Low confidence (rejected)
   * - 50-74: Medium confidence (accepted with reduced reward)
   * - 75-89: High confidence (full reward)
   * - 90-100: Very high confidence (potential bonus)
   */
  confidence: number;
  
  /** 
   * Human-readable confidence level
   * Values: "No Confidence", "Low Confidence", "Medium Confidence", 
   *         "High Confidence", "Very High Confidence"
   */
  confidenceLevel: string;
  
  /** Individual score breakdown for transparency */
  scores: ConfidenceScores;
  
  /** 
   * Reward amount in STEP tokens (decimal string)
   * Format: "0.5" (6 decimal precision)
   * May be scaled by confidence (e.g., 50% reward for medium confidence)
   */
  reward: string;
  
  /** 
   * Updated account balance in STEP tokens (decimal string)
   * Format: "123.456789"
   */
  balance: string;
  
  /** 
   * Error message if ok=false
   * Contains rejection reason and suggestions
   */
  error?: string;
  
  /** 
   * Rejection reasons (array of strings)
   * Examples: "GPS accuracy too low", "Hardware attestation failed",
   *           "Cell tower mismatch", "GNSS variance suspicious"
   */
  reasons?: string[];
  
  /** 
   * Processed timestamp (ISO 8601 with milliseconds UTC)
   * Format: YYYY-MM-DDTHH:MM:SS.sssZ
   */
  processedAt?: string;
}
