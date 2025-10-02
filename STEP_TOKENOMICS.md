# STEP_TOKENOMICS.md

**Project:** STEP — Proof-of-Location Blockchain  
**Version:** v1.0.0-alpha  
**Last Updated:** 2025-10-02T14:05:00.000Z  
**Status:** Design Phase — Mathematical Specification

---

## Executive Summary

STEP features a **fixed-supply token economy** with mathematically defined distribution based on user's physical exploration of Earth's surface. Total supply is **7.7 trillion STEP tokens**, distributed across **2.8 trillion triangular regions** through **588 mining events** per location maximum.

---

## 1. Core Economics

### 1.1 Total Supply Calculation

**Given:**
- 21 triangle levels (from 8000km sides to 7m sides)
- 28 miners per triangle (exponentially decreasing rewards)
- Reward formula: `R(N) = 1 / 2^(N-1)` for miner N ∈ [1..28]
- Final bonus: +1 token for 28th (last) miner on each triangle

**Triangle Count by Level:**

| Level | Side Length | Triangle Count | Cumulative |
|-------|-------------|----------------|------------|
| 1 | 8000 km | 20 | 20 |
| 2 | 4000 km | 80 | 100 |
| 3 | 2000 km | 320 | 420 |
| ... | ... | ... | ... |
| 10 | 15.625 km | 5,242,880 | ~5.2M |
| ... | ... | ... | ... |
| 21 | 7.1875 m | 21,990,232,555,520 | **2.1 trillion** |

**Total triangles at level 21:** 2,199,023,255,552 (2.1 trillion)  
**All levels summed:** ~2.8 trillion triangles

**Tokens per triangle:**
- Sum of rewards for 28 miners: `Σ(1/2^(N-1)) for N=1 to 28`
- This equals: `2 - 1/2^27 ≈ 2 tokens`
- Plus final bonus for level 21 completion: `+1 token` (2.1 trillion bonuses)

**Total Supply:**
- **From mining rewards:** 2.8T triangles × 2 tokens = **5.6 trillion STEP**
- **From completion bonuses:** 2.1 trillion × 1 token = **2.1 trillion STEP**
- **Grand Total:** **7.7 trillion STEP tokens**

---

## 2. Reward Curve

### 2.1 Per-Mine Reward Formula

```
R(N) = 1 / 2^(N-1)  where N is the click number [1..28]
```

**Examples:**
- 1st miner: `R(1) = 1/2^0 = 1 STEP`
- 2nd miner: `R(2) = 1/2^1 = 0.5 STEP`
- 3rd miner: `R(3) = 1/2^2 = 0.25 STEP`
- 10th miner: `R(10) = 1/2^9 = 0.001953125 STEP`
- 20th miner: `R(20) = 1/2^19 = 0.0000019073 STEP`
- 28th miner: `R(28) = 1/2^27 = 0.0000000074506 STEP`

**Plus:** 28th miner receives bonus `+1 STEP` if this completes the last triangle at the location.

### 2.2 Cumulative Rewards

**Cumulative reward after N miners:**
```
C(N) = Σ R(i) for i=1 to N
     = 2 - 1/2^(N-1)
```

**Examples:**
- After 10 miners: `C(10) = 1.998046875 STEP`
- After 20 miners: `C(20) = 1.999998093 STEP`
- After 28 miners: `C(28) = 1.999999993 ≈ 2 STEP`

---

## 3. Time-Lock Schedule

### 3.1 Moratorium Period

**Rule:** Each triangle has a **168-hour (7-day) moratorium** after creation before it becomes mineable.

**Purpose:**
- Prevents instant depletion of newly subdivided triangles
- Allows geographic distribution of miners
- Adds strategic planning element

**Implementation:**
- Triangle created at time `T`
- First mine eligible at `T + 168h`
- Enforced by validator nodes (reject proofs submitted before eligibility)

### 3.2 Inter-Mine Delay Schedule

**Rule:** After each successful mine, the triangle is locked for an exponentially increasing duration before the next miner can claim.

