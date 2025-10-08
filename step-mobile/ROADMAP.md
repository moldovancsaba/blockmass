# STEP Mobile - Product Roadmap

**Project:** Blockmass STEP Mobile  
**Version:** 1.0.1  
**Last Updated:** 2025-10-08T09:25:36.000Z  
**Status:** Active Development

---

## Strategic Vision

STEP Mobile is a **location-proof mining application** that enables users to earn STEP tokens by proving their physical presence at specific geographic locations using a **pure 3D spherical mesh visualization**. The app uses hardware-accelerated WebGL rendering to display Earth's icosahedral triangle mesh, providing users with an intuitive, game-like interface for mining spherical triangles.

### Core Differentiators:
1. **NO traditional map** - Pure 3D Earth sphere with spherical triangle mesh
2. **True spherical geometry** - No distortion, geodesic subdivision
3. **Hardware attestation** - Anti-spoofing via Play Integrity & DeviceCheck
4. **Self-custodial wallet** - Users control their private keys
5. **Real-time location proof** - GPS → Spherical Triangle → Cryptographic signature

---

## Q4 2025 - Foundation & Core Mining (Current)

### Milestone 1: 3D Spherical Mining Visualization ⚡ **IN PROGRESS**
**Priority:** P0 (Critical)  
**Target:** 2025-10-15T12:00:00.000Z  
**Owner:** AI Developer  
**Status:** 🚧 Phase 1 - Core 3D Engine Setup

**Objective:**  
Replace the placeholder map interface with a **true 3D spherical mesh visualization** directly ported from the proven web Three.js implementation. This is NOT a map-based interface—it's a location-centered view of Earth's spherical triangle mesh.

**Dependencies:**
- expo-gl, expo-three, three, @react-three/fiber, @react-three/drei
- react-native-gesture-handler (touch gestures)
- react-native-svg (already installed, for borders/markers)
- Web frontend implementation at `/frontend/app/mesh-mining-3d/page.tsx`

**Deliverables:**
1. **Phase 1: Core 3D Engine** (2025-10-09 to 2025-10-10)
   - Blue Earth sphere (unit sphere, radius 1.0)
   - WebGL rendering via expo-gl + Three.js
   - Camera controls (pan, rotate, zoom)
   - Lighting (ambient + directional)
   - 60 fps on test device
   - Files: `src/components/earth/SphereMesh3D.tsx`

