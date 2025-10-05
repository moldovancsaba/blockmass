# ANTI_SPOOFING_STRATEGY.md

**STEP Blockchain - Advanced Anti-Spoofing Strategy**  
**Version:** v0.3.1  
**Last Updated:** 2025-10-05T15:34:30.000Z  
**Status:** Implementation Plan

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Threat Model](#threat-model)
3. [Current Defense Mechanisms](#current-defense-mechanisms)
4. [Advanced Anti-Spoofing Features](#advanced-anti-spoofing-features)
5. [Confidence Scoring System](#confidence-scoring-system)
6. [Hardware Attestation](#hardware-attestation)
7. [GNSS Raw Data Verification](#gnss-raw-data-verification)
8. [Cell Tower Cross-Check](#cell-tower-cross-check)
9. [Wi-Fi Fingerprinting](#wi-fi-fingerprinting)
10. [Witness Verification](#witness-verification)
11. [Implementation Roadmap](#implementation-roadmap)
12. [API Changes](#api-changes)
13. [Testing Strategy](#testing-strategy)

---

## 1. Executive Summary

### Goal

Produce verifiable, tamper-resistant Proof-of-Location (PoL) statements from mobile devices by combining multiple independent signals, hardware-backed attestation, nonce-based signing, witness cross-checks, and confidence scoring. The system yields a **confidence score (0-100)** and an **auditable hash** for each accepted location event.

### Current State (Phase 2)

**Implemented:**
- ✅ EIP-191 signature verification (prevents impersonation)
- ✅ Nonce-based replay protection (prevents reuse)
- ✅ GPS accuracy gate (≤50 meters)
- ✅ Speed gate (≤15 m/s / 54 km/h)
- ✅ Moratorium (10-second minimum interval)
- ✅ Binary accept/reject validation

**Limitations:**
- ❌ No hardware attestation (vulnerable to emulators/rooted devices)
- ❌ No GNSS raw data verification (vulnerable to GPS spoofing)
- ❌ No cell tower cross-check (can't detect location inconsistencies)
- ❌ No Wi-Fi fingerprinting (can't verify indoor location)
- ❌ Binary validation (no nuanced fraud detection)

### Target State (Phase 2.5+)

**Enhanced Security:**
- ✅ Hardware attestation (Play Integrity, DeviceCheck) - **CRITICAL**
- ✅ Confidence scoring (0-100, multi-factor) - **HIGH PRIORITY**
- ✅ GNSS raw data (satellites, C/N0, pseudorange) - **HIGH PRIORITY**
- ✅ Cell tower cross-check (MCC/MNC, RSRP) - **HIGH PRIORITY**
- ✅ Wi-Fi fingerprinting (BSSID, RSSI) - **MEDIUM PRIORITY**
- ✅ Witness verification (peer attestation) - **Phase 3**

---

## 2. Threat Model

### Attack Vectors

**1. GPS Spoofing (Software)**
- **Method:** Fake GPS apps (Android) or jailbreak tweaks (iOS)
- **Detection:** Hardware attestation (detects mock location flag)
- **Impact:** 🔴 HIGH (80%+ of attacks)
- **Mitigation:** Require attestation + GNSS raw data

**2. GPS Spoofing (Hardware)**
- **Method:** SDR (Software Defined Radio) transmitting fake GPS signals
- **Detection:** GNSS raw data analysis (C/N0 profiles, multi-constellation)
- **Impact:** 🟡 MEDIUM (10-15% of sophisticated attacks)
- **Mitigation:** Multi-signal verification (GNSS + cell + Wi-Fi)

**3. Emulator/Rooted Devices**
- **Method:** Running app in Android emulator or rooted device with location spoofing
- **Detection:** Hardware attestation (Play Integrity detects emulators)
- **Impact:** 🔴 HIGH (common for bot farms)
- **Mitigation:** Require Play Integrity MEETS_DEVICE_INTEGRITY

**4. Replay Attacks**
- **Method:** Reusing previously signed proofs
- **Detection:** Nonce uniqueness (already implemented)
- **Impact:** 🟢 LOW (already mitigated)
- **Mitigation:** Server-issued nonce + compound unique index

**5. Teleportation**
- **Method:** Submitting proofs from distant locations rapidly
- **Detection:** Speed gate (already implemented)
- **Impact:** 🟢 LOW (already mitigated)
- **Mitigation:** Haversine distance + time delta check

**6. Bot Farms**
- **Method:** Multiple devices submitting proofs from same location
- **Detection:** Rate limiting + device fingerprinting + attestation
- **Impact:** 🟡 MEDIUM (organized fraud)
- **Mitigation:** Attestation + behavioral analysis

**7. Cell Tower Spoofing**
- **Method:** Fake base station (IMSI catcher)
- **Detection:** Cross-check with Wi-Fi and GNSS
- **Impact:** 🟢 LOW (requires specialized equipment)
- **Mitigation:** Multi-signal consensus (GNSS + cell + Wi-Fi)

---

## 3. Current Defense Mechanisms (Phase 2)

### 3.1 EIP-191 Signature Verification ✅

**Implementation:** `core/validator/signature.ts`

**How it works:**
1. Client signs proof with private key (wallet)
2. Server recovers signer address from signature
3. Compare recovered address with claimed account
4. Reject if mismatch

**Effectiveness:**
- ✅ Prevents impersonation (can't submit on behalf of another user)
- ✅ Prevents payload tampering (signature includes all fields)
- ❌ Does NOT prevent spoofing (attacker with valid wallet can still fake location)

**Score:** 20 points (out of 100)

---

### 3.2 Nonce-Based Replay Protection ✅

**Implementation:** `api/proof.ts` + MongoDB compound unique index

**How it works:**
1. Server issues unique nonce
2. Client includes nonce in signed proof
3. Server checks nonce hasn't been used before
4. MongoDB enforces uniqueness via `(account, nonce)` index

**Effectiveness:**
- ✅ Prevents replay attacks
- ✅ Prevents proof reuse
- ❌ Does NOT prevent spoofing (attacker can request nonce and fake location)

**Score:** N/A (pass/fail, not scored)

---

### 3.3 GPS Accuracy Gate ✅

**Implementation:** `core/validator/geometry.ts`

**How it works:**
1. Client reports GPS accuracy (meters)
2. Server rejects if accuracy > 50 meters
3. Encourages outdoor mining (better GPS signal)

**Effectiveness:**
- ✅ Filters low-quality GPS readings
- ✅ Prevents indoor mining (where GPS is weak)
- ❌ Does NOT prevent spoofing (attacker can fake accuracy value)

**Score:** 15 points

---

### 3.4 Speed Gate ✅

**Implementation:** `core/validator/geometry.ts`

**How it works:**
1. Compare current proof location with previous proof
2. Calculate speed: distance / time
3. Reject if speed > 15 m/s (54 km/h)
4. Allow 2-minute clock drift tolerance

**Effectiveness:**
- ✅ Prevents teleportation attacks
- ✅ Catches rapid-fire spoofing
- ❌ Does NOT prevent slow-moving spoofing (walking speed)

**Score:** 10 points

---

### 3.5 Moratorium ✅

**Implementation:** `core/validator/geometry.ts`

**How it works:**
1. Check time since last proof from same account
2. Reject if < 10 seconds
3. Rate-limits each account

**Effectiveness:**
- ✅ Prevents bot spam (high-frequency submissions)
- ✅ Gives GPS time to stabilize
- ❌ Does NOT prevent spoofing (just slows it down)

**Score:** 5 points

---

### Current Total Score: 50 points (out of 100)

**Verdict:** ⚠️ **MODERATE SECURITY** - Vulnerable to determined attackers with spoofing tools

---

## 4. Advanced Anti-Spoofing Features

### Feature Comparison

| Feature | Current | Phase 2.5 | Phase 3 | Impact | Effort |
|---------|---------|-----------|---------|--------|--------|
| **Signature Verification** | ✅ | ✅ | ✅ | 🟡 Medium | - |
| **Nonce Replay Protection** | ✅ | ✅ | ✅ | 🟡 Medium | - |
| **GPS Accuracy Gate** | ✅ | ✅ | ✅ | 🟢 Low | - |
| **Speed Gate** | ✅ | ✅ | ✅ | 🟢 Low | - |
| **Moratorium** | ✅ | ✅ | ✅ | 🟢 Low | - |
| **Confidence Scoring** | ❌ | ✅ | ✅ | 🟡 Medium | 1 week |
| **Hardware Attestation** | ❌ | ✅ | ✅ | 🔴 CRITICAL | 1-2 weeks |
| **GNSS Raw Data** | ❌ | ✅ | ✅ | 🟡 High | 2-3 weeks |
| **Cell Tower Cross-Check** | ❌ | ✅ | ✅ | 🟡 High | 1-2 weeks |
| **Wi-Fi Fingerprinting** | ❌ | ⏳ | ✅ | 🟡 Medium | 2-3 weeks |
| **Witness Verification** | ❌ | ❌ | ✅ | 🟡 High | 3-4 weeks |

---

## 5. Confidence Scoring System

### Overview

Replace binary accept/reject with **confidence score (0-100)**:
- **0-49:** Rejected (fraud likely)
- **50-69:** Suspicious (requires additional verification)
- **70-84:** Accepted (moderate confidence)
- **85-100:** Accepted (high confidence)

### Score Breakdown

| Component | Max Points | Criteria |
|-----------|------------|----------|
| **Signature Valid** | 20 | EIP-191 signature verifies correctly |
| **GPS Accuracy** | 15 | Accuracy ≤ 50 meters |
| **Speed Gate** | 10 | Realistic movement speed |
| **Moratorium** | 5 | Minimum 10 seconds between proofs |
| **Hardware Attestation** | 25 | Play Integrity or DeviceCheck passed |
| **GNSS Raw Data** | 15 | C/N0 profiles realistic, multi-constellation |
| **Cell Tower Match** | 10 | Cell location matches GPS location |
| **Wi-Fi Match** | 10 | Wi-Fi APs match expected location (optional) |
| **Witness Confirmation** | +10 | Peer attestation bonus (Phase 3) |
| **TOTAL** | 100+ | (Witness can push above 100) |

### Acceptance Thresholds

**Default:** 70 points minimum

**Configurable per use case:**
- **High-security:** 85 points (e.g., financial transactions)
- **Standard:** 70 points (e.g., STEP mining)
- **Low-security:** 50 points (e.g., check-ins)

### Example Calculations

**Scenario 1: Perfect Proof (100 points)**
- Signature: 20 ✅
- GPS Accuracy: 15 ✅
- Speed Gate: 10 ✅
- Moratorium: 5 ✅
- Attestation: 25 ✅
- GNSS Raw: 15 ✅
- Cell Tower: 10 ✅
- **Total: 100 points** → Accepted (high confidence)

**Scenario 2: Spoofed GPS (45 points)**
- Signature: 20 ✅
- GPS Accuracy: 15 ✅ (fake app reports "15m")
- Speed Gate: 10 ✅ (slow movement)
- Moratorium: 0 ❌ (too fast)
- Attestation: 0 ❌ (Play Integrity detects mock location)
- GNSS Raw: 0 ❌ (no raw data or unrealistic C/N0)
- Cell Tower: 0 ❌ (cell doesn't match GPS)
- **Total: 45 points** → Rejected (fraud likely)

**Scenario 3: Indoor Proof (65 points)**
- Signature: 20 ✅
- GPS Accuracy: 0 ❌ (80m, indoor)
- Speed Gate: 10 ✅
- Moratorium: 5 ✅
- Attestation: 25 ✅
- GNSS Raw: 5 ⚠️ (weak signal)
- Cell Tower: 10 ✅
- **Total: 75 points** → Accepted (moderate confidence)

---

## 6. Hardware Attestation

### 6.1 Android: Play Integrity API

**What it detects:**
- ✅ Emulators (not real device)
- ✅ Rooted devices (compromised OS)
- ✅ Modified apps (tampered APK)
- ✅ Mock location enabled (fake GPS flag)
- ✅ Google Play Services unavailable

**Implementation:**

**Client (Kotlin/Java):**
```kotlin
import com.google.android.play.core.integrity.IntegrityManager
import com.google.android.play.core.integrity.IntegrityManagerFactory

val integrityManager = IntegrityManagerFactory.create(context)
val nonce = getNonceFromServer() // Server-issued nonce

// Request integrity token
val integrityTokenResponse = integrityManager
    .requestIntegrityToken(
        IntegrityTokenRequest.builder()
            .setNonce(nonce)
            .build()
    )
    .addOnSuccessListener { response ->
        val token = response.token()
        // Include token in proof submission
        submitProof(proof, signature, token)
    }
```

**Server (Node.js):**
```typescript
import { verifyPlayIntegrity } from '@google-cloud/recaptcha-enterprise';

async function verifyAndroidAttestation(token: string): Promise<boolean> {
  const result = await verifyPlayIntegrity(token, {
    packageName: 'com.stepblockchain.app',
  });
  
  // Check verdicts
  const { appIntegrity, deviceIntegrity } = result.tokenPayloadExternal;
  
  return (
    appIntegrity === 'PLAY_RECOGNIZED' &&
    deviceIntegrity === 'MEETS_DEVICE_INTEGRITY'
  );
}
```

**Score:** 25 points if passed

---

### 6.2 iOS: DeviceCheck / App Attest

**What it detects:**
- ✅ Jailbroken devices
- ✅ Simulators (not real device)
- ✅ Modified apps (tampered IPA)

**Implementation:**

**Client (Swift):**
```swift
import DeviceCheck

let service = DCAppAttestService.shared

// Check if available
guard service.isSupported else { return }

// Generate key (once per app install)
service.generateKey { keyId, error in
    guard let keyId = keyId else { return }
    
    // Attest the key
    let challenge = getNonceFromServer().data(using: .utf8)!
    service.attestKey(keyId, clientDataHash: challenge) { attestation, error in
        guard let attestation = attestation else { return }
        
        // Send attestation to server
        submitProof(proof, signature, attestation)
    }
}
```

**Server (Node.js):**
```typescript
import { verifyAppAttest } from 'apple-app-attest';

async function verifyiOSAttestation(
  attestation: Buffer,
  keyId: string,
  challenge: Buffer
): Promise<boolean> {
  const result = await verifyAppAttest({
    attestation,
    keyId,
    challenge,
    bundleId: 'com.stepblockchain.app',
    production: true,
  });
  
  return result.valid;
}
```

**Score:** 25 points if passed

---

### 6.3 Attestation Scoring Logic

```typescript
async function scoreAttestation(
  attestation: string,
  platform: 'android' | 'ios'
): Promise<number> {
  if (!attestation) {
    return 0; // No attestation = 0 points
  }
  
  try {
    let valid = false;
    
    if (platform === 'android') {
      valid = await verifyAndroidAttestation(attestation);
    } else if (platform === 'ios') {
      valid = await verifyiOSAttestation(attestation, ...);
    }
    
    return valid ? 25 : 0;
  } catch (error) {
    console.error('Attestation verification failed:', error);
    return 0;
  }
}
```

**Impact:** 🔴 **BLOCKS 80%+ of emulator/rooted device attacks**

---

## 7. GNSS Raw Data Verification

### 7.1 What is GNSS Raw Data?

**GNSS** = Global Navigation Satellite System (GPS, GLONASS, Galileo, BeiDou)

**Raw data includes:**
- **Satellite ID (svid):** Which satellite signal was received
- **C/N0 (Carrier-to-Noise ratio):** Signal strength (dB-Hz)
- **Azimuth/Elevation:** Satellite position in sky (degrees)
- **Pseudorange:** Distance to satellite (meters)
- **Constellation:** GPS, GLONASS, Galileo, BeiDou

**Why this matters:**
- Spoofed GPS usually has **unrealistic C/N0 profiles**
- Real GPS: C/N0 varies by satellite (30-50 dB-Hz typical)
- Fake GPS: All satellites have identical C/N0 or missing data

---

### 7.2 Collection (Android Only)

**Availability:** Android 7.0+ (API level 24+)

**Client (Kotlin):**
```kotlin
import android.location.GnssStatus

val locationManager = getSystemService(LocationManager::class.java)

// Register GNSS callback
locationManager.registerGnssStatusCallback(object : GnssStatus.Callback() {
    override fun onSatelliteStatusChanged(status: GnssStatus) {
        val satellites = mutableListOf<SatelliteData>()
        
        for (i in 0 until status.satelliteCount) {
            satellites.add(SatelliteData(
                svid = status.getSvid(i),
                cn0 = status.getCn0DbHz(i),
                azimuth = status.getAzimuthDegrees(i),
                elevation = status.getElevationDegrees(i),
                constellation = when (status.getConstellationType(i)) {
                    GnssStatus.CONSTELLATION_GPS -> "GPS"
                    GnssStatus.CONSTELLATION_GLONASS -> "GLONASS"
                    GnssStatus.CONSTELLATION_GALILEO -> "Galileo"
                    GnssStatus.CONSTELLATION_BEIDOU -> "BeiDou"
                    else -> "Unknown"
                },
                usedInFix = status.usedInFix(i)
            ))
        }
        
        // Include in proof payload
    }
})
```

**iOS Limitation:** Core Location does NOT expose GNSS raw data. Score 0 for iOS (no penalty).

---

### 7.3 Verification Logic

```typescript
function verifyGnssRaw(gnss: GnssData): number {
  if (!gnss || !gnss.satellites || gnss.satellites.length === 0) {
    return 0; // No data = 0 points
  }
  
  let score = 0;
  
  // Check 1: Minimum satellites (4+ required for fix)
  if (gnss.satellites.length >= 4) {
    score += 3;
  }
  
  // Check 2: Multi-constellation (GPS + GLONASS/Galileo/BeiDou)
  const constellations = new Set(gnss.satellites.map(s => s.constellation));
  if (constellations.size >= 2) {
    score += 3;
  }
  
  // Check 3: C/N0 variance (realistic signals vary)
  const cn0Values = gnss.satellites.map(s => s.cn0);
  const variance = calculateVariance(cn0Values);
  if (variance > 5) { // Realistic variance > 5 dB-Hz
    score += 4;
  }
  
  // Check 4: C/N0 range (30-50 dB-Hz typical for good signal)
  const avgCn0 = cn0Values.reduce((a, b) => a + b, 0) / cn0Values.length;
  if (avgCn0 >= 30 && avgCn0 <= 50) {
    score += 5;
  }
  
  return Math.min(score, 15); // Max 15 points
}
```

**Impact:** 🟡 **CATCHES 50-70% of GPS spoofing**

---

## 8. Cell Tower Cross-Check

### 8.1 What is Cell Tower Data?

**Cellular network info:**
- **MCC (Mobile Country Code):** Country (e.g., 310 = USA)
- **MNC (Mobile Network Code):** Carrier (e.g., 260 = T-Mobile)
- **Cell ID:** Unique tower identifier
- **RSRP/RSRQ (LTE) or RSSI (3G):** Signal strength (dBm)
- **TAC/LAC:** Tracking/Location Area Code

**Why this matters:**
- Cell towers have **known geographic locations**
- Can verify GPS location matches cell location (within ~500m-5km)
- Spoofed GPS often doesn't match actual cell location

---

### 8.2 Collection

**Android (Kotlin):**
```kotlin
import android.telephony.TelephonyManager
import android.telephony.CellInfoLte

val telephonyManager = getSystemService(TelephonyManager::class.java)
val cellInfos = telephonyManager.allCellInfo

for (cellInfo in cellInfos) {
    if (cellInfo is CellInfoLte && cellInfo.isRegistered) {
        val identity = cellInfo.cellIdentity
        val signalStrength = cellInfo.cellSignalStrength
        
        val cellData = CellData(
            mcc = identity.mccString?.toIntOrNull() ?: 0,
            mnc = identity.mncString?.toIntOrNull() ?: 0,
            cellId = identity.ci,
            tac = identity.tac,
            rsrp = signalStrength.rsrp,
            rsrq = signalStrength.rsrq
        )
    }
}
```

**iOS (Swift):**
```swift
import CoreTelephony

let networkInfo = CTTelephonyNetworkInfo()
let carrier = networkInfo.subscriberCellularProvider

let cellData = CellData(
    mcc: Int(carrier?.mobileCountryCode ?? "0") ?? 0,
    mnc: Int(carrier?.mobileNetworkCode ?? "0") ?? 0
    // Note: iOS doesn't expose Cell ID or signal strength
)
```

---

### 8.3 Verification Logic

**Database:** Use **OpenCellID** (https://opencellid.org) or **Mozilla Location Service** (https://location.services.mozilla.com)

```typescript
async function verifyCellTower(
  gpsLat: number,
  gpsLon: number,
  cell: CellData
): Promise<number> {
  if (!cell || !cell.cellId) {
    return 0; // No cell data = 0 points
  }
  
  // Look up cell tower location in database
  const towerLocation = await lookupCellTower(cell.mcc, cell.mnc, cell.cellId);
  
  if (!towerLocation) {
    return 0; // Tower not in database
  }
  
  // Calculate distance between GPS and tower
  const distance = haversineDistance(
    gpsLat, gpsLon,
    towerLocation.lat, towerLocation.lon
  );
  
  // Score based on distance
  if (distance < 1000) { // Within 1 km
    return 10;
  } else if (distance < 5000) { // Within 5 km
    return 7;
  } else if (distance < 10000) { // Within 10 km
    return 4;
  } else {
    return 0; // Too far = suspicious
  }
}
```

**Impact:** 🟡 **CATCHES 40-60% of GPS spoofing**

---

## 9. Wi-Fi Fingerprinting

### 9.1 What is Wi-Fi Fingerprinting?

**Wi-Fi scan data:**
- **BSSID:** MAC address of Wi-Fi access point (unique)
- **SSID:** Network name (not unique)
- **RSSI:** Signal strength (dBm)

**Why this matters:**
- Wi-Fi APs have **fixed physical locations**
- Can build database of AP locations over time
- Very accurate for indoor location (±10 meters)

---

### 9.2 Collection

**Android (Kotlin):**
```kotlin
import android.net.wifi.WifiManager

val wifiManager = getSystemService(WifiManager::class.java)
val scanResults = wifiManager.scanResults

val wifiData = scanResults.map { result ->
    WifiApData(
        bssid = result.BSSID,
        ssid = result.SSID,
        rssi = result.level // dBm
    )
}
```

**iOS (Swift):**
```swift
import NetworkExtension

// Note: iOS requires user permission and special entitlements
NEHotspotNetwork.fetchCurrent { network in
    if let network = network {
        let wifiData = WifiApData(
            bssid: network.bssid,
            ssid: network.ssid,
            rssi: network.signalStrength
        )
    }
}
```

---

### 9.3 Verification Logic

**Database:** Build over time or use **WiGLE** (https://wigle.net) or **Skyhook**

```typescript
async function verifyWifi(
  gpsLat: number,
  gpsLon: number,
  wifi: WifiApData[]
): Promise<number> {
  if (!wifi || wifi.length === 0) {
    return 0; // No Wi-Fi data = 0 points
  }
  
  let score = 0;
  let matchCount = 0;
  
  for (const ap of wifi) {
    // Look up AP location in database
    const apLocation = await lookupWifiAp(ap.bssid);
    
    if (apLocation) {
      // Calculate distance between GPS and AP
      const distance = haversineDistance(
        gpsLat, gpsLon,
        apLocation.lat, apLocation.lon
      );
      
      // Wi-Fi range is typically < 100 meters
      if (distance < 100) {
        matchCount++;
      }
    }
  }
  
  // Score based on number of matches
  if (matchCount >= 3) {
    score = 10;
  } else if (matchCount >= 2) {
    score = 7;
  } else if (matchCount >= 1) {
    score = 4;
  }
  
  return score;
}
```

**Impact:** 🟡 **CATCHES 30-50% of indoor spoofing**

---

## 10. Witness Verification (Phase 3)

### 10.1 Concept

**Mutual attestation:** Two users physically near each other verify each other's location via:
- BLE (Bluetooth Low Energy) challenge-response
- Wi-Fi RTT (Round-Trip Time) distance measurement

**How it works:**
1. User A submits proof at Triangle X
2. User B (nearby) also submits proof at Triangle X
3. Server issues nonces to both A and B
4. A and B exchange BLE challenge-response (measure RTT)
5. Both submit RTT measurement to server
6. Server verifies:
   - RTT-derived distance matches GPS distance
   - Both proofs submitted within time window
   - Both signatures valid
7. If matched, both proofs get **+10 confidence bonus**

---

### 10.2 BLE Challenge-Response Protocol

**Client A (Kotlin):**
```kotlin
// A broadcasts BLE advertisement
val advertiser = BluetoothAdapter.getDefaultAdapter().bluetoothLeAdvertiser
advertiser.startAdvertising(advertisingData)

// A waits for B to scan and connect
// A receives challenge from B: { challengeB, nonceB, signatureB }
// A responds with: { responseA, nonceA, signatureA }
// A measures RTT
```

**Client B (Kotlin):**
```kotlin
// B scans for A's BLE advertisement
val scanner = BluetoothAdapter.getDefaultAdapter().bluetoothLeScanner
scanner.startScan(scanCallback)

// B connects to A
// B sends challenge to A: { challengeB, nonceB, signatureB }
// B receives response from A: { responseA, nonceA, signatureA }
// B measures RTT
```

---

### 10.3 Verification Logic

```typescript
async function verifyWitness(
  proofA: ProofPayload,
  proofB: ProofPayload,
  witnessData: {
    rttMs: number;
    challengeA: string;
    challengeB: string;
    responseA: string;
    responseB: string;
  }
): Promise<{ valid: boolean; bonus: number }> {
  // Verify both proofs are within same triangle
  if (proofA.triangleId !== proofB.triangleId) {
    return { valid: false, bonus: 0 };
  }
  
  // Verify both proofs are within time window (e.g., 60 seconds)
  const timeDelta = Math.abs(
    new Date(proofA.timestamp).getTime() - 
    new Date(proofB.timestamp).getTime()
  );
  if (timeDelta > 60000) {
    return { valid: false, bonus: 0 };
  }
  
  // Calculate GPS distance between A and B
  const gpsDistance = haversineDistance(
    proofA.location.lat, proofA.location.lon,
    proofB.location.lat, proofB.location.lon
  );
  
  // Calculate BLE RTT-derived distance
  // Assuming BLE signal travels at speed of light (3e8 m/s)
  const rttDistance = (witnessData.rttMs / 1000) * (3e8 / 2); // Round-trip
  
  // Allow 20% tolerance for measurement error
  const tolerance = 0.2;
  const distanceDiff = Math.abs(gpsDistance - rttDistance);
  const valid = distanceDiff <= (gpsDistance * tolerance);
  
  return {
    valid,
    bonus: valid ? 10 : 0
  };
}
```

**Impact:** 🟡 **ADDS DECENTRALIZED VERIFICATION LAYER**

---

## 11. Implementation Roadmap

### Phase 2.5: Advanced Anti-Spoofing (3-4 Weeks)

**Week 1: Hardware Attestation + Confidence Scoring**
- ✅ Day 1-2: Integrate Play Integrity API (Android)
- ✅ Day 3-4: Integrate DeviceCheck/App Attest (iOS)
- ✅ Day 5: Implement confidence scoring system
- **Deliverables:**
  - `core/validator/attestation.ts` (new)
  - `core/validator/confidence.ts` (new)
  - Updated `ProofPayload` (v2)
  - Updated API response with confidence score

**Week 2: GNSS Raw Data**
- ✅ Day 1-2: Android client - collect GNSS raw data
- ✅ Day 3: Backend - verify C/N0 profiles
- ✅ Day 4-5: Testing with real devices + spoofing tools
- **Deliverables:**
  - `core/validator/gnss.ts` (new)
  - Updated mobile client (Android)

**Week 3: Cell Tower Cross-Check**
- ✅ Day 1-2: Integrate OpenCellID API
- ✅ Day 3: Implement cell tower lookup and distance verification
- ✅ Day 4-5: Testing with real devices in multiple locations
- **Deliverables:**
  - `core/validator/cell-tower.ts` (new)
  - OpenCellID integration

**Week 4: Integration + Testing**
- ✅ Day 1-2: End-to-end testing with enhanced proofs
- ✅ Day 3: Tune confidence weights and thresholds
- ✅ Day 4: Documentation (ANTI_SPOOFING_STRATEGY.md)
- ✅ Day 5: Deploy to staging
- **Deliverables:**
  - Updated TEST_RESULTS.md
  - Updated LEARNINGS.md

---

### Phase 3: Witness Verification (Month 3)

**Weeks 9-10: Witness Protocol Design**
- Design BLE challenge-response protocol
- Define witness message types
- Add to CONSENSUS_SPEC.md

**Weeks 11-12: Implementation**
- Mobile SDK: BLE discovery and RTT measurement
- Backend: Witness verification logic
- Validators: Require witnesses for high-confidence proofs

---

## 12. API Changes

### 12.1 Updated ProofPayload (v2)

**Before (v1):**
```typescript
interface ProofPayload {
  version: 'STEP-PROOF-v1';
  account: string;
  triangleId: string;
  lat: number;
  lon: number;
  accuracy: number;
  timestamp: string;
  nonce: string;
}
```

**After (v2):**
```typescript
interface ProofPayload {
  version: 'STEP-PROOF-v2';  // Increment version
  account: string;
  triangleId: string;
  
  // Location data
  location: {
    lat: number;
    lon: number;
    alt?: number;
    accuracy: number;
  };
  
  // GNSS raw data (Android only)
  gnss?: {
    satellites: Array<{
      svid: number;          // Satellite ID
      cn0: number;           // Signal strength (dB-Hz)
      az: number;            // Azimuth (degrees)
      el: number;            // Elevation (degrees)
      constellation: string; // GPS, GLONASS, Galileo, BeiDou
    }>;
    rawAvailable: boolean;
  };
  
  // Cell tower info
  cell?: {
    mcc: number;             // Mobile Country Code
    mnc: number;             // Mobile Network Code
    cellId: number;          // Cell ID
    tac?: number;            // Tracking Area Code
    rsrp?: number;           // Signal strength (dBm)
    neighbors?: Array<{
      cellId: number;
      rsrp: number;
    }>;
  };
  
  // Wi-Fi scan
  wifi?: Array<{
    bssid: string;           // MAC address
    ssid?: string;           // Network name
    rssi: number;            // Signal strength (dBm)
  }>;
  
  // Device metadata
  device: {
    model: string;           // e.g., "Pixel 7"
    os: string;              // e.g., "Android 14"
    appVersion: string;      // e.g., "1.0.0"
    mockLocationEnabled?: boolean;
  };
  
  // Hardware attestation
  attestation: string;       // Play Integrity or DeviceCheck token
  
  timestamp: string;
  nonce: string;
}
```

---

### 12.2 Updated API Response

**Before:**
```json
{
  "ok": true,
  "reward": "0.5",
  "unit": "STEP",
  "triangleId": "STEP-TRI-v1:L10:...",
  "level": 10,
  "clicks": 5,
  "balance": "2.5",
  "processedAt": "2025-10-05T15:30:00.000Z"
}
```

**After (with confidence):**
```json
{
  "ok": true,
  "confidence": 87,
  "scores": {
    "signature": 20,
    "gpsAccuracy": 15,
    "speedGate": 10,
    "moratorium": 5,
    "attestation": 25,
    "gnssRaw": 12,
    "cellTower": 0
  },
  "reward": "0.5",
  "unit": "STEP",
  "triangleId": "STEP-TRI-v1:L10:...",
  "level": 10,
  "clicks": 5,
  "balance": "2.5",
  "processedAt": "2025-10-05T15:30:35.000Z"
}
```

---

## 13. Testing Strategy

### 13.1 Unit Tests (Manual Validation Scripts)

**Test 1: Confidence Scoring**
```bash
# Test scenario: Perfect proof (100 points)
node scripts/test-confidence-scoring.js --scenario perfect
# Expected: 100 points, accepted

# Test scenario: Spoofed GPS (45 points)
node scripts/test-confidence-scoring.js --scenario spoofed
# Expected: 45 points, rejected
```

**Test 2: Hardware Attestation**
```bash
# Test scenario: Valid attestation
node scripts/test-attestation.js --platform android --valid true
# Expected: 25 points

# Test scenario: Invalid attestation (emulator)
node scripts/test-attestation.js --platform android --valid false
# Expected: 0 points
```

---

### 13.2 Integration Tests (Real Devices)

**Test 3: GNSS Raw Data**
- Run app on real Android device outdoors
- Verify satellite count ≥ 4
- Verify multi-constellation (GPS + GLONASS/Galileo)
- Verify C/N0 variance > 5 dB-Hz
- Expected: 15 points

**Test 4: Cell Tower Cross-Check**
- Run app on real device in multiple locations
- Verify cell tower matches GPS location (within 5 km)
- Expected: 10 points

**Test 5: Wi-Fi Fingerprinting**
- Run app indoors with known Wi-Fi APs
- Verify Wi-Fi APs match location
- Expected: 10 points

---

### 13.3 Adversarial Tests (Spoofing Attempts)

**Test 6: Fake GPS App**
- Install fake GPS app (e.g., "Fake GPS Location")
- Enable mock location
- Submit proof
- Expected: 0 points (attestation fails, rejected)

**Test 7: Emulator**
- Run app in Android emulator
- Submit proof
- Expected: 0 points (attestation detects emulator, rejected)

**Test 8: GPS Spoofing Hardware (SDR)**
- Use GPS simulator (if available)
- Submit proof
- Expected: Low confidence (GNSS raw data unrealistic)

---

### 13.4 Field Tests (Real-World Scenarios)

**Test 9: Urban Outdoor**
- Test in city with good GPS signal
- Expected: High confidence (80-100 points)

**Test 10: Indoor**
- Test inside building with weak GPS
- Expected: Moderate confidence (60-80 points, if cell/Wi-Fi available)

**Test 11: Rural**
- Test in rural area with no cell towers or Wi-Fi
- Expected: Moderate confidence (70-85 points, GPS + GNSS only)

---

## 14. Success Metrics

### Phase 2.5 Acceptance Criteria

**Security:**
- ✅ 80%+ of emulator/rooted device attacks blocked (attestation)
- ✅ 50%+ of GPS spoofing attacks detected (GNSS raw + cell)
- ✅ <5% false positive rate (legitimate users not rejected)

**Performance:**
- ✅ Confidence score computed in <100ms
- ✅ Attestation verification in <500ms
- ✅ No impact on proof submission latency

**User Experience:**
- ✅ Users see confidence score in app
- ✅ Clear error messages for rejected proofs (with reasons)
- ✅ No additional user friction (attestation happens automatically)

---

## 15. Future Enhancements

### Phase 4+

**Machine Learning:**
- Train ML model on validated proofs
- Detect anomalous patterns (behavioral analysis)
- Predict fraud probability

**Blockchain Anchoring:**
- Store SHA256(ProofBatch) on blockchain
- Immutable audit trail
- Public verification

**Advanced Witness:**
- Witness network (nearby users)
- Cross-device verification
- Decentralized trust

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.3.1 | 2025-10-05T15:34:30.000Z | Initial anti-spoofing strategy | AI Developer |

---

**End of ANTI_SPOOFING_STRATEGY.md**
