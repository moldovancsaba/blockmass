# STEP Blockchain - Quick Start Guide

**Project:** STEP (working title: blockmass)  
**Version:** 0.2.0  
**Last Updated:** 2025-10-04T06:36:00.000Z

---

## 🚀 Quick Launch Commands

### 1. Start Backend API Server
```bash
cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
./start-server.sh
```
✅ Server runs on http://localhost:3002

### 2. Start Mobile App (iOS Simulator)
```bash
cd /Users/moldovancsaba/Projects/blockmass/step-mobile
npm start
```
Then press **"i"** to open iOS Simulator

### 3. Start Web Frontend (Optional)
```bash
cd /Users/moldovancsaba/Projects/blockmass/frontend
npm run dev
```
✅ Web app runs on http://localhost:3000

---

## 📁 Project Structure

```
/Users/moldovancsaba/Projects/blockmass/
├── step-blockchain/          # Backend API (Node.js + Express)
│   ├── api/                  # REST API endpoints
│   │   ├── server.ts        # Main server
│   │   ├── proof.ts         # Proof validation ✅ NEW
│   │   └── mesh-simple.ts   # Mesh queries
│   ├── core/
│   │   ├── db.ts            # MongoDB Atlas connector ✅ NEW
│   │   ├── mesh/            # Phase 1 geodesic utilities
│   │   ├── validator/       # Signature & geometry validation ✅ NEW
│   │   └── state/           # MongoDB schemas
│   ├── dist/                # Compiled JavaScript
│   ├── start-server.sh      # Launch script ✅ NEW
│   └── test-subdivision.js  # Automated test ✅ NEW
│
├── step-mobile/              # React Native + Expo
│   ├── src/
│   │   ├── screens/         # UI screens
│   │   │   └── MapScreen.tsx  # Main mining interface
│   │   └── lib/
│   │       ├── wallet.ts      # EIP-191 signing ✅ UPDATED
│   │       ├── mesh-client.ts # API client ✅ UPDATED
│   │       └── location.ts    # GPS integration
│   └── App.tsx
│
├── frontend/                 # Web UI (Next.js)
│   └── (web explorer - optional)
│
├── contracts/                # Smart contracts (future)
│
└── Documentation/
    ├── README.md            # Overview ✅ UPDATED
    ├── ARCHITECTURE.md      # Technical details ✅ UPDATED
    ├── ROADMAP.md           # Development phases ✅ UPDATED
    ├── VISION.md            # Business strategy ✅ NEW
    ├── PHASE2_PLAN.md       # Current phase plan
    ├── BLOCKCHAIN_PROTOCOL.md
    ├── STEP_TOKENOMICS.md
    ├── MANUAL_TEST_PLAN.md  # Testing procedures ✅ NEW
    ├── TEST_RESULTS.md      # Test outcomes ✅ NEW
    └── QUICKSTART.md        # This file ✅ NEW
```

---

## ✅ What's Working Now (Phase 2 Complete!)

### Backend API
- ✅ MongoDB Atlas connected
- ✅ EIP-191 signature verification
- ✅ GPS accuracy validation
- ✅ Speed gate (anti-teleportation)
- ✅ Moratorium (anti-spam)
- ✅ Reward calculation (1/2^(level-1) STEP)
- ✅ **Triangle subdivision at 11 clicks** 🎉
- ✅ Atomic MongoDB transactions
- ✅ Audit trail logging

### Mobile App
- ✅ GPS location tracking
- ✅ Triangle mesh visualization
- ✅ Wallet generation & signing
- ✅ Proof submission
- ✅ Reward display
- ✅ Error handling

### Testing
- ✅ Automated test script (11 proofs → subdivision)
- ✅ All validation checks pass
- ✅ MongoDB verification complete

---

## 🎮 Testing the Subdivision Feature

### Option 1: Automated Test (Already Working!)
```bash
cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
node test-subdivision.js
```
This will:
1. Create a test triangle
2. Submit 11 proofs (takes ~2 minutes)
3. Verify subdivision occurred
4. Check MongoDB state

**Expected:** ✅ TEST PASSED: Subdivision working correctly!

### Option 2: Mobile Simulator (Visual Testing)
1. Start backend:
   ```bash
   cd /Users/moldovancsaba/Projects/blockmass/step-blockchain
   ./start-server.sh
   ```

2. Start mobile app:
   ```bash
   cd /Users/moldovancsaba/Projects/blockmass/step-mobile
   npm start
   ```

3. Press **"i"** to open iOS Simulator

4. In the simulator:
   - Create/import wallet
   - Allow location permissions
   - Tap "MINE" button 11 times (wait 11 seconds between each)
   - Watch subdivision happen on the 11th click!

---

## 🗄️ Database (MongoDB Atlas)

**Connection String:**
```
REDACTED_ROTATE_ME_2026-08-14
```

**Database:** `step`

**Collections:**
- `triangles` - Triangle state (clicks, children, polygon)
- `accounts` - User balances
- `triangle_events` - Audit log (click, subdivide events)