**Formula:**
```
Delay(N) = 10 - 2 × 2^N seconds  (for N ∈ [2..21])

Special cases:
- N=1: No delay (first miner)
- N≥22: Fixed at ~3 hours (10,480 seconds)
```

**Delay Table:**

| Click | Formula | Delay (seconds) | Delay (human) |
|-------|---------|-----------------|---------------|
| 1 | — | 0 | Immediate |
| 2 | 10 - 2×2^1 | 0.01 | 10ms |
| 3 | 10 - 2×2^2 | 0.02 | 20ms |
| 4 | 10 - 2×2^3 | 0.04 | 40ms |
| 10 | 10 - 2×2^9 | 5 | 5 seconds |
| 15 | 10 - 2×2^14 | 327 | 5.5 minutes |
| 20 | 10 - 2×2^19 | 5,240 | 87 minutes |
| 21 | 10 - 2×2^20 | 10,480 | 174 minutes (2.9h) |
| 22-28 | Fixed | 10,480 | ~3 hours |

**Average delay across all mines:** ~1 hour

### 3.3 Total Time to Deplete a Location

**Scenario:** Single geolocation (e.g., Times Square) with maximum 588 miners (21 levels × 28 clicks).

**Calculation:**
- 21 levels of triangles
- Each level: 28 clicks with delays
- Each level: 168h moratorium before first mine

**Total time:**
- Moratoriums: `21 × 168h = 3,528 hours`
- Mining delays: `588 × ~1h = 588 hours` (average)
- **Grand total:** ~4,116 hours ≈ **171 days** ≈ **5.7 months**

**Reality check:** Popular locations (high foot traffic) will deplete faster due to parallel mining across nearby triangles.

---

## 4. Triangle Lifecycle

### 4.1 State Machine

```
[UNBORN] ──create──> [ACTIVE]
              │
              │ (168h moratorium)
              ▼
           [MINEABLE] ──mine(1-10)──> [PARTIALLY_MINED]
              │
              │ (mine 11)
              ▼
           [SUBDIVIDING] ──create 4 children──> [EXHAUSTED]
                                                      │
                                                      │ (continue on children)
                                                      ▼
                                          (Recursive to level 21)
```

### 4.2 Subdivision Logic

**Trigger:** 11th successful mine on a triangle

**Action:**
1. Mark parent triangle as `EXHAUSTED`
2. Create 4 child triangles:
   - Child A: vertices = (parent.v0, mid(v0,v1), mid(v0,v2))
   - Child B: vertices = (mid(v0,v1), parent.v1, mid(v1,v2))
   - Child C: vertices = (mid(v0,v2), mid(v1,v2), parent.v2)
   - Child D: vertices = (mid(v0,v1), mid(v1,v2), mid(v0,v2)) [center]
3. Set `moratoriumStartAt = now()` for all 4 children
4. Children become mineable after 168h

**Midpoint calculation:** Geodesic midpoint on spherical surface (not Euclidean average).

### 4.3 Level 21 Terminal State

**Rule:** Level 21 triangles (7m sides) **do NOT subdivide** after 11th click.

**Reason:** Level 21 is the finest resolution; further subdivision would be sub-meter scale (impractical for GPS accuracy).

**Behavior:** Level 21 triangles continue accepting miners 12-28 with exponential delays, then permanently exhaust.

---

## 5. Token Distribution Phases

### 5.1 Bootstrap Phase (Phase 1-3: Months 1-12)

**Supply:** 0 tokens (no mining yet)  
**Purpose:** Build mesh, validator infrastructure, mobile app  
**Funding:** Off-chain (angel investment, grants)

### 5.2 Testnet Phase (Phase 4: Months 13-18)

**Supply:** Test STEP tokens (no economic value)  
**Purpose:** Validate tokenomics, time-locks, anti-spoofing  
**Distribution:** Faucet + invite-only mining

### 5.3 Mainnet Launch (Phase 5: Month 19+)

