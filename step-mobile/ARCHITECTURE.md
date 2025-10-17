# STEP Mobile - Technical Architecture

**Version:** 1.2.1  
**Last Updated:** 2025-10-17T15:49:39.000Z  
**Status:** Production Ready

---

## Overview

STEP Mobile is a React Native/Expo location-proof mining application using **pure 3D spherical mesh visualization** powered by Three.js and WebGL. The app renders Earth's icosahedral triangle mesh in hardware-accelerated 3D with real-time GPS integration and cryptographic proof generation.

### Core Technologies
- **Platform:** React Native + Expo (SDK 54)
- **3D Rendering:** Three.js 0.166.0 + Expo GL (WebGL)
- **Language:** TypeScript (strict mode)
- **State:** React Hooks + AsyncStorage
- **Crypto:** secp256k1 (Ethereum wallet) + EIP-191 signing

---

## System Architecture

### High-Level Component Hierarchy

```
App.tsx (Root)
└── StandaloneMapScreen.tsx (Main Screen)
    ├── StandaloneEarthMesh3D.tsx (3D Renderer)
    │   ├── expo-gl GLView (WebGL context)
    │   ├── Three.js Scene/Camera/Renderer
    │   ├── Merged Triangle Mesh (BufferGeometry)
    │   ├── GPS Marker (red sphere)
    │   └── GPS Edges (LineSegments)
    └── Stats Panel (optional overlay)
```

### Data Flow

```
GPS Location
  ↓
LocationService.getCurrentLocation()
  ↓
StandaloneMapScreen (state: currentLocation)
  ↓
StandaloneEarthMesh3D (prop: currentPosition)
  ↓
1. GPS triangle detection (findTriangleContainingPoint)
2. Mesh rotation calculation (Euler angles)
3. Visibility culling (frustum + backface)
4. Merged mesh creation (visible triangles only)
5. Render loop (60fps)
```

---

## Core Systems

### 1. 3D Rendering System

**File:** `src/components/earth/StandaloneEarthMesh3D.tsx` (~1,200 lines)

#### Coordinate Systems

**Three.js World Space:**
- X: East (+) / West (-)
- Y: North (+) / South (-)  
- Z: Up (+) / Down (-)
- Camera at (0, 0, zoom) looking at (0, 0, 0)

**GPS to Cartesian Conversion:**
```typescript
// sphericalToCartesian(lat, lon)
x = cos(lat) * cos(lon)
y = cos(lat) * sin(lon)
z = sin(lat)
```

**GPS Centering via Euler Rotation:**
```typescript
// Rotate mesh to show GPS location at screen center
rotationX = -latitude (radians)
rotationY = -longitude (radians)
euler = new THREE.Euler(rotX, rotY, 0, 'XYZ')
mesh.rotation.copy(euler)
```

#### Mesh Rendering Approach

**Merged Single Mesh (v1.2+):**
- All visible triangles merged into ONE BufferGeometry
- Vertex colors for level-based coloring (21 levels)
- Subdivision depth 4 (256 micro-triangles per STEP triangle)
- Rebuilt only on visibility changes (not every frame)

**Why Merged Mesh?**
- Performance: 1 draw call vs 256+ draw calls
- Eliminates per-object overhead
- Smooth 60fps on mobile devices
- Instant updates (no object creation/deletion)

#### Visibility System

**Frustum Culling:**
```typescript
// Build frustum from camera projection matrix
const frustum = new THREE.Frustum();
frustum.setFromProjectionMatrix(
  camera.projectionMatrix × camera.matrixWorldInverse
);

// Test triangle bounding sphere
const sphere = new THREE.Sphere(center, radius);
if (!frustum.intersectsSphere(sphere)) {
  // Triangle not in view, skip
}
```

**Backface Culling:**
```typescript
// Triangle centroid points outward from Earth
const centroid = (v0 + v1 + v2) / 3;
centroid.applyMatrix4(rotationMatrix); // Apply mesh rotation
centroid.normalize();

// Camera direction points toward Earth
const camDir = new THREE.Vector3(0, 0, -1);

// Dot product < 0 means facing camera
const facing = centroid.dot(camDir);
if (facing >= 0) {
  // Back-facing, skip
}
```

**CRITICAL:** Rotation matrix must be applied to vertices BEFORE frustum/backface tests!

---

### 2. Camera System

#### Dynamic FOV (Telescopic Lens Effect)

**Formula:**
```typescript
zoomT = (currentZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
FOV = MIN_FOV + (MAX_FOV - MIN_FOV) * zoomT;

// MIN_ZOOM 1.071 (~6km alt) → FOV 20° (telephoto)
// MAX_ZOOM 5.0 (~25,500km alt) → FOV 70° (wide angle)
```

**Why Dynamic FOV?**
- Keeps triangles screen-sized at all zoom levels
- Close zoom: Narrow FOV shows small triangles clearly
- Far zoom: Wide FOV shows large triangles clearly
- Creates intuitive "zoom lens" experience

#### Pixel-Locked Rotation

