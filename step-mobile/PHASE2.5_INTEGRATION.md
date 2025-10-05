# Mobile App - Phase 2.5 Integration Guide

**STEP Mobile - Advanced Anti-Spoofing Integration**  
**Target:** Upgrade to ProofPayloadV2 with 100/100 security  
**Platform Priority:** Android first (full features), then iOS  
**Status:** Ready to implement 🚀

---

## 🎯 Integration Objectives

### Goal
Upgrade STEP Mobile app to use ProofPayloadV2 with all Phase 2.5 anti-spoofing features:
- ✅ Hardware Attestation (Android: Play Integrity, iOS: DeviceCheck)
- ✅ GNSS Raw Data (Android only)
- ✅ Cell Tower Location (Android + iOS)
- ✅ Device Metadata
- ✅ Confidence Scoring Display

### Expected Security Scores
- **Android:** 95-100 points (all features available)
- **iOS:** 85-90 points (no GNSS raw data)

---

## 📦 Required Dependencies

### Android
```json
{
  "expo-device": "^7.0.3",           // Device info
  "expo-cellular": "^7.0.3",         // Cell tower info
  "@react-native-community/geolocation": "^3.3.0", // GNSS raw data
  "react-native-play-integrity": "^1.0.0"  // Play Integrity API
}
```

### iOS
```json
{
  "expo-device": "^7.0.3",           // Device info
  "expo-cellular": "^7.0.3",         // Cell tower info
  "react-native-device-check": "^1.0.0"  // DeviceCheck API
}
```

---

## 🔧 Implementation Steps

### Step 1: Install Dependencies
```bash
cd /Users/moldovancsaba/Projects/blockmass/step-mobile

# Core dependencies
npx expo install expo-device expo-cellular

# Platform-specific (add to package.json)
# Android: react-native-play-integrity
# iOS: react-native-device-check
```

### Step 2: Create ProofPayloadV2 Type
File: `src/types/proof-v2.ts`

```typescript
export interface ProofPayloadV2 {
  version: 'STEP-PROOF-v2';
  account: string;
  triangleId: string;
  
  location: {
    lat: number;
    lon: number;
    alt?: number;
    accuracy: number;
  };
  
  gnss?: {
    satellites: Array<{
      svid: number;
      cn0: number;
      az: number;
      el: number;
      constellation: string;
    }>;
    rawAvailable: boolean;
  };
  
  cell?: {
    mcc: number;
    mnc: number;
    cellId: number;
    tac?: number;
    rsrp?: number;
    neighbors?: Array<{
      cellId: number;
      rsrp: number;
    }>;
  };
  
  device: {
    model: string;
    os: string;
    appVersion: string;
    mockLocationEnabled?: boolean;
  };
  
  attestation: string;
  timestamp: string;
  nonce: string;
}
```

### Step 3: Create Data Collection Library
File: `src/lib/proof-collector.ts`

Functions to implement:
- `collectDeviceMetadata()` - Device info
- `collectCellTowerData()` - Cell tower info
- `collectGnssData()` - GNSS raw (Android only)
- `collectAttestation()` - Hardware attestation
- `buildProofPayloadV2()` - Assemble complete payload

### Step 4: Update Proof Signing
File: `src/lib/wallet.ts`

Update `signProof()` to handle ProofPayloadV2 format

### Step 5: Update MapScreen UI
File: `src/screens/MapScreen.tsx`

Add:
- Confidence score display
- Security level indicator
- Attestation status
- GNSS/Cell status indicators

### Step 6: Update API Client
File: `src/lib/mesh-client.ts`

Update:
- `submitProof()` to send ProofPayloadV2
- Handle new API response (confidence, scores, reasons)
- Display rejection reasons to user

---

## 🤖 Android-Specific Implementation

### Play Integrity API

File: `src/lib/android/play-integrity.ts`

```typescript
import PlayIntegrity from 'react-native-play-integrity';

export async function getPlayIntegrityToken(
  nonce: string
): Promise<string> {
  try {
    const token = await PlayIntegrity.requestIntegrityToken({
      nonce,
      cloudProjectNumber: 'YOUR_PROJECT_NUMBER'
    });
    return token;
  } catch (error) {
    console.error('Play Integrity failed:', error);
    throw error;
  }
}
```

