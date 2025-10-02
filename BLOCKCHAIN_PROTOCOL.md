# BLOCKCHAIN_PROTOCOL.md

**Project:** STEP — Proof-of-Location Blockchain Protocol  
**Version:** v1.0.0-alpha  
**Last Updated:** 2025-10-02T13:59:03.000Z  
**Status:** Design Phase

---

## Executive Summary

STEP is a novel proof-of-location blockchain protocol that enables mobile device mining through physical presence verification. The protocol divides Earth into 2.8 trillion triangular regions using a recursive icosahedron mesh, allowing users to earn cryptocurrency by proving their presence at specific locations.

### Key Innovations

1. **Proof-of-Location-Click (PoLC) Consensus** — Novel consensus mechanism requiring cryptographic proof of physical presence
2. **Icosahedron Mesh System** — Deterministic, globally consistent geospatial indexing with 21 levels of precision
3. **Mobile-First Mining** — Smartphones become miners through GPS + sensor fusion verification
4. **Progressive Decentralization** — Centralized MVP → Hybrid validators → Full P2P network
5. **Fixed Supply Economics** — 7.7 trillion STEP tokens with mathematically defined distribution

---

## 1. System Architecture

### 1.1 High-Level Components

```
┌───────────────────────────────────────────────────────┐
│                    STEP Ecosystem                      │
├───────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────┐        ┌──────────────┐              │
│  │ Mobile App  │◄──────►│  Validator   │              │
│  │ (React      │        │  Network     │              │
│  │  Native)    │        │  (Node.js +  │              │
│  │             │        │   MongoDB)   │              │
│  └─────────────┘        └──────────────┘              │
│       │                        │                       │
│       │ Location Proof         │ Block Production      │
│       │ Submission             │ & Validation          │
│       │                        │                       │
│       ▼                        ▼                       │
│  ┌──────────────────────────────────────┐             │
│  │     STEP Blockchain State            │             │
│  │  - Triangle mesh (2.8T regions)      │             │
│  │  - Token ledger (7.7T supply)        │             │
│  │  - Proof-of-location records         │             │
│  └──────────────────────────────────────┘             │
│       │                        │                       │
│       │                        │                       │
│       ▼                        ▼                       │
│  ┌─────────────┐        ┌──────────────┐              │
│  │  Explorer   │        │   P2P Layer  │              │
│  │  (Next.js + │        │   (libp2p)   │              │
│  │   Mapbox)   │        │              │              │
│  └─────────────┘        └──────────────┘              │
│                                                         │
└───────────────────────────────────────────────────────┘
```

### 1.2 Node Types

#### Validator Node (Full Consensus Participant)
- Validates location proofs
- Proposes and votes on blocks
- Maintains full blockchain state
- Runs P2P gossip protocol
- **Requirements:** MongoDB, stable network, stake (Phase 4+)

#### Full Node (Non-Validating)
- Validates incoming blocks
- Serves JSON-RPC API
- Gossips mempool transactions
- **Requirements:** MongoDB, stable network

#### Light Client (Mobile/Web)
- Verifies block headers only
- Submits location proofs
- Queries own balance/transactions
- **Requirements:** Minimal storage (<100MB)

---

## 2. Consensus Mechanism: Proof-of-Location-Click (PoLC)

### 2.1 Core Concept

Traditional blockchains use Proof-of-Work (computational puzzles) or Proof-of-Stake (token deposits). STEP uses **Proof-of-Location-Click** — cryptographic proof that a device physically occupied a geographic location at a specific time.

### 2.2 Consensus Flow

```
User Action:
1. User physically travels to triangle T
2. Mobile app captures:
   - GPS coordinates (lat/lon/accuracy)
   - WiFi BSSIDs and signal strengths
   - Cell tower IDs (MCC/MNC/LAC/CID)
   - Device fingerprint
   - Timestamp (ISO 8601 UTC with ms)
3. App generates proof object and signs with device key
4. App submits proof to validator network

Validator Action:
5. Validator receives proof from mempool
6. Validates:
   a. Signature authenticity (secp256k1)
   b. Point-in-triangle geometry (spherical math)
   c. Time-lock eligibility (168h moratorium + sequence delay)
   d. Anti-replay (nonce uniqueness)
   e. Anti-spoof heuristics (speed gate, sensor fusion)
7. If valid:
   a. Compute reward: 1 / 2^(N-1) STEP tokens
   b. Update triangle state (clicks++, lastClickAt)
   c. Emit reward to user's wallet
   d. If clicks == 11, subdivide triangle into 4 children
8. Include proof in next block
9. Block propagates via P2P network
```