2. **Phase 2: Spherical Triangle Rendering** (2025-10-10 to 2025-10-11)
   - Fetch current spherical triangle via GPS
   - Fetch neighbor spherical triangles (up to 512)
   - Render spherical triangles on sphere surface
   - Color coding: gray neighbors (#CCCCCC), gold current (#FFD700)
   - Files: `src/components/earth/SphericalTrianglesMesh.tsx`, `src/hooks/useSphericalTriangles.ts`

3. **Phase 3: SVG Overlay for Crisp Borders** (2025-10-11 to 2025-10-12)
   - Project 3D vertices to 2D screen coordinates
   - Draw borders: 2px black (neighbors), 5px red (current/mining)
   - User marker: red circle (5-6px) at GPS position
   - Backface culling in projection layer
   - Files: `src/components/earth/SvgTriangleBorders.tsx`

4. **Phase 4: Location Integration & Auto-Centering** (2025-10-12 to 2025-10-13)
   - GPS updates sphere rotation
   - Auto-center on user position (smooth lerp)
   - Current spherical triangle lookup via API
   - Files: Update `src/screens/MapScreen.tsx`

5. **Phase 5: Mining Visual Feedback** (2025-10-13 to 2025-10-14)
   - Mining target spherical triangle pulses red (sin wave)
   - Success: brief green flash
   - Failure: brief red flash
   - Files: `src/components/earth/MiningHighlight.tsx`

6. **Phase 6: Performance Optimization** (2025-10-14 to 2025-10-15)
   - 30-60 fps on iOS/Android
   - Max 512 spherical triangles enforced
   - Memory management (dispose geometries)
   - Battery optimization

**Success Criteria:**
- ✅ Pure 3D spherical visualization (no map tiles)
- ✅ Spherical triangles rendered on unit sphere
- ✅ User position shown as red dot
- ✅ Current spherical triangle highlighted gold with 5px red border
- ✅ Mining target pulses red
- ✅ GPS-based auto-centering works
- ✅ Touch gestures smooth (rotate, zoom)
- ✅ 30+ fps on mid-range Android/iOS

**Reference:**  
`/step-mobile/MOBILE_3D_MINING_PLAN.md` (Single Source of Truth)

---

### Milestone 2: Phase 2 Core Features ✅ **95% COMPLETE**
**Priority:** P1 (High)  
**Target:** 2025-10-20T12:00:00.000Z  
**Owner:** AI Developer  
**Status:** ✅ Nearly complete, polish items remaining

**Completed:**
- ✅ Self-custodial wallet (secp256k1)
- ✅ EIP-191 message signing
- ✅ Location permission handling
- ✅ GPS accuracy validation
- ✅ Triangle lookup via API
- ✅ Proof submission (Phase 2 format)
- ✅ Basic UI (MapScreen, BalanceScreen)
- ✅ TypeScript types (ProofPayloadV2)

**Remaining:**
- Remove mock triangle fallback (requires backend mesh seeding)
- Implement token balance screen
- Add environment configuration

---

### Milestone 3: Phase 2.5 Anti-Spoofing Integration
**Priority:** P1 (High)  
**Target:** 2025-11-30T12:00:00.000Z  
**Owner:** AI Developer  
**Status:** 📋 Planned, types defined

**Objective:**  
Integrate hardware attestation and raw sensor data collection to achieve 95-100 confidence scores and prevent location spoofing.

**Dependencies:**
- Google Play Console project setup
- Apple Developer account with App Attest
- Backend Phase 2.5 API deployed

**Deliverables:**
1. ProofPayloadV2 data collection library (`src/lib/proof-collector.ts`)
2. Android Play Integrity integration
3. iOS DeviceCheck/App Attest integration
4. Android GNSS raw data collection (native module)
5. Cell tower data collection (both platforms)
6. MapScreen UI for confidence scoring display
7. submitProofV2 integration in handleMine()

**Success Criteria:**
- ✅ Android: 95-100 confidence score (full GNSS data)
- ✅ iOS: 85-90 confidence score (no GNSS data)
- ✅ Hardware attestation verified on both platforms
- ✅ Cell tower data collected and validated
- ✅ UI displays confidence breakdown

---

## Q1 2026 - Production Readiness & Polish

### Milestone 4: Production Deployment
**Priority:** P2 (Medium)  
**Target:** 2026-01-15T12:00:00.000Z  
**Status:** 📅 Planned

**Deliverables:**
1. Environment configuration (.env support)
2. Crash reporting (Sentry)
3. Analytics integration (Amplitude/Mixpanel)
4. EAS Build configuration (App Store/Play Store)
5. CI/CD pipeline
6. Code signing setup

---

### Milestone 5: UX Enhancements
**Priority:** P2 (Medium)  
**Target:** 2026-02-01T12:00:00.000Z  
**Status:** 📅 Planned

**Deliverables:**
1. Loading states and error boundaries
2. Improved permission request flow
3. Transaction history screen
4. Wallet management screen (export/import, QR code)
5. Dark mode support
6. Localization (i18n) - English, Spanish, Chinese

---

### Milestone 6: Advanced Features
**Priority:** P3 (Low)  
**Target:** 2026-03-01T12:00:00.000Z  
**Status:** 📅 Planned

**Deliverables:**
1. Offline mode (proof queue and auto-retry)
2. Social features (leaderboard)
3. Referral system
4. Achievement badges
5. In-app notifications

---

## Technical Debt & Maintenance

### Ongoing Tasks
- Expo SDK upgrades (quarterly)
- Dependency security audits (monthly)
- Performance optimization (ongoing)
- Bundle size optimization (quarterly)
- Code refactoring (as needed)

### Known Debt
1. MapScreen.tsx is too large (445 lines) → split into components
2. Simple UUID v4 implementation → use proper library
3. Bundle size optimization needed → tree-shaking, code splitting

---

## Dependencies & Blockers

### External Dependencies
| Dependency | Status | Required For | ETA |
|------------|--------|--------------|-----|
| Backend mesh seeding | ⏸️ Pending | Remove mock triangles | 2025-10-15 |
| Backend Phase 2.5 API | ⏸️ Pending | ProofPayloadV2 testing | 2025-10-30 |
| Backend account balance API | ⏸️ Pending | Balance screen | 2025-10-20 |
| Google Play Console | ⏸️ Pending | Play Integrity | 2025-11-05 |
| Apple Developer account | ⏸️ Pending | DeviceCheck | 2025-11-05 |

### Internal Blockers
- None currently

---

## Success Metrics

### Phase 2 (Current)
- ✅ Wallet generation: 100%
- ✅ Location tracking: 100%
- 🚧 3D Visualization: 0% → **TARGET: 100% by 2025-10-15**
- ✅ Proof submission: 100%
- ⏸️ Balance display: 0% (blocked by backend API)

### Phase 2.5 (Next)
- ⏸️ Hardware attestation: 0%
- ⏸️ GNSS raw data: 0%
- ⏸️ Cell tower data: 0%
- ⏸️ Confidence scoring: 0%

### Production Readiness (Q1 2026)
- Environment config: 0%
- Crash reporting: 0%
- Analytics: 0%
- App Store build: 0%
- Play Store build: 0%

---

## Release Schedule

| Version | Target Date | Milestone | Status |
|---------|-------------|-----------|--------|
| 1.0.0 | 2025-10-06 | Phase 2 Core | ✅ Released |
| 1.1.0 | 2025-10-15 | 3D Visualization | 🚧 In Progress |
| 1.2.0 | 2025-10-20 | Phase 2 Complete | 📋 Ready |
| 2.0.0 | 2025-11-30 | Phase 2.5 Complete | 📅 Planned |
| 2.1.0 | 2026-01-15 | Production Ready | 📅 Planned |
| 2.2.0 | 2026-02-01 | UX Polish | 📅 Planned |
| 3.0.0 | 2026-03-01 | Advanced Features | 📅 Planned |

---

## Change Log

### 2025-10-08T09:25:36.000Z
- **Created ROADMAP.md** with 3D Spherical Mining Visualization milestone
- Added Q4 2025 and Q1 2026 milestones
- Defined 6-phase implementation plan for 3D visualization
- Set target date: 2025-10-15T12:00:00.000Z
- Linked to MOBILE_3D_MINING_PLAN.md as Single Source of Truth

---

**Next Review:** 2025-10-13T12:00:00.000Z  
**Roadmap Owner:** AI Developer  
**Last Major Update:** 2025-10-08T09:25:36.000Z
