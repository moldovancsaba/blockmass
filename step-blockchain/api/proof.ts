/**
 * Proof Submission API
 * 
 * Handles location proof validation and token distribution.
 * 
 * Phase 2 MVP: Centralized validator
 * - Single server validates all proofs
 * - MongoDB transactions ensure atomicity
 * - Anti-spoof heuristics (GPS accuracy, speed gate, moratorium)
 * 
 * Phase 3+: Decentralized consensus
 * - Multiple validators vote on proofs
 * - BFT consensus for finality
 * - Advanced anti-spoof (multi-sensor fusion, witness network)
 * 
 * Security model:
 * - Signature verification prevents impersonation
 * - Nonce uniqueness prevents replay attacks
 * - Transactions prevent double-spend under concurrency
 * - Geospatial checks prevent out-of-bounds mining
 * - Heuristics catch basic spoofing (teleportation, rapid-fire)
 */

import express, { Router, Request, Response } from 'express';
import { Triangle, TriangleEvent, Account, getOrCreateAccount, updateBalance } from '../core/state/schemas.js';
import type { ProofPayload, ProofPayloadV2 } from '../core/validator/signature.js';
import { verifySignature, isProofPayloadV2 } from '../core/validator/signature.js';
import {
  isPointInTriangle,
  validateGpsAccuracy,
  validateSpeedGate,
  validateMoratorium,
  getConfig as getValidatorConfig,
} from '../core/validator/geometry.js';
import { 
  getChildrenIds, 
  decodeTriangleId, 
  encodeTriangleId 
} from '../core/mesh/addressing.js';
import { triangleIdToPolygon, triangleIdToCentroid } from '../core/mesh/polygon.js';
import {
  computeConfidence,
  shouldAccept,
  getRejectionReasons,
  getConfidenceLevel,
  type ValidationResults,
} from '../core/validator/confidence.js';
import {
  verifyAttestation,
  isAttestationRequired,
  type AttestationResult,
} from '../core/validator/attestation.js';
import {
  verifyGnssRaw,
  type GnssResult,
} from '../core/validator/gnss.js';
import {
  verifyCellTower,
  type CellTowerResult,
} from '../core/validator/cell-tower.js';

const router = Router();

/**
 * Error codes for structured error responses.
 * 
 * Why structured codes:
 * - Mobile app can show user-friendly messages
 * - Easier debugging and monitoring
 * - Consistent error handling across API
 */