### GNSS Raw Data

File: `src/lib/android/gnss.ts`

```typescript
import { Platform, NativeModules } from 'react-native';

export async function collectGnssRawData() {
  if (Platform.OS !== 'android') {
    return null;
  }
  
  // Use GnssMeasurement API (Android 7.0+)
  // Collect satellite data: svid, cn0, azimuth, elevation
  // TODO: Implement native module bridge
}
```

---

## 🍎 iOS-Specific Implementation

### DeviceCheck/App Attest

File: `src/lib/ios/device-check.ts`

```typescript
import DeviceCheck from 'react-native-device-check';

export async function getDeviceCheckToken(
  challenge: string
): Promise<string> {
  try {
    const token = await DeviceCheck.generateToken({
      challenge,
      teamId: 'YOUR_TEAM_ID',
      bundleId: 'com.blockmass.stepmobile'
    });
    return token;
  } catch (error) {
    console.error('DeviceCheck failed:', error);
    throw error;
  }
}
```

---

## 📱 Cell Tower Collection (Both Platforms)

File: `src/lib/cell-tower.ts`

```typescript
import * as Cellular from 'expo-cellular';

export async function collectCellTowerData() {
  try {
    const carrier = await Cellular.getCarrier();
    const mcc = await Cellular.getMobileCountryCode();
    const mnc = await Cellular.getMobileNetworkCode();
    
    // Note: CellID and signal strength require native modules
    // Expo doesn't expose these directly
    
    return {
      mcc: parseInt(mcc || '0'),
      mnc: parseInt(mnc || '0'),
      cellId: 0, // TODO: Native module needed
      rsrp: undefined
    };
  } catch (error) {
    console.warn('Cell tower data collection failed:', error);
    return null;
  }
}
```

---

## 🎨 UI Updates

### Confidence Score Display

```tsx
{confidence && (
  <View style={styles.confidenceContainer}>
    <Text style={styles.confidenceScore}>
      🛡️ Security Score: {confidence}/100
    </Text>
    <Text style={styles.confidenceLevel}>
      {confidenceLevel}
    </Text>
    
    {/* Score Breakdown */}
    <View style={styles.scoreBreakdown}>
      <ScoreItem label="Signature" score={scores.signature} max={20} />
      <ScoreItem label="Attestation" score={scores.attestation} max={25} />
      <ScoreItem label="GPS Accuracy" score={scores.gpsAccuracy} max={15} />
      <ScoreItem label="GNSS" score={scores.gnssRaw} max={15} />
      <ScoreItem label="Cell Tower" score={scores.cellTower} max={10} />
    </View>
  </View>
)}
```

---

## 🔄 API Integration Flow

### 1. Collect All Data
```typescript
const deviceData = await collectDeviceMetadata();
const cellData = await collectCellTowerData();
const gnssData = Platform.OS === 'android' 
  ? await collectGnssData() 
  : undefined;
const attestation = Platform.OS === 'android'
  ? await getPlayIntegrityToken(nonce)
  : await getDeviceCheckToken(nonce);
```

### 2. Build ProofPayloadV2
```typescript
const payload: ProofPayloadV2 = {
  version: 'STEP-PROOF-v2',
  account: walletAddress,
  triangleId: currentTriangle.id,
  location: {
    lat: location.coords.latitude,
    lon: location.coords.longitude,
    alt: location.coords.altitude || undefined,
    accuracy: location.coords.accuracy
  },
  gnss: gnssData,
  cell: cellData,
  device: deviceData,
  attestation: attestation,
  timestamp: new Date().toISOString(),
  nonce: generateNonce()
};
```

### 3. Sign Payload
```typescript
const signature = await signProofV2(payload, privateKey);
```