**Algorithm:**
1. Touch point → Raycast to sphere surface → 3D anchor point
2. Move finger → Raycast new position → New 3D point
3. Calculate rotation: `axis = anchor × current`, `angle = arccos(anchor · current)`
4. Apply rotation via quaternion: `q.setFromAxisAngle(axis, angle)`
5. Update anchor point for next frame

**Why Quaternions?**
- Avoids gimbal lock
- Smooth interpolation
- Composable rotations

---

### 3. Mesh State Management

**File:** `src/lib/mesh-state-manager.ts`

#### Data Structure

```typescript
interface MeshTriangle {
  id: string;          // "ICO-5-2-1-3" (hierarchical)
  level: number;       // 0-20 (subdivision depth)
  clicks: number;      // 0-2 (mining progress)
  subdivided: boolean; // true if split into children
  vertices: Vector3[]; // 3 points on unit sphere
}
```

**Storage:** AsyncStorage (JSON serialized Map)

#### Subdivision Rules

- **Threshold:** 2 clicks (down from 10 in v1.1)
- **Pattern:** 1 triangle → 4 children (geodesic midpoints)
- **Max Level:** 21 (~27m triangles)
- **Parent Behavior:** Hidden when subdivided (children replace parent)

---

### 4. Level-Based Color System (v1.2+)

**File:** `src/lib/triangle-colors.ts`

```typescript
// 21 distinct colors for 21 subdivision levels
function getLevelColor(level: number): string {
  const colors = [
    '#E6194B', // Level 1: ~7052 km (continent)
    '#3CB44B', // Level 2: ~3526 km
    // ... 17 more colors ...
    '#4A5B6C', // Level 21: ~27 m (building)
  ];
  return colors[level - 1] || '#808080';
}
```

**Triangle Size Chart:**
- **Level 1-4:** Continent-scale (7052 km → 1763 km)
- **Level 5-10:** Regional-scale (882 km → 27.5 km)
- **Level 11-15:** City-scale (13.7 km → 1721 m)
- **Level 16-21:** Neighborhood-scale (861 m → 27 m)

---

### 5. Interaction System

#### Double-Tap Mining

**Algorithm:**
1. Touch event → Screen coordinates
2. Convert to NDC (Normalized Device Coordinates)
3. Raycast from camera through screen point
4. Ray-sphere intersection (quadratic equation)
5. Apply inverse rotation matrix to hit point
6. Test which triangle contains the local point
7. Increment clicks, subdivide if threshold reached

**Ray-Sphere Intersection Math:**
```typescript
// Ray: P(t) = origin + t * direction
// Sphere: |P|² = radius²
// Quadratic: at² + bt + c = 0
a = direction · direction; // = 1 for normalized
b = 2 * (origin · direction);
c = |origin|² - radius²;
discriminant = b² - 4ac;
t = (-b - √discriminant) / (2a); // Closer intersection
```

---

### 6. Visibility Update Triggers

**When Visibility Recalculates:**
1. **Mesh state changes** (mining, subdivision)
2. **GPS triangle changes** (user moves)
3. **Rotation changes** (gesture release)
4. **Zoom changes** (>10% delta)
5. **Progressive loading** (level-by-level reveal)

**Optimization:** Zoom changes during pinch gesture trigger visibility update every 10% change, avoiding expensive recalculations on every frame.

---

### 7. Performance Optimizations

#### 256 Triangle Limit (v1.2+)

**Enforcement:**
- Frustum culling selects visible triangles
- Backface culling removes rear hemisphere
- Hard limit of 256 triangles in merged mesh
- Expected: 15-30% FPS improvement vs 512

#### Camera State Synchronization

**CRITICAL FIX (v1.2.1):**
```typescript
// Problem: Visibility used stale camera matrices
// Solution: Force camera update before frustum calculation

const currentZoom = zoomRef.current;
camera.position.z = currentZoom;

// Update FOV to match render loop
const zoomT = (currentZoom - MIN_ZOOM) / (MAX_ZOOM - MIN_ZOOM);
const fov = MIN_FOV + (MAX_FOV - MIN_FOV) * zoomT;
camera.fov = fov;

camera.updateProjectionMatrix();    // CRITICAL
camera.updateMatrixWorld(true);     // CRITICAL

// NOW build frustum with correct camera state
const frustum = new THREE.Frustum();
frustum.setFromProjectionMatrix(
  camera.projectionMatrix × camera.matrixWorldInverse
);
```

**Why This Matters:**
- Camera position/FOV changes in render loop (60fps)
- Frustum calculation happens in useEffect (triggered by state)
- Without sync → frustum uses old camera state → wrong culling → invisible triangles!

#### Rotation Matrix Consistency

**CRITICAL PATTERN (v1.2.1):**
```typescript
// ALWAYS use THREE.Euler with explicit 'XYZ' order
const euler = new THREE.Euler(rotX, rotY, 0, 'XYZ');
const matrix = new THREE.Matrix4().makeRotationFromEuler(euler);

// NEVER mix matrix multiplication manually
// ❌ BAD: matrix.makeRotationY(y); matrix.multiply(makeRotationX(x));
// ✅ GOOD: use Euler with explicit order
```

