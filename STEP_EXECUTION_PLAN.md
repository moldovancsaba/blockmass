# STEP EXECUTION PLAN

**Project:** STEP — Proof-of-Location Blockchain Protocol  
**Planning Session:** 2025-10-02T14:10:00.000Z  
**Timeline:** 18-24 months to mainnet launch  
**Status:** **APPROVED** — Ready for Phase 1 execution

---

## 🎯 MISSION STATEMENT

Build an independent, free, permissionless blockchain that enables anyone with a GPS-enabled device to mine cryptocurrency by proving their physical presence at specific geographic locations.

---

## 📊 PROJECT OVERVIEW

### What We're Building

**STEP (Spatial Token for Earth Proof)** — A custom blockchain with:

1. **Novel Consensus:** Proof-of-Location-Click (PoLC)
   - Users mine by physically visiting triangular regions on Earth's surface
   - Cryptographic proof validates presence via GPS + sensor fusion
   - No wasteful computation (unlike Bitcoin PoW)

2. **Icosahedron Mesh System:**
   - Earth divided into 2.8 trillion triangular regions
   - 21 levels of precision (8000km → 7m triangle sides)
   - Recursive subdivision creates finer meshes

3. **Fixed Token Economics:**
   - Total supply: 7.7 trillion STEP tokens
   - Distribution: 28 miners per triangle with exponentially decreasing rewards
   - Time-locks prevent instant depletion

4. **Mobile-First Design:**
   - React Native app for iOS/Android
   - Background mining with battery optimization
   - Wallet, maps, and proof submission

5. **Progressive Decentralization:**
   - Start centralized (fast iteration)
   - Migrate to hybrid validators
   - End with full P2P network

---

## 🗓️ PHASED TIMELINE (18-24 Months)

### Phase 1: Mesh Foundation (Months 1-4) 
**Target:** 2026-02-02T00:00:00.000Z

**Goal:** Build and visualize the icosahedron mesh system

**Deliverables:**
- ✅ Icosahedron math library (seed + recursive subdivision)
- ✅ Triangle addressing standard (STEP-TRI-v1 with base32 encoding)
- ✅ MongoDB schemas (sparse materialization, 2dsphere indexes)
- ✅ Mesh RPC API (triangleAt, polygon, children, search)
- ✅ Explorer visualization (Mapbox GL with interactive triangles)
- ✅ Documentation (MESH_SPECIFICATION.md)

**Milestone:** Public demo of interactive mesh with zoom/click

---

### Phase 2: Location Proof MVP (Months 5-8)
**Target:** 2026-06-02T00:00:00.000Z

**Goal:** First real-world mine with mobile app

**Deliverables:**
- ✅ React Native app (GPS capture, device fingerprint, wallet keygen)
- ✅ Centralized validator API (proof submission, anti-replay, basic anti-spoof)
- ✅ Token ledger (MongoDB-backed balances + transfers)
- ✅ Mobile UI (map with current triangle overlay, "Mine" button)
- ✅ First Budapest pilot test (invite-only)

**Milestone:** First user earns 1 STEP token by visiting a real location

---

### Phase 3: Tokenomics + Time-Locks (Months 9-12)
**Target:** 2026-10-02T00:00:00.000Z

**Goal:** Full economic system with triangle lifecycle

**Deliverables:**
- ✅ Reward curve implementation (1/2^(N-1) formula)
- ✅ Time-lock scheduler (168h moratorium + exponential delays)
- ✅ Triangle state machine (active → partially_mined → subdivide)
- ✅ Wallet flows (export/import, transfer, balance history)
- ✅ Explorer pages (address view, triangle detail, mining schedule)

**Milestone:** Invite-only beta with 100+ users

---

### Phase 4: Blockchain Integration (Months 13-18)
**Target:** 2027-04-02T00:00:00.000Z

**Goal:** Decentralized consensus with public testnet

**Deliverables:**
- ✅ PoLC consensus module (BFT-style with proposer rotation)
- ✅ libp2p network (TCP/WebSockets, GossipSub, peer discovery)
- ✅ Block structure (headers + proofs + transfers + events)
- ✅ Node software (validator + full node roles)
- ✅ JSON-RPC API (step_* methods for clients)
- ✅ Public testnet launch (4-7 community validators)

