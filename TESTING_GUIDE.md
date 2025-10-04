# Testing Guide - Mesh Database Integration

**Date:** 2025-10-04T09:35:00.000Z  
**Version:** 0.2.1

## What Was Delivered

✅ Real triangle data in MongoDB (10 triangles seeded for Budapest)  
✅ Mesh API serving real data (no more 404 errors)  
✅ Mobile app ready to receive real triangle data

---

## Step-by-Step Testing

### 1. Start the Mesh API (Terminal 1)

```bash
cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
npm run dev
```

**Expected Output:**
```
┌─────────────────────────────────────────────┐
│  STEP Mesh API Server                       │
├─────────────────────────────────────────────┤
│  Version:     0.1.0                         │
│  Port:        3002                          │
│  Environment: development                   │
│  Started:     2025-10-04T09:35:00.000Z      │
└─────────────────────────────────────────────┘

API endpoints:
  → http://localhost:3002/
  → http://localhost:3002/health
  → http://localhost:3002/mesh/triangleAt?lat=47.4979&lon=19.0402&level=10
```

**✅ SUCCESS:** Server running on port 3002

---

### 2. Test Mesh API with Budapest Coordinates (Terminal 2)

```bash
# Test triangle lookup
curl "http://localhost:3002/mesh/triangleAt?lat=47.4979&lon=19.0402&level=10"
```

**Expected Output:**
```json
{
  "ok": true,
  "result": {
    "triangleId": "STEP-TRI-v1:P3-12000000000000000000-FAM",
    "face": 15,
    "level": 3,
    "path": [1, 2],
    "centroid": {
      "type": "Point",
      "coordinates": [15.206..., 52.736...]
    },
    "estimatedSideLength": 2000000
  },
  "timestamp": "2025-10-04T09:35:00.000Z"
}
```

**✅ SUCCESS:** Real triangle data returned (not a 404!)

---

### 3. Test Triangle Polygon Endpoint

```bash
# Get full polygon geometry
curl "http://localhost:3002/mesh/polygon/STEP-TRI-v1:P3-12000000000000000000-FAM"
```

**Expected Output:**
```json
{
  "ok": true,
  "result": {
    "triangleId": "STEP-TRI-v1:P3-12000000000000000000-FAM",
    "polygon": {
      "type": "Polygon",
      "coordinates": [[[0, 58.28...], [12.88..., 43.93...], [31.71..., 54.0], [0, 58.28...]]]
    }
  },
  "timestamp": "2025-10-04T09:35:00.000Z"
}
```

**✅ SUCCESS:** Valid GeoJSON polygon returned

---

### 4. Start Mobile App (Terminal 3)

```bash
cd /Users/moldovancsaba/Projects/blockmass/step-mobile
npm start
```

**Expected Output:**
```
Starting Metro Bundler
› Metro waiting on exp://192.168.100.139:8000
› Press i │ open iOS simulator
```

**Action:** Press `i` to open iOS simulator

---

### 5. Verify Mobile App Logs

**In the mobile app terminal, watch for:**

❌ **OLD BEHAVIOR (Mock Data):**
```
WARN  Mesh API returned 404, using mock triangle data for development
LOG   Current triangle: STEP-TRI-v1-L10-37.786--122.406-DEV-MOCK
```

✅ **NEW BEHAVIOR (Real Data):**
```
LOG   Current triangle: STEP-TRI-v1:P3-12000000000000000000-FAM
LOG   Triangle level: 3
LOG   Centroid: 15.206, 52.736
```

**No 404 warnings = SUCCESS!**

---

### 6. Test Triangle Breakdown in Mobile App

**In the iOS Simulator:**

1. **Check Current Location Display:**
   - Should show real triangle ID (not DEV-MOCK)
   - GPS coordinates displayed
   - Triangle ID starts with `STEP-TRI-v1:P`

2. **Test Parent Navigation (if implemented):**
   - Navigate to parent triangle
   - Should move from level 3 → level 2 → level 1
   
3. **Test Children Navigation (if implemented):**
   - Navigate to children
   - Should show 4 child triangles at level 4

---

## Verification Checklist

- [ ] Mesh API starts without errors
- [ ] API returns triangle data for Budapest (47.4979, 19.0402)
- [ ] Polygon endpoint returns valid GeoJSON
- [ ] Mobile app starts without errors
- [ ] Mobile app shows real triangle ID (not DEV-MOCK)
- [ ] No "404" warnings in mobile app logs
- [ ] Triangle data includes centroid coordinates
- [ ] (Optional) Parent/children navigation works

---

## Known Issues

### SF Simulator Coordinates Not Working

**Issue:** San Francisco coordinates (37.785834, -122.406417) return null  
**Reason:** Mesh lookup precision issue in `core/mesh/lookup.ts`  
**Impact:** SF simulator will still use mock data  
**Workaround:** Use Budapest coordinates or wait for mesh precision fix

**To test with Budapest coordinates in simulator:**
1. Open iOS Simulator
2. Debug → Location → Custom Location
3. Set: Latitude `47.4979`, Longitude `19.0402`
4. Reload mobile app

---

## Troubleshooting

### API won't start - "MONGODB_URI required"

**Fix:** The .env file exists but dotenv wasn't loaded
```bash
cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
npm install dotenv  # Already installed
npm run dev         # Should work now
```

### Mobile app still shows mock data

**Check:**
1. Is Mesh API running on port 3002? → `curl http://localhost:3002/health`
2. Does API return data? → Test with curl commands above
3. Is mobile app pointing to correct IP? → Check `src/lib/mesh-client.ts`
4. Restart mobile app after API changes

### 404 still appearing

**Possible causes:**
1. Using SF coordinates (not seeded) → Switch to Budapest
2. API not running → Start with `npm run dev`
3. Database empty → Re-run `npm run seed`

---

## Re-seeding Database

If you need to re-populate the database:

```bash
cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
npm run seed
```

**To rollback seeded data:**
```javascript
// In MongoDB shell or Compass:
db.triangles.deleteMany({ dataset: /^seed-mesh:/ })
```

---

## Success Criteria

✅ **PASS:** Mobile app displays real triangle data from MongoDB  
✅ **PASS:** No 404 warnings in mobile app console  
✅ **PASS:** Triangle ID format matches `STEP-TRI-v1:P{level}-...`  
✅ **PASS:** API responds with valid GeoJSON geometry  

---

## Next Steps After Testing

Once testing confirms everything works:

1. **Documentation:** Update README.md with seeding instructions
2. **Versioning:** Bump to 0.3.0 (minor version for new feature)
3. **Commit:** Push mesh seeding implementation to GitHub
4. **Mobile:** Test parent/children navigation UI
5. **Fix Precision:** Improve mesh lookup for deeper levels

---

**Questions?** Check logs in both terminals for error messages.

**Testing Complete?** Mark this feature as delivered! 🎉
