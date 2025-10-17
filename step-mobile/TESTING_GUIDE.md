# Phase 2.5 Foundation - Testing Guide

**Version:** 1.1.0  
**Date:** 2025-01-10T20:00:00.000Z  
**Status:** Ready for Device Testing

---

## 🎯 What We're Testing

This guide covers testing the Phase 2.5 foundation implementation, which includes:
- ✅ ProofPayloadV2 submission
- ✅ Confidence score display (0-100)
- ✅ Device metadata collection
- ✅ Partial cell tower data (MCC/MNC)
- ✅ Mock attestation tokens
- ✅ Enhanced mining alerts with security feedback

---

## 📋 Prerequisites

### 1. Backend API (Optional for Testing)
The app can work with or without the backend:

**Option A: Local Backend** (for full testing)
```bash
# In a separate terminal
cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
npm run dev
```
Backend will run on: http://localhost:5500

**Option B: Production Backend** (already configured)
The app is configured to use: https://step-blockchain-api.onrender.com

**Option C: Mock Data** (no backend needed)
The app has built-in fallbacks for development testing.

### 2. Mobile App
The Expo server is already running on port 8000!

---

## 📱 Testing on iPhone

### Step 1: Open Expo Go App
1. Open **Expo Go** app on your iPhone
2. Make sure your iPhone is on the same WiFi network as your Mac
3. Scan the QR code from the terminal (or Metro bundler screen)

