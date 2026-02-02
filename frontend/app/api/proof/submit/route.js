import { NextResponse } from 'next/server';
import mongoose from '@/app/_lib/db';
import Triangle from '@/app/_models/Triangle';
import crypto from 'crypto';

// Configuration constants
const GPS_MAX_ACCURACY_M = 50;
const PROOF_SPEED_LIMIT_MPS = 15;
const PROOF_MORATORIUM_MS = 10000;

// Verify EIP-191 signature
function verifySignature(message, signature, expectedAddress) {
  try {
    // For PoC, we accept signatures that match our simple hash format
    // In production, use proper EIP-191 verification with secp256k1
    
    // Check if it's our PoC hash-based signature
    if (signature.startsWith('0x') && signature.length >= 130) {
      // Recreate the expected hash
      const encoder = new TextEncoder();
      const dataHash = encoder.encode(message);
      const hashBuffer = crypto.subtle.digest('SHA-256', dataHash).then(buffer => {
        const hashArray = Array.from(new Uint8Array(buffer));
        const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        
        // Extract the actual signature part (first 66 chars = 33 bytes)
        const expectedSig = hashHex + '00'.repeat(65 - hashHex.length + 2);
        
        // For PoC, just check if the address matches (simplified)
        // In production, recover the address from the signature
        return true;
      });
      return true;
    }
    
    // For production, implement proper EIP-191 recovery:
    // 1. Hash the message: keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)
    // 2. Recover public key from signature (r, s, v)
    // 3. Hash public key to get address
    // 4. Compare with expectedAddress
    
    return true; // PoC: accept all valid-format signatures
  } catch (error) {
    console.error('Signature verification error:', error);
    return false;
  }
}

// Build canonical signable message
function buildSignableMessage(payload) {
  return `STEP-PROOF-v1|account:${payload.account}|triangle:${payload.triangleId}|lat:${payload.lat}|lon:${payload.lon}|acc:${payload.accuracy}|ts:${payload.timestamp}|nonce:${payload.nonce}`;
}

export async function POST(request) {
  try {
    await mongoose.connect();

    const body = await request.json();
    const { payload, signature } = body;

    // Validate payload structure
    if (!payload || !signature) {
      return NextResponse.json(
        { ok: false, code: 'INVALID_PAYLOAD', message: 'Missing payload or signature' },
        { status: 400 }
      );
    }

    // Validate required fields
    const requiredFields = ['version', 'account', 'triangleId', 'lat', 'lon', 'accuracy', 'timestamp', 'nonce'];
    for (const field of requiredFields) {
      if (!payload[field]) {
        return NextResponse.json(
          { ok: false, code: 'INVALID_PAYLOAD', message: `Missing required field: ${field}` },
          { status: 400 }
        );
      }
    }

    // Validate version
    if (payload.version !== 'STEP-PROOF-v1') {
      return NextResponse.json(
        { ok: false, code: 'INVALID_VERSION', message: 'Invalid proof version' },
        { status: 400 }
      );
    }

    // Validate coordinates
    if (payload.lat < -90 || payload.lat > 90 || payload.lon < -180 || payload.lon > 180) {
      return NextResponse.json(
        { ok: false, code: 'OUT_OF_BOUNDS', message: 'Coordinates out of bounds' },
        { status: 422 }
      );
    }

    // Check GPS accuracy
    if (payload.accuracy > GPS_MAX_ACCURACY_M) {
      return NextResponse.json(
        { ok: false, code: 'LOW_GPS_ACCURACY', message: `GPS accuracy ${payload.accuracy}m exceeds maximum ${GPS_MAX_ACCURACY_M}m. Move outdoors for better signal.` },
        { status: 422 }
      );
    }

    // Verify signature
    const message = buildSignableMessage(payload);
    // For PoC, we skip strict signature verification
    // In production: const isValid = verifySignature(message, signature, payload.account);
    
    // Find and update triangle
    let triangle = await Triangle.findOne({ triangleId: payload.triangleId }).session(
      await mongoose.startSession()
    );

    if (!triangle) {
      // Create new triangle if it doesn't exist
      triangle = new Triangle({
        triangleId: payload.triangleId,
        level: parseInt(payload.triangleId.split(':')[1]?.split('-')[0]?.replace(/^[A-Z]/, '') || '10'),
        centroid: {
          type: 'Point',
          coordinates: [payload.lon, payload.lat],
        },
        polygon: null, // Would need to fetch from mesh service
        clicks: 1,
        status: 'active',
        lastMinedAt: new Date(),
      });
    } else {
      // Check moratorium (time since last proof)
      if (triangle.lastMinedAt) {
        const timeSinceLast = Date.now() - triangle.lastMinedAt.getTime();
        if (timeSinceLast < PROOF_MORATORIUM_MS) {
          return NextResponse.json(
            { ok: false, code: 'MORATORIUM', message: `Please wait ${Math.ceil((PROOF_MORATORIUM_MS - timeSinceLast) / 1000)} seconds before submitting another proof` },
            { status: 422 }
          );
        }
      }

      // Update triangle
      triangle.clicks += 1;
      triangle.lastMinedAt = new Date();

      if (triangle.clicks >= 11) {
        triangle.status = 'subdivided';
      } else if (triangle.clicks >= 1) {
        triangle.status = 'active';
      }
    }

    // Calculate reward (simplified)
    const level = triangle.level || 10;
    const reward = (1 / Math.pow(2, level - 1)).toFixed(6);

    await triangle.save();

    return NextResponse.json({
      ok: true,
      reward,
      unit: 'STEP',
      triangleId: payload.triangleId,
      level,
      clicks: triangle.clicks,
      balance: reward, // PoC: balance = just this reward
      processedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Proof submission error:', error);
    return NextResponse.json(
      { ok: false, code: 'INTERNAL_ERROR', message: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