### 2.3 Block Structure

#### Block Header
```json
{
  "height": 12345,
  "parentHash": "0x...",
  "stateRoot": "0x...",
  "proofsRoot": "0x...",
  "timestamp": "2025-10-02T14:00:00.123Z",
  "proposer": "0xValidatorAddress...",
  "validatorSetHash": "0x...",
  "signature": "0x..."
}
```

#### Block Body
```json
{
  "proofs": [
    {
      "proofId": "uuid-v4",
      "triangleId": "STEP-TRI-v1:...",
      "userAddress": "0x...",
      "location": {"lat": 47.5, "lon": 19.0, "accuracy": 12},
      "radioFingerprint": {"wifi": [...], "cell": [...]},
      "deviceFingerprint": "hash(...)",
      "clientTimestamp": "2025-10-02T13:55:00.456Z",
      "nonce": "uuid-v4",
      "signature": "0x..."
    }
  ],
  "transfers": [
    {
      "from": "0x...",
      "to": "0x...",
      "amount": "1000000000000000000",
      "nonce": 42,
      "signature": "0x..."
    }
  ],
  "triangleEvents": [
    {
      "type": "subdivide",
      "triangleId": "...",
      "children": ["...", "...", "...", "..."],
      "timestamp": "2025-10-02T14:00:00.123Z"
    }
  ]
}
```

### 2.4 Block Production Schedule

- **Target Block Time:** 10 minutes (aligns with time-lock validation latency)
- **Proposer Selection:** Deterministic round-robin among active validators
- **Finality:** Byzantine fault tolerance with 2/3+ validator quorum signatures
- **Fork Resolution:** Longest chain with highest cumulative validator weight

---

## 3. Cryptography and Security

### 3.1 Key Management

#### Device Keys (Mobile App)
- **Algorithm:** secp256k1 (same as Bitcoin/Ethereum)
- **Generation:** Random 256-bit private key
- **Storage:** Platform-specific secure storage
  - iOS: Secure Enclave
  - Android: Keystore with TEE backing
- **Address Derivation:** `address = keccak256(publicKey)[12:]` (20 bytes, 0x-prefixed hex)

#### Validator Keys
- **Hot Key:** For block signing and P2P authentication
- **Cold Key:** For validator registration and stake management (Phase 4+)
- **Key Rotation:** On-chain governance mechanism for compromised keys

### 3.2 Proof Signing

```javascript
// Proof object (canonical JSON, sorted keys)
const proofPayload = {
  clientTimestamp: "2025-10-02T13:55:00.456Z",
  deviceFingerprint: "hash(...)",
  location: {accuracy: 12, lat: 47.5, lon: 19.0},
  nonce: "uuid-v4",
  radioFingerprint: {cell: [...], wifi: [...]},
  triangleId: "STEP-TRI-v1:..."
};

// Compute hash
const proofHash = keccak256(canonicalJSON(proofPayload));

// Sign with device private key
const signature = secp256k1.sign(proofHash, devicePrivateKey);

// Proof object with signature
const signedProof = {
  ...proofPayload,
  userAddress: "0x...",
  signature: "0x..."
};
```

### 3.3 Anti-Spoofing Measures

#### Layer 1: Device-Level
- Require hardware attestation (iOS Secure Enclave / Android SafetyNet)
- Sensor fusion: GPS + WiFi + Cell + Compass + Accelerometer
- Time-of-flight WiFi ranging (WiFi 6, where available)

#### Layer 2: Validator Heuristics
- **Speed Gate:** Reject proofs implying >150 km/h travel between consecutive mines
- **Accuracy Threshold:** Require GPS accuracy <50m (configurable per level)
- **Radio Consistency:** Cross-check WiFi BSSIDs with known databases (optional)
- **Device Fingerprint Reuse:** Limit mines per device per triangle per time window