const ErrorCode = {
  INVALID_PAYLOAD: 'INVALID_PAYLOAD',
  BAD_SIGNATURE: 'BAD_SIGNATURE',
  OUT_OF_BOUNDS: 'OUT_OF_BOUNDS',
  LOW_GPS_ACCURACY: 'LOW_GPS_ACCURACY',
  LOW_CONFIDENCE: 'LOW_CONFIDENCE',  // Phase 2.5: Confidence score below threshold
  ATTESTATION_REQUIRED: 'ATTESTATION_REQUIRED',  // Phase 2.5: Missing attestation
  ATTESTATION_FAILED: 'ATTESTATION_FAILED',  // Phase 2.5: Attestation verification failed
  NONCE_REPLAY: 'NONCE_REPLAY',
  TOO_FAST: 'TOO_FAST',
  MORATORIUM: 'MORATORIUM',
  TRIANGLE_NOT_FOUND: 'TRIANGLE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

/**
 * Extract location data from proof payload (v1 or v2)
 * 
 * Why: ProofPayloadV2 restructures location into a nested object.
 * This helper provides backward compatibility for v1 while supporting v2.
 * 
 * @param payload - Proof payload (v1 or v2)
 * @returns Location data (lat, lon, accuracy)
 */
function extractLocation(payload: ProofPayload | ProofPayloadV2): {
  lat: number;
  lon: number;
  accuracy: number;
} {
  if (isProofPayloadV2(payload)) {
    return {
      lat: payload.location.lat,
      lon: payload.location.lon,
      accuracy: payload.location.accuracy,
    };
  } else {
    return {
      lat: payload.lat,
      lon: payload.lon,
      accuracy: payload.accuracy,
    };
  }
}

/**
 * Detect platform from proof payload
 * 
 * Why: ProofPayloadV2 includes device.os field.
 * Used to route attestation verification to correct platform (Android/iOS).
 * 
 * @param payload - Proof payload (v1 or v2)
 * @returns Platform ('android', 'ios', or 'unknown')
 */
function detectPlatform(payload: ProofPayload | ProofPayloadV2): 'android' | 'ios' | 'unknown' {
  if (!isProofPayloadV2(payload)) {
    return 'unknown';
  }
  
  const os = payload.device.os.toLowerCase();
  if (os.includes('android')) {
    return 'android';
  } else if (os.includes('ios')) {
    return 'ios';
  } else {
    return 'unknown';
  }
}

/**
 * Calculate reward for a given triangle level.
 * 
 * Formula: reward(level) = 1 / 2^(level - 1) STEP tokens
 * 
 * Examples:
 * - Level 1: 1 STEP
 * - Level 2: 0.5 STEP
 * - Level 10: 0.001953125 STEP
 * - Level 21: 0.00000095367431640625 STEP
 * 
 * Why exponential decay:
 * - Higher-level (smaller) triangles are harder to reach
 * - Creates scarcity gradient across mesh hierarchy
 * - Total supply converges (28 clicks * sum of geometric series)
 * 
 * Precision:
 * - Store as decimal string to avoid floating-point errors
 * - Use 6 decimal places for display
 * - MongoDB stores balance as string for exact arithmetic
 * 
 * @param level - Triangle level (1-21)
 * @returns Reward as decimal string
 */
function calculateReward(level: number): string {
  if (level < 1 || level > 21) {
    throw new Error(`Invalid triangle level: ${level}. Must be 1-21.`);
  }
  
  // reward = 1 / 2^(level - 1)
  const divisor = Math.pow(2, level - 1);
  const reward = 1 / divisor;
  
  // Format to 6 decimal places (sufficient for level 21)
  return reward.toFixed(6);
}

/**
 * POST /proof/submit
 * 
 * Submit a location proof for validation and token reward.
 * 
 * Request body:
 * {
 *   payload: ProofPayload,  // See core/validator/signature.ts
 *   signature: string       // 65-byte hex signature
 * }
 * 
 * Success response (200):
 * {
 *   ok: true,
 *   reward: "0.5",
 *   unit: "STEP",
 *   triangleId: "STEP-TRI-v1:...",
 *   level: 10,
 *   clicks: 5,
 *   balance: "2.5",
 *   processedAt: "2025-10-03T16:50:00.123Z"
 * }
 * 
 * Error response (4xx/5xx):
 * {
 *   ok: false,
 *   code: "ERROR_CODE",
 *   message: "Human-readable error message",
 *   timestamp: "2025-10-03T16:50:00.123Z"
 * }
 */
router.post('/submit', async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();
  
  try {
    // ========================================================================
    // Step 1: Validate request structure
    // ========================================================================
    
    const { payload, signature } = req.body;
    
    if (!payload || !signature) {
      return res.status(400).json({
        ok: false,
        code: ErrorCode.INVALID_PAYLOAD,
        message: 'Missing payload or signature',
        timestamp,
      });
    }
    
    // Validate payload fields (support v1 and v2)
    const version = payload.version;
    const account = payload.account;
    const triangleId = payload.triangleId;
    const proofTimestamp = payload.timestamp;
    const nonce = payload.nonce;
    
    // Extract location (works for v1 and v2)
    const { lat, lon, accuracy } = extractLocation(payload);
    
    if (
      !version ||
      !account ||
      !triangleId ||
      lat === undefined ||
      lon === undefined ||
      accuracy === undefined ||
      !proofTimestamp ||
      !nonce
    ) {
      return res.status(400).json({
        ok: false,
        code: ErrorCode.INVALID_PAYLOAD,
        message: 'Missing required payload fields',
        timestamp,
      });
    }
    
    // Support both v1 and v2 payloads
    if (version !== 'STEP-PROOF-v1' && version !== 'STEP-PROOF-v2') {
      return res.status(400).json({
        ok: false,
        code: ErrorCode.INVALID_PAYLOAD,
        message: `Unsupported proof version: ${version}`,
        timestamp,
      });
    }
    
    // ========================================================================
    // Step 2: Validate GPS accuracy
    // ========================================================================
    // Why before DB: Fail fast on obvious issues to reduce load
    
    if (!validateGpsAccuracy(accuracy)) {
      const config = getValidatorConfig();
      return res.status(422).json({
        ok: false,
        code: ErrorCode.LOW_GPS_ACCURACY,
        message: `GPS accuracy ${accuracy}m exceeds maximum ${config.GPS_MAX_ACCURACY_M}m. Move outdoors for better signal.`,
        timestamp,
      });
    }
    
    // ========================================================================
    // Step 3: Verify signature
    // ========================================================================
    // Why before DB: Prevent unauthorized submissions from hitting DB
    
    console.log(`[${timestamp}] Verifying signature for ${account}...`);
    
    const sigResult = await verifySignature(payload, signature, account);
    
    if (!sigResult.ok) {
      console.warn(`[${timestamp}] Signature verification failed:`, sigResult.error);
      return res.status(401).json({
        ok: false,
        code: ErrorCode.BAD_SIGNATURE,
        message: sigResult.error || 'Signature verification failed',
        timestamp,
      });
    }
    
    console.log(`[${timestamp}] Signature valid for ${account}`);
    
    // ========================================================================
    // Step 4: Check nonce replay (pre-check)
    // ========================================================================
    // Why: Fast rejection before expensive DB operations
    // Note: Final check happens inside transaction with unique index
    
    const existingNonce = await TriangleEvent.findOne({
      account,
      nonce,
    }).lean();
    
    if (existingNonce) {
      console.warn(`[${timestamp}] Nonce replay detected: ${account} / ${nonce}`);
      return res.status(409).json({
        ok: false,
        code: ErrorCode.NONCE_REPLAY,
        message: 'Nonce already used. Each proof must have unique nonce.',
        timestamp,
      });
    }
    
    // ========================================================================
    // Step 5: Fetch triangle (for now, create mock if not exists)
    // ========================================================================
    // TODO Phase 2: Replace with real mesh lookup after mesh is populated
    
    let triangle = await Triangle.findById(triangleId);
    
    if (!triangle) {
      // For MVP: Create mock triangle
      // In production: This would be an error (triangle must pre-exist in mesh)
      console.log(`[${timestamp}] Triangle not found, creating mock: ${triangleId}`);
      
      // Extract level from triangle ID (simplified)
      // Real format: STEP-TRI-v1:L{level}:...
      const levelMatch = triangleId.match(/L(\d+)/);
      const level = levelMatch ? parseInt(levelMatch[1], 10) : 10;
      
      triangle = new Triangle({
        _id: triangleId,
        face: 0,
        level,
        pathEncoded: '0',
        parentId: null,
        childrenIds: [],
        state: 'active',
        clicks: 0,
        moratoriumStartAt: new Date(),
        lastClickAt: null,
        centroid: {
          type: 'Point',
          coordinates: [lon, lat],
        },
        polygon: {
          type: 'Polygon',
          coordinates: [
            [
              [lon - 0.01, lat - 0.01],
              [lon + 0.01, lat - 0.01],
              [lon, lat + 0.01],
              [lon - 0.01, lat - 0.01],
            ],
          ],
        },
      });
      
      await triangle.save();
    }
    
    // ========================================================================
    // Step 6: Validate geometry (point-in-triangle)
    // ========================================================================
    
    const inTriangle = isPointInTriangle(lat, lon, triangle.polygon);
    
    if (!inTriangle) {
      console.warn(`[${timestamp}] Out of bounds: ${lat},${lon} not in ${triangleId}`);
      return res.status(422).json({
        ok: false,
        code: ErrorCode.OUT_OF_BOUNDS,
        message: 'Location is outside triangle boundary',
        timestamp,
      });
    }
    
    // ========================================================================
    // Step 7: Load previous proof for heuristics
    // ========================================================================
    
    const previousProof = await TriangleEvent.findOne({
      account,
      eventType: 'click',
    })
      .sort({ timestamp: -1 })
      .lean();
    
    // ========================================================================
    // Step 8: Validate heuristics (speed gate, moratorium)
    // ========================================================================
    
    if (previousProof) {
      // Speed gate check
      const speedResult = validateSpeedGate(
        {
          lat: previousProof.payload.lat || 0,
          lon: previousProof.payload.lon || 0,
          timestamp: previousProof.timestamp.toISOString(),
        },
        {
          lat,
          lon,
          timestamp: proofTimestamp,
        }
      );
      
      if (!speedResult.ok) {
        console.warn(`[${timestamp}] Speed gate failed:`, speedResult.error);
        return res.status(422).json({
          ok: false,
          code: ErrorCode.TOO_FAST,
          message: speedResult.error,
          timestamp,
        });
      }
      
      // Moratorium check
      const moratoriumResult = validateMoratorium(
        previousProof.timestamp.toISOString(),
        proofTimestamp
      );
      
      if (!moratoriumResult.ok) {
        console.warn(`[${timestamp}] Moratorium failed:`, moratoriumResult.error);
        return res.status(422).json({
          ok: false,
          code: ErrorCode.MORATORIUM,
          message: moratoriumResult.error,
          timestamp,
        });
      }
    }
    
    // ========================================================================
    // Step 9: Phase 2.5 - Confidence Scoring (Anti-Spoofing)
    // ========================================================================
    // Why: Replace binary accept/reject with nuanced 0-100 confidence score.
    // Combines multiple signals: signature, attestation, GPS, GNSS, cell, etc.
    // Transparent: Users see their confidence score and rejection reasons.
    
    let attestationResult: AttestationResult | undefined;
    let gnssResult: GnssResult | undefined;
    let cellTowerResult: CellTowerResult | undefined;
    let confidenceScore = 0;
    let validationResults: ValidationResults;
    
    // Basic validation results (always present)
    validationResults = {
      signatureValid: true,  // Already verified in Step 3
      gpsAccuracyOk: true,  // Already verified in Step 2
      speedGateOk: true,  // Already verified in Step 8
      moratoriumOk: true,  // Already verified in Step 8
      attestationValid: false,  // Will check below
      gnssRawOk: false,  // Phase 2.5 Week 2
      cellTowerOk: false,  // Phase 2.5 Week 3
      wifiOk: false,  // Phase 2.5 Week 3 (optional)
      witnessValid: false,  // Phase 3
    };
    
    // Check attestation (Phase 2.5 Week 1)
    if (isProofPayloadV2(payload) && payload.attestation) {
      const platform = detectPlatform(payload);
      
      // Skip attestation verification if platform is unknown (v2 payload but no device.os)
      if (platform === 'unknown') {
        console.warn(`[${timestamp}] Unknown platform, skipping attestation for ${account}`);
      } else {
        const expectedId = platform === 'android'
          ? process.env.ANDROID_PACKAGE_NAME || 'com.stepblockchain.app'
          : process.env.IOS_BUNDLE_ID || 'com.stepblockchain.app';
        
        try {
          attestationResult = await verifyAttestation(
            payload.attestation,
            platform,
            expectedId
          );
          validationResults.attestationValid = attestationResult.passed;
          
          console.log(`[${timestamp}] Attestation verified:`, {
            platform,
            passed: attestationResult.passed,
            score: attestationResult.score,
          });
        } catch (error) {
          console.warn(`[${timestamp}] Attestation verification error:`, error);
          attestationResult = {
            score: 0,
            passed: false,
            platform,
            error: error instanceof Error ? error.message : 'Unknown error',
            verifiedAt: new Date().toISOString(),
          };
        }
      }
    } else if (isAttestationRequired()) {
      // Attestation required but missing
      console.warn(`[${timestamp}] Attestation required but missing for ${account}`);
      return res.status(422).json({
        ok: false,
        code: ErrorCode.ATTESTATION_REQUIRED,
        message: 'Hardware attestation is required. Please update your app.',
        timestamp,
      });
    }
    
    // Check GNSS raw data (Phase 2.5 Week 2 - Android only)
    if (isProofPayloadV2(payload) && payload.gnss) {
      try {
        gnssResult = verifyGnssRaw(payload.gnss);
        validationResults.gnssRawOk = gnssResult.passed;
        validationResults.gnssRawScore = gnssResult.score;
        
        console.log(`[${timestamp}] GNSS verified:`, {
          satellites: gnssResult.satelliteCount,
          constellations: gnssResult.constellations,
          score: gnssResult.score,
          passed: gnssResult.passed,
        });
        
        if (gnssResult.issues.length > 0) {
          console.warn(`[${timestamp}] GNSS issues detected:`, gnssResult.issues);
        }
      } catch (error) {
        console.warn(`[${timestamp}] GNSS verification error:`, error);
        // Non-critical - continue without GNSS score
      }
    }
    
    // Check cell tower (Phase 2.5 Week 3 - Android & iOS)
    if (isProofPayloadV2(payload) && payload.cell) {
      try {
        cellTowerResult = await verifyCellTower(payload.cell, lat, lon);
        validationResults.cellTowerOk = cellTowerResult.passed;
        validationResults.cellTowerScore = cellTowerResult.score;
        
        console.log(`[${timestamp}] Cell tower verified:`, {
          distance: cellTowerResult.distanceKm,
          score: cellTowerResult.score,
          passed: cellTowerResult.passed,
        });
        
        if (cellTowerResult.issues.length > 0) {
          console.warn(`[${timestamp}] Cell tower issues:`, cellTowerResult.issues);
        }
      } catch (error) {
        console.warn(`[${timestamp}] Cell tower verification error:`, error);
        // Non-critical - continue without cell tower score
      }
    }
    
    // Compute confidence score
    const confidenceResult = computeConfidence(validationResults);
    confidenceScore = confidenceResult.total;
    
    console.log(`[${timestamp}] Confidence score: ${confidenceScore}/100`, {
      level: getConfidenceLevel(confidenceScore),
      scores: confidenceResult,
    });
    
    // Check acceptance threshold
    const accepted = shouldAccept(confidenceResult);
    
    if (!accepted) {
      const reasons = getRejectionReasons(confidenceResult);
      console.warn(`[${timestamp}] Proof rejected (confidence ${confidenceScore}/100):`, reasons);
      
      return res.status(422).json({
        ok: false,
        code: ErrorCode.LOW_CONFIDENCE,
        message: `Confidence score too low (${confidenceScore}/100). Reasons: ${reasons.join('; ')}`,
        confidence: confidenceScore,
        confidenceLevel: getConfidenceLevel(confidenceScore),
        reasons,
        timestamp,
      });
    }
    
    console.log(`[${timestamp}] Proof accepted (confidence ${confidenceScore}/100)`);
    
    // ========================================================================
    // Step 10: Calculate reward
    // ========================================================================
    
    const reward = calculateReward(triangle.level);
    
    // ========================================================================
    // Step 10: Atomic transaction - update state and award tokens
    // ========================================================================
    // Why transaction: Ensures nonce uniqueness, balance update, and
    // triangle state mutation happen atomically. Prevents partial updates
    // under concurrent submissions.
    
    console.log(`[${timestamp}] Starting transaction for ${account}...`);
    
    const session = await Triangle.startSession();
    
    try {
      await session.withTransaction(async () => {
        // Create event record (unique index enforces nonce uniqueness)
        const eventId = `proof-${Date.now()}-${Math.random().toString(36).substring(7)}`;
        
        const event = new TriangleEvent({
          _id: eventId,
          triangleId,
          eventType: 'click',
          timestamp: new Date(proofTimestamp),
          account,
          nonce,
          signature,
          payload: {
            minerAddress: account,
            reward,
            clickNumber: triangle.clicks + 1,
            lat,
            lon,
            accuracy,
            speed: previousProof ? validateSpeedGate(
              {
                lat: previousProof.payload.lat || 0,
                lon: previousProof.payload.lon || 0,
                timestamp: previousProof.timestamp.toISOString(),
              },
              { lat, lon, timestamp: proofTimestamp }
            ).speed : undefined,
          },
        });
        
        await event.save({ session });
        
        // Increment triangle clicks
        triangle.clicks += 1;
        triangle.lastClickAt = new Date();
        await triangle.save({ session });
        
        // ====================================================================
        // Subdivision Logic: Trigger when clicks reach 11
        // ====================================================================
        // Why: At 11 clicks, triangle has been sufficiently mined
        // Action: Subdivide into 4 children, mark parent as subdivided
        // Implementation: Uses Phase 1 mesh utilities for deterministic
        // subdivision based on geodesic midpoints on sphere
        
        if (triangle.clicks === 11) {
          console.log(`[${timestamp}] Subdivision triggered for ${triangleId}`);
          
          try {
            // Decode parent triangle ID to get face, level, path
            const parentId = decodeTriangleId(triangleId);
            
            // Get 4 child triangle IDs (adds one path digit to each)
            const childIds = getChildrenIds(parentId);
            
            // Create child triangle documents
            const childTriangles = childIds.map((childId) => {
              // Compute polygon and centroid using Phase 1 utilities
              const polygon = triangleIdToPolygon(childId);
              const centroid = triangleIdToCentroid(childId);
              
              // Encode child ID to STEP-TRI-v1 string format
              const childTriangleId = encodeTriangleId(childId);
              
              return new Triangle({
                _id: childTriangleId,
                face: childId.face,
                level: childId.level,
                pathEncoded: childId.path.join(''),
                parentId: triangleId,
                childrenIds: [],
                state: 'active',
                clicks: 0,
                moratoriumStartAt: new Date(),
                lastClickAt: null,
                centroid,
                polygon,
              });
            });
            
            // Save all 4 child triangles
            await Triangle.insertMany(childTriangles, { session });
            
            // Update parent triangle: mark as subdivided
            triangle.state = 'subdivided';
            triangle.childrenIds = childTriangles.map(t => t._id);
            await triangle.save({ session });
            
            // Create subdivision event for audit trail
            const subdivisionEventId = `subdivision-${Date.now()}-${Math.random().toString(36).substring(7)}`;
            const subdivisionEvent = new TriangleEvent({
              _id: subdivisionEventId,
              triangleId,
              eventType: 'subdivide',
              timestamp: new Date(),
              account: null,
              nonce: null,
              signature: null,
              payload: {
                parentId: triangleId,
                childrenIds: triangle.childrenIds,
                level: parentId.level,
                newLevel: parentId.level + 1,
              },
            });
            await subdivisionEvent.save({ session });
            
            console.log(`[${timestamp}] Subdivision complete: ${triangleId} → 4 children at level ${parentId.level + 1}`);
          } catch (subdivisionError) {
            console.error(`[${timestamp}] Subdivision failed:`, subdivisionError);
            throw subdivisionError; // Rollback transaction on subdivision failure
          }
        }
        
        // Update account balance
        // Convert reward string to bigint (assuming 6 decimals)
        const rewardFloat = parseFloat(reward);
        const rewardBigInt = BigInt(Math.round(rewardFloat * 1e6)); // 6 decimals precision
        
        await updateBalance(account, rewardBigInt);
        
        console.log(`[${timestamp}] Transaction complete: ${account} +${reward} STEP`);
      });
    } finally {
      await session.endSession();
    }
    
    // ========================================================================
    // Step 11: Load updated balance and return success
    // ========================================================================
    
    const accountDoc = await getOrCreateAccount(account);
    const balance = (BigInt(accountDoc.balance) / BigInt(1e6)).toString(); // Convert back to decimal
    
    console.log(`[${timestamp}] Proof validated: ${triangleId} by ${account}`);
    
    // Return success with confidence score (Phase 2.5)
    return res.status(200).json({
      ok: true,
      reward,
      unit: 'STEP',
      triangleId,
      level: triangle.level,
      clicks: triangle.clicks,
      balance,
      confidence: confidenceScore,  // Phase 2.5: Confidence score (0-100)
      confidenceLevel: getConfidenceLevel(confidenceScore),  // Phase 2.5: UI display label
      scores: confidenceResult,  // Phase 2.5: Component scores for debugging
      processedAt: timestamp,
    });
    
  } catch (error) {
    console.error(`[${timestamp}] Error processing proof:`, error);
    
    return res.status(500).json({
      ok: false,
      code: ErrorCode.INTERNAL_ERROR,
      message: error instanceof Error ? error.message : 'Internal server error',
      timestamp,
    });
  }
});

/**
 * GET /proof/config
 * 
 * Get current validator configuration (for debugging).
 * 
 * Response:
 * {
 *   GPS_MAX_ACCURACY_M: 50,
 *   PROOF_SPEED_LIMIT_MPS: 15,
 *   PROOF_MORATORIUM_MS: 10000
 * }
 */
router.get('/config', (req: Request, res: Response) => {
  const config = getValidatorConfig();
  res.json(config);
});

export default router;
