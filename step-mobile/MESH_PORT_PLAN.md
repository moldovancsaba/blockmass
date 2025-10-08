# STEP Mobile - Mesh Visualization Port Plan

## Web Frontend Implementation Analysis

The web frontend (`frontend/app/mesh/page.tsx`) uses:

### ✅ **Proven Features to Port**:
1. **Orthographic Projection** - Shows Earth as 3D sphere from infinite distance
2. **Canvas-based rendering** - Fast, hardware accelerated
3. **Zoom with altitude** - Range: 25x (ISS, 400km) to 100,000x (street, 100m)
4. **Pan/drag to rotate** - Globe rotation with drag
5. **Viewport-based queries** - Only fetches visible triangles (max 512)
6. **Level selector** - Fixed level selection (1-21)
7. **Touch gestures** - Pinch-to-zoom, drag-to-pan
8. **Auto zoom limits** - Enforces 512 triangle visibility rule

### 📐 **Key Math (from frontend)**:

#### Orthographic Projection
```typescript
// 3D sphere projection
const phi = (90 - lat) * (Math.PI / 180);
const theta = (lon + 180) * (Math.PI / 180);
const x3d = Math.cos(lonRad) * cosLat;
const y3d = Math.sin(latRad);
const z3d = Math.sin(lonRad) * cosLat;

// 2D projection (drop Z)
const radius = canvasSize / 2.5;
const x = centerX + x3d * radius * zoom;
const y = centerY - y3d * radius * zoom;
```

#### Altitude Calculation
```typescript
const viewWidthKm = 20037 / zoom;
const altitudeKm = viewWidthKm / 2;
const altitudeMeters = altitudeKm * 1000;
```

#### Zoom Limits (512 triangle rule)
```typescript
const totalTriangles = 20 * Math.pow(4, level - 1);
if (totalTriangles <= 1024) {
  minZoom = 25.0; // ISS altitude
} else {
  const zoomFactor = Math.sqrt(totalTriangles / 1024);
  minZoom = 25.0 * zoomFactor;
}
maxZoom = 100000; // Street level
```

## 🚧 React Native Implementation Options

### Option 1: React Native Skia (RECOMMENDED)
**Pros**:
- Hardware accelerated Canvas API
- Same drawing commands as web
- Best performance
- Direct port of web code

**Cons**:
- Need to install `@shopify/react-native-skia`

### Option 2: React Native SVG (CURRENT)
**Pros**:
- Already installed
- Works now

**Cons**:
- Performance issues with 512+ triangles
- No hardware acceleration
- Complex to implement backface culling

### Option 3: React Native WebView
**Pros**:
- Can embed entire web frontend
- Zero porting needed

**Cons**:
- Heavy
- Poor integration with native UI

## ✅ RECOMMENDED APPROACH

Use **React Native Skia** and port the exact Canvas logic from web frontend.

### Implementation Steps:

1. **Install Skia**:
   ```bash
   npx expo install @shopify/react-native-skia
   ```

2. **Port Canvas rendering to Skia**:
   - Copy `latLonToCanvas()` projection math
   - Copy `render()` triangle drawing logic
   - Copy gesture handlers (already have in web)
   - Copy zoom limits calculation

3. **Port viewport management**:
   - Same ViewportState interface
   - Same zoom/pan/rotation logic
   - Same 512 triangle rule

4. **Port API integration**:
   - Same `fetchTriangles()` with bbox
   - Same `getViewportBbox()` calculation
   - Already have mesh-client.ts

5. **Port UI controls**:
   - Level selector dropdown
   - Altitude display
   - Triangle count
   - Loading indicator

## 📋 Action Items

1. Install `@shopify/react-native-skia`
2. Create `src/components/MeshVisualization.tsx` based on web `page.tsx`
3. Replace current `TriangleMeshView.tsx` with new Skia implementation
4. Test zoom, pan, triangle rendering
5. Verify 512 triangle limit works

## 🎯 Expected Result

Mobile app will have **identical mesh visualization** to web frontend:
- ✅ Proper spherical projection
- ✅ Smooth zoom 25x - 100,000x
- ✅ Altitude display in meters
- ✅ Pan/rotate globe
- ✅ 512 triangle visibility limit
- ✅ Level selector (1-21)
- ✅ Fast Canvas rendering
