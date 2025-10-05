/**
 * Confidence Scoring System for Location Proofs
 * 
 * Replaces binary accept/reject with nuanced 0-100 confidence scoring.
 * Combines multiple independent signals for fraud detection:
 * - Signature verification (20 points)
 * - GPS accuracy (15 points)
 * - Speed gate (10 points)
 * - Moratorium (5 points)
 * - Hardware attestation (25 points)
 * - GNSS raw data (15 points)
 * - Cell tower match (10 points)
 * - Wi-Fi match (10 points, optional)
 * - Witness confirmation (+10 bonus, Phase 3)
 * 
 * Why confidence scoring:
 * - More nuanced fraud detection (not just pass/fail)
 * - Transparent rejection reasons (user sees why proof failed)
 * - Adjustable thresholds (different use cases need different security)
 * - Supports future ML-based scoring
 * 
 * Acceptance thresholds:
 * - 70+ (standard): STEP mining
 * - 85+ (high-security): Financial transactions
 * - 50+ (low-security): Check-ins
 * 
 * Implementation: Phase 2.5
 */

/**
 * Individual component scores contributing to total confidence.
 * Each component represents an independent verification method.
 */
export interface ConfidenceScores {
  signature: number;        // 0-20: EIP-191 signature verification
  gpsAccuracy: number;      // 0-15: GPS accuracy ≤50m
  speedGate: number;        // 0-10: Realistic movement speed
  moratorium: number;       // 0-5: Time between proofs
  attestation: number;      // 0-25: Hardware attestation (Play Integrity/DeviceCheck)
  gnssRaw: number;          // 0-15: GNSS raw data quality (Android only)
  cellTower: number;        // 0-10: Cell tower location match
  wifi: number;             // 0-10: Wi-Fi AP location match (optional)
  witness: number;          // 0-10: Peer attestation bonus (Phase 3)
  total: number;            // 0-110: Sum of all scores (witness can push >100)
}

/**
 * Validation results from various checks.
 * Pass these to computeConfidence() to get scored.
 */
export interface ValidationResults {
  // Basic checks (Phase 2, already implemented)
  signatureValid: boolean;
  gpsAccuracyOk: boolean;
  speedGateOk: boolean;
  moratoriumOk: boolean;
  
  // Advanced checks (Phase 2.5)
  attestationValid: boolean;
  
  // Optional checks (Phase 2.5+)
  gnssRawOk?: boolean;       // Android only
  gnssRawScore?: number;     // 0-15, detailed GNSS scoring
  cellTowerOk?: boolean;
  cellTowerScore?: number;   // 0-10, detailed cell tower scoring
  wifiOk?: boolean;
  wifiScore?: number;        // 0-10, detailed Wi-Fi scoring
  
  // Phase 3
  witnessValid?: boolean;
}

/**
 * Confidence scoring configuration.
 * Allows tuning weights and thresholds per deployment.
 */
export interface ConfidenceConfig {
  // Component weights (can adjust importance of each check)
  weights: {
    signature: number;       // Default: 20
    gpsAccuracy: number;     // Default: 15
    speedGate: number;       // Default: 10
    moratorium: number;      // Default: 5
    attestation: number;     // Default: 25
    gnssRaw: number;         // Default: 15
    cellTower: number;       // Default: 10
    wifi: number;            // Default: 10
    witness: number;         // Default: 10
  };
  
  // Acceptance threshold (0-100)
  acceptanceThreshold: number;  // Default: 70
  
  // Require attestation (strongly recommended)
  requireAttestation: boolean;  // Default: true
}

/**
 * Default configuration for confidence scoring.
 * 
 * Weights are based on security impact:
 * - Attestation (25): Blocks 80%+ of emulator/rooted attacks
 * - Signature (20): Prevents impersonation
 * - GPS Accuracy (15): Basic location quality
 * - GNSS Raw (15): Catches 50-70% of GPS spoofing
 * - Cell Tower (10): Catches 40-60% of GPS spoofing
 * - Wi-Fi (10): Indoor location verification
 * - Speed Gate (10): Prevents teleportation
 * - Moratorium (5): Rate limiting
 * - Witness (10): Decentralized verification (Phase 3)
 */
export const DEFAULT_CONFIDENCE_CONFIG: ConfidenceConfig = {
  weights: {
    signature: 20,
    gpsAccuracy: 15,
    speedGate: 10,
    moratorium: 5,
    attestation: 25,
    gnssRaw: 15,
    cellTower: 10,
    wifi: 10,
    witness: 10,
  },
  acceptanceThreshold: 70,
  requireAttestation: true,
};

/**
 * Compute confidence score from validation results.
 * 
 * Each validation check contributes points to the total score.
 * Score ranges from 0-110 (witness bonus can push above 100).
 * 
 * @param results - Validation results from various checks
 * @param config - Optional scoring configuration (uses defaults if not provided)
 * @returns Detailed confidence scores with component breakdown
 */