#### Layer 3: Social Consensus (Witness Network)
- **Nearby Witnesses:** Devices in proximity attest to each other's presence (Phase 3+)
- **Sybil Resistance:** Require N independent witnesses for high-value triangles
- **Collusion Detection:** Graph analysis of witness relationships

---

## 4. State Management

### 4.1 World State

The STEP blockchain maintains state for:

1. **Accounts** (wallets)
   - Address → Balance mapping
   - Nonce counter (for transfer ordering)

2. **Triangles** (mesh regions)
   - Triangle ID → State mapping
   - State: `{clicks, moratoriumStartAt, lastClickAt, parentId, children[]}`

3. **Validator Set** (Phase 4+)
   - Active validators → Stake/pubkey mapping

### 4.2 State Transitions

State updates occur via:
- **Location Proofs:** Update triangle clicks, emit reward to user
- **Transfers:** Debit sender, credit receiver
- **Triangle Subdivisions:** Create 4 child triangles on 11th click
- **Validator Changes:** Add/remove validators (Phase 4+)

### 4.3 State Root Computation

```
State Root = MerkleRoot([
  AccountsRoot,
  TrianglesRoot,
  ValidatorSetRoot
])
```

State roots are included in block headers for light client verification.

---

## 5. P2P Network (Phase 4)

### 5.1 libp2p Stack

- **Transport:** TCP + WebSockets
- **Multiplexing:** mplex
- **Security:** noise protocol
- **Peer Discovery:** mDNS (local) + Bootstrap nodes (global)
- **Pubsub:** GossipSub v1.1

### 5.2 Gossip Topics

| Topic | Purpose | Message Type |
|-------|---------|--------------|
| `/step/proofs/1.0` | Location proof mempool | Signed location proof |
| `/step/blocks/1.0` | Block propagation | Full block |
| `/step/validators/1.0` | Validator set changes | Validator update |

### 5.3 Peer Handshake

```
1. Connect via libp2p transport
2. Noise protocol key exchange
3. Exchange chain metadata:
   - chainId: "step-mainnet-1"
   - genesisHash: "0x..."
   - headHeight: 12345
   - headHash: "0x..."
4. Sync missing blocks if behind
5. Subscribe to gossip topics
```

---

## 6. Phased Rollout

### Phase 1: Mesh Foundation (Months 1-4)
- **Components:** Mesh engine, MongoDB storage, explorer visualization
- **Consensus:** None (read-only mesh)
- **Milestone:** Interactive mesh demo

### Phase 2: Location Proof MVP (Months 5-8)
- **Components:** Mobile app, centralized validator API, token ledger
- **Consensus:** Centralized validation (no blockchain yet)
- **Milestone:** First real-world mine

### Phase 3: Tokenomics + Time-Locks (Months 9-12)
- **Components:** Reward curve, time-lock scheduler, triangle subdivision
- **Consensus:** Still centralized, but full tokenomics live
- **Milestone:** Invite-only beta

### Phase 4: Blockchain Integration (Months 13-18)
- **Components:** PoLC consensus, libp2p network, validator nodes
- **Consensus:** Decentralized BFT with 4-7 validators
- **Milestone:** Public testnet

### Phase 5: Decentralization + Mainnet (Months 19-24)
- **Components:** Staking, slashing, mobile light client, B2B marketplace
- **Consensus:** Fully decentralized, 50+ validators
- **Milestone:** Mainnet launch

---

## 7. JSON-RPC API

### 7.1 Standard Methods (Ethereum-Compatible)

```
net_version                    → Returns chain ID
web3_clientVersion             → Returns node software version
step_blockNumber               → Returns latest block height
step_getBlockByNumber          → Returns block by height
step_getBlockByHash            → Returns block by hash
step_getBalance                → Returns wallet balance
step_sendTransaction           → Submits signed transfer
step_getTransactionReceipt     → Returns tx confirmation
```

### 7.2 STEP-Specific Methods