**Milestone:** First decentralized block mined with location proof

---

### Phase 5: Decentralization + Mainnet (Months 19-24)
**Target:** 2027-10-02T00:00:00.000Z

**Goal:** Production launch with full ecosystem

**Deliverables:**
- ✅ Security audit (consensus, P2P, crypto, mobile, RPC)
- ✅ Mobile light client (on-device verification, background sync)
- ✅ Validator staking + slashing (economic security)
- ✅ B2B marketplace (businesses purchase geo-mines)
- ✅ NFT landmarks (POI minting)
- ✅ Mainnet genesis and launch

**Milestone:** Public mainnet with 50+ validators and real economic activity

---

## 🛠️ TECHNOLOGY STACK (APPROVED)

### Backend (step-blockchain)
- **Language:** Node.js 18.18+ with TypeScript
- **Database:** MongoDB 6+ (with 2dsphere indexes)
- **Geospatial:** Turf.js (spherical geometry)
- **Cryptography:** @noble/secp256k1, @noble/hashes
- **P2P:** libp2p (Phase 4+)
- **Runtime:** Node.js (not Deno/Bun; LTS versions only)

### Mobile (step-mobile)
- **Framework:** React Native (iOS + Android)
- **Maps:** Mapbox GL (custom mesh rendering)
- **Location:** @react-native-community/geolocation
- **Crypto:** @noble/secp256k1 (signing)
- **Storage:** AsyncStorage + device keystore (Secure Enclave/TEE)

### Explorer (step-explorer, formerly blockmass)
- **Framework:** Next.js 15 (App Router)
- **UI:** Tailwind CSS (high-contrast black/white only)
- **Maps:** Mapbox GL (polygon rendering)
- **Database:** MongoDB (shared with blockchain nodes)
- **Deployment:** Vercel (via GitHub, no direct Vercel ops)

### Shared Utilities
- **Logging:** ISO 8601 UTC with milliseconds (all timestamps)
- **Versioning:** Semantic (MAJOR.MINOR.PATCH) with automation scripts
- **Documentation:** Markdown with versioned badges

---

## 📁 REPOSITORY STRUCTURE (TO BE CREATED)

```
/step-blockchain/          # Core blockchain node software
├─ core/
│  ├─ mesh/               # Icosahedron engine
│  ├─ consensus/          # PoLC consensus (Phase 4)
│  ├─ p2p/                # libp2p network (Phase 4)
│  └─ state/              # State management
├─ api/                   # JSON-RPC server
├─ scripts/               # Version automation
├─ docs/                  # Technical docs
└─ package.json

/step-mobile/              # React Native mobile app
├─ src/
│  ├─ screens/            # Map, Wallet, Settings
│  ├─ lib/                # Crypto, location, proof
│  └─ components/
├─ ios/
├─ android/
└─ package.json

/step-explorer/            # Public block explorer (rename blockmass)
├─ app/
│  ├─ mesh/               # Mesh viewer page
│  ├─ address/[addr]/     # Wallet detail page
│  ├─ triangle/[id]/      # Triangle detail page
│  └─ admin/health/       # Existing health dashboard
├─ app/_lib/
│  ├─ mesh-client.js      # Mesh RPC client
│  └─ step-rpc.js         # Node JSON-RPC client (Phase 4)
└─ package.json
```

---

## 🚀 IMMEDIATE NEXT STEPS (Your Decision Required)

### Option A: Start Phase 1 Immediately

**I can begin building:**

1. Create `/step-blockchain` repo structure
2. Implement icosahedron seed vertices (12 points on sphere)
3. Build recursive subdivision algorithm
4. Create STEP-TRI-v1 addressing scheme
5. MongoDB schema design + indexes

**Timeline:** First commit in 30 minutes

---

### Option B: Review and Clarify First

**Questions to answer before coding:**

1. **Repository hosting:** Create new GitHub repos or subdirectories in `blockmass`?
2. **Naming confirmation:** "STEP" vs "Blockmass" as project name going forward?
3. **Immediate scope:** Phase 1 full scope or start with just mesh math prototype?
4. **Version strategy:** Start all repos at v0.1.0 or v1.0.0-alpha?