**Alternative: Manual Connection**
If QR code doesn't work:
1. In Expo Go, tap "Enter URL manually"
2. Enter: `exp://192.168.100.138:8000` (your Mac's local IP)

### Step 2: Wait for App to Load
You should see:
- Loading screen
- Location permission request
- 3D Earth sphere visualization

### Step 3: Grant Permissions
1. **Location Permission**: Tap "Allow While Using App"
2. Wait for GPS to acquire lock (±5-50m accuracy)

---

## 🧪 Test Scenarios

### Test 1: Basic 3D Visualization ✅
**Expected:**
- Blue Earth sphere renders
- Spherical triangles visible (color gradient: blue → green → red)
- Smooth touch rotation (one finger drag)
- Smooth pinch zoom (two fingers)
- Auto-centering on your GPS position
- FPS counter showing 30-60 fps (optional, may need to enable)

**How to Test:**
1. Rotate the sphere with one finger
2. Pinch to zoom in/out
3. Observe current triangle (should be highlighted differently)
4. Check if sphere auto-centers on your position

**Success Criteria:**
- ✅ Sphere renders without crashes
- ✅ Touch controls are responsive
- ✅ Triangle colors change based on clicks
- ✅ No error messages in console

---

### Test 2: Device Metadata Collection ✅
**Expected:**
- Device model detected (e.g., "iPhone 16")
- OS version detected (e.g., "iOS 18.1")
- App version shown (1.1.0)

**How to Test:**
1. Check console logs for:
   ```
   [ProofCollector] Collecting device metadata...
   [ProofCollector] Device metadata collected: {...}
   ```

**Success Criteria:**
- ✅ Device model is correct
- ✅ OS version is correct
- ✅ No errors in metadata collection

---

### Test 3: Cell Tower Data Collection ⚠️
**Expected (on Cellular Connection):**
- MCC (Mobile Country Code) detected
- MNC (Mobile Network Code) detected

**Expected (on WiFi Only):**
- Cell data: undefined or null (this is normal)

**How to Test:**
1. Ensure you're on cellular network (not just WiFi)
2. Check console logs for:
   ```
   [ProofCollector] Collecting cell tower data...
   [ProofCollector] Cell tower data collected (partial): {mcc: 310, mnc: 260}
   ```

**Success Criteria:**
- ✅ On cellular: MCC/MNC detected
- ✅ On WiFi only: Gracefully returns undefined
- ✅ No crashes

**Known Limitation:**
- Cell ID, RSRP, TAC not available (requires native module)

---

### Test 4: ProofPayloadV2 Mining Flow 🎯
**Expected:**
- Enhanced proof payload with all collected data
- Mining button functional
- Confidence score calculated
- Success/failure alerts with detailed breakdown

**How to Test:**
1. Tap the **⛏️ MINE** button
2. Wait for mining to complete (2-5 seconds)
3. Observe the alert dialog

**Success Alert Should Show:**
```
🎉 Mining Successful!
You earned 0.001953 STEP tokens!

Total Confidence: XX/100 (Medium/High Confidence)

Score Breakdown:
  • Signature: 20/20
  • GPS Accuracy: 15/15
  • Speed Gate: 10/10
  • Moratorium: 5/5
  • Attestation: 0/25
  • GNSS Raw: 0/15
  • Cell Tower: 10/10

New Balance: X.XXXXXX STEP
```

**Failure Alert Should Show:**
```
❌ Mining Failed
[Error message]

Confidence: XX/100 (Low/No Confidence)

Issues detected:
  • [Specific reason 1]
  • [Specific reason 2]
```

**Success Criteria:**
- ✅ Mining completes without crash
- ✅ Confidence score displays (expect 60-80/100 in dev mode)
- ✅ Score breakdown shows all components
- ✅ Mock attestation is detected (0/25 points)
- ✅ Cell tower score reflects collection status

**Expected Scores:**
- **With Cellular:** 60-75/100
- **WiFi Only:** 50-65/100
- **Signature:** Always 20/20
- **GPS Accuracy:** 0-15 (based on accuracy)
- **Attestation:** 0/25 (mock tokens)
- **GNSS:** 0/15 (no native module)
- **Cell Tower:** 0-10 (based on data availability)

---

### Test 5: Confidence Score UI Display ✅
**Expected:**
- Confidence score appears after first mining
- Color-coded based on score:
  - 🟢 90-100: Dark green (Very High)
  - 🟢 75-89: Light green (High)
  - 🟠 50-74: Orange (Medium)
  - 🔴 0-49: Red (Low)
- Individual score breakdown visible

**How to Test:**
1. Mine at least once
2. Scroll down in the MapScreen
3. Look for "Last Proof Security" section

**Success Criteria:**
- ✅ Confidence score displays correctly
- ✅ Color matches score value
- ✅ Breakdown shows individual scores
- ✅ UI is readable and well-formatted

---

### Test 6: Mining Visual Feedback ✅
**Expected:**
- Current triangle pulses during mining
- Green flash on success (200ms)
- Red flash on failure (200ms)

**How to Test:**
1. Watch the current triangle while mining
2. Observe the flash after mining completes

**Success Criteria:**
- ✅ Pulsing animation visible
- ✅ Flash animation plays
- ✅ Colors are correct (green/red)
- ✅ Animations don't lag or stutter

---

### Test 7: Performance Monitoring ✅
**Expected:**
- 30-60 fps on iPhone
- Smooth animations
- No memory leaks
- Low battery impact

**How to Test:**
1. Use the app for 5-10 minutes
2. Rotate, zoom, mine multiple times
3. Monitor FPS counter (if enabled)
4. Check battery usage in iPhone Settings

**Success Criteria:**
- ✅ FPS stays above 30
- ✅ No significant frame drops
- ✅ App doesn't crash after extended use
- ✅ Battery drain is reasonable (<5% per 10 min)

---

## 🐛 Troubleshooting

### Issue: App Won't Load
**Solution:**
1. Check Expo Go is latest version
2. Restart Expo dev server: `npm start`
3. Clear cache: `npm start -- --clear`

### Issue: Location Permission Denied
**Solution:**
1. Go to iPhone Settings > Privacy & Security > Location Services
2. Find your app > Enable "While Using the App"

### Issue: "Backend not responding"
**Solution:**
This is normal! The app has fallbacks:
- Uses mock triangle data
- Uses production API (https://step-blockchain-api.onrender.com)
- Development mode confidence scoring still works

### Issue: Confidence Score is 0
**Solution:**
Check logs for specific errors:
- Signature failed: Wallet issue
- GPS accuracy too low: Move to open area
- All zeros: Backend might be rejecting proof

### Issue: Cell Tower Data is Undefined
**Solutions:**
- Make sure you're on cellular network (not WiFi only)
- Some devices/carriers don't expose MCC/MNC
- This is expected and normal - partial support

### Issue: FPS is Low (<30)
**Solutions:**
- Close other apps
- Restart the app
- Check if device is overheating
- Try reducing triangle count (backend setting)

---

## 📊 Expected Test Results

### Development Mode (Current)
**iPhone on Cellular Network:**
```
Confidence Score: 60-75/100
├─ Signature: 20/20 ✅
├─ GPS Accuracy: 15/15 ✅
├─ Speed Gate: 10/10 ✅
├─ Moratorium: 5/5 ✅
├─ Attestation: 0/25 ❌ (mock)
├─ GNSS Raw: 0/15 ❌ (no module)
└─ Cell Tower: 10/10 ✅
```

**iPhone on WiFi Only:**
```
Confidence Score: 50-65/100
├─ Signature: 20/20 ✅
├─ GPS Accuracy: 15/15 ✅
├─ Speed Gate: 10/10 ✅
├─ Moratorium: 5/5 ✅
├─ Attestation: 0/25 ❌ (mock)
├─ GNSS Raw: 0/15 ❌ (no module)
└─ Cell Tower: 0/10 ❌ (no data)
```

### Production Mode (Future with Native Modules)
**Target Scores:**
- Android: 95-100/100
- iOS: 85-90/100

---

## 📝 Test Checklist

Use this checklist to track your testing:

### Basic Functionality
- [ ] App loads without crashes
- [ ] Location permission granted
- [ ] 3D Earth sphere renders
- [ ] Touch rotation works
- [ ] Pinch zoom works
- [ ] Auto-centering works

### Phase 2.5 Features
- [ ] Device metadata collected
- [ ] Cell tower data attempted (cellular network)
- [ ] Mining with ProofPayloadV2 succeeds
- [ ] Confidence score displays
- [ ] Score breakdown visible
- [ ] Individual scores correct
- [ ] Alert messages show detailed feedback

### Visual Feedback
- [ ] Mining target pulses
- [ ] Success flash (green)
- [ ] Failure flash (red)
- [ ] Click-based color gradient visible

### Performance
- [ ] FPS stays above 30
- [ ] No crashes after 10 minutes
- [ ] Battery drain acceptable
- [ ] Memory usage stable

---

## 🎯 Success Criteria Summary

**Phase 2.5 Foundation is successful if:**
1. ✅ ProofPayloadV2 submits without errors
2. ✅ Confidence score displays (60-80/100 expected)
3. ✅ Device metadata shows correct info
4. ✅ Cell tower data works on cellular (or gracefully fails on WiFi)
5. ✅ Mining alerts show detailed score breakdown
6. ✅ UI is responsive and readable
7. ✅ No crashes or major errors

**What's Expected to NOT Work (Normal):**
- ❌ Attestation: 0/25 (mock tokens, needs Play Integrity/DeviceCheck)
- ❌ GNSS: 0/15 (no native module yet)
- ❌ Cell ID: Missing (partial support, needs native module)

---

## 📞 Reporting Issues

If you encounter issues, please note:
1. **Device:** iPhone model and iOS version
2. **Network:** Cellular or WiFi only
3. **Error messages:** Full text from alerts or console
4. **Confidence score:** Actual vs expected
5. **Steps to reproduce:** What you did before the error

---

## 🚀 Next Steps After Testing

Once testing is complete:
1. **Document results** in test report
2. **Update PHASE_2.5_FOUNDATION.md** with actual test results
3. **Plan native module development** (if foundation works)
4. **Deploy to production** (if all tests pass)

---

**Ready to test?** Open Expo Go on your iPhone and let's see Phase 2.5 in action! 🎉
