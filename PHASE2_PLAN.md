# STEP Phase 2: Location Proof Validator API
## Implementation Plan

**Created:** 2025-10-03T13:46:00.000Z  
**Author:** AI Developer (Warp.dev)  
**Status:** Ready for execution  
**Dependencies:** Phase 1 (Mesh system), Mobile app (Phase 2 core)

---

## Objective

Build a production-ready centralized validator API that:
1. Accepts cryptographically signed location proofs from mobile clients
2. Validates GPS accuracy, signature authenticity, and anti-spoof heuristics
3. Awards STEP tokens using exponential reward curve (1/2^(depth-1))
4. Manages triangle state with automatic subdivision at 11 clicks
5. Maintains atomic consistency with MongoDB transactions

---

## Architecture Overview

```
Mobile App                 Validator API              MongoDB
┌──────────┐              ┌─────────────┐           ┌─────────────┐
│          │              │             │           │             │
│ GPS      │─────────────▶│ /proof/     │──────────▶│ Triangles   │
│ Location │  ProofPayload│  submit     │  Atomic   │ Accounts    │
│          │  + Signature │             │  Updates  │ Events      │
│ Wallet   │              │ Validates:  │           │             │
│ Signer   │              │ • Signature │           │ Indexes:    │
│          │◀─────────────│ • Geometry  │           │ • Nonce     │
│          │   Reward     │ • Heuristics│           │ • Spatial   │
└──────────┘              └─────────────┘           └─────────────┘
```

---

## Key Technical Decisions

### 1. Signature Scheme: EIP-191 (Ethereum personal_sign)
**Why:**
- Compatible with existing Ethereum wallets and libraries
- Deterministic message encoding prevents signature mismatches
- Replay protection via nonce + triangleId + timestamp

**Canonical Message Format:**
```
STEP-PROOF-v1|account:{address}|triangle:{id}|lat:{lat}|lon:{lon}|acc:{accuracy}|ts:{timestamp}|nonce:{nonce}
```

### 2. Database: MongoDB with Mongoose
**Why:**
- Already implemented in Phase 1 for mesh storage
- 2dsphere indexes for efficient geospatial queries
- Transactions for atomic state updates
- Sparse materialization (only create triangles when mined)

**Collections:**
- `triangles` - Triangle state (clicks, moratorium, subdivision)
- `accounts` - Wallet balances (BigInt as string for precision)
- `triangle_events` - Append-only audit log with compound unique index on (account, nonce)

### 3. Anti-Spoof Heuristics
**Checks:**
- GPS accuracy ≤ 50m (configurable via env)
- Speed gate: ≤ 15 m/s between consecutive proofs
- Moratorium: ≥ 10 seconds between proofs from same account
- Point-in-triangle geometry validation

**Why minimal:**
- Phase 2 is centralized MVP - advanced multi-sensor fusion comes in Phase 3
- Focus on preventing obvious exploits (teleportation, replay attacks)

---

## Implementation Tasks (24 Steps)

### Pre-Flight (Step 0)
- Audit existing code for reuse opportunities
- Confirm runtime (Node 22+, TypeScript, ESM/CommonJS)
- Decide minimal dependencies (@noble/secp256k1, @turf/turf, @noble/hashes)

### Core Infrastructure (Steps 1-4)
- Define ProofPayload interface and canonical signing message
- Create MongoDB connection module with health checks
- Implement EIP-191 signature verification
- Implement geometry and heuristics validators

### API Implementation (Steps 5-8)
- Build /proof/submit endpoint with full validation flow
- Add compound unique index (account, nonce) to TriangleEvent schema
- Implement reward calculation and subdivision mechanics
- Mount router in server.ts with DB lifecycle management

### Mobile Integration (Steps 13-14)
- Update mesh-client.ts with submitProof() function
- Update MapScreen.tsx with submission UX and reward display

### Documentation & Compliance (Steps 15-23)
- Environment configuration
- API documentation with examples
- Architecture diagrams
- Versioning and release notes
- Manual verification (no automated tests per policy)

---

## File Manifest

### New Files
1. `/step-blockchain/api/proof.ts` - Proof submission router
2. `/step-blockchain/core/db.ts` - MongoDB connector
3. `/step-blockchain/core/validator/signature.ts` - EIP-191 verification
4. `/step-blockchain/core/validator/geometry.ts` - Geospatial checks

### Modified Files
1. `/step-blockchain/api/server.ts` - Mount router, DB init
2. `/step-blockchain/core/state/schemas.ts` - Add nonce field + index
3. `/step-mobile/src/lib/mesh-client.ts` - Add submitProof()
4. `/step-mobile/src/screens/MapScreen.tsx` - Update UI flow

---

## Environment Variables

```bash
# Backend (step-blockchain)
MONGODB_URI=mongodb://localhost:27017/step
GPS_MAX_ACCURACY_M=50
PROOF_SPEED_LIMIT_MPS=15
PROOF_MORATORIUM_MS=10000

# Mobile (step-mobile)
API_BASE_URL=http://localhost:3002  # Dev
# API_BASE_URL=https://api.step.network  # Production
```

---

## Acceptance Criteria (Definition of Done)

### API
- ✅ POST /proof/submit returns 200 with reward for valid proofs
- ✅ All failure scenarios return structured errors with codes
- ✅ Atomic DB updates with nonce uniqueness at database level
- ✅ Triangle subdivision triggers exactly once at 11 clicks
- ✅ All timestamps in ISO 8601 with milliseconds (YYYY-MM-DDTHH:MM:SS.sssZ)

### Mobile
- ✅ Users can submit proof and see reward on success
- ✅ Clear error messages for all failure scenarios
- ✅ No breadcrumbs (UI policy compliance)

### Documentation
- ✅ README.md updated with Phase 2 overview
- ✅ ARCHITECTURE.md includes validator flow diagram
- ✅ ROADMAP.md and TASKLIST.md reflect current work
- ✅ RELEASE_NOTES.md has versioned entry
- ✅ LEARNINGS.md documents implementation decisions

### Code Quality
- ✅ All code commented (what + why)
- ✅ Reuse-before-creation verified
- ✅ Stack compliance maintained
- ✅ Versioning protocol followed

---

## Risk Mitigation

| Risk | Mitigation |
|------|-----------|
| Signature mismatch | Add diagnostic endpoint to compare client/server message construction |
| Time skew | Allow ±2 minute clock drift tolerance |
| Indoor GPS inaccuracy | Return LOW_GPS_ACCURACY with guidance to move outdoors |
| Concurrency on 11th click | Use MongoDB transactions with retry on conflict |
| Nonce replay | Compound unique index (account, nonce) at DB level |

---

## Next Steps

1. **Execute Step 0:** Pre-flight audit and dependency decisions
2. **Execute Steps 1-4:** Core infrastructure
3. **Execute Steps 5-8:** API implementation
4. **Execute Steps 9-12:** Server integration
5. **Execute Steps 13-14:** Mobile integration
6. **Execute Steps 15-20:** Documentation and verification
7. **Execute Steps 21-23:** Release preparation

**Estimated Timeline:** 2-3 days for full implementation  
**Blocker:** None - all dependencies ready

---

**Status:** Plan approved - Ready to begin execution  
**Next Action:** Start Step 0 (Pre-flight audit)
