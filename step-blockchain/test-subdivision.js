/**
 * Automated Subdivision Test Script
 * 
 * This script:
 * 1. Generates a test wallet
 * 2. Creates a test triangle in MongoDB
 * 3. Submits 11 proofs to trigger subdivision
 * 4. Verifies subdivision occurred correctly
 */

import * as secp from '@noble/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { sha256 } from '@noble/hashes/sha256';
import { keccak_256 } from '@noble/hashes/sha3';
import fetch from 'node-fetch';
import { MongoClient } from 'mongodb';

// Set up HMAC for @noble/secp256k1
secp.etc.hmacSha256Sync = (key, ...msgs) => {
  const h = hmac.create(sha256, key);
  msgs.forEach(msg => h.update(msg));
  return h.digest();
};

// Configuration
const API_URL = 'http://localhost:3002';
const MONGODB_URI = 'mongodb+srv://moldovancsaba_blockmass:MbpKmyyRHDKMECXd@blockmass-cluster.1dzskdf.mongodb.net/step?retryWrites=true&w=majority&appName=blockmass-cluster';

// Test triangle configuration
const TEST_TRIANGLE_ID = 'STEP-TRI-v1:A10-00000000000000000000-UPB'; // Proper checksum
const TEST_LOCATION = {
  lat: 37.7749,
  lon: -122.4194,
};

// ============================================================================
// Wallet Generation
// ============================================================================

function generateWallet() {
  console.log('\n🔑 Generating test wallet...');
  
  // Generate random private key (32 bytes)
  const privateKey = new Uint8Array(32);
  for (let i = 0; i < 32; i++) {
    privateKey[i] = Math.floor(Math.random() * 256);
  }
  const privateKeyHex = '0x' + Buffer.from(privateKey).toString('hex');
  
  // Derive public key using v2 API
  const publicKey = secp.getPublicKey(privateKey, false); // Uncompressed
  
  // Derive Ethereum address (last 20 bytes of keccak256(publicKey))
  const publicKeyHash = keccak_256(publicKey.slice(1)); // Remove 0x04 prefix
  const address = '0x' + Buffer.from(publicKeyHash.slice(-20)).toString('hex');
  
  console.log(`✅ Address: ${address}`);
  console.log(`   Private Key: ${privateKeyHex.slice(0, 20)}...`);
  
  return { privateKey, address };
}

// ============================================================================
// EIP-191 Signing
// ============================================================================

function buildCanonicalMessage(payload) {
  return `STEP-PROOF-v1|account:${payload.account}|triangle:${payload.triangleId}|lat:${payload.lat}|lon:${payload.lon}|acc:${payload.accuracy}|ts:${payload.timestamp}|nonce:${payload.nonce}`;
}

async function signProof(payload, privateKey) {
  // Build canonical message
  const message = buildCanonicalMessage(payload);
  
  // EIP-191 prefix
  const prefix = `\x19Ethereum Signed Message:\n${message.length}${message}`;
  
  // Hash with keccak256
  const messageHash = keccak_256(new TextEncoder().encode(prefix));
  
  // Sign with secp256k1 v2 API (async, so we need to await)
  const sig = await secp.sign(messageHash, privateKey);
  
  // sig is a Signature object with properties r, s, recovery
  const sigBytes = sig.toCompactRawBytes();
  
  // Get recovery value - should be 0 or 1
  let recovery = sig.recovery !== undefined ? sig.recovery : 0;
  console.log(`DEBUG: sig.recovery = ${sig.recovery}`);
  if (recovery === undefined || recovery === null) {
    // If recovery not provided, we need to compute it
    // Try both values and see which one recovers to our address
    const publicKey = await secp.getPublicKey(privateKey);
    const publicKeyHash = keccak_256(publicKey.slice(1));
    const expectedAddress = '0x' + Buffer.from(publicKeyHash.slice(-20)).toString('hex');
    
    recovery = 0; // Default to 0
    for (let r = 0; r <= 1; r++) {
      try {
        const recovered = await sig.recoverPublicKey(messageHash);
        if (recovered) {
          const recoveredHash = keccak_256(recovered.slice(1));
          const recoveredAddr = '0x' + Buffer.from(recoveredHash.slice(-20)).toString('hex');
          if (recoveredAddr.toLowerCase() === expectedAddress.toLowerCase()) {
            recovery = r;
            break;
          }
        }
      } catch (e) {}
    }
  }
  
  const v = recovery + 27; // EIP-191: v = 27 or 28
  
  // Combine: r (32 bytes) + s (32 bytes) + v (1 byte)
  const fullSig = new Uint8Array(65);
  fullSig.set(sigBytes, 0);
  fullSig[64] = v;
  
  const hexSig = '0x' + Buffer.from(fullSig).toString('hex');
  console.log(`DEBUG: Full signature length: ${hexSig.length} (should be 132)`);  
  console.log(`DEBUG: Last 2 chars (v): ${hexSig.slice(-2)} (should be 1b for v=27 or 1c for v=28)`);
  
  return hexSig;
}

