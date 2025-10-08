# Mobile 3D Spherical Mining Visualization - Implementation Plan

**Project:** Blockmass STEP Mobile  
**Version:** 1.0.1  
**Created:** 2025-10-08T09:05:29.000Z  
**Author:** AI Developer  
**Status:** Planning Phase

---

## Executive Summary

Implement a **pure 3D spherical mesh visualization** for mobile mining, directly porting the proven Three.js approach from the web frontend (`/frontend/app/mesh-mining-3d/page.tsx`). This is **NOT a map-based interface** - it's a location-centered view of Earth's spherical triangle mesh.

### Critical Terminology Corrections:
- ✅ **Spherical triangles** (not flat polygons)
- ✅ **Spherical mesh** (not 2D mesh)
- ✅ **Geodesic subdivision** (spherical, not planar)
- ✅ **NO MAP** - Pure 3D sphere with triangle mesh only
- ✅ **Location-based view** - User's position centers the sphere rotation

---

## Core Principles (Non-Negotiable)

### 1. True 3D Spherical Geometry ONLY
- **Unit sphere** (radius = 1.0) represents Earth
- All triangles rendered **on the sphere surface**
- Geodesic edges (great circle arcs)
- No flat map projections (Mercator, Web Mercator, etc.)
- No distortion at any latitude

### 2. NO Map Interface
- **Pure spherical mesh visualization**
- 3D Earth sphere with icosahedral triangle mesh overlay
- User position determines sphere rotation/centering
- No traditional map tiles or overlays