```
step_submitProof               → Submit location proof
step_getProofStatus            → Check proof validation status
step_getTriangle               → Get triangle state
step_getTriangleChildren       → Get child triangle IDs
step_getTriangleSchedule       → Get time-lock schedule for triangle
step_estimateReward            → Estimate reward for mining triangle
```

---

## 8. Security Considerations

### 8.1 Attack Vectors

1. **GPS Spoofing** — Fake location via software/hardware
2. **Emulator Farms** — Run many virtual devices from one location
3. **Radio Fingerprint Forgery** — Spoof WiFi/Cell data
4. **Collusion** — Validators collude to accept invalid proofs
5. **Sybil Attacks** — One entity controls many devices/validators

### 8.2 Mitigations

1. **Multi-Sensor Fusion** — Require GPS + WiFi + Cell consistency
2. **Hardware Attestation** — Secure Enclave / SafetyNet required
3. **Rate Limiting** — Cap mines per device per time per area
4. **Validator Slashing** — Penalize validators who accept invalid proofs (Phase 4+)
5. **Witness Network** — Nearby devices attest to each other (Phase 3+)

### 8.3 Privacy Considerations

- **Location Data:** Only triangle ID stored on-chain (7m-8000km resolution)
- **Radio Fingerprints:** Hashed before storage; original data never persisted
- **Device Fingerprints:** Salted hashes; not reversible to IMEI/serial
- **User Consent:** Explicit opt-in for location tracking; clear export/delete flows

---

## 9. Governance and Upgrades

### 9.1 Protocol Upgrades (Post-Mainnet)

- **Hard Forks:** Require 2/3+ validator vote + 4-week notice
- **Soft Forks:** Backward-compatible; 1/2+ validator vote
- **Emergency Patches:** Fast-track process for critical security fixes

### 9.2 Parameter Governance

Adjustable via on-chain voting:
- Time-lock delays
- Reward curve parameters
- Validator stake requirements
- Slashing penalties

---

## 10. Compliance and Legal

### 10.1 Data Minimization

- Collect only location data necessary for proof validation
- Hash and discard raw sensor data after validation
- Provide user data export and deletion endpoints

### 10.2 Regulatory Considerations

- **Not Financial Advice:** STEP tokens are utility tokens for location proof incentives
- **KYC/AML:** Not required for MVP; B2B marketplace may require for fiat onramps
- **GDPR Compliance:** Right to erasure supported (off-chain data only; blockchain is immutable)

---

## 11. Future Roadmap (Post-Mainnet)

- **Cross-Chain Bridges:** Bridge STEP tokens to Ethereum/Polygon for DeFi integration
- **zk-SNARK Proofs:** Zero-knowledge location proofs for privacy-enhanced mining
- **Mesh NFTs:** Tradeable ownership of specific triangles
- **DAO Governance:** Community-driven protocol parameter updates
- **Multi-App Ecosystem:** Third-party apps building on STEP mesh + token

---

## 12. References and Resources

- **Icosahedron Math:** [Wolfram MathWorld - Icosahedron](https://mathworld.wolfram.com/Icosahedron.html)
- **Spherical Geometry:** [Spherical Law of Cosines](https://en.wikipedia.org/wiki/Spherical_law_of_cosines)
- **secp256k1:** [Bitcoin's Cryptography](https://en.bitcoin.it/wiki/Secp256k1)
- **libp2p:** [libp2p Specification](https://docs.libp2p.io/)
- **BFT Consensus:** [Practical Byzantine Fault Tolerance](http://pmg.csail.mit.edu/papers/osdi99.pdf)

---

## Appendix A: Glossary

- **STEP:** Spatial Token for Earth Proof
- **PoLC:** Proof-of-Location-Click consensus mechanism
- **Triangle:** Spherical polygon on Earth's surface; basic unit of the mesh
- **Click:** Act of mining a triangle by proving physical presence
- **Moratorium:** 168-hour delay before a triangle becomes mineable
- **Time-Lock:** Exponential delay between consecutive miners on same triangle
- **Subdivision:** Process of splitting a triangle into 4 child triangles after 11 clicks

---

**Document Status:** Living Document — Updated continuously as protocol evolves  
**Maintainers:** AI Developer (Warp.dev), Product Owner  
**Last Review:** 2025-10-02T13:59:03.000Z