// ============================================================================
// MongoDB Setup
// ============================================================================

async function setupTestTriangle() {
  console.log('\n📦 Setting up test triangle in MongoDB...');
  
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db('step');
  
  try {
    // Clear existing test data
    await db.collection('triangles').deleteMany({});
    await db.collection('triangle_events').deleteMany({});
    await db.collection('accounts').deleteMany({});
    
    console.log('✅ Cleared existing test data');
    
    // Create test triangle
    await db.collection('triangles').insertOne({
      _id: TEST_TRIANGLE_ID,
      face: 0,
      level: 10,
      pathEncoded: '000000000',
      parentId: null,
      childrenIds: [],
      state: 'active',
      clicks: 0,
      moratoriumStartAt: new Date(),
      lastClickAt: null,
      centroid: {
        type: 'Point',
        coordinates: [TEST_LOCATION.lon, TEST_LOCATION.lat],
      },
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [TEST_LOCATION.lon - 0.01, TEST_LOCATION.lat - 0.01],
          [TEST_LOCATION.lon + 0.01, TEST_LOCATION.lat - 0.01],
          [TEST_LOCATION.lon, TEST_LOCATION.lat + 0.01],
          [TEST_LOCATION.lon - 0.01, TEST_LOCATION.lat - 0.01],
        ]],
      },
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    
    console.log(`✅ Created test triangle: ${TEST_TRIANGLE_ID}`);
    console.log(`   Location: ${TEST_LOCATION.lat}, ${TEST_LOCATION.lon}`);
    console.log(`   Level: 10`);
    
  } finally {
    await client.close();
  }
}

// ============================================================================
// Proof Submission
// ============================================================================