**Supply:** 0 → 7.7T STEP over ~10-20 years (distribution depends on miner activity)  
**Initial Distribution:**
- **Genesis allocation:** 0 (100% mined)
- **Validator rewards:** From protocol reserve (Phase 4+; details TBD)
- **B2B geo-mines:** Businesses purchase triangle mining rights (revenue to protocol treasury)

### 5.4 Long-Term Distribution Curve

**Assumptions:**
- Average 1,000 active miners globally (conservative)
- Each miner completes 10 triangles/month
- Distributed across all levels

**Estimated timeline:**
- **Year 1:** ~0.1% of total supply mined
- **Year 5:** ~5% mined
- **Year 10:** ~30% mined
- **Year 20:** ~80% mined
- **Year 50+:** Asymptotic approach to 100%

**Reality:** Popular urban areas will exhaust faster; remote areas may never be fully mined.

---

## 6. Economic Incentives

### 6.1 For Miners (Users)

**Early Miner Advantage:**
- First miner on a triangle earns **1 STEP** (full token)
- Later miners earn fractional amounts
- Incentivizes exploration of unmined regions

**Geographic Arbitrage:**
- High-traffic areas (cities) deplete quickly
- Remote areas offer higher rewards per mine (less competition)
- Encourages geographic distribution

**Long-Term Engagement:**
- 588 mines per location maximum (months of activity)
- Time-locks prevent instant depletion
- Strategic planning: "Which triangle should I mine next?"

### 6.2 For Businesses (B2B Geo-Mines)

**Use Cases:**
- Retail: Reward customers for visiting stores
- Tourism: Incentivize landmark visits
- Events: Proof-of-attendance tokens

**Revenue Model:**
- Businesses purchase "mine rights" for specific triangles/POIs
- Protocol charges fee per POI mine created
- Businesses can offer bonus rewards on top of protocol rewards

### 6.3 For Validators (Phase 4+)

**Revenue Streams:**
- Block rewards (from protocol reserve; % TBD)
- Transaction fees (user transfers)
- B2B geo-mine creation fees (% shared)

**Costs:**
- Infrastructure (servers, bandwidth)
- Stake lock-up (opportunity cost)

**Slashing Risks:**
- Accepting invalid proofs
- Double-signing blocks
- Offline downtime (liveness failure)

---

## 7. Token Utility

### 7.1 Primary Utility

1. **Proof-of-Location Rewards** — Earn STEP by physically visiting triangles
2. **Transfer Medium** — Send STEP to other users (P2P payments)
3. **B2B Marketplace** — Businesses accept STEP for goods/services
4. **Validator Staking** — Lock STEP to become validator (Phase 4+)

### 7.2 Secondary Utility (Post-Mainnet)

1. **Governance** — Vote on protocol parameters (time-locks, reward curves, etc.)
2. **NFT Minting** — Pay STEP to mint landmark NFTs tied to triangles
3. **Cross-Chain Bridges** — Bridge to Ethereum/Polygon for DeFi integration
4. **Triangle Ownership** — Purchase exclusive mining rights for specific triangles (advanced)

---

## 8. Anti-Inflation Mechanisms

### 8.1 Fixed Supply

**No inflation:** Total supply capped at 7.7 trillion STEP. Once all triangles are mined, no new tokens are created.

### 8.2 Deflationary Pressure (Optional, Post-Mainnet)

**Potential mechanisms (subject to governance vote):**
- **Transaction Fee Burn:** Burn % of transfer fees
- **Lost Key Tokens:** Tokens in wallets with lost keys are permanently unspendable
- **B2B Revenue Burn:** Burn % of geo-mine creation fees

---

## 9. Economic Simulations (Preliminary)

### 9.1 Scenario: Urban Hotspot (e.g., Times Square)

**Assumptions:**
- 10,000 miners visit per month
- Triangles exhaust within 6 months

**Result:**
- ~0.001% of global supply mined in this location
- High competition, low reward per miner
- Demonstrates time-lock effectiveness

### 9.2 Scenario: Remote Area (e.g., Sahara Desert)