export function computeConfidence(
  results: ValidationResults,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): ConfidenceScores {
  const scores: ConfidenceScores = {
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
  };
  
  // Score: Signature verification (20 points max)
  // Why: Prevents impersonation, ensures proof authenticity
  if (results.signatureValid) {
    scores.signature = config.weights.signature;
  }
  
  // Score: GPS accuracy (15 points max)
  // Why: Filters low-quality location data, encourages outdoor mining
  if (results.gpsAccuracyOk) {
    scores.gpsAccuracy = config.weights.gpsAccuracy;
  }
  
  // Score: Speed gate (10 points max)
  // Why: Prevents teleportation, catches rapid-fire spoofing
  if (results.speedGateOk) {
    scores.speedGate = config.weights.speedGate;
  }
  
  // Score: Moratorium (5 points max)
  // Why: Rate-limits submissions, gives GPS time to stabilize
  if (results.moratoriumOk) {
    scores.moratorium = config.weights.moratorium;
  }
  
  // Score: Hardware attestation (25 points max) - CRITICAL
  // Why: Blocks 80%+ of emulator/rooted device attacks
  // This is the single most important anti-spoofing measure
  if (results.attestationValid) {
    scores.attestation = config.weights.attestation;
  }
  
  // Score: GNSS raw data (0-15 points)
  // Why: Catches 50-70% of GPS spoofing via C/N0 profile analysis
  // Only available on Android 7.0+ (API 24+)
  if (results.gnssRawScore !== undefined) {
    // Use detailed GNSS scoring if provided
    scores.gnssRaw = Math.min(results.gnssRawScore, config.weights.gnssRaw);
  } else if (results.gnssRawOk !== undefined) {
    // Fallback to boolean check
    scores.gnssRaw = results.gnssRawOk ? config.weights.gnssRaw : 0;
  }
  
  // Score: Cell tower cross-check (0-10 points)
  // Why: Catches 40-60% of GPS spoofing by verifying cell location matches GPS
  if (results.cellTowerScore !== undefined) {
    // Use detailed cell tower scoring if provided
    scores.cellTower = Math.min(results.cellTowerScore, config.weights.cellTower);
  } else if (results.cellTowerOk !== undefined) {
    // Fallback to boolean check
    scores.cellTower = results.cellTowerOk ? config.weights.cellTower : 0;
  }
  
  // Score: Wi-Fi fingerprinting (0-10 points, optional)
  // Why: Accurate indoor location verification (±10 meters)
  if (results.wifiScore !== undefined) {
    // Use detailed Wi-Fi scoring if provided
    scores.wifi = Math.min(results.wifiScore, config.weights.wifi);
  } else if (results.wifiOk !== undefined) {
    // Fallback to boolean check
    scores.wifi = results.wifiOk ? config.weights.wifi : 0;
  }
  
  // Score: Witness verification (+10 bonus, Phase 3)
  // Why: Decentralized peer attestation, adds trust layer
  if (results.witnessValid) {
    scores.witness = config.weights.witness;
  }
  
  // Calculate total score
  scores.total = 
    scores.signature +
    scores.gpsAccuracy +
    scores.speedGate +
    scores.moratorium +
    scores.attestation +
    scores.gnssRaw +
    scores.cellTower +
    scores.wifi +
    scores.witness;
  
  return scores;
}

/**
 * Determine if proof should be accepted based on confidence score.
 * 
 * Default threshold: 70 points (standard security)
 * - Can be adjusted per use case (high-security: 85+, low-security: 50+)
 * 
 * Attestation requirement:
 * - If requireAttestation=true, proof MUST have valid attestation to pass
 * - This is strongly recommended to block emulator/rooted device attacks
 * 
 * @param scores - Confidence scores from computeConfidence()
 * @param config - Optional configuration (uses defaults if not provided)
 * @returns True if proof should be accepted
 */
export function shouldAccept(
  scores: ConfidenceScores,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): boolean {
  // Check: Attestation required?
  // If attestation is required but not provided, reject immediately
  // This blocks 80%+ of emulator/rooted device attacks
  if (config.requireAttestation && scores.attestation === 0) {
    return false;
  }
  
  // Check: Total score meets threshold?
  return scores.total >= config.acceptanceThreshold;
}

/**
 * Generate human-readable explanation for rejection.
 * 
 * Used in API error responses to help users understand why proof was rejected.
 * Transparent rejection reasons improve UX and trust.
 * 
 * @param scores - Confidence scores from computeConfidence()
 * @param config - Optional configuration (uses defaults if not provided)
 * @returns Array of failure reasons
 */