### 3. Visual Elements
- **Blue Earth sphere** (solid color or texture)
- **Spherical triangles** overlaid on sphere:
  - Neighbors: Gray (#CCCCCC), semi-transparent
  - Current triangle: Gold (#FFD700) with 5px red border
  - Mining target: Pulsing red highlight
- **User marker**: Red dot on sphere surface at GPS position
- **No background map** - just the 3D sphere in space

---

## Architecture: Port from Web Frontend

### Web Implementation Already Working
**Location:** `/frontend/app/mesh-mining-3d/page.tsx`

**Proven Features:**
- Three.js WebGL rendering
- Proper spherical coordinate conversion
- Geodesic triangle subdivision
- 512 triangle visibility limit
- Altitude-based zoom (64 km - 3,185 km)
- Click-to-mine mechanics
- Pulsing highlights for active mining

### Mobile Adaptation Strategy
**Goal:** Achieve feature parity with web, optimized for mobile performance

**Technology Stack:**
```
expo-gl + expo-three          → WebGL context for React Native
three                         → Core 3D library (same as web)
@react-three/fiber/native     → React hooks for Three.js (native build)
@react-three/drei             → Helper components (OrbitControls, etc.)
react-native-svg              → Crisp 2D overlays (borders, markers)
react-native-gesture-handler  → Touch gestures (pan, pinch-to-zoom)
```

**Why This Stack:**
1. **Reuses web logic** - Same Three.js code from frontend
2. **Hardware acceleration** - Native OpenGL ES via expo-gl
3. **Proven performance** - Handles 512 triangles at 60 fps
4. **Existing math** - `/step-mobile/src/lib/icosahedron.ts` already ported

---

## Visual Requirements

### Sphere View (3D WebGL)
```
┌─────────────────────────────────────┐
│                                     │
│         ╱╲                          │
│        ╱  ╲     ← Neighbor triangle │
│       ╱ ◉  ╲      (gray, 2px border)│
│      ╱══════╲                       │
│     ╱        ╲   ← Current triangle │
│    ╱   🔴    ╲    (gold, red 5px)  │
│   ╱           ╲   ← User position   │
│  ╱─────────────╲                    │
│ Earth Sphere (blue)                 │
│                                     │
│ Altitude: 400 km                    │
│ Triangles: 23 visible               │
└─────────────────────────────────────┘
```

### Key Visual Elements:
1. **Earth Sphere**
   - Radius: 1.0 (unit sphere)
   - Material: MeshStandardMaterial, color `#2e6fdb` or texture
   - Lighting: Ambient (0.5) + Directional (from camera)

2. **Spherical Triangles** (on sphere surface)
   - **Neighbors** (up to 512):
     - Fill: `#CCCCCC`, opacity: 0.6
     - Border: Black 2px (SVG overlay)
     - Vertices: Geodesic points on sphere
   
   - **Current Triangle**:
     - Fill: `#FFD700` (gold), opacity: 0.9
     - Border: Red 5px (SVG overlay)
     - Slightly offset from sphere (+ε) to avoid z-fighting
   
   - **Mining Target** (when mining):
     - Fill: Pulsing shader (sin wave)
     - Border: Red 5px, pulsing opacity
     - Animation: useFrame with time-based intensity

3. **User Marker**
   - Red circle (r=5-6px) at GPS position
   - Rendered in SVG overlay (always visible)
   - Projects 3D position to screen coordinates

4. **Info Overlay** (React Native UI)
   - Altitude display (top-left)
   - Triangle count (top-left)
   - Current triangle ID (bottom)

---

## Implementation Phases

### Phase 1: Core 3D Engine Setup
**Files:**
- `/step-mobile/src/components/earth/SphereMesh3D.tsx`
- Install dependencies: `expo-gl`, `expo-three`, `three`, `@react-three/fiber`, `@react-three/drei`

**Deliverables:**
1. Blue Earth sphere renders in 3D
2. Camera controls work (pan, rotate, zoom)
3. Lighting properly illuminates sphere
4. 60 fps on test device

**Acceptance:**
- User can rotate sphere with touch drag
- User can zoom with pinch gesture
- Sphere maintains unit radius (1.0)
- No flat map visible - just 3D sphere

---

### Phase 2: Spherical Triangle Rendering
**Files:**
- `/step-mobile/src/components/earth/SphericalTrianglesMesh.tsx`
- `/step-mobile/src/hooks/useSphericalTriangles.ts`

**Deliverables:**
1. Fetch current spherical triangle via GPS
2. Fetch neighbor spherical triangles (up to 512)
3. Render spherical triangles on sphere surface
4. Color coding: gray neighbors, gold current

**Math (from web):**
```typescript
// Convert lat/lon to 3D position on unit sphere
function latLonToVector3(lat: number, lon: number): THREE.Vector3 {
  const phi = (90 - lat) * (Math.PI / 180);    // Polar angle
  const theta = (lon + 180) * (Math.PI / 180); // Azimuthal angle
  
  const x = -Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  
  return new THREE.Vector3(x, y, z);
}

// Get spherical triangle vertices from API polygon
function getSphericalTriangleVertices(polygon: GeoJSONPolygon): THREE.Vector3[] {
  const coords = polygon.coordinates[0]; // First ring
  return coords.slice(0, 3).map(([lon, lat]) => latLonToVector3(lat, lon));
}
```

**Acceptance:**
- Spherical triangles render on sphere surface (not floating)
- Triangles follow sphere curvature
- Current triangle highlighted in gold
- Neighbors rendered in gray
- No distortion at poles

---

### Phase 3: SVG Overlay for Crisp Borders
**Files:**
- `/step-mobile/src/components/earth/SvgTriangleBorders.tsx`

**Why SVG Overlay:**
- WebGL lineWidth > 1 is **not reliably supported** on mobile
- SVG guarantees crisp 2px and 5px borders
- Absolute positioned over Canvas

**Deliverables:**
1. Project 3D spherical triangle vertices to 2D screen coordinates
2. Draw borders in SVG:
   - Neighbors: 2px black
   - Current: 5px red
   - Mining: 5px red, pulsing
3. User marker: Red circle at GPS position
4. Hide occluded triangles (backface culling in projection)

**Projection Math:**
```typescript
// Use Three.js camera.project() to get screen coordinates
function project3DToScreen(
  vertex3D: THREE.Vector3,
  camera: THREE.Camera,
  width: number,
  height: number
): { x: number; y: number } {
  const projected = vertex3D.clone().project(camera);
  
  return {
    x: (projected.x + 1) / 2 * width,
    y: (-projected.y + 1) / 2 * height
  };
}

// Check if triangle is visible (not behind sphere)
function isTriangleVisible(vertices: THREE.Vector3[], cameraPos: THREE.Vector3): boolean {
  const centroid = new THREE.Vector3()
    .add(vertices[0])
    .add(vertices[1])
    .add(vertices[2])
    .divideScalar(3);
  
  const toCam = cameraPos.clone().sub(centroid).normalize();
  const normal = centroid.clone().normalize(); // Normal points outward from sphere
  
  return toCam.dot(normal) > 0; // Facing camera
}
```

**Acceptance:**
- Borders are pixel-perfect crisp
- Neighbors have 2px black borders
- Current triangle has 5px red border
- Occluded triangles not drawn
- User marker always visible

---

### Phase 4: Location Integration & Auto-Centering
**Files:**
- `/step-mobile/src/screens/MapScreen.tsx` (rename logic, keep structure)

**Deliverables:**
1. GPS position updates sphere rotation
2. User position centered in view
3. Smooth transition when location changes
4. Current spherical triangle lookup via API

**Auto-Centering Math:**
```typescript
// Rotate sphere so user's position faces camera
function centerOnUser(userLat: number, userLon: number): THREE.Quaternion {
  const userPos = latLonToVector3(userLat, userLon);
  const target = new THREE.Vector3(0, 0, 1); // Camera looks at +Z
  
  const quaternion = new THREE.Quaternion();
  quaternion.setFromUnitVectors(userPos.normalize(), target);
  
  return quaternion;
}
```

**Acceptance:**
- Sphere rotates to center user position
- User marker (red dot) always visible at GPS location
- Current spherical triangle updates when user moves
- Smooth lerp animation (not instant snap)

---

### Phase 5: Mining Integration & Visual Feedback
**Files:**
- `/step-mobile/src/components/earth/MiningHighlight.tsx`

**Deliverables:**
1. "Mine" button triggers mining target highlight
2. Target spherical triangle pulses red
3. Success: Brief green flash, return to normal
4. Failure: Brief red flash, return to normal

**Pulsing Animation:**
```typescript
// In useFrame hook
function updateMiningPulse(time: number) {
  const intensity = 0.5 + 0.5 * Math.sin(time * 3); // 3 rad/s frequency
  miningMaterial.emissiveIntensity = intensity;
  miningMaterial.opacity = 0.7 + 0.3 * intensity;
}
```

**Acceptance:**
- Mining target spherical triangle pulses red
- Pulsing is smooth (sin wave)
- Success/failure feedback clear
- Mining flow: GPS → **Spherical Triangle** lookup → Proof signing → Submit

---

### Phase 6: Performance Optimization
**Targets:**
- 60 fps on iOS (iPhone 12+)
- 30+ fps on Android (mid-range)
- Max 512 spherical triangles visible
- Smooth gestures (no lag)

**Optimizations:**
1. **Triangle Culling**
   - Backface culling (GPU side)
   - Frustum culling (Three.js automatic)
   - Distance-based LOD (optional)

2. **Geometry Reuse**
   - BufferGeometry instances
   - Shared materials
   - Typed arrays (Float32Array)

3. **Update Throttling**
   - GPS updates: max 2 Hz (500ms)
   - Triangle fetch: only on significant movement
   - Overlay projection: max 30 Hz (33ms)

4. **Memory Management**
   - Dispose old geometries/materials
   - Limit cached triangles to 512
   - Clear refs on unmount

**Acceptance:**
- Maintains 30+ fps during rotation
- No jank during zoom
- Memory stays under 150 MB
- Battery impact acceptable (<5% per 10 min)

---

## File Structure

```
/step-mobile/
├── src/
│   ├── components/
│   │   └── earth/
│   │       ├── SphereMesh3D.tsx          # Main 3D component
│   │       ├── SphericalTrianglesMesh.tsx # Spherical triangles rendering
│   │       ├── SvgTriangleBorders.tsx    # SVG overlay for borders
│   │       ├── MiningHighlight.tsx       # Pulsing mining target
│   │       └── UserMarker.tsx            # Red dot at GPS
│   ├── hooks/
│   │   ├── useSphericalTriangles.ts      # Fetch & manage spherical triangles
│   │   └── useAutoCenter.ts              # Auto-rotate to user position
│   ├── lib/
│   │   ├── icosahedron.ts                # REUSE - already has spherical math
│   │   ├── mesh-client.ts                # REUSE - API calls
│   │   └── spherical-projection.ts       # NEW - 3D to 2D projection utils
│   └── screens/
│       └── MapScreen.tsx                 # Main screen (NO MAP - just 3D view)
└── MOBILE_3D_MINING_PLAN.md              # This document
```

---

## Dependencies to Install

```bash
# Core 3D rendering
expo install expo-gl expo-three
npm install three @react-three/fiber @react-three/drei

# Gestures and overlays
expo install react-native-gesture-handler react-native-reanimated
# react-native-svg already installed

# TypeScript types
npm install --save-dev @types/three
```

---

## Testing Checklist

### Visual Verification
- [ ] Blue Earth sphere visible (3D, not flat)
- [ ] Spherical triangles rendered on sphere surface
- [ ] Current spherical triangle highlighted gold with 5px red border
- [ ] Neighbor spherical triangles gray with 2px black borders
- [ ] User marker (red dot) visible at GPS position
- [ ] No map tiles or overlays (pure 3D sphere only)
- [ ] Backface culling works (triangles behind sphere hidden)

### Interaction
- [ ] Touch drag rotates sphere smoothly
- [ ] Pinch-to-zoom adjusts altitude (64 km - 3,185 km)
- [ ] Auto-centers on user position
- [ ] Mining target pulses red when mining
- [ ] Success/failure feedback displays

### Performance
- [ ] 30+ fps on test device
- [ ] No frame drops during rotation
- [ ] Memory stable (no leaks)
- [ ] Battery impact acceptable

### Correctness
- [ ] GPS → **Spherical Triangle** lookup works
- [ ] Current spherical triangle updates on movement
- [ ] Spherical triangle vertices match backend API
- [ ] Proof signing includes correct spherical triangle ID
- [ ] Submission to validator succeeds

---

## Success Criteria (Definition of Done)

### Functional Requirements
1. ✅ **Pure 3D spherical visualization** (no map)
2. ✅ **Spherical triangles** rendered on unit sphere
3. ✅ **User position** shown as red dot on sphere
4. ✅ **Current spherical triangle** highlighted gold
5. ✅ **Mining target** pulses red during mining
6. ✅ **GPS-based centering** rotates sphere to user
7. ✅ **Touch gestures** work (rotate, zoom)
8. ✅ **Performance** maintains 30+ fps

### Technical Requirements
1. ✅ All spherical triangle vertices use geodesic math
2. ✅ No flat map projections or tiles
3. ✅ SVG borders crisp at 2px and 5px
4. ✅ Backface culling prevents rendering hidden triangles
5. ✅ Max 512 spherical triangles enforced
6. ✅ Mining flow: GPS → **Spherical Triangle** → Proof → Validator

### Documentation Requirements
1. ✅ ROADMAP.md updated with milestone
2. ✅ TASKLIST.md updated with tasks
3. ✅ ARCHITECTURE.md documents 3D rendering component
4. ✅ README.md includes quickstart
5. ✅ All timestamps in UTC ISO 8601 with milliseconds
6. ✅ Code comments explain "what" and "why"

---

## Versioning

- **Before npm run dev:** Increment PATCH (+1)
- **Before commit:** Increment MINOR (+1), reset PATCH to 0
- **Update version in:** package.json, README.md, ROADMAP.md, TASKLIST.md, ARCHITECTURE.md, LEARNINGS.md, RELEASE_NOTES.md

---

## References

### Web Implementation (Working)
- `/frontend/app/mesh-mining-3d/page.tsx` - Three.js implementation
- `/THREE_JS_IMPLEMENTATION.md` - Technical documentation
- `/frontend/MESH_MINING_3D_IMPLEMENTATION.md` - Implementation guide

### Backend Spherical Math
- `/step-blockchain/core/mesh/icosahedron.ts` - Base icosahedron geometry
- `/step-blockchain/core/mesh/polygon.ts` - Spherical triangle generation
- `/step-blockchain/core/mesh/addressing.ts` - STEP-TRI-v1 IDs

### Mobile Foundation
- `/step-mobile/src/lib/icosahedron.ts` - Spherical math (already ported)
- `/step-mobile/src/lib/mesh-client.ts` - API client (reuse)

---

**Next Step:** Approve this plan and begin Phase 1 implementation with proper documentation updates per governance rules.