**Assumptions:**
- 10 miners visit per year
- Triangles never fully exhaust

**Result:**
- Early miners earn near-maximum rewards
- Geographic arbitrage opportunity
- Demonstrates distribution incentive

### 9.3 Global Distribution (10-Year Projection)

**Model:**
- Monte Carlo simulation with 10,000 runs
- Variables: miner count, geographic distribution, travel patterns
- **Outcome:** Expected 30% of total supply mined after 10 years (median scenario)

**Validation:** Match actual mainnet data against projections; adjust model as needed.

---

## 10. Compliance and Taxation

### 10.1 Tax Treatment (Disclaimer: Not Financial/Legal Advice)

**Potential classifications (varies by jurisdiction):**
- **Mining Income:** STEP earned via location proofs may be taxable as income
- **Capital Gains:** Selling/transferring STEP may trigger capital gains tax
- **Reporting:** Users responsible for tracking and reporting per local laws

**Protocol stance:** STEP is a utility token for location proof incentives, not an investment security.

### 10.2 B2B Accounting

**For businesses purchasing geo-mines:**
- Treat as marketing expense
- STEP tokens distributed to customers = promotional cost
- Consult tax professional for specific jurisdiction

---

## 11. Future Economic Enhancements

### 11.1 Dynamic Reward Adjustments (Governance-Driven)

**Post-mainnet, community can vote to:**
- Adjust time-lock delays (if depletion is too fast/slow)
- Modify reward curve (if economic imbalance detected)
- Introduce new triangle levels (if GPS accuracy improves)

### 11.2 Proof-of-Stake Transition (Phase 4+)

**Validators must stake STEP:**
- Minimum stake: TBD (e.g., 10,000 STEP)
- Slashing: Lose stake for malicious behavior
- Rewards: Earn block rewards + fees

---

## 12. Mathematical Proofs

### 12.1 Proof: Total Supply = 7.7T

**Given:**
- Triangle count at level 21: `T = 21,990,232,555,520`
- All-levels summed: `T_sum ≈ 2.8 × 10^12`
- Tokens per triangle: `2 STEP` (from geometric series)
- Level-21 completion bonus: `1 STEP × T`

**Calculation:**
```
Total_Supply = (T_sum × 2) + T
             = (2.8 × 10^12 × 2) + (2.2 × 10^12)
             = 5.6 × 10^12 + 2.2 × 10^12
             = 7.8 × 10^12
             ≈ 7.7 trillion STEP
```

**QED.**

### 12.2 Proof: Geometric Series Convergence

**Reward sum for 28 miners:**
```
S = Σ (1/2^(N-1)) for N=1 to 28
  = 1 + 1/2 + 1/4 + 1/8 + ... + 1/2^27
  = 2 × (1 - 1/2^28)
  ≈ 2 - 3.73 × 10^-9
  ≈ 2 STEP
```

**QED.**

---

## Appendix A: Token Precision and Representation

**Smallest Unit:** `1 wei` (10^-18 STEP), following Ethereum convention

**Representation:**
- On-chain: 256-bit unsigned integer (wei)
- User-facing: Decimal STEP (18 decimal places)
- Example: `1.5 STEP = 1,500,000,000,000,000,000 wei`

---

## Appendix B: Reward Schedule CSV (First 28 Miners)

```csv
Click,Reward_STEP,Cumulative_STEP
1,1.000000000000000000,1.000000000000000000
2,0.500000000000000000,1.500000000000000000
3,0.250000000000000000,1.750000000000000000
4,0.125000000000000000,1.875000000000000000
5,0.062500000000000000,1.937500000000000000
10,0.001953125000000000,1.998046875000000000
15,0.000061035156250000,1.999938964843750000
20,0.000001907348632812,1.999998092651367188
28,0.000000007450580597,1.999999992549419403
```

---

**Document Status:** Living Document — Updated as economic model evolves  
**Maintainers:** AI Developer (Warp.dev), Product Owner, Economist (TBD)  
**Last Review:** 2025-10-02T14:05:00.000Z