### 4. Submit to API
```typescript
const response = await fetch('https://step-blockchain-api.onrender.com/proof/submit', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ payload, signature })
});

const result = await response.json();

if (result.ok) {
  // Show success with confidence score
  showSuccess(result.confidence, result.confidenceLevel, result.reward);
} else {
  // Show rejection reasons
  showRejection(result.reasons);
}
```

---

## 🧪 Testing Strategy

### Development Testing
1. **Simulator/Emulator First**
   - Test basic flow without attestation
   - Use `CONFIDENCE_REQUIRE_ATTESTATION=false` on backend
   - Verify ProofPayloadV2 structure

2. **Real Device Testing**
   - Test with attestation enabled
   - Verify GNSS data collection (Android)
   - Verify cell tower data collection
   - Check confidence scores

### Security Testing
1. **Emulator Detection**
   - Run on emulator → expect attestation failure
   - Confidence score should be 0 for attestation

2. **GPS Spoofing**
   - Use fake GPS app → expect low confidence
   - GNSS variance should detect spoofing

3. **Cell Tower Mismatch**
   - Mock cell data → expect distance warning
   - Cell tower score should be 0

---

## 📊 Expected Results

### Android (Full Features)
```json
{
  "ok": true,
  "confidence": 97,
  "confidenceLevel": "Very High Confidence",
  "scores": {
    "signature": 20,
    "gpsAccuracy": 15,
    "speedGate": 10,
    "moratorium": 5,
    "attestation": 25,
    "gnssRaw": 15,
    "cellTower": 7,
    "total": 97
  },
  "reward": "0.5",
  "balance": "10.5"
}
```

### iOS (No GNSS)
```json
{
  "ok": true,
  "confidence": 85,
  "confidenceLevel": "High Confidence",
  "scores": {
    "signature": 20,
    "gpsAccuracy": 15,
    "speedGate": 10,
    "moratorium": 5,
    "attestation": 25,
    "gnssRaw": 0,
    "cellTower": 10,
    "total": 85
  },
  "reward": "0.5",
  "balance": "10.5"
}
```

---

## 🚀 Implementation Timeline

### Week 1: Core Integration
- Day 1-2: Install dependencies, create types
- Day 3-4: Implement data collection functions
- Day 5: Update proof signing and submission

### Week 2: Platform-Specific
- Day 1-2: Android Play Integrity + GNSS
- Day 3-4: iOS DeviceCheck
- Day 5: Cell tower data (both platforms)

### Week 3: UI & Testing
- Day 1-2: Update MapScreen with confidence display
- Day 3-4: Testing on real devices
- Day 5: Bug fixes and polish

---

## 📝 Files to Create/Modify

### New Files
- `src/types/proof-v2.ts` (ProofPayloadV2 interface)
- `src/lib/proof-collector.ts` (Data collection)
- `src/lib/android/play-integrity.ts` (Android attestation)
- `src/lib/android/gnss.ts` (GNSS raw data)
- `src/lib/ios/device-check.ts` (iOS attestation)
- `src/lib/cell-tower.ts` (Cell tower info)

### Modified Files
- `src/lib/wallet.ts` (Update signing for v2)
- `src/lib/mesh-client.ts` (Update API calls)
- `src/screens/MapScreen.tsx` (Add confidence UI)
- `package.json` (Add dependencies)

---

## ✅ Success Criteria

- [ ] ProofPayloadV2 correctly assembled
- [ ] Hardware attestation working (Android + iOS)
- [ ] GNSS raw data collected (Android)
- [ ] Cell tower data collected (both platforms)
- [ ] Confidence score displayed in UI
- [ ] API integration working with https://step-blockchain-api.onrender.com
- [ ] Real device testing complete
- [ ] Android achieves 95+ confidence score
- [ ] iOS achieves 85+ confidence score

---

## 🎉 Ready to Start!

**Current Status:** All backend features complete (100/100 security)  
**Next Step:** Implement mobile data collection  
**Timeline:** 3 weeks to full integration  
**Target:** Production-ready mobile app with world-class security! 🚀

---

**Document Version:** 1.0.0  
**Last Updated:** 2025-10-05T16:45:00.000Z  
**Author:** AI Mobile Team  
**Status:** Ready for implementation
