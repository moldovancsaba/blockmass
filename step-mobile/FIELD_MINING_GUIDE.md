# Field Mining Guide

**Ready to mine STEP tokens in the real world!** 🌍

---

## Pre-Flight Checklist

### ✅ Backend (Production)
- [x] Deployed to Render.com: https://step-blockchain-api.onrender.com
- [x] MongoDB connected (20 base triangles seeded)
- [x] Spherical geometry working globally
- [x] Health check passing

### ✅ Mobile App Configuration
- [x] USE_LOCAL_DEV = false (using production backend)
- [x] GPS permissions granted
- [x] 3D globe rendering working

### ⏳ Before You Leave
- [ ] Restart Expo app (to pick up production backend)
- [ ] Verify app shows 20 triangles
- [ ] Create/check wallet address
- [ ] Test tap on triangle (should show mining UI)
- [ ] Check internet connection (mobile data or WiFi)

---

## Field Mining Instructions

### 1. Open the App
```bash
# On your development machine
cd ~/Projects/blockmass/step-mobile
npx expo start
```

Then open on your **physical device** (not simulator):
- iOS: Scan QR with Camera app
- Android: Scan QR with Expo Go app

### 2. Location Setup
- Enable GPS/Location Services
- Allow "Precise Location" (iOS) or "High Accuracy" (Android)
- Go outside for best GPS signal (50m accuracy required)

### 3. Mining Flow
1. **Globe centers on your location** (GPS marker visible)
2. **Triangle containing you is highlighted** (yellow/orange)
3. **Tap the triangle** to mine
4. **Sign the proof** with your wallet
5. **Submit to backend** → Reward received!

### 4. What You'll See
```
LOG  [GPS] Location: 47.5064, 18.9897
LOG  [Mesh] Triangle: ICO-5 (Level 0)
LOG  [Mining] Submitting proof...
LOG  [Success] Reward: 1.0 STEP tokens
```

---

## Troubleshooting

### Issue: "No triangles visible"
**Fix:**
1. Check internet connection
2. Look for error: `[MeshStateManager] Fetching global mesh state from https://step-blockchain-api.onrender.com/mesh/state`
3. If timeout, Render.com may be cold-starting (wait 30 seconds)

### Issue: "GPS not accurate enough"
**Error:** `LOW_GPS_ACCURACY` (accuracy > 50m)

**Fix:**
- Go outside (away from buildings)
- Wait for GPS to stabilize (15-30 seconds)
- Clear sky view helps

### Issue: "Mining too fast"
**Error:** `TOO_FAST` (moved >15 m/s between proofs)

**Fix:**
- Wait 10 seconds between mining attempts
- Backend enforces 10-second cooldown per account

### Issue: "Proof signature failed"
**Error:** `BAD_SIGNATURE`

**Fix:**
- Check wallet is initialized
- Restart app to refresh wallet
- Check logs for wallet address

### Issue: "Backend not responding"
**Fix:**
1. Verify backend health:
   ```bash
   curl https://step-blockchain-api.onrender.com/health
   ```

2. If down, check Render.com dashboard

3. Render free tier may sleep after 15min inactivity:
   - First request wakes it up (30-60 second delay)
   - Subsequent requests are instant

---

## Production Backend Status

**URL:** https://step-blockchain-api.onrender.com

**Endpoints:**
- `GET /health` - Backend health check
- `GET /mesh/state` - All 20 base triangles
- `GET /mesh/triangleAt?lat={lat}&lon={lon}&level={level}` - Triangle lookup
- `POST /proof/submit` - Submit mining proof

**Test from command line:**
```bash
# Health check
curl https://step-blockchain-api.onrender.com/health | jq

# Get triangle at your location
curl "https://step-blockchain-api.onrender.com/mesh/triangleAt?lat=47.4979&lon=19.0402&level=10" | jq

# Get all triangles
curl https://step-blockchain-api.onrender.com/mesh/state | jq '.result.triangleCount'
```

---

## Mining Statistics

**Current Mesh:**
- Level 0: 20 base icosahedron triangles
- Coverage: Global (entire Earth)
- Triangle size: ~2,000 km per edge
- Reward per click: 1.0 STEP tokens (Level 0)

**Expected subdivision:**
- After 2 clicks → triangle subdivides into 4 children
- New triangles at Level 1 (~500 km per edge)
- Reward: 0.5 STEP tokens per click (Level 1)

---

## Known Limitations

### Render.com Free Tier
- **Cold starts:** 30-60 second delay after 15min inactivity
- **Sleep:** Backend sleeps if no requests for 15 minutes
- **Solution:** First request wakes it up, then it's fast

### GPS Accuracy
- **Required:** 50 meters or better
- **Best:** 5-20 meters (outdoors, clear sky)
- **Poor:** 100+ meters (indoors, urban canyons)

### Network
- **Required:** Internet connection (3G/4G/5G/WiFi)
- **Data usage:** ~10 KB per mining proof
- **Offline mode:** Not supported yet

---

## Success Criteria

You know it's working when:

1. ✅ App loads 20 triangles from backend
2. ✅ Globe centers on your GPS location
3. ✅ GPS marker visible at your position
4. ✅ Triangle containing you is highlighted
5. ✅ Tap triangle → mining UI appears
6. ✅ Submit proof → success message
7. ✅ Balance increases by 1.0 STEP

---

## Next Steps After Field Test

1. **Report issues** - Note any errors or UX problems
2. **Check backend logs** - Render.com dashboard → Logs tab
3. **Verify MongoDB** - Check triangle clicks incremented
4. **Plan improvements** - UI polish, offline mode, notifications

---

## Emergency Rollback

If production is broken:

```bash
# Switch back to local backend
cd ~/Projects/blockmass/step-mobile
# Edit 3 files: set USE_LOCAL_DEV = true
# src/lib/mesh-state-manager.ts
# src/lib/mesh-client.ts
# src/hooks/useActiveTriangles.ts

# Restart local backend
cd ~/Projects/blockmass/step-blockchain
npm start

# Restart Expo
cd ~/Projects/blockmass/step-mobile
npx expo start
```

---

**Good luck mining! 🎉**