**View in MongoDB Atlas:**
https://cloud.mongodb.com

---

## 📦 Environment Configuration

### Backend (.env in step-blockchain/)
```bash
MONGODB_URI=REDACTED_ROTATE_ME_2026-08-14
PORT=3002
NODE_ENV=development
GPS_MAX_ACCURACY_M=50
PROOF_SPEED_LIMIT_MPS=15
PROOF_MORATORIUM_MS=10000
```

### Mobile (automatically uses localhost:3002 in dev)
No configuration needed - it auto-detects dev mode!

---

## 🔧 Common Commands

### Backend
```bash
# Build TypeScript
npm run build

# Start server (manual)
node dist/api/server.js

# Start server (with env vars)
./start-server.sh

# Run subdivision test
node test-subdivision.js
```

### Mobile
```bash
# Install dependencies
npm install

# Start Expo
npm start

# In Expo menu:
# - Press "i" for iOS Simulator
# - Press "a" for Android Emulator
# - Press "r" to reload app
# - Press "?" for help
```

### Health Checks
```bash
# Check backend
curl http://localhost:3002/health

# Check config
curl http://localhost:3002/proof/config
```

---

## 🎯 Development Workflow

### Making Changes to Backend
1. Edit TypeScript files in `step-blockchain/`
2. Rebuild: `npm run build`
3. Restart server: `./start-server.sh`
4. Test changes

### Making Changes to Mobile
1. Edit files in `step-mobile/src/`
2. Save file
3. In Expo terminal, press "r" to reload
4. Changes appear instantly in simulator

---

## 📝 Key Files Modified/Created Today

### New Files
- `step-blockchain/start-server.sh` - Easy server startup
- `step-blockchain/test-subdivision.js` - Automated testing
- `step-blockchain/MANUAL_TEST_PLAN.md` - Test procedures
- `step-blockchain/TEST_RESULTS.md` - Test results
- `QUICKSTART.md` - This guide

### Updated Files
- `step-blockchain/api/proof.ts` - Added subdivision logic
- `step-blockchain/core/validator/signature.ts` - Fixed recovery bug
- `step-blockchain/core/state/schemas.ts` - Added 'subdivided' state
- `step-blockchain/README.md` - Full documentation
- `step-blockchain/ARCHITECTURE.md` - Subdivision details

---

## 🐛 Troubleshooting

### Backend won't start
```bash
# Check if MongoDB URI is set
echo $MONGODB_URI

# If empty, use start-server.sh instead of direct node command
./start-server.sh
```

### Mobile app won't connect to backend
```bash
# 1. Check backend is running
curl http://localhost:3002/health

# 2. Check mobile app is in dev mode (should show localhost:3002 in logs)

# 3. If using iOS Simulator, localhost should work
# 4. If using physical device, need to use your computer's IP address
```

### Expo won't start
```bash
# Clear cache
cd step-mobile
rm -rf node_modules .expo
npm install
npm start -- --clear
```

### iOS Simulator doesn't open when pressing "i"
```bash
# 1. Check Xcode is installed:
xcode-select --install

# 2. Check simulators are available:
xcrun simctl list devices

# 3. Manually open simulator first:
open -a Simulator

# 4. Then press "i" in Expo
```

---

## 📚 Documentation Quick Links

| Document | Purpose |
|----------|---------|
| [README.md](./step-blockchain/README.md) | Complete API documentation |
| [ARCHITECTURE.md](./step-blockchain/ARCHITECTURE.md) | Technical deep-dive |
| [VISION.md](./step-blockchain/VISION.md) | Business strategy |
| [ROADMAP.md](./step-blockchain/ROADMAP.md) | Development phases |
| [MANUAL_TEST_PLAN.md](./step-blockchain/MANUAL_TEST_PLAN.md) | Testing procedures |
| [TEST_RESULTS.md](./step-blockchain/TEST_RESULTS.md) | Latest test results |

---

## 🎉 Phase 2 Achievement Summary

✅ **What We Built:**
- Centralized proof validator API
- EIP-191 signature verification
- Anti-spoof heuristics (GPS accuracy, speed gate, moratorium)
- Atomic MongoDB transactions
- **Triangle subdivision at 11 clicks** (TESTED & WORKING!)
- Mobile app integration
- Comprehensive documentation
- Automated testing suite

✅ **Test Results:**
- All 11 proofs accepted ✓
- Subdivision triggered correctly ✓
- 4 child triangles created ✓
- Parent marked as 'subdivided' ✓
- Audit log complete ✓
- MongoDB state verified ✓

**Status:** Phase 2 COMPLETE! Ready for Phase 3 (multi-validator consensus).

---

## 🚀 Next Steps

1. **Test in Mobile Simulator** - Visual confirmation of subdivision
2. **Deploy Backend** - Move to production MongoDB + hosting
3. **Phase 3 Planning** - Multi-validator Byzantine consensus
4. **Smart Contracts** - Move from centralized to decentralized

---

**Questions?** Check the documentation or review server logs in `/tmp/step-server.log`