**Why?**
- Three.js uses 'XYZ' Euler order internally
- Manual matrix multiplication can introduce order mismatches
- Euler approach guarantees consistency across codebase

---

## Known Issues & Solutions

### Issue: Triangles Invisible After Rotation

**Root Cause:** Stale camera matrices in visibility calculation

**Solution:**
1. Force camera position/FOV update in visibility useEffect
2. Call `updateProjectionMatrix()` and `updateMatrixWorld(true)`
3. Trigger visibility recalc on zoom changes (>10%)

### Issue: Screen Center GPS Wrong (Showing Antipode)

**Root Cause:** Incorrect GPS centering rotation direction

**Solution:**
```typescript
// Simple direct Euler rotation
rotX = -latitude;  // NOT +latitude
rotY = -longitude; // NOT +longitude
```

### Issue: Frustum Culling Not Working

**Root Cause:** Rotation matrix order mismatch

**Solution:**
- Use `THREE.Euler(x, y, 0, 'XYZ')` everywhere
- Never mix manual matrix multiplication
- Apply rotation BEFORE frustum/backface tests

---

## Configuration

### Zoom Limits

```typescript
const MIN_ZOOM = 1.071;  // ~6.4km altitude
const MAX_ZOOM = 5.0;    // ~25,500km altitude
const MIN_FOV = 20;      // Telephoto lens
const MAX_FOV = 70;      // Wide angle lens
```

**Altitude Calculation:**
```typescript
altitude_km = (zoom - STEP_RADIUS) * EARTH_RADIUS_KM
            = (zoom - 1.07) * 6371
```

### Rendering Radii

```typescript
const EARTH_RADIUS = 0.95;   // Base sphere (visual only)
const STEP_RADIUS = 1.07;    // Triangle mesh layer
const EDGE_RADIUS = 1.09;    // GPS edge highlights
const GPS_MARKER_RADIUS = 1.12; // GPS marker sphere
```

**Layer Stack:**
```
GPS Marker (1.12)
  ↓
GPS Edges (1.09)
  ↓
Triangles (1.07)
  ↓
Earth Sphere (0.95)
```

---

## File Structure

```
src/
├── components/earth/
│   └── StandaloneEarthMesh3D.tsx (~1,200 lines)
│       - Main 3D renderer
│       - Merged mesh creation
│       - Visibility culling
│       - Gesture handling
│
├── screens/
│   └── StandaloneMapScreen.tsx (~200 lines)
│       - GPS location tracking
│       - Stats panel UI
│       - Mining interaction wrapper
│
├── lib/
│   ├── icosahedron.ts (~500 lines)
│   │   - Spherical geometry math
│   │   - Coordinate conversions
│   │   - Geodesic midpoint calculations
│   │
│   ├── icosahedron-mesh.ts (~800 lines)
│   │   - Base icosahedron generation
│   │   - Triangle finding algorithms
│   │   - Subdivision logic
│   │
│   ├── mesh-state-manager.ts (~400 lines)
│   │   - AsyncStorage persistence
│   │   - Click tracking
│   │   - Subdivision triggering
│   │
│   ├── triangle-colors.ts (~150 lines)
│   │   - Level-based color mapping
│   │   - Material property generation
│   │
│   └── location.ts (~200 lines)
│       - GPS permission handling
│       - Location updates
│
└── types/
    └── index.ts
        - MeshTriangle interface
        - LocationData types
```

---

## Dependencies

### Core
- `expo@54.0.12` - React Native framework
- `react-native@0.75.4` - Native platform
- `three@0.166.0` - 3D math and rendering
- `expo-gl@15.0.14` - WebGL context

### Supporting
- `expo-location@18.0.4` - GPS tracking
- `expo-haptics@13.0.1` - Touch feedback
- `@react-native-async-storage/async-storage@2.1.0` - Persistence

---

## Performance Characteristics

### Target Metrics (Mobile)
- **FPS:** 60fps (high-end), 30+ fps (mid-range)
- **Memory:** <150 MB
- **Battery:** <5% per 10 min
- **Render time:** <30ms per visibility update
- **Visible triangles:** 7-256 (adaptive)

### Actual Results (v1.2.1)
- **FPS:** Smooth 60fps on iPhone 16
- **Visible triangles:** 3-37 (varies with zoom/rotation)
- **Render time:** 22-110ms (includes full mesh rebuild)
- **GPS marker:** Always visible (depthTest: false)
- **Frustum culling:** Working (2-23 triangles culled)
- **Backface culling:** Working (10-26 triangles culled)

---

## Deployment

### Build Commands
```bash
# Development
npm install
npm run dev

# TypeScript validation
npx tsc --noEmit

# Build (requires EAS)
npm run build
```

### Environment Variables
- None currently (all config in constants)

---

**Architecture Owner:** AI Developer  
**Last Major Refactor:** 2025-10-16T14:53:42.000Z (v1.2.0)  
**Last Critical Fix:** 2025-10-17T15:49:39.000Z (v1.2.1 - Visibility System)
