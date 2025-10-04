# Phase 2 Manual Test Plan

**Version:** 0.2.0  
**Created:** 2025-10-04T05:50:00.000Z  
**Purpose:** Validate triangle subdivision and proof submission functionality

---

## Prerequisites

### 1. MongoDB Running

Start MongoDB on localhost:27017:

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Or manual start
mongod --dbpath /path/to/data/db --port 27017
```

Verify MongoDB is running:

```bash
# Should show process
ps aux | grep mongod

# Or try connection
mongosh mongodb://localhost:27017/step
```

### 2. Environment Configuration

Create `.env` file in project root:

```bash
# Database
MONGODB_URI=mongodb://localhost:27017/step

# Validator Heuristics
GPS_MAX_ACCURACY_M=50
PROOF_SPEED_LIMIT_MPS=15
PROOF_MORATORIUM_MS=10000

# Server
PORT=3002
NODE_ENV=development
```

### 3. Build Project

```bash
npm run build
```

---

## Test Suite

### Test 1: Health Check

**Purpose:** Verify server starts and MongoDB connects

**Steps:**

1. Start server:
   ```bash
   npm run dev
   ```

2. Check health endpoint:
   ```bash
   curl http://localhost:3002/health
   ```

**Expected Response:**
```json
{
  "status": "ok",
  "timestamp": "2025-10-04T05:50:00.123Z",
  "uptime": 5.234,
  "database": {
    "status": "ok",
    "name": "step"
  }
}
```

**Pass Criteria:**
- Server starts without errors
- Health endpoint returns 200
- Database status is "ok"

---

### Test 2: Validator Configuration

**Purpose:** Verify configuration endpoints work

**Steps:**

1. Get validator config:
   ```bash
   curl http://localhost:3002/proof/config
   ```

**Expected Response:**
```json
{
  "GPS_MAX_ACCURACY_M": 50,
  "PROOF_SPEED_LIMIT_MPS": 15,
  "PROOF_MORATORIUM_MS": 10000
}
```

**Pass Criteria:**
- Returns correct config values from .env

---

### Test 3: Valid Proof Submission

**Purpose:** Test successful proof validation and reward

**Test Data:**
```json
{
  "payload": {
    "version": "STEP-PROOF-v1",
    "account": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "triangleId": "STEP-TRI-v1:A1-00000000000000000000-ABC",
    "lat": 37.7749,
    "lon": -122.4194,
    "accuracy": 25.5,
    "timestamp": "2025-10-04T05:50:00.000Z",
    "nonce": "550e8400-e29b-41d4-a716-446655440000"
  },
  "signature": "0x..."
}
```

**Steps:**

1. Generate a test wallet (using Node.js REPL or mobile app)
2. Build canonical message from payload
3. Sign with EIP-191
4. Submit proof:
   ```bash
   curl -X POST http://localhost:3002/proof/submit \
     -H "Content-Type: application/json" \
     -d @test-proof.json
   ```

**Expected Response:**
```json
{
  "ok": true,
  "reward": "1.000000",
  "unit": "STEP",
  "triangleId": "STEP-TRI-v1:A1-00000000000000000000-ABC",
  "level": 1,
  "clicks": 1,
  "balance": "1.000000",
  "processedAt": "2025-10-04T05:50:00.123Z"
}
```

**Pass Criteria:**
- Returns 200 status
- Reward equals 1.000000 STEP (level 1)
- Balance increments correctly
- clicks === 1

---

### Test 4: Invalid Signature Rejection

**Purpose:** Verify signature verification works

**Test Data:**
```json
{
  "payload": {
    "version": "STEP-PROOF-v1",
    "account": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "triangleId": "STEP-TRI-v1:A1-00000000000000000000-ABC",
    "lat": 37.7749,
    "lon": -122.4194,
    "accuracy": 25.5,
    "timestamp": "2025-10-04T05:50:00.000Z",
    "nonce": "550e8400-e29b-41d4-a716-446655440001"
  },
  "signature": "0xBAD_SIGNATURE"
}
```

**Expected Response:**
```json
{
  "ok": false,
  "code": "BAD_SIGNATURE",
  "message": "Signature verification failed",
  "timestamp": "2025-10-04T05:50:00.123Z"
}
```

**Pass Criteria:**
- Returns 401 status
- Error code is BAD_SIGNATURE

---

### Test 5: Nonce Replay Protection

**Purpose:** Verify nonce uniqueness enforcement

**Steps:**

1. Submit a valid proof (Test 3)
2. Submit the exact same proof again (same nonce)

**Expected Response:**
```json
{
  "ok": false,
  "code": "NONCE_REPLAY",
  "message": "Nonce already used. Each proof must have unique nonce.",
  "timestamp": "2025-10-04T05:50:00.123Z"
}
```

**Pass Criteria:**
- First submission succeeds (200)
- Second submission fails (409)
- Error code is NONCE_REPLAY

---

### Test 6: GPS Accuracy Gate

**Purpose:** Verify low-accuracy proofs are rejected

**Test Data:**
```json
{
  "payload": {
    "version": "STEP-PROOF-v1",
    "account": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "triangleId": "STEP-TRI-v1:A1-00000000000000000000-ABC",
    "lat": 37.7749,
    "lon": -122.4194,
    "accuracy": 150.0,
    "timestamp": "2025-10-04T05:50:00.000Z",
    "nonce": "550e8400-e29b-41d4-a716-446655440002"
  },
  "signature": "0x..."
}
```

**Expected Response:**
```json
{
  "ok": false,
  "code": "LOW_GPS_ACCURACY",
  "message": "GPS accuracy 150m exceeds maximum 50m. Move outdoors for better signal.",
  "timestamp": "2025-10-04T05:50:00.123Z"
}
```

**Pass Criteria:**
- Returns 422 status
- Error code is LOW_GPS_ACCURACY

---

### Test 7: Speed Gate Validation

**Purpose:** Verify teleportation detection

**Steps:**

1. Submit proof at location A (lat: 37.7749, lon: -122.4194)
2. Wait 5 seconds
3. Submit proof at location B (lat: 40.7128, lon: -74.0060) - ~4000km away

**Expected Response:**
```json
{
  "ok": false,
  "code": "TOO_FAST",
  "message": "Speed 800000 m/s exceeds limit of 15 m/s. Suspiciously fast movement detected.",
  "timestamp": "2025-10-04T05:50:00.123Z"
}
```

**Pass Criteria:**
- Second proof is rejected (422)
- Error code is TOO_FAST

---

### Test 8: Moratorium Enforcement

**Purpose:** Verify rapid-fire spam prevention

**Steps:**

1. Submit valid proof
2. Immediately submit another valid proof (same account, different nonce)

**Expected Response:**
```json
{
  "ok": false,
  "code": "MORATORIUM",
  "message": "Must wait 10 seconds between proofs. Time since last proof: 2 seconds.",
  "timestamp": "2025-10-04T05:50:00.123Z"
}
```

**Pass Criteria:**
- Second proof is rejected (422)
- Error code is MORATORIUM

---

### Test 9: **CRITICAL - Triangle Subdivision**

**Purpose:** Verify subdivision triggers at 11 clicks

**Setup:**

1. Clear MongoDB triangle collection:
   ```javascript
   // In mongosh
   use step;
   db.triangles.deleteMany({});
   db.triangle_events.deleteMany({});
   db.accounts.deleteMany({});
   ```

2. Create a test triangle at level 10:
   ```javascript
   // In mongosh
   db.triangles.insertOne({
     "_id": "STEP-TRI-v1:A10-00000000000000000000-ABC",
     "face": 0,
     "level": 10,
     "pathEncoded": "000000000",
     "parentId": "STEP-TRI-v1:A9-00000000000000000000-ABC",
     "childrenIds": [],
     "state": "active",
     "clicks": 0,
     "moratoriumStartAt": new ISODate(),
     "lastClickAt": null,
     "centroid": {
       "type": "Point",
       "coordinates": [-122.4194, 37.7749]
     },
     "polygon": {
       "type": "Polygon",
       "coordinates": [[
         [-122.42, 37.77],
         [-122.41, 37.77],
         [-122.415, 37.78],
         [-122.42, 37.77]
       ]]
     }
   });
   ```

**Test Steps:**

1. Submit 11 valid proofs to the same triangle:
   ```bash
   for i in {1..11}; do
     # Generate unique nonce for each proof
     NONCE=$(uuidgen)
     # Submit proof (requires signing each time)
     echo "Submitting proof $i with nonce $NONCE"
     # ... submit proof ...
     sleep 11  # Wait for moratorium
   done
   ```

**Expected Behavior After 11th Proof:**

1. Check triangle state in MongoDB:
   ```javascript
   // In mongosh
   db.triangles.findOne({ "_id": "STEP-TRI-v1:A10-00000000000000000000-ABC" });
   ```
   
   **Expected:**
   ```json
   {
     "_id": "STEP-TRI-v1:A10-00000000000000000000-ABC",
     "state": "subdivided",
     "clicks": 11,
     "childrenIds": [
       "STEP-TRI-v1:A11-00000000000000000000-ABC",
       "STEP-TRI-v1:A11-10000000000000000000-ABC",
       "STEP-TRI-v1:A11-20000000000000000000-ABC",
       "STEP-TRI-v1:A11-30000000000000000000-ABC"
     ]
   }
   ```

2. Check for 4 child triangles:
   ```javascript
   db.triangles.find({ "parentId": "STEP-TRI-v1:A10-00000000000000000000-ABC" }).count();
   ```
   
   **Expected:** 4

3. Verify child triangles have correct properties:
   ```javascript
   db.triangles.find({ "parentId": "STEP-TRI-v1:A10-00000000000000000000-ABC" });
   ```
   
   **Expected for each child:**
   - level === 11
   - state === 'active'
   - clicks === 0
   - parentId === parent triangle ID
   - polygon and centroid are valid GeoJSON
   - childrenIds === []

4. Check for subdivision event:
   ```javascript
   db.triangle_events.findOne({ 
     "triangleId": "STEP-TRI-v1:A10-00000000000000000000-ABC",
     "eventType": "subdivision" 
   });
   ```
   
   **Expected:**
   ```json
   {
     "_id": "subdivision-...",
     "triangleId": "STEP-TRI-v1:A10-00000000000000000000-ABC",
     "eventType": "subdivision",
     "timestamp": ISODate("..."),
     "account": null,
     "nonce": null,
     "signature": null,
     "payload": {
       "parentId": "STEP-TRI-v1:A10-00000000000000000000-ABC",
       "childrenIds": [...],
       "level": 10,
       "newLevel": 11
     }
   }
   ```

5. Verify 11th proof still succeeded:
   ```bash
   # Check API response from 11th proof
   ```
   
   **Expected:**
   ```json
   {
     "ok": true,
     "reward": "0.001953",
     "clicks": 11,
     ...
   }
   ```

**Pass Criteria:**
- ✅ Parent triangle state becomes 'subdivided'
- ✅ Parent triangle clicks === 11
- ✅ Exactly 4 child triangles created
- ✅ Each child has level === parent.level + 1
- ✅ Each child has correct parentId reference
- ✅ Parent's childrenIds array contains all 4 child IDs
- ✅ Subdivision event created in audit log
- ✅ All operations completed within single transaction
- ✅ 11th proof submission returned success (200)
- ✅ Account balance incremented correctly for all 11 proofs

**Failure Scenarios to Test:**

1. **Subdivision Failure Rollback:**
   - Simulate error during child creation (modify code temporarily)
   - Verify entire transaction rolls back
   - Verify clicks NOT incremented
   - Verify balance NOT updated

---

### Test 10: Out-of-Bounds Rejection

**Purpose:** Verify geometry validation

**Test Data:**
```json
{
  "payload": {
    "triangleId": "STEP-TRI-v1:A10-00000000000000000000-ABC",
    "lat": 0.0,
    "lon": 0.0,
    ...
  }
}
```

**Expected Response:**
```json
{
  "ok": false,
  "code": "OUT_OF_BOUNDS",
  "message": "Location is outside triangle boundary",
  "timestamp": "2025-10-04T05:50:00.123Z"
}
```

**Pass Criteria:**
- Returns 422 status
- Error code is OUT_OF_BOUNDS

---

## Database Verification Queries

After completing all tests, verify database state:

### Check Triangle Count
```javascript
db.triangles.count();
```

### Check Account Balances
```javascript
db.accounts.find().pretty();
```

### Check Event Log
```javascript
db.triangle_events.find().sort({ timestamp: -1 }).limit(20).pretty();
```

### Verify Indexes
```javascript
db.triangle_events.getIndexes();
// Should include: account_nonce_unique (unique, sparse)
```

### Check for Orphaned Children
```javascript
// Find children whose parent doesn't exist
db.triangles.find({ 
  parentId: { $ne: null },
  parentId: { $nin: db.triangles.distinct("_id") }
});
// Should return empty array
```

---

## Performance Benchmarks

### Proof Processing Time

Measure end-to-end latency:

```bash
time curl -X POST http://localhost:3002/proof/submit -d @proof.json
```

**Expected:**
- Normal proof: <100ms
- Proof triggering subdivision: <200ms

### Subdivision Performance

Monitor console logs during Test 9:

**Expected Output:**
```
[2025-10-04T05:50:00.123Z] Subdivision triggered for STEP-TRI-v1:A10-...
[2025-10-04T05:50:00.150Z] Subdivision complete: STEP-TRI-v1:A10-... → 4 children at level 11
[2025-10-04T05:50:00.155Z] Transaction complete: 0x742d... +0.001953 STEP
```

**Pass Criteria:**
- Subdivision completes in <100ms
- No errors in console

---

## Known Limitations (MVP)

1. **Mock Triangle Creation:** If triangle doesn't exist, creates mock instead of failing
2. **No Mesh Pre-population:** Level 1-10 triangles not pre-created
3. **Single Validator:** No consensus, single point of failure
4. **Basic Heuristics:** GPS spoofing still possible with sophisticated tools

---

## Test Completion Checklist

- [ ] Test 1: Health Check - PASS
- [ ] Test 2: Validator Config - PASS
- [ ] Test 3: Valid Proof - PASS
- [ ] Test 4: Bad Signature - PASS
- [ ] Test 5: Nonce Replay - PASS
- [ ] Test 6: GPS Accuracy - PASS
- [ ] Test 7: Speed Gate - PASS
- [ ] Test 8: Moratorium - PASS
- [ ] Test 9: **Subdivision** - PASS ✅✅✅
- [ ] Test 10: Out of Bounds - PASS
- [ ] Database verification complete
- [ ] Performance benchmarks recorded
- [ ] All console output clean (no errors)

---

## Recording Results

Document findings in `LEARNINGS.md` with:
- Timestamp of test execution
- Test results (pass/fail for each)
- Any bugs discovered
- Performance metrics
- Recommendations for improvements

---

**Next Steps After Testing:**

1. Document results in LEARNINGS.md
2. Update RELEASE_NOTES.md with v0.2.0 entry
3. Commit and push to GitHub
4. Update TASKLIST.md with completion status
5. Prepare for mobile app testing