export function getRejectionReasons(
  scores: ConfidenceScores,
  config: ConfidenceConfig = DEFAULT_CONFIDENCE_CONFIG
): string[] {
  const reasons: string[] = [];
  
  // Check signature
  if (scores.signature === 0) {
    reasons.push('Invalid signature - proof could not be verified');
  }
  
  // Check GPS accuracy
  if (scores.gpsAccuracy === 0) {
    reasons.push('GPS accuracy too low - move outdoors for better signal');
  }
  
  // Check speed gate
  if (scores.speedGate === 0) {
    reasons.push('Movement speed too fast - teleportation detected');
  }
  
  // Check moratorium
  if (scores.moratorium === 0) {
    reasons.push('Submitted too quickly - wait at least 10 seconds between proofs');
  }
  
  // Check attestation (CRITICAL)
  if (config.requireAttestation && scores.attestation === 0) {
    reasons.push('Device attestation failed - emulator or rooted device detected');
  }
  
  // Check GNSS raw data
  if (scores.gnssRaw === 0 && config.weights.gnssRaw > 0) {
    reasons.push('GNSS data quality low or unavailable - satellite signal inconsistent');
  }
  
  // Check cell tower
  if (scores.cellTower === 0 && config.weights.cellTower > 0) {
    reasons.push('Cell tower location mismatch - GPS location inconsistent with network');
  }
  
  // Check Wi-Fi
  if (scores.wifi === 0 && config.weights.wifi > 0) {
    reasons.push('Wi-Fi fingerprint mismatch - location inconsistent with visible networks');
  }
  
  // Add overall confidence message
  reasons.push(
    `Overall confidence: ${scores.total}/${config.acceptanceThreshold} ` +
    `(threshold: ${config.acceptanceThreshold})`
  );
  
  return reasons;
}

/**
 * Get confidence level label for display in UI.
 * 
 * Translates numeric score to human-readable label:
 * - 0-49: "Fraud Likely" (rejected)
 * - 50-69: "Suspicious" (requires review)
 * - 70-84: "Moderate Confidence" (accepted)
 * - 85-100: "High Confidence" (accepted)
 * - 100+: "Very High Confidence" (accepted with witness)
 * 
 * @param score - Total confidence score
 * @returns Confidence level label
 */
export function getConfidenceLevel(score: number): string {
  if (score < 50) {
    return 'Fraud Likely';
  } else if (score < 70) {
    return 'Suspicious';
  } else if (score < 85) {
    return 'Moderate Confidence';
  } else if (score < 100) {
    return 'High Confidence';
  } else {
    return 'Very High Confidence';
  }
}

/**
 * Calculate statistics for monitoring fraud detection performance.
 * 
 * Used for logging and analytics to track:
 * - Average confidence scores
 * - Component performance (which checks catch most fraud)
 * - Rejection rate
 * 
 * @param scores - Array of confidence scores
 * @returns Statistics object
 */
export function calculateConfidenceStats(scores: ConfidenceScores[]): {
  count: number;
  avgTotal: number;
  avgByComponent: {
    signature: number;
    gpsAccuracy: number;
    speedGate: number;
    moratorium: number;
    attestation: number;
    gnssRaw: number;
    cellTower: number;
    wifi: number;
    witness: number;
  };
  acceptanceRate: number;
} {
  if (scores.length === 0) {
    return {
      count: 0,
      avgTotal: 0,
      avgByComponent: {
        signature: 0,
        gpsAccuracy: 0,
        speedGate: 0,
        moratorium: 0,
        attestation: 0,
        gnssRaw: 0,
        cellTower: 0,
        wifi: 0,
        witness: 0,
      },
      acceptanceRate: 0,
    };
  }
  
  const sum = scores.reduce(
    (acc, score) => ({
      total: acc.total + score.total,
      signature: acc.signature + score.signature,
      gpsAccuracy: acc.gpsAccuracy + score.gpsAccuracy,
      speedGate: acc.speedGate + score.speedGate,
      moratorium: acc.moratorium + score.moratorium,
      attestation: acc.attestation + score.attestation,
      gnssRaw: acc.gnssRaw + score.gnssRaw,
      cellTower: acc.cellTower + score.cellTower,
      wifi: acc.wifi + score.wifi,
      witness: acc.witness + score.witness,
    }),
    {
      total: 0,
      signature: 0,
      gpsAccuracy: 0,
      speedGate: 0,
      moratorium: 0,
      attestation: 0,
      gnssRaw: 0,
      cellTower: 0,
      wifi: 0,
      witness: 0,
    }
  );
  
  const count = scores.length;
  const accepted = scores.filter(s => shouldAccept(s)).length;
  
  return {
    count,
    avgTotal: sum.total / count,
    avgByComponent: {
      signature: sum.signature / count,
      gpsAccuracy: sum.gpsAccuracy / count,
      speedGate: sum.speedGate / count,
      moratorium: sum.moratorium / count,
      attestation: sum.attestation / count,
      gnssRaw: sum.gnssRaw / count,
      cellTower: sum.cellTower / count,
      wifi: sum.wifi / count,
      witness: sum.witness / count,
    },
    acceptanceRate: accepted / count,
  };
}