async function submitProof(payload, signature) {
  const response = await fetch(`${API_URL}/proof/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ payload, signature }),
  });
  
  const data = await response.json();
  return { status: response.status, data };
}

function generateNonce() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// Subdivision Verification
// ============================================================================

async function verifySubdivision() {
  console.log('\n🔍 Verifying subdivision in MongoDB...');
  
  const client = await MongoClient.connect(MONGODB_URI);
  const db = client.db('step');
  
  try {
    // Check parent triangle
    const parent = await db.collection('triangles').findOne({ _id: TEST_TRIANGLE_ID });
    
    console.log('\n📊 Parent Triangle:');
    console.log(`   State: ${parent.state}`);
    console.log(`   Clicks: ${parent.clicks}`);
    console.log(`   Children: ${parent.childrenIds.length}`);
    
    if (parent.state !== 'subdivided') {
      console.log('❌ FAILED: Parent state is not "subdivided"');
      return false;
    }
    
    if (parent.clicks !== 11) {
      console.log(`❌ FAILED: Parent clicks is ${parent.clicks}, expected 11`);
      return false;
    }
    
    if (parent.childrenIds.length !== 4) {
      console.log(`❌ FAILED: Expected 4 children, found ${parent.childrenIds.length}`);
      return false;
    }
    
    // Check child triangles
    console.log('\n📊 Child Triangles:');
    const children = await db.collection('triangles').find({
      parentId: TEST_TRIANGLE_ID,
    }).toArray();
    
    if (children.length !== 4) {
      console.log(`❌ FAILED: Expected 4 child documents, found ${children.length}`);
      return false;
    }
    
    for (let i = 0; i < children.length; i++) {
      const child = children[i];
      console.log(`   Child ${i + 1}:`);
      console.log(`     ID: ${child._id}`);
      console.log(`     Level: ${child.level}`);
      console.log(`     State: ${child.state}`);
      console.log(`     Clicks: ${child.clicks}`);
      
      if (child.level !== 11) {
        console.log(`     ❌ FAILED: Expected level 11, got ${child.level}`);
        return false;
      }
      
      if (child.state !== 'active') {
        console.log(`     ❌ FAILED: Expected state "active", got "${child.state}"`);
        return false;
      }
      
      if (child.clicks !== 0) {
        console.log(`     ❌ FAILED: Expected 0 clicks, got ${child.clicks}`);
        return false;
      }
    }
    
    // Check subdivision event
    const subdivisionEvent = await db.collection('triangle_events').findOne({
      triangleId: TEST_TRIANGLE_ID,
      eventType: 'subdivide',
    });
    
    if (!subdivisionEvent) {
      console.log('\n❌ FAILED: No subdivision event found in audit log');
      return false;
    }
    
    console.log('\n📊 Subdivision Event:');
    console.log(`   ID: ${subdivisionEvent._id}`);
    console.log(`   Timestamp: ${subdivisionEvent.timestamp.toISOString()}`);
    console.log(`   Parent Level: ${subdivisionEvent.payload.level}`);
    console.log(`   New Level: ${subdivisionEvent.payload.newLevel}`);
    
    console.log('\n✅ ALL CHECKS PASSED!');
    console.log('   ✅ Parent state: "subdivided"');
    console.log('   ✅ Parent clicks: 11');
    console.log('   ✅ 4 child triangles created');
    console.log('   ✅ All children at level 11');
    console.log('   ✅ All children in "active" state');
    console.log('   ✅ Subdivision event logged');
    
    return true;
    
  } finally {
    await client.close();
  }
}

// ============================================================================
// Main Test Flow
// ============================================================================

async function runTest() {
  console.log('🚀 STEP Blockchain Subdivision Test');
  console.log('=' .repeat(50));
  
  try {
    // Step 1: Setup
    const { privateKey, address } = generateWallet();
    await setupTestTriangle();
    
    // Step 2: Submit 11 proofs
    console.log('\n📤 Submitting 11 proofs...');
    console.log('   (Waiting 11 seconds between each for moratorium)');
    
    for (let i = 1; i <= 11; i++) {
      const payload = {
        version: 'STEP-PROOF-v1',
        account: address,
        triangleId: TEST_TRIANGLE_ID,
        lat: TEST_LOCATION.lat,
        lon: TEST_LOCATION.lon,
        accuracy: 25.5,
        timestamp: new Date().toISOString(),
        nonce: generateNonce(),
      };
      
      const signature = await signProof(payload, privateKey);
      
      process.stdout.write(`   Proof ${i}/11... `);
      
      const { status, data } = await submitProof(payload, signature);
      
      if (status === 200) {
        process.stdout.write(`✅ (clicks: ${data.clicks}, reward: ${data.reward} STEP)\n`);
        
        // Check if subdivision happened on 11th proof
        if (i === 11 && data.clicks === 11) {
          console.log('\n   🎉 Subdivision triggered on 11th proof!');
        }
      } else {
        process.stdout.write(`❌ Status ${status}: ${data.message}\n`);
        console.log('\n   Full response:', JSON.stringify(data, null, 2));
        throw new Error(`Proof ${i} failed`);
      }
      
      // Wait for moratorium (except after last proof)
      if (i < 11) {
        await new Promise(resolve => setTimeout(resolve, 11000));
      }
    }
    
    // Step 3: Verify subdivision
    const success = await verifySubdivision();
    
    console.log('\n' + '='.repeat(50));
    if (success) {
      console.log('🎉 TEST PASSED: Subdivision working correctly!');
      process.exit(0);
    } else {
      console.log('❌ TEST FAILED: Subdivision verification failed');
      process.exit(1);
    }
    
  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

// Run the test
runTest();
