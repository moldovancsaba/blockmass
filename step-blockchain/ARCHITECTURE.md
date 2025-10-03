# STEP Blockchain Architecture

**Phase 2 MVP - Centralized Validator**

This document describes the technical architecture of the STEP blockchain system, focusing on the Phase 2 implementation with a centralized validator.

**Version:** 0.2.0  
**Last Updated:** 2025-10-03T17:56:56.000Z

---

## Table of Contents

- [System Overview](#system-overview)
- [Component Architecture](#component-architecture)
- [Data Flow](#data-flow)
- [Database Schema](#database-schema)
- [Validator Logic](#validator-logic)
- [Security Model](#security-model)
- [Scalability Considerations](#scalability-considerations)

---

## System Overview

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        STEP Ecosystem                        │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────┐         ┌──────────────┐                  │
│  │ Mobile App   │         │  Explorer    │                  │
│  │ (React       │         │  (Next.js)   │                  │
│  │  Native)     │         │              │                  │
│  └──────┬───────┘         └──────┬───────┘                  │
│         │                        │                           │
│         │  HTTPS/JSON            │  HTTPS/JSON              │
│         │                        │                           │
│         ▼                        ▼                           │
│  ┌─────────────────────────────────────────┐                │
│  │     Validator API (Node.js/Express)     │                │
│  │                                         │                │
│  │  ┌─────────────┐   ┌─────────────┐    │                │
│  │  │ Proof API   │   │  Mesh API   │    │                │
│  │  │ /proof/*    │   │  /mesh/*    │    │                │
│  │  └──────┬──────┘   └──────┬──────┘    │                │
│  │         │                  │           │                │
│  │         ▼                  ▼           │                │
│  │  ┌──────────────────────────────────┐ │                │
│  │  │      Validation Engine           │ │                │
│  │  │  • Signature verification        │ │                │
│  │  │  • Geometry checks               │ │                │
│  │  │  • Anti-spoof heuristics         │ │                │
│  │  └──────────────┬───────────────────┘ │                │
│  │                 │                      │                │
│  │                 ▼                      │                │
│  │  ┌──────────────────────────────────┐ │                │
│  │  │      State Manager               │ │                │
│  │  │  • Atomic transactions           │ │                │
│  │  │  • Balance updates               │ │                │
│  │  │  • Triangle state                │ │                │
│  │  └──────────────┬───────────────────┘ │                │
│  └─────────────────┼─────────────────────┘                │
│                    │                                        │
│                    ▼                                        │
│         ┌──────────────────────┐                           │
│         │      MongoDB         │                           │
│         │  • Triangles         │                           │
│         │  • Accounts          │                           │
│         │  • Events (audit)    │                           │
│         └──────────────────────┘                           │
│                                                              │
└──────────────────────────────────────────────────────────────┘
```

### Technology Stack

**Backend (step-blockchain):**
- **Runtime:** Node.js 18+ / 20+
- **Framework:** Express.js 4.x
- **Language:** TypeScript 5.3+
- **Database:** MongoDB 5.0+ with Mongoose ODM
- **Cryptography:** @noble/secp256k1, @noble/hashes
- **Geospatial:** @turf/turf
- **Module System:** CommonJS (for compatibility)

**Mobile (step-mobile):**
- **Framework:** React Native + Expo SDK 54
- **Language:** TypeScript + JSX
- **Crypto:** @noble/secp256k1, js-sha3, expo-crypto
- **Storage:** expo-secure-store (Keychain/Keystore)
- **Location:** expo-location

---

## Component Architecture

### Backend Components

#### 1. API Layer (`api/`)

**server.ts** - Main entry point
- Express application bootstrap
- MongoDB connection initialization
- Middleware registration (CORS, JSON parsing, logging)
- Route mounting
- Health check endpoints
- Global error handling

**proof.ts** - Proof validation router
- POST /proof/submit - Main proof submission endpoint
- GET /proof/config - Validator configuration
- Input validation
- Signature verification orchestration
- Transaction management
- Error code mapping

**mesh-simple.ts** - Mesh query router (Phase 1)
- GET /mesh/triangleAt - Find triangle at coordinates
- GET /mesh/polygon/:id - Get triangle polygon
- GET /mesh/search - Spatial search
- GET /mesh/stats - Mesh statistics

#### 2. Core Layer (`core/`)

**db.ts** - Database connection manager
- Singleton pattern (prevents connection leaks)
- Connection pooling (10 max, 2 min)
- Health monitoring (ok/degraded/down)
- Automatic reconnection
- Graceful shutdown

**validator/signature.ts** - Cryptographic verification
- EIP-191 message hashing
- Signature verification (secp256k1)
- Public key recovery
- Ethereum address derivation
- Canonical message builder

**validator/geometry.ts** - Geospatial validation
- Point-in-triangle checks (Turf.js)
- Haversine distance calculation
- Speed computation
- GPS accuracy validation
- Moratorium enforcement
- Clock drift tolerance

**state/schemas.ts** - Mongoose data models
- Triangle schema (mesh state)
- Account schema (balances)
- TriangleEvent schema (audit log)
- Indexes for performance
- Type definitions

#### 3. Mesh Layer (`core/mesh/`) - Phase 1

Icosahedron-based geodesic mesh utilities:
- Triangle addressing
- Subdivision algorithms
- Polygon generation
- Spatial queries

### Mobile Components

#### 1. Library Layer (`src/lib/`)

**wallet.ts** - Key management
- Wallet generation (secp256k1)
- EIP-191 message signing
- Secure storage integration
- Key import/export

**mesh-client.ts** - API client
- Triangle lookup
- Proof submission
- Canonical message builder
- Error handling

**location.ts** - GPS integration
- Location permission management
- Continuous tracking
- Accuracy validation

#### 2. UI Layer (`src/screens/`)

**MapScreen.tsx** - Main mining interface
- Location display
- Triangle overlay
- Mining button
- Reward display
- Error handling

---

## Data Flow

### Proof Submission Flow

```
┌─────────────────────────────────────────────────────────────┐
│ MOBILE APP                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  1. User taps "MINE" button                                  │
│     ↓                                                         │
│  2. Collect GPS data                                         │
│     • latitude, longitude                                    │
│     • accuracy (meters)                                      │
│     • timestamp (ISO 8601 UTC+ms)                           │
│     ↓                                                         │
│  3. Fetch current triangle                                   │
│     • GET /mesh/triangleAt?lat={lat}&lon={lon}&level=10    │
│     • Receive triangleId                                     │
│     ↓                                                         │
│  4. Build ProofPayload                                       │
│     • version: "STEP-PROOF-v1"                              │
│     • account: wallet address                                │
│     • triangleId: from step 3                               │
│     • lat, lon, accuracy: from step 2                       │
│     • timestamp: current UTC with milliseconds              │
│     • nonce: UUID v4 (prevents replay)                      │
│     ↓                                                         │
│  5. Build canonical message                                  │
│     STEP-PROOF-v1|account:{addr}|triangle:{id}|...         │
│     ↓                                                         │
│  6. Sign with EIP-191                                        │
│     • Hash: keccak256("\x19Ethereum Signed Message:\n" +    │
│              len(message) + message)                         │
│     • Sign: secp256k1 with private key                      │
│     • Output: 65-byte signature (r, s, v)                   │
│     ↓                                                         │
│  7. Submit to validator                                      │
│     POST /proof/submit                                       │
│     { payload: {...}, signature: "0x..." }                  │
│                                                               │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ VALIDATOR API                                                │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  8. Validate request structure                               │
│     • All fields present?                                    │
│     • Correct types?                                         │
│     • Version === "STEP-PROOF-v1"?                          │
│     ↓                                                         │
│  9. Validate GPS accuracy                                    │
│     • accuracy <= 50m?                                       │
│     ↓                                                         │
│  10. Verify signature                                        │
│      • Rebuild canonical message                             │
│      • Hash with EIP-191 prefix                             │
│      • Recover signer address from signature                │
│      • Match payload.account? (case-insensitive)            │
│      ↓                                                        │
│  11. Check nonce replay (pre-check)                          │
│      • Query TriangleEvent for {account, nonce}             │
│      • Exists? → Reject with NONCE_REPLAY                   │
│      ↓                                                        │
│  12. Fetch triangle from DB                                  │
│      • Triangle.findById(triangleId)                        │
│      • Not found? → Create mock for MVP                     │
│      ↓                                                        │
│  13. Validate geometry                                       │
│      • Point-in-triangle check (Turf.js)                    │
│      • Inside boundary? → Continue                           │
│      • Outside? → Reject with OUT_OF_BOUNDS                 │
│      ↓                                                        │
│  14. Load previous proof                                     │
│      • TriangleEvent.findOne({account, eventType:"click"}) │
│      • Sort by timestamp desc                                │
│      ↓                                                        │
│  15. Validate heuristics (if previous proof exists)          │
│      • Speed gate: distance/time <= 15 m/s?                 │
│      • Moratorium: time delta >= 10 seconds?                │
│      ↓                                                        │
│  16. Calculate reward                                        │
│      reward = 1 / 2^(level - 1) STEP                        │
│      ↓                                                        │
│  17. Start MongoDB transaction                               │
│      session.withTransaction(async () => {                   │
│        // All updates below are atomic                       │
│        ↓                                                      │
│        18. Create TriangleEvent (audit log)                  │
│            • Stores full payload + signature                 │
│            • Unique index enforces nonce uniqueness          │
│            ↓                                                  │
│        19. Update Triangle state                             │
│            • Increment clicks by 1                           │
│            • Update lastClickAt                              │
│            • TODO: Trigger subdivision at 11 clicks          │
│            ↓                                                  │
│        20. Update Account balance                            │
│            • Add reward to balance (bigint)                  │
│            • Atomic increment                                │
│      })                                                       │
│      ↓                                                        │
│  21. Load updated balance                                    │
│      • getOrCreateAccount(account)                          │
│      ↓                                                        │
│  22. Return success response                                 │
│      {                                                        │
│        ok: true,                                             │
│        reward: "0.001953",                                   │
│        unit: "STEP",                                         │
│        triangleId: "...",                                    │
│        level: 10,                                            │
│        clicks: 5,                                            │
│        balance: "1.234567",                                  │
│        processedAt: "2025-10-03T17:56:56.789Z"             │
│      }                                                        │
│                                                               │
└───────────────────────────┬───────────────────────────────────┘
                            │
                            ▼
┌─────────────────────────────────────────────────────────────┐
│ MOBILE APP                                                   │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  23. Display success                                         │
│      Alert: "🎉 Mining Successful!"                         │
│      "You earned {reward} STEP tokens!"                     │
│      "New Balance: {balance} STEP"                          │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

---

## Database Schema

### Collections

#### 1. Triangles

Stores mesh state and mining progress.

```typescript
{
  _id: string,                    // Triangle ID (e.g., "STEP-TRI-v1:L10:F0:01234567")
  face: number,                   // Icosahedron face (0-19)
  level: number,                  // Subdivision level (1-21)
  pathEncoded: string,            // Binary path from root
  parentId: string | null,        // Parent triangle ID
  childrenIds: string[],          // Child triangle IDs
  state: string,                  // 'active' | 'subdivided' | 'retired'
  clicks: number,                 // Number of proofs submitted (0-11)
  moratoriumStartAt: Date,        // When moratorium started
  lastClickAt: Date | null,       // Last proof timestamp
  centroid: {                     // Center point
    type: 'Point',
    coordinates: [lon, lat]
  },
  polygon: {                      // Boundary
    type: 'Polygon',
    coordinates: [[[lon, lat], ...]]
  }
}
```

**Indexes:**
- `{ _id: 1 }` - Primary key
- `{ 'centroid': '2dsphere' }` - Geospatial queries
- `{ state: 1, level: 1 }` - Active triangle queries

#### 2. Accounts

Stores user balances and metadata.

```typescript
{
  _id: string,                    // Ethereum address (0x...)
  balance: string,                // Balance in minimal units (bigint as string)
  totalProofs: number,            // Total proofs submitted
  lastProofAt: Date | null,       // Last proof timestamp
  createdAt: Date,                // Account creation
  updatedAt: Date                 // Last update
}
```

**Indexes:**
- `{ _id: 1 }` - Primary key (Ethereum address)
- `{ balance: -1 }` - Leaderboard queries

#### 3. TriangleEvents

Audit log of all mining activity.

```typescript
{
  _id: string,                    // Event ID (proof-{timestamp}-{random})
  triangleId: string,             // Triangle that was mined
  eventType: string,              // 'click' | 'subdivision'
  timestamp: Date,                // When event occurred
  account: string,                // Miner address (optional for subdivision)
  nonce: string,                  // Proof nonce (optional)
  signature: string,              // Proof signature (optional)
  payload: {                      // Full proof data
    minerAddress: string,
    reward: string,
    clickNumber: number,
    lat: number,
    lon: number,
    accuracy: number,
    speed: number | undefined
  }
}
```

**Indexes:**
- `{ _id: 1 }` - Primary key
- `{ account: 1, nonce: 1 }` - **Unique compound** (replay protection)
- `{ account: 1, timestamp: -1 }` - User proof history
- `{ triangleId: 1, timestamp: -1 }` - Triangle audit trail

---

## Validator Logic

### Signature Verification (EIP-191)

**Why EIP-191:**
- Industry standard for signing arbitrary messages
- Prevents signatures from being valid Ethereum transactions
- Compatible with all major Ethereum wallets
- Not an Ethereum dependency (just a signing convention)

**Process:**
1. Build canonical message from ProofPayload
2. Add EIP-191 prefix: `\x19Ethereum Signed Message:\n{length}{message}`
3. Hash with keccak256
4. Verify signature with secp256k1
5. Recover signer address from signature
6. Compare with payload.account (case-insensitive)

### Geospatial Validation

**Point-in-Triangle:**
- Uses Turf.js `booleanPointInPolygon` function
- Planar approximation (acceptable for small triangles <10km)
- GeoJSON polygon format
- Rejects proofs outside triangle boundary

**Why Turf.js:**
- Fast and well-tested
- Supports GeoJSON standard
- Planar approximation negligible at our scale

### Anti-Spoof Heuristics

#### GPS Accuracy Gate
- **Threshold:** 50 meters (configurable via `GPS_MAX_ACCURACY_M`)
- **Why:** Prevents indoor/poor-signal spoofing
- **Trade-off:** Stricter = more secure, but fewer valid proofs

#### Speed Gate
- **Threshold:** 15 m/s = 54 km/h (configurable via `PROOF_SPEED_LIMIT_MPS`)
- **Calculation:** Haversine distance / time delta
- **Why:** Detects teleportation attacks
- **Trade-off:** May reject legitimate highway driving

#### Moratorium
- **Threshold:** 10 seconds (configurable via `PROOF_MORATORIUM_MS`)
- **Why:** Prevents rapid-fire spam
- **Clock Drift:** Allows ±2 minutes for client/server time differences

**Phase 3+ Improvements:**
- Multi-sensor fusion (accelerometer, gyroscope, compass)
- Hardware attestation (Trusted Execution Environment)
- Witness network (nearby users confirm each other)
- Machine learning anomaly detection

### Reward Calculation

**Formula:**
```
reward(level) = 1 / 2^(level - 1) STEP
```

**Examples:**
- Level 1: 1.000000 STEP
- Level 5: 0.062500 STEP
- Level 10: 0.001953 STEP
- Level 15: 0.000061 STEP
- Level 21: 0.000001 STEP (1 microSTEP)

**Total Supply:**
- 2.8 trillion triangles at Level 21
- 28 clicks per triangle (11 + 4×11 + 4×4×11 + ...)
- Geometric series converges to ~7.7 trillion STEP

### Transaction Safety

**Atomicity:**
All state updates happen inside a MongoDB transaction:
1. Create TriangleEvent (with unique nonce index)
2. Increment triangle.clicks
3. Update account.balance
4. (Future) Trigger subdivision at 11 clicks

**Why Transactions:**
- Prevents partial updates on concurrent submissions
- Ensures nonce uniqueness at database level
- Guarantees balance consistency
- Allows rollback on any error

**Concurrency:**
- MongoDB transactions use two-phase commit
- Compound unique index on (account, nonce) prevents duplicates
- Optimistic locking for triangle state

---

## Security Model

### Threat Model

**Phase 2 MVP (Current):**
- **Trust Model:** Single centralized validator
- **Attack Surface:** GPS spoofing, replay attacks, signature forgery
- **Defenses:** Signature verification, nonce uniqueness, heuristics

**Phase 3+ (Future):**
- **Trust Model:** Byzantine Fault Tolerant (BFT) consensus
- **Attack Surface:** Collusion, Sybil attacks, witness manipulation
- **Defenses:** Majority voting, stake-based validation, TEE attestation

### Attack Vectors & Mitigations

#### 1. GPS Spoofing
**Attack:** Fake GPS coordinates to mine from anywhere
**Mitigation (Phase 2):**
- GPS accuracy gate (reject accuracy >50m)
- Speed gate (reject teleportation)
- Moratorium (prevent rapid submissions)

**Future Improvements:**
- Multi-sensor fusion (accelerometer confirms movement)
- Hardware attestation (TEE proves real GPS)
- Witness network (nearby users confirm)

#### 2. Replay Attacks
**Attack:** Resubmit same proof multiple times
**Mitigation:**
- Unique nonce per proof (UUID v4)
- Database-level unique constraint on (account, nonce)
- Transaction ensures atomic check-and-insert

#### 3. Signature Forgery
**Attack:** Submit proof without owning private key
**Mitigation:**
- EIP-191 signature verification
- Address recovery from signature
- Cryptographically impossible to forge without private key

#### 4. Double-Spend
**Attack:** Race condition on concurrent submissions
**Mitigation:**
- MongoDB transactions (ACID guarantees)
- Unique indexes enforce constraints
- Optimistic locking prevents conflicts

#### 5. Sybil Attacks
**Attack:** Create many accounts to dominate mining
**Mitigation (Phase 2):**
- Limited (heuristics only prevent rapid movement)

**Future Improvements:**
- Stake-based validation
- Identity verification (optional tier)
- Witness network reputation

---

## Scalability Considerations

### Phase 2 Limitations

**Current Bottlenecks:**
1. **Single Validator:** All proofs go through one server
2. **MongoDB:** Single database instance
3. **Sequential Processing:** One proof at a time per account

**Current Capacity:**
- ~1000 proofs/second (optimistic)
- ~86 million proofs/day
- ~31 billion proofs/year

### Phase 3+ Scaling Plan

**Horizontal Scaling:**
- Multiple validator nodes
- Load balancer distributes proofs
- Consensus protocol ensures agreement

**Database Sharding:**
- Shard by triangleId prefix
- Shard by geographic region
- Read replicas for queries

**Optimizations:**
- Batch proof validation
- Async reward distribution
- Caching for frequent queries

**Target Capacity (Phase 4):**
- 100,000 proofs/second
- 8.6 billion proofs/day
- Support 1 billion users

---

## Future Architecture (Phase 3+)

### Multi-Validator Consensus

```
┌─────────────────────────────────────────────────────┐
│  Mobile Apps                                         │
└────────┬─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────┐
│  Load Balancer                                       │
└────┬─────┬─────┬─────┬─────────────────────────────┘
     │     │     │     │
     ▼     ▼     ▼     ▼
┌─────┐ ┌─────┐ ┌─────┐ ┌─────┐
│Val 1│ │Val 2│ │Val 3│ │Val N│  Validator Nodes
└──┬──┘ └──┬──┘ └──┬──┘ └──┬──┘
   │       │       │       │
   └───────┴───────┴───────┘
           │
           ▼
   ┌───────────────┐
   │   Consensus   │  BFT Agreement
   │   Protocol    │  (2/3 majority)
   └───────┬───────┘
           │
           ▼
   ┌───────────────┐
   │   Blockchain  │  Immutable Log
   └───────────────┘
```

**Consensus Mechanism:**
- Validator nodes vote on each proof
- 2/3+ majority required for acceptance
- Byzantine fault tolerance (up to 1/3 malicious)
- Finality in 2-3 seconds

---

**Last Updated:** 2025-10-03T17:56:56.000Z  
**Version:** 0.2.0  
**Phase:** 2 (Centralized Validator MVP)
