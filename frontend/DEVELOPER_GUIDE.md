# Developer Guide: Building Use-Case Apps

This guide explains how to build location-proof apps on Blockmass, using the Driver Verification app as a reference implementation.

## Table of Contents
1. [Overview](#overview)
2. [Architecture Pattern](#architecture-pattern)
3. [Distance Calculation](#distance-calculation)
4. [Event Recording Flow](#event-recording-flow)
5. [Building a New Use Case](#building-a-new-use-case)
6. [No Map Provider Needed](#no-map-provider-needed)

---

## Overview

Blockmass provides a foundation for building **proof-of-location** applications. Each use case follows a consistent pattern:

1. **Setup** — Define target locations and user configuration
2. **Verification** — Capture GPS, compare with targets, calculate distance
3. **Proof** — Record tamper-proof events with contentHash

The driver use case demonstrates this pattern for delivery/field service verification.

---

## Architecture Pattern

### Directory Structure
```
app/
├── page.jsx                     # Landing page with use-case selector
├── driver/                      # Driver use case
│   ├── page.jsx                # Use-case home (navigation hub)
│   ├── setup/
│   │   └── page.jsx            # Configuration (locations, settings)
│   └── verify/
│       └── page.jsx            # GPS capture & verification
├── inspector/                   # Future: Inspector use case
├── volunteer/                   # Future: Volunteer use case
└── _lib/
    └── geo/
        ├── geohash5.js         # Privacy-friendly location bucketing
        └── distance.js         # Haversine distance calculation
```

### Use-Case Pattern
Each use case has three pages:

1. **Home** (`/driver/page.jsx`)
   - Navigation hub
   - Links to Setup and Verify
   - Shows use-case context

2. **Setup** (`/driver/setup/page.jsx`)
   - User configuration
   - Define target locations
   - Store in localStorage or MongoDB

3. **Verify** (`/driver/verify/page.jsx`)
   - Select target
   - Get nonce
   - Capture GPS
   - Calculate distance
   - Record event

---

## Distance Calculation

### Haversine Formula
We use the Haversine formula to calculate great-circle distance between two points on Earth's surface.

**Location**: `app/_lib/geo/distance.js`

```javascript
import { calculateDistance } from "@/app/_lib/geo/distance";

// Returns distance in meters
const distanceM = calculateDistance(lat1, lon1, lat2, lon2);
```

### Why Haversine?
- **No external dependencies** — Pure JavaScript math
- **Accurate enough** — Within ~0.5% for most distances
- **Fast** — Simple trigonometry
- **No API keys needed** — Works offline

### Accuracy Considerations
The Haversine formula assumes Earth is a perfect sphere (radius: 6,371,000 meters). For most use cases, this is sufficient:

- **< 100m**: Very accurate (within 1-2 meters)
- **< 10km**: Accurate (within ~50 meters)
- **> 100km**: Slight deviation (use Vincenty formula for extreme precision)

---

## Event Recording Flow

### 1. Get a Nonce
```javascript
const res = await fetch("/api/attest/nonce", { method: "POST" });
const { nonce } = await res.json();
```

**Why?** Nonces prevent replay attacks. Each nonce expires in 5 minutes and can only be used once.

### 2. Capture GPS
```javascript
const position = await new Promise((resolve, reject) => {
  navigator.geolocation.getCurrentPosition(resolve, reject, {
    enableHighAccuracy: true,  // Use GPS, not IP/WiFi
    timeout: 10000,             // 10-second timeout
  });
});

const { latitude, longitude, accuracy } = position.coords;
```

**Tip**: `enableHighAccuracy: true` forces GPS usage instead of WiFi/cell tower triangulation, giving you ~5-10m accuracy instead of ~50-500m.

### 3. Calculate Distance (Optional)
```javascript
import { calculateDistance } from "@/app/_lib/geo/distance";

const distanceM = Math.round(
  calculateDistance(latitude, longitude, targetLat, targetLon)
);
```

### 4. Build Payload
```javascript
const payload = {
  topicId: "driver",              // Use case identifier
  taskId: location.id.toString(), // Specific target/task
  occurredAt: new Date().toISOString(),
  lat: latitude,
  lon: longitude,
  accuracyM: Math.round(accuracy || 0),
  nonce,
  meta: {                         // Optional metadata
    driverName: "John Doe",
    targetLocation: {
      label: "Customer A",
      lat: targetLat,
      lon: targetLon,
    },
    distanceM,
  },
};
```

### 5. Record Event
```javascript
const res = await fetch("/api/events", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(payload),
});

const { eventId, contentHash } = await res.json();
```

**What Happens:**
- Event is stored in MongoDB with all details
- `contentHash` is computed (SHA-256 of canonical JSON)
- `geohash5` is generated (privacy bucket, ~5km)
- Event is broadcast via Socket.IO to connected clients
- Status is set to `queued` (ready for blockchain anchoring)

### 6. Display Proof
```javascript
let proofMessage = "";
if (distanceM < 10) {
  proofMessage = `You are within 10 meters of ${targetLabel}`;
} else if (distanceM < 50) {
  proofMessage = `You are within 50 meters of ${targetLabel}`;
} else if (distanceM < 100) {
  proofMessage = `You are within 100 meters of ${targetLabel}`;
} else {
  proofMessage = `You are ${distanceM} meters from ${targetLabel}`;
}
```

---

## Building a New Use Case

### Step 1: Add to Landing Page
Edit `app/page.jsx`:

```javascript
const USE_CASES = [
  {
    id: "driver",
    title: "Driver Verification",
    description: "...",
    path: "/driver",
  },
  {
    id: "inspector",         // Your new use case
    title: "Inspector Check-In",
    description: "Record site inspections with location proof.",
    path: "/inspector",
  },
];
```

### Step 2: Create Directory
```bash
mkdir -p app/inspector/setup app/inspector/verify
```

### Step 3: Create Pages
1. **Home** (`app/inspector/page.jsx`) — Copy from `driver/page.jsx` and customize
2. **Setup** (`app/inspector/setup/page.jsx`) — Copy from `driver/setup/page.jsx` and customize
3. **Verify** (`app/inspector/verify/page.jsx`) — Copy from `driver/verify/page.jsx` and customize

### Step 4: Customize Configuration
Change the `STORAGE_KEY` to avoid conflicts:

```javascript
const STORAGE_KEY = "blockmass_inspector_config"; // Not "driver_config"
```

### Step 5: Customize Payload
Use a unique `topicId`:

```javascript
const payload = {
  topicId: "inspector",  // Not "driver"
  taskId: inspection.id.toString(),
  // ... rest of payload
};
```

### Step 6: Test
1. `npm run dev`
2. Open `http://localhost:3000`
3. Click your new use case
4. Test setup and verify flows

---

## No Map Provider Needed

### Why No Map Library?
Most location-proof apps don't need interactive maps. You only need:

1. **Device GPS** → `navigator.geolocation`
2. **Coordinates** → Copy from Google Maps / OpenStreetMap
3. **Distance calculation** → Haversine formula

### Getting Coordinates
**Option 1: Google Maps**
1. Right-click on location
2. Click the lat/lon at the top
3. Copy: `47.123456, -122.987654`

**Option 2: OpenStreetMap**
1. Right-click on location
2. Choose "Show address"
3. Copy coordinates

**Option 3: Apple Maps**
1. Right-click on location
2. Click "Copy Coordinates"

### When You DO Need a Map
If your use case requires:
- **Visual confirmation** of location
- **Drawing geofences** or boundaries
- **Route planning**

...then consider adding Leaflet (open-source, no API key required):

```bash
npm install leaflet react-leaflet
```

But for most MVP use cases, device GPS + distance calculation is sufficient!

---

## Distance Thresholds

### Recommended Thresholds
Based on GPS accuracy and use-case requirements:

| Use Case | Threshold | Rationale |
|----------|-----------|-----------|
| **Delivery** | 10-50m | Driver stops near address |
| **Inspection** | 5-20m | Inspector at specific equipment |
| **Volunteer** | 50-200m | Attendee at venue/event |
| **Field Service** | 10-30m | Technician at customer site |

### GPS Accuracy by Method
- **High-accuracy GPS**: 5-10 meters (clear sky)
- **WiFi triangulation**: 20-50 meters (urban areas)
- **Cell tower**: 100-1000 meters (fallback)

**Always use `enableHighAccuracy: true`** to force GPS usage.

---

## Proof Messages

### User-Friendly Messaging
Instead of showing raw numbers, provide context:

```javascript
function formatProofMessage(distanceM, targetLabel) {
  if (distanceM < 10) {
    return `✓ You are at ${targetLabel}`;
  } else if (distanceM < 50) {
    return `✓ You are near ${targetLabel} (${distanceM}m away)`;
  } else if (distanceM < 100) {
    return `⚠ You are close to ${targetLabel} (${distanceM}m away)`;
  } else {
    return `✗ You are too far from ${targetLabel} (${distanceM}m away)`;
  }
}
```

---

## Event Schema

### What Gets Stored
```javascript
{
  _id: "uuid",
  topicId: "driver",
  taskId: "location-id",
  occurredAt: "2025-10-02T12:00:00.000Z",
  geo: {
    latE7: 471234560,     // lat * 10^7 (stable integer)
    lonE7: -1229876540,   // lon * 10^7 (stable integer)
    geohash5: "c23nb",    // 5-char privacy bucket (~5km)
    accuracyM: 8          // GPS accuracy in meters
  },
  verification: {
    nonce: "...",
    userSig: "",          // Optional: cryptographic signature
    ipCountry: "US",
    ipCity: "Seattle",
    ipOk: false,
    venueTokenId: "",     // Future: QR code venue verification
    venueOk: false
  },
  contentHash: "0xabc123...",  // SHA-256 of canonical JSON
  anchor: {
    status: "queued",     // queued|sent|confirmed|failed
    txHash: "",           // Blockchain transaction hash
    blockNumber: null,
    usedEndpoint: ""
  },
  createdAt: "2025-10-02T12:00:00.000Z",
  updatedAt: "2025-10-02T12:00:00.000Z"
}
```

---

## Testing Tips

### Local Development
1. **Use real GPS** — Test on your phone, not desktop
2. **Test nonce expiry** — Wait 5 minutes and try to reuse
3. **Test distance calculation** — Walk 10m, 50m, 100m from target
4. **Test offline** — Capture GPS, then disconnect network (should fail at event recording)

### Production Verification
1. Visit `/dev` page to see all recorded events
2. Check `/api/events/list` to verify data structure
3. Use `/admin/health` to confirm MongoDB connection
4. Test with multiple users to verify real-time Socket.IO broadcast

---

## Next Steps

### Phase 3 Enhancements (Future)
1. **Batch anchoring** — Combine multiple events into Merkle tree
2. **Venue QR codes** — Scan QR at location for additional proof
3. **Photo attachments** — Capture image proof with EXIF data
4. **Offline mode** — Queue events locally, sync when online
5. **Geofencing** — Auto-detect when entering/leaving target area

### Resources
- Haversine formula: https://en.wikipedia.org/wiki/Haversine_formula
- Geohash: https://en.wikipedia.org/wiki/Geohash
- Web Geolocation API: https://developer.mozilla.org/en-US/docs/Web/API/Geolocation_API

---

**Built with Blockmass v0.20.0**