---

### Option C: Business Planning First

**Before technical work:**

1. Legal entity setup (if needed for funding)
2. Trademark registration for "STEP"
3. Whitepaper draft for investor/community
4. Budget and hiring plan (if scaling team)

---

## 📚 DOCUMENTATION INVENTORY (COMPLETED)

### Root-Level Docs (Created Today)
- ✅ `BLOCKCHAIN_PROTOCOL.md` — 472 lines, complete technical spec
- ✅ `STEP_TOKENOMICS.md` — 456 lines, mathematical economic model
- ✅ `STEP_EXECUTION_PLAN.md` — This document

### Frontend Docs (Updated Today)
- ✅ `frontend/WARP.DEV_AI_CONVERSATION.md` — Planning session logged
- ⏳ `frontend/ROADMAP.md` — Needs Phase 1-5 milestone update
- ⏳ `frontend/TASKLIST.md` — Needs detailed Phase 1 task breakdown

### To Be Created (Phase 1)
- ⏳ `MESH_SPECIFICATION.md` — Detailed icosahedron math and addressing
- ⏳ `ARCHITECTURE.md` — System architecture for all 3 repos
- ⏳ `CONTRIBUTING.md` — Dev guidelines (reuse-before-creation, no-tests, etc.)

---

## 🎓 KEY LEARNINGS FROM PLANNING SESSION

1. **Not a simple app, but a new protocol** — Building Bitcoin/Ethereum-level infrastructure
2. **Mobile mining is the core innovation** — Smartphones become miners, not servers
3. **Math is critical** — 2.8 trillion triangles, 7.7 trillion tokens, precise geometry
4. **Progressive approach reduces risk** — MVP without blockchain, add decentralization later
5. **Product owner has long-term vision (2016)** — This is a multi-year, multi-app platform

---

## ⚠️ CRITICAL RISKS AND MITIGATIONS

| Risk | Impact | Mitigation |
|------|--------|------------|
| GPS spoofing | High | Multi-sensor fusion + hardware attestation + witness network |
| Token depletion too fast | Medium | Time-locks (168h + exponential delays) |
| Scalability (2.8T triangles) | High | Sparse materialization + MongoDB sharding |
| Mobile battery drain | High | Background optimization + efficient location polling |
| Validator collusion | High | Slashing + BFT consensus (2/3+ quorum) |
| Legal/regulatory | Medium | Utility token (not security); consult legal in Phase 3 |

---

## 💡 SUCCESS CRITERIA

### Phase 1 Success:
- [ ] Interactive mesh demo loads instantly
- [ ] Can zoom to any location on Earth
- [ ] Click triangle to see ID and level
- [ ] All 21 levels render correctly

### Phase 2 Success:
- [ ] 10+ users mine first STEP tokens in real world
- [ ] No GPS spoofing detected in pilot
- [ ] Mobile app stays under 100MB storage

### Phase 3 Success:
- [ ] 100+ beta users actively mining
- [ ] Time-locks prevent hotspot depletion
- [ ] Triangle subdivisions work correctly
- [ ] No economic exploits found

### Phase 4 Success:
- [ ] Testnet runs 30+ days without downtime
- [ ] 7+ community validators participate
- [ ] Blocks produce every ~10 minutes
- [ ] No consensus forks

### Phase 5 Success:
- [ ] Security audit passes with no critical issues
- [ ] 50+ mainnet validators from 10+ countries
- [ ] 1,000+ active miners in first month
- [ ] First B2B geo-mine sale

---

## 📞 DECISION POINT

**Product Owner, please choose:**

**A) START CODING PHASE 1 NOW**  
→ I will begin building mesh engine immediately

**B) CLARIFY QUESTIONS FIRST**  
→ Answer repository/naming/scope questions above

**C) BUSINESS PLANNING FIRST**  
→ Whitepaper, legal, funding before code

**D) HYBRID: Prototype + Planning**  
→ Build mesh math prototype while you handle business side

---

**Awaiting your decision to proceed.** 🚀

---

**Document Status:** Master Execution Plan — Single Source of Truth  
**Maintainers:** AI Developer (Warp.dev), Product Owner  
**Last Updated:** 2025-10-02T14:15:00.000Z
