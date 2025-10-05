# LEARNINGS.md

**Project:** STEP Blockchain Protocol  
**Version:** 0.3.3  
**Last Updated:** 2025-10-05T16:29:46.254Z

---

## Purpose

This document captures resolved issues, technical decisions, and lessons learned during development to prevent regression and guide future implementation. Only concrete learnings with actionable insights are included.

---

## Categories

- [Backend](#backend)
- [Dev / Process](#dev--process)
- [Database](#database)
- [Security](#security)
- [Other](#other)

---

## Backend

### 1. MongoDB Transactions Require Replica Set

**Issue:** MongoDB transactions fail with error "Transaction numbers are only allowed on a replica set member or mongos" on standalone instances.

**Root Cause:** The proof submission flow uses MongoDB transactions for atomicity (`session.withTransaction`). Transactions are only supported on replica sets, not standalone MongoDB instances.

**Solution:**
- Use MongoDB Atlas (cloud) which provides replica sets by default
- For local development, configure a local replica set
- Add `retryWrites=true&w=majority` to connection string for reliability

**Prevention:**
- Document MongoDB replica set requirement in README.md
- Add startup check to verify replica set support
- Provide clear error message if transactions fail due to topology

**Timestamp:** 2025-10-03T18:00:00.000Z

---

### 2. Subdivision Must Use Geodesic Midpoints

**Issue:** Initial subdivision attempts used planar (Euclidean) midpoints, causing distortion on sphere surface.

**Root Cause:** Earth is a sphere (approximated as WGS84 ellipsoid). Planar midpoints between lat/lon coordinates don't account for spherical geometry, leading to incorrect triangle shapes at high latitudes.

**Solution:**
- Use geodesic midpoint calculation: normalize Cartesian coordinates on unit sphere
- Formula: `midpoint = normalize((A + B) / 2)` in 3D Cartesian space
- Convert back to lat/lon after computation
- Reuse Phase 1 mesh utilities (`core/mesh/icosahedron.ts`) which implement this correctly

**Prevention:**
- Always use spherical geometry for geospatial calculations
- Test subdivision at multiple latitudes (equator, mid-latitudes, poles)
- Document the geodesic requirement in code comments

**Timestamp:** 2025-10-04T04:30:00.000Z

---

### 3. BigInt Required for Token Precision

**Issue:** JavaScript `Number` type loses precision for token amounts with many decimals (e.g., 0.001953125 STEP).

**Root Cause:** JavaScript `Number` uses 64-bit floating point (IEEE 754), which has limited precision (~15-17 decimal digits). Cumulative rounding errors occur with many operations.

**Solution:**
- Store token amounts as `BigInt` with fixed decimal places (6 decimals)
- Example: 1.234567 STEP = BigInt(1234567) internally
- Convert to string for API responses: `(balance / 1_000_000).toString()`
- Use BigInt arithmetic for all balance operations

**Prevention:**
- Never use `Number` for financial calculations
- Document the BigInt convention in schema comments
- Add utility functions for BigInt ↔ decimal string conversion

**Timestamp:** 2025-10-03T18:30:00.000Z

---

## Dev / Process

### 4. Version Management Must Be Automated

**Issue:** Manual version updates across multiple documentation files resulted in version mismatches (README.md showed v0.2.0 while package.json was v0.2.2).

**Root Cause:** Documentation files (README, ARCHITECTURE, ROADMAP, etc.) reference the version independently. Manual updates are error-prone and easy to forget.

**Solution:**
- Created `scripts/version-sync.js` utility
- Automatically finds and updates version strings in all docs
- Updates timestamps to ISO 8601 with milliseconds UTC
- Run after every version bump: `node scripts/version-sync.js`

**Prevention:**
- Make version-sync part of the release checklist
- Consider pre-commit hook to enforce synchronization
- Document the utility in README.md and WARP.DEV_AI_CONVERSATION.md

**Timestamp:** 2025-10-05T12:30:00.000Z

---

### 5. Module System Must Be Consistent

**Issue:** Attempted to use ES Modules (`import`/`export`) in scripts, but project uses CommonJS (`require`/`module.exports`).

**Root Cause:** package.json does not specify `"type": "module"`, defaulting to CommonJS. Mixing module systems causes "Cannot use import statement outside a module" errors.

**Solution:**
- Identified module system from package.json (no `"type"` field = CommonJS)
- Use `require()` and `module.exports` in all new scripts
- Document module system choice in ARCHITECTURE.md

**Prevention:**
- Check package.json before creating new files
- Follow Reuse Before Creation rule: inspect existing code conventions
- Add module system note to developer onboarding docs

**Timestamp:** 2025-10-05T12:15:00.000Z

---

### 6. Versioning Protocol: PATCH Before Dev, MINOR Before Commit

**Issue:** Confusion about when to increment version numbers and which level to use.

**Root Cause:** Versioning and Release Protocol requires specific version increments at specific lifecycle stages, but this wasn't clearly enforced.

**Solution:**
- **PATCH (+0.0.1):** Before running `npm run dev` (development cycle)
- **MINOR (+0.1.0):** Before committing to main (feature release)
- **MAJOR (+1.0.0):** Before major milestones or breaking changes
- Documented in RELEASE_NOTES.md and WARP.DEV_AI_CONVERSATION.md

**Prevention:**
- Add version bump reminders to development workflow
- Consider pre-dev script hook to auto-increment PATCH
- Document rationale: ensures every dev cycle is uniquely identified

**Timestamp:** 2025-10-05T12:00:00.000Z

---

## Database

### 7. Compound Unique Index for Replay Protection

**Issue:** Duplicate nonce submissions from same account weren't being rejected, allowing replay attacks.

**Root Cause:** Nonce uniqueness was checked in application code, not enforced at database level. Race conditions allowed duplicate inserts.

**Solution:**
- Added compound unique index: `{ account: 1, nonce: 1 }`
- MongoDB enforces uniqueness at write time
- Duplicate inserts throw `E11000` error, caught and returned as 409 Conflict

**Prevention:**
- Always enforce critical constraints at database level
- Use unique indexes for replay protection
- Handle duplicate key errors gracefully with user-friendly messages

**Timestamp:** 2025-10-03T19:00:00.000Z

---

### 8. Sparse Materialization for 2.8 Trillion Triangles

**Issue:** Cannot pre-populate all 2.8 trillion triangles at Level 21 in MongoDB (storage and performance issues).

**Root Cause:** Full materialization would require petabytes of storage and hours to populate.

**Solution:**
- **Sparse Materialization:** Only create triangle documents when first mined
- Start with Level 10 triangles (~20 million)
- Subdivide on-demand when triangle reaches 11 clicks
- Use deterministic mesh utilities to compute geometry on-the-fly

**Prevention:**
- Design for lazy initialization in large-scale systems
- Use deterministic algorithms that don't require pre-computation
- Document the sparse approach in ARCHITECTURE.md

**Timestamp:** 2025-10-02T16:00:00.000Z

---

## Security

### 9. EIP-191 Prevents Cross-Context Signature Reuse

**Issue:** Need to prevent proof signatures from being valid Ethereum transactions or other contexts.

**Root Cause:** Without a domain separator, a signature could be reused in unintended contexts (e.g., as an Ethereum transaction).

**Solution:**
- Use EIP-191 message signing: `\x19Ethereum Signed Message:\n{length}{message}`
- Prefix makes signatures context-specific
- Industry standard, compatible with all major wallets
- Not an Ethereum dependency—just a signing convention

**Prevention:**
- Always use domain-separated signatures
- Document the signature scheme in API contracts
- Include version prefix in payload (e.g., "STEP-PROOF-v1")

**Timestamp:** 2025-10-03T17:15:00.000Z

---

### 10. Speed Gate Must Account for Legitimate Travel

**Issue:** Users in vehicles (cars, trains) were rejected for "moving too fast" even with legitimate GPS readings.

**Root Cause:** Initial speed limit was too strict (5 m/s = 18 km/h), rejecting highway driving.

**Solution:**
- Increased speed limit to 15 m/s (54 km/h)
- Still detects teleportation attacks
- Allows most ground-based vehicle travel
- Trade-off: Allows some spoofing via driving

**Prevention:**
- Balance security vs. usability in heuristics
- Test with real-world travel scenarios
- Consider dynamic thresholds based on triangle density

**Timestamp:** 2025-10-03T17:45:00.000Z

---

## Other

### 11. Timestamps Must Use ISO 8601 with Milliseconds UTC

**Issue:** Inconsistent timestamp formats across codebase (Unix epoch, ISO without ms, local time zones).

**Root Cause:** No enforced standard; developers used various formats.

**Solution:**
- Standardize on ISO 8601 with milliseconds in UTC
- Format: `YYYY-MM-DDTHH:MM:SS.sssZ`
- Example: `2025-10-05T12:29:33.074Z`
- JavaScript: `new Date().toISOString()`

**Prevention:**
- Document timestamp format in all relevant files
- Use utility functions for timestamp generation
- Lint rules to enforce format (future improvement)

**Timestamp:** 2025-10-05T12:20:00.000Z

---

### 12. Tests Are Prohibited Per Governance Rules

**Issue:** Temptation to write automated unit tests for validation logic.

**Root Cause:** Standard software engineering practice is to write automated tests, but project governance explicitly prohibits them.

**Solution:**
- Replace automated tests with manual validation scripts
- Scripts print human-readable output for verification
- Manual testers confirm expected behavior
- Document rationale: MVP factory approach prioritizes speed over test coverage

**Prevention:**
- Clearly document "no tests" policy in ARCHITECTURE.md and WARP.md
- Create validation scripts instead of test files
- Onboard new developers with governance rules upfront

**Timestamp:** 2025-10-05T12:00:00.000Z

---

## Future Learnings

This section will be updated as new issues are resolved and decisions are made.

**Next Review:** After Phase 3 implementation

---

**Document Status:** Living Document  
**Maintainers:** AI Developer, Product Owner  
**Last Review:** 2025-10-05T12:29:33.074Z
