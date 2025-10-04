# STEP Blockchain

**Proof-of-Location Consensus · Phase 2 MVP**

STEP is a novel blockchain that uses physical location as proof-of-work. Users mine tokens by proving their presence at unique geographic locations on Earth's surface, which is divided into 2.8 trillion triangular regions.

**Version:** 0.2.0  
**Status:** Phase 2 - Centralized Validator (Active Development)  
**Last Updated:** 2025-10-03T17:56:56.000Z

---

## 📋 Table of Contents

- [Overview](#overview)
- [Mission](#mission-financial-freedom-for-all)
- [Features](#features)
- [Architecture](#architecture)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [Proof Contract](#proof-contract)
- [Development](#development)
- [Deployment](#deployment)
- [Business Model](#business-model)
- [Roadmap](#roadmap)

---

## 🌍 Overview

### What is STEP?

STEP (Space-Time Proof) is a blockchain where mining happens in the real world. Instead of solving cryptographic puzzles, users prove they're physically present at a location by submitting GPS-verified location proofs.

### Mission: Financial Freedom for All

**"Everyone has the right to work, to free choice of employment, to just and favourable conditions of work..."**  
— UN Declaration, Article 23

STEP democratizes cryptocurrency mining by removing barriers to entry:

- **No expensive hardware** - Mine with your smartphone
- **Geographic equality** - Mining in Myanmar = Mining in Manhattan
- **Zero entry cost** - No investment required to start
- **Proactive Passive Income** - Earn while you move

Unlike traditional crypto mining that requires expensive ASICs or GPUs, STEP gives everyone—regardless of location or economic status—an equal opportunity to participate in the blockchain economy.

### Key Concepts

**Triangular Mesh:**
- Earth divided into ~2.8 trillion triangles (icosahedron-based geodesic grid)
- 21 levels of subdivision (Level 1 = largest, Level 21 = smallest)
- Each triangle is ~1 meter² at Level 21

**Mining Mechanism:**
- Users submit location proofs with GPS coordinates + signature
- Validator verifies: signature, geometry, GPS accuracy, anti-spoof heuristics
- Reward: `1 / 2^(level - 1)` STEP tokens per proof
- After 11 proofs, triangle subdivides into 4 children

**Total Supply:** 7.7 trillion STEP tokens (converges via geometric series)

---

## ✨ Features

### Phase 2 (Current)

- ✅ **Centralized Validator API** - Single validator node for MVP
- ✅ **EIP-191 Signature Verification** - Ethereum-compatible signatures
- ✅ **Geospatial Validation** - Point-in-triangle checks
- ✅ **Anti-Spoof Heuristics** - GPS accuracy, speed gate, moratorium
- ✅ **Replay Protection** - Nonce-based uniqueness per account
- ✅ **MongoDB Storage** - Transaction-safe state updates
- ✅ **Mobile Client** - React Native + Expo app

### Coming Soon

- 🔄 **Triangle Subdivision** (at 11 clicks)
- 🔄 **Mesh Explorer** (Next.js frontend)
- 🚀 **Phase 3:** Multi-validator consensus
- 🚀 **Phase 4:** Full blockchain with smart contracts

---

## 🏗 Architecture

### System Components

```
┌─────────────────┐
│  Mobile App     │  React Native + Expo
│  (step-mobile)  │  • GPS location tracking
└────────┬────────┘  • Wallet (secp256k1)
         │           • Proof signing (EIP-191)
         │
         ▼
┌─────────────────┐
│  Validator API  │  Node.js + Express + TypeScript
│ (step-blockchain│  • Signature verification
│      /api)      │  • Geometry validation
└────────┬────────┘  • Anti-spoof heuristics
         │           • Reward distribution
         │
         ▼
┌─────────────────┐
│    MongoDB      │  Database
│                 │  • Triangles (mesh state)
└─────────────────┘  • Accounts (balances)
                     • Events (audit log)
```

### Data Flow

```
Mobile App → Build ProofPayload → Sign with EIP-191
                                         ↓
                            POST /proof/submit
                                         ↓
Validator API → Verify Signature → Check Geometry
                     ↓                    ↓
              Check Heuristics  →  Atomic Transaction
                     ↓                    ↓
              Calculate Reward → Update State (Triangles, Accounts, Events)
                     ↓
              Return Success + Balance
```

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ or 20+
- **MongoDB** 5.0+
- **npm** or **yarn**

### Installation

```bash
# Clone repository
git clone https://github.com/step-protocol/step-blockchain.git
cd step-blockchain

# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your MongoDB URI

# Build TypeScript
npm run build
```

### Start MongoDB

```bash
# macOS (Homebrew)
brew services start mongodb-community

# Or run manually
mongod --dbpath /usr/local/var/mongodb
```

### Run Validator API

```bash
# Development mode (with auto-reload)
npm run dev

# Production mode
npm run build
npm start
```

Server will start on `http://localhost:3002`

### Verify Setup

```bash
# Health check
curl http://localhost:3002/health

# Expected response:
# {
#   "ok": true,
#   "service": "step-mesh-api",
#   "version": "0.1.0",
#   "environment": "development",
#   "database": {
#     "status": "ok",
#     "connectedAt": "2025-10-03T17:08:00.000Z"
#   }
# }
```

---

## 📡 API Reference

### POST /proof/submit

Submit a location proof for validation and token reward.

**Request:**

```json
{
  "payload": {
    "version": "STEP-PROOF-v1",
    "account": "0x742d35Cc6634C0532925a3b844Bc9e7595f0bEb",
    "triangleId": "STEP-TRI-v1:L10:F0:01234567",
    "lat": 47.4979,
    "lon": 19.0402,
    "accuracy": 12.5,
    "timestamp": "2025-10-03T17:08:00.123Z",
    "nonce": "550e8400-e29b-41d4-a716-446655440000"
  },
  "signature": "0xabcd1234...5678" // 65-byte hex (130 chars)
}
```

**Success Response (200):**

```json
{
  "ok": true,
  "reward": "0.001953",
  "unit": "STEP",
  "triangleId": "STEP-TRI-v1:L10:F0:01234567",
  "level": 10,
  "clicks": 5,
  "balance": "1.234567",
  "processedAt": "2025-10-03T17:08:00.456Z"
}
```

**Error Response (4xx/5xx):**

```json
{
  "ok": false,
  "code": "LOW_GPS_ACCURACY",
  "message": "GPS accuracy 75m exceeds maximum 50m. Move outdoors for better signal.",
  "timestamp": "2025-10-03T17:08:00.456Z"
}
```

**Error Codes:**

| Code | Status | Description |
|------|--------|-------------|
| `INVALID_PAYLOAD` | 400 | Missing or invalid fields |
| `BAD_SIGNATURE` | 401 | Signature verification failed |
| `OUT_OF_BOUNDS` | 422 | Location outside triangle |
| `LOW_GPS_ACCURACY` | 422 | GPS accuracy > 50m |
| `NONCE_REPLAY` | 409 | Nonce already used |
| `TOO_FAST` | 422 | Movement speed exceeds 15 m/s |
| `MORATORIUM` | 422 | < 10 seconds since last proof |
| `INTERNAL_ERROR` | 500 | Server error |

### GET /proof/config

Get current validator configuration (for debugging).

**Response:**

```json
{
  "GPS_MAX_ACCURACY_M": 50,
  "PROOF_SPEED_LIMIT_MPS": 15,
  "PROOF_MORATORIUM_MS": 10000
}
```

### GET /mesh/triangleAt

Get triangle at GPS coordinates.

**Query Parameters:**
- `lat` - Latitude (-90 to 90)
- `lon` - Longitude (-180 to 180)
- `level` - Triangle level (1-21, default: 10)

**Example:**

```bash
curl "http://localhost:3002/mesh/triangleAt?lat=47.4979&lon=19.0402&level=10"
```

---

## 🔐 Proof Contract

### Canonical Message Format

**CRITICAL:** Both mobile and backend MUST use identical message format.

**ProofPayload Interface:**

```typescript
interface ProofPayload {
  version: 'STEP-PROOF-v1';
  account: string;      // 0x-prefixed Ethereum address
  triangleId: string;   // STEP-TRI-v1:... mesh ID
  lat: number;          // WGS84 decimal latitude
  lon: number;          // WGS84 decimal longitude
  accuracy: number;     // GPS accuracy in meters
  timestamp: string;    // ISO 8601 UTC with milliseconds
  nonce: string;        // UUID v4 for replay protection
}
```

**Canonical Signable String:**

```
STEP-PROOF-v1|account:{account}|triangle:{triangleId}|lat:{lat}|lon:{lon}|acc:{accuracy}|ts:{timestamp}|nonce:{nonce}
```

**Example:**

```
STEP-PROOF-v1|account:0x742d35cc6634c0532925a3b844bc9e7595f0beb|triangle:STEP-TRI-v1:L10:F0:01234567|lat:47.4979|lon:19.0402|acc:12.5|ts:2025-10-03T17:08:00.123Z|nonce:550e8400-e29b-41d4-a716-446655440000
```

### Signature Scheme (EIP-191)

**Format:** `keccak256("\x19Ethereum Signed Message:\n" + len(message) + message)`

**Output:** 65-byte signature (r, s, v) as 130-char hex with 0x prefix

**Why EIP-191:**
- Industry standard (compatible with MetaMask, WalletConnect, etc.)
- Prevents signature reuse across different contexts
- Battle-tested by billions of Ethereum users
- Not a vendor lock-in (open cryptographic standard)

**Note:** Despite the name, this is NOT an Ethereum dependency. It's just a signing convention using open standards (secp256k1 + keccak256).

---

## 💻 Development

### Project Structure

```
step-blockchain/
├── api/                  # Express API server
│   ├── server.ts        # Main server entry point
│   ├── proof.ts         # Proof validation router
│   └── mesh-simple.ts   # Mesh query router
├── core/                # Core business logic
│   ├── db.ts           # MongoDB connector
│   ├── validator/      # Validation modules
│   │   ├── signature.ts # EIP-191 verification
│   │   └── geometry.ts  # Geospatial + heuristics
│   ├── state/          # Data models
│   │   └── schemas.ts   # Mongoose schemas
│   └── mesh/           # Mesh utilities (Phase 1)
├── dist/               # Compiled JavaScript (gitignored)
└── .env                # Environment config (gitignored)
```

### Scripts

```bash
# Development (auto-reload)
npm run dev

# Build TypeScript
npm run build

# Production
npm start

# Type checking
npm run type-check

# Clean build artifacts
npm run clean
```

### Environment Variables

See `.env.example` for all configuration options.

**Required:**
- `MONGODB_URI` - MongoDB connection string

**Optional (with defaults):**
- `PORT=3002` - API server port
- `NODE_ENV=development` - Environment
- `GPS_MAX_ACCURACY_M=50` - GPS accuracy threshold
- `PROOF_SPEED_LIMIT_MPS=15` - Speed limit (m/s)
- `PROOF_MORATORIUM_MS=10000` - Proof interval (ms)

---

## 🚢 Deployment

### Production Checklist

- [ ] Set `NODE_ENV=production`
- [ ] Use MongoDB connection with authentication
- [ ] Set secure `MONGODB_URI` (MongoDB Atlas recommended)
- [ ] Configure firewall to allow only necessary ports
- [ ] Enable MongoDB replica set for transactions
- [ ] Set up monitoring (health endpoint polling)
- [ ] Configure logging (stdout/stderr to log aggregator)
- [ ] Set up backup strategy for MongoDB

### MongoDB Atlas Setup

1. Create cluster at https://cloud.mongodb.com
2. Add database user with read/write permissions
3. Whitelist API server IP address
4. Copy connection string to `MONGODB_URI`
5. Ensure replica set is enabled (required for transactions)

### Health Monitoring

Poll `/health` endpoint every 30 seconds:

```bash
curl -f http://localhost:3002/health || alert
```

Expected uptime: 99.9%+

---

## 💼 Business Model

### Revenue Streams

STEP creates value for multiple stakeholders through innovative location-based services:

#### 1. Pathfinders Program (B2B)

**Companies hire users to mine specific locations:**
- Businesses pay users to visit and validate points of interest
- Market research: Verify store hours, product availability, conditions
- Quality assurance: Photo verification, crowd-sourced audits
- Competitive intelligence: Monitor competitor locations

**Example:** Restaurant chain pays pathfinders $10 + triangle rewards to verify menu displays across 1,000 locations.

#### 2. Mining Rights Sales (B2B)

**Companies purchase exclusive or priority mining rights:**
- Retail: Buy triangles around store locations
- Real estate: Secure valuable downtown areas
- Tourism: Own landmarks and attractions
- Events: Exclusive mining during conferences/festivals

**Example:** Nike buys 10,000 triangles around flagship stores worldwide, earning fees from user mining activity.

#### 3. Hidden Gems & Sponsored Content (B2B/B2C)

**Location-based collectibles and advertisements:**
- Digital coupons ("Find a Coke Zero coupon in Times Square")
- Limited edition NFTs at specific locations
- Scavenger hunts with branded rewards
- Location-triggered promotions

**Example:** Starbucks places 100,000 "Free Coffee" gems in triangles near their stores, driving foot traffic.

#### 4. Point-of-Interest Sponsorship (B2B)

**Drive active foot traffic to physical locations:**
- Increased mining rewards near sponsored locations
- Time-limited bonus events
- "Check-in" rewards for visiting businesses
- Customer acquisition with measurable ROI

**Example:** Mall increases triangle rewards 10x during off-peak hours, driving traffic when stores need it most.

### Value Proposition

**For Users (B2C):**
- Earn STEP tokens while going about daily life
- No entry cost or expensive equipment
- Passive income from regular activities (commuting, shopping, walking)
- Additional earning through pathfinder missions
- Collectibles and exclusive rewards

**For Businesses (B2B):**
- Measurable foot traffic generation
- Customer acquisition with transparent ROI
- Market research at scale
- Brand engagement through gamification
- Real-world presence verification

**Problem Solved:**
- **Traditional Marketing:** No way to actively drive guaranteed foot traffic
- **Crypto Exclusivity:** High barriers to entry (expensive hardware, technical knowledge)
- **Passive Income Myth:** Most people don't know how to generate it

**STEP Solution:**
- **Brick & Mortar Sales:** Drive active traffic with value-per-visit metrics
- **Crypto Democratization:** Smartphone mining with zero entry cost
- **Proactive Passive Income:** Move to earn — simple, accessible, universal

---

## 🗯 Roadmap

See [ROADMAP.md](./ROADMAP.md) for detailed development plans.

**Phase 2 (Current):** Centralized Validator MVP  
**Phase 3 (Q1 2026):** Multi-validator Consensus  
**Phase 4 (Q2 2026):** Full Blockchain + Smart Contracts  
**Phase 5 (Q3 2026):** Mesh Explorer + Advanced Features  

---

## 📄 License

MIT License - See [LICENSE](./LICENSE) file for details.

---

## 🤝 Contributing

STEP is currently in early development. Contributions welcome after Phase 3 release.

For questions or discussions, open an issue on GitHub.

---

## 📚 Additional Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System design and data flow
- [ROADMAP.md](./ROADMAP.md) - Development phases and milestones
- [TASKLIST.md](./TASKLIST.md) - Active tasks and priorities
- [RELEASE_NOTES.md](./RELEASE_NOTES.md) - Version history
- [LEARNINGS.md](./LEARNINGS.md) - Technical decisions and issues

---

**Built with ❤️ by the STEP Protocol Team**
