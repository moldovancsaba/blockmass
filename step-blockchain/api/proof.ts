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
import type { ProofPayload } from '../core/validator/signature.js';
import { verifySignature } from '../core/validator/signature.js';
import {
  isPointInTriangle,
  validateGpsAccuracy,
  validateSpeedGate,
  validateMoratorium,
  getConfig as getValidatorConfig,
} from '../core/validator/geometry.js';

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
  NONCE_REPLAY: 'NONCE_REPLAY',
  TOO_FAST: 'TOO_FAST',
  MORATORIUM: 'MORATORIUM',
  TRIANGLE_NOT_FOUND: 'TRIANGLE_NOT_FOUND',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

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
    
    // Validate payload fields
    const {
      version,
      account,
      triangleId,
      lat,
      lon,
      accuracy,
      timestamp: proofTimestamp,
      nonce,
    } = payload as ProofPayload;
    
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
    
    if (version !== 'STEP-PROOF-v1') {
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
    // Step 9: Calculate reward
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
    
    return res.status(200).json({
      ok: true,
      reward,
      unit: 'STEP',
      triangleId,
      level: triangle.level,
      clicks: triangle.clicks,
      balance,
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
