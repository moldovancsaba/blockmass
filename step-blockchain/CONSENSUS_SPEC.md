# CONSENSUS_SPEC.md

**STEP Blockchain - PoLC-BFT Consensus Protocol Specification**  
**Version:** v0.3.1  
**Status:** Draft  
**Last Updated:** 2025-10-05T14:56:15.000Z

---

## Table of Contents

1. [Introduction](#introduction)
2. [Design Principles](#design-principles)
3. [Protocol Overview](#protocol-overview)
4. [Consensus Parameters](#consensus-parameters)
5. [Validator Set Management](#validator-set-management)
6. [Message Types](#message-types)
7. [Consensus State Machine](#consensus-state-machine)
8. [Consensus Rounds](#consensus-rounds)
9. [Proposer Selection](#proposer-selection)
10. [Voting Rules](#voting-rules)
11. [Finality](#finality)
12. [Fork Resolution](#fork-resolution)
13. [Timeout Mechanisms](#timeout-mechanisms)
14. [Safety and Liveness](#safety-and-liveness)
15. [Edge Cases](#edge-cases)
16. [References](#references)

---

## 1. Introduction

### 1.1 Purpose

The **PoLC-BFT** (Proof-of-Location-Click Byzantine Fault Tolerant) consensus protocol is a custom Byzantine Fault Tolerant consensus mechanism designed specifically for the STEP blockchain. It enables multiple validators to reach agreement on the validity of location proofs submitted by mobile users, ensuring decentralization, security, and high throughput.

### 1.2 Goals

- **Decentralization:** Eliminate single points of failure by distributing proof validation across multiple validators
- **Byzantine Fault Tolerance:** Tolerate up to f = (N-1)/3 malicious or faulty validators
- **High Throughput:** Process 10,000+ location proofs per second
- **Low Latency:** Achieve finality in <3 seconds
- **Deterministic Finality:** No probabilistic finality (unlike PoW) - once finalized, immutable
- **Simplicity:** Clear, auditable consensus logic optimized for location proof validation

### 1.3 Inspiration

PoLC-BFT draws inspiration from:

- **Tendermint BFT:** Round-based voting with pre-vote and pre-commit phases
- **HotStuff:** 3-phase commit for safety and liveness
- **PBFT (Practical Byzantine Fault Tolerance):** View-change mechanisms and 2/3+ quorum requirements
- **Casper FFG:** Finality gadget concepts and accountability mechanisms

**Key Differences:**
- Optimized for location proof validation (not general transactions)
- Simplified proposer selection (deterministic round-robin, no leader election randomness)
- Batch-oriented processing (groups of proofs, not individual transactions)
- Integrated with geospatial validation logic (triangle membership, GPS accuracy)

---

## 2. Design Principles

### 2.1 Core Principles

1. **Safety First:** Never finalize conflicting proofs, even under network partitions
2. **Accountability:** All validator actions are signed and recorded for evidence collection
3. **Batching:** Process proofs in batches to maximize throughput
4. **Determinism:** All validators execute identical validation logic
5. **Simplicity:** Prefer clear, auditable algorithms over complex optimizations

### 2.2 Threat Model

**Assumptions:**
- Up to f = (N-1)/3 validators may be Byzantine (malicious, faulty, or colluding)
- Network is partially synchronous (messages eventually delivered, bounded delays)
- Cryptographic primitives (ECDSA, SHA-256) are secure
- Validators have accurate clocks (NTP synchronized, ±1 second tolerance)

**Attack Vectors Addressed:**
- **Double-Signing:** Slashing mechanism penalizes validators signing conflicting votes
- **GPS Spoofing:** Requires collusion of >1/3 validators to accept invalid proofs
- **Replay Attacks:** Nonce enforcement prevents reuse of signed proofs (Phase 2)
- **Sybil Attacks:** Stake requirements limit validator count per entity
- **Network Partitions:** Timeout mechanisms ensure liveness

---

## 3. Protocol Overview

### 3.1 High-Level Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                    PROOF SUBMISSION (Mobile App)                 │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                 LOAD BALANCER / API GATEWAY                      │
│  - Distributes proofs to all validators                         │
│  - Round-robin or least-loaded validator selection              │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              PROOF DISTRIBUTION (GossipSub P2P)                  │
│  - All validators receive proof via P2P network                 │
│  - Proof added to mempool for batching                          │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│           INDEPENDENT VALIDATION (Each Validator)                │
│  - Signature verification (EIP-191)                             │
│  - Geometry validation (point-in-triangle)                      │
│  - Heuristics (GPS accuracy, speed gate, moratorium)            │
│  - Result: ACCEPT or REJECT                                     │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│              PROPOSER SELECTION (Round-Robin)                    │
│  - proposer_index = (round mod validator_count)                 │
│  - Proposer creates ProofBatch proposal                         │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PRE-VOTE ROUND (Phase 1)                      │
│  - Validators vote on ProofBatch proposal                       │
│  - Threshold: 2/3+ validators must vote ACCEPT                  │
│  - Timeout: 3 seconds                                           │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                  PRE-COMMIT ROUND (Phase 2)                      │
│  - Validators commit to finalizing the ProofBatch               │
│  - Threshold: 2/3+ validators must pre-commit                   │
│  - Timeout: 2 seconds                                           │
└─────────────────────────────────────────────────────────────────┘
                                 │
                                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                COMMIT & EXECUTE (Finalization)                   │
│  - Apply state changes to MongoDB (atomic transaction)          │
│  - Distribute rewards to proof submitters                       │
│  - Update validator rewards                                     │
│  - Broadcast finalized ProofBatch to network                    │
│  - Result: FINALIZED                                            │
└─────────────────────────────────────────────────────────────────┘
```

### 3.2 Consensus Phases

**Phase 1: Pre-Vote**
- Validators evaluate the proposer's ProofBatch
- Vote ACCEPT if all proofs are valid, REJECT otherwise
- Collects votes until 2/3+ threshold or timeout

**Phase 2: Pre-Commit**
- Validators commit to finalizing the ProofBatch
- Only proceeds if Phase 1 achieved 2/3+ ACCEPT votes
- Serves as a safety lock before finalization

**Phase 3: Commit**
- Execute state changes (atomic MongoDB transaction)
- Distribute rewards
- Broadcast finalization to all validators

---

## 4. Consensus Parameters

### 4.1 Network Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Validator Count (MVP)** | 4-7 | Minimum for BFT (3f+1, f=1) |
| **Validator Count (Target)** | 10-50 | Production network size |
| **Byzantine Tolerance (f)** | (N-1)/3 | Standard BFT assumption |
| **Voting Threshold** | 2/3+ (2f+1) | Safety requirement |
| **Quorum Size** | ceil(2N/3) | Minimum votes for finality |

### 4.2 Timing Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Batch Interval** | 10 seconds | Time to accumulate proofs |
| **Pre-Vote Timeout** | 3 seconds | Validator response time |
| **Pre-Commit Timeout** | 2 seconds | Finalization time |
| **Proposer Timeout** | 5 seconds | Fallback to next proposer |
| **Round Duration (max)** | 10 seconds | Total time for one consensus round |
| **Epoch Length** | 1000 batches | Validator set update frequency |

### 4.3 Batch Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Batch Size (target)** | 100 proofs | Balance throughput and latency |
| **Batch Size (max)** | 1000 proofs | Prevent oversized batches |
| **Batch Size (min)** | 1 proof | Allow low-traffic periods |

### 4.4 Stake Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| **Minimum Stake** | 100,000 STEP | Sybil resistance |
| **Unstaking Period** | 7 days | Prevent rapid exit after malicious behavior |
| **Slashing (Double-Sign)** | 50% | Severe penalty for equivocation |
| **Slashing (Invalid Proof)** | 30% | Penalty for accepting bad proofs |
| **Slashing (Offline >24h)** | 10% | Encourage uptime |

---

## 5. Validator Set Management

### 5.1 Validator Registration

**Requirements:**
1. Stake at least 100,000 STEP tokens
2. Submit validator public key (ECDSA secp256k1)
3. Provide network endpoint (IP:Port for P2P)
4. Sign registration transaction with validator key

**Registration Process:**
```typescript
interface ValidatorRegistration {
  validatorAddress: string;      // Ethereum-style address
  publicKey: string;              // Compressed ECDSA public key (33 bytes hex)
  stake: bigint;                  // Minimum 100,000 STEP
  endpoint: string;               // "ip:port" for P2P connection
  registrationTimestamp: Date;    // ISO 8601 UTC with milliseconds
  signature: string;              // EIP-191 signature of registration data
}
```

### 5.2 Validator Activation

**Activation Criteria:**
- Stake confirmed (transaction finalized)
- Network connectivity verified (P2P handshake successful)
- Passes health check (responds to ping within 1 second)

**Activation Delay:** 1 epoch (~2.8 hours if 10-second batches)

### 5.3 Validator Deactivation

**Voluntary Deactivation:**
- Validator submits unstaking request
- Stake locked for 7 days (unstaking period)
- Validator remains active until epoch boundary
- Stake returned after unstaking period

**Involuntary Deactivation (Slashing):**
- Immediate removal from validator set
- Stake slashed according to offense severity
- Banned from re-registering for 30 days

### 5.4 Validator Set Updates

**Epoch Boundary Processing:**
- Current epoch ends after 1000 batches
- Pending validator registrations activated
- Unstaking validators deactivated
- New validator set hash computed and propagated

**Validator Set Hash:**
```typescript
validatorSetHash = SHA256(
  concat(
    validator1.address,
    validator1.publicKey,
    validator1.stake,
    // ... all validators sorted by address
  )
)
```

---

## 6. Message Types

### 6.1 ProofBatch Message

**Purpose:** Proposer bundles multiple proofs into a single consensus unit

```typescript
interface ProofBatch {
  batchId: string;                // UUID v4
  round: number;                  // Consensus round number
  height: number;                 // Blockchain height (blocks finalized)
  proposer: string;               // Validator address
  timestamp: string;              // ISO 8601 UTC with milliseconds
  proofs: LocationProof[];        // Array of location proofs
  previousBatchHash: string;      // SHA-256 of previous batch (chain continuity)
  validatorSetHash: string;       // Current validator set hash
  signature: string;              // Proposer's EIP-191 signature
}

interface LocationProof {
  userId: string;
  triangleId: string;
  latitude: number;
  longitude: number;
  timestamp: string;
  accuracy: number;
  nonce: number;
  signature: string;
}
```

### 6.2 PreVote Message

**Purpose:** Validator signals acceptance or rejection of ProofBatch

```typescript
interface PreVote {
  batchId: string;                // UUID of ProofBatch
  round: number;
  validator: string;              // Validator address
  vote: 'ACCEPT' | 'REJECT';      // Validation result
  timestamp: string;              // ISO 8601 UTC with milliseconds
  signature: string;              // Validator's EIP-191 signature
}
```

### 6.3 PreCommit Message

**Purpose:** Validator commits to finalizing the ProofBatch

```typescript
interface PreCommit {
  batchId: string;                // UUID of ProofBatch
  round: number;
  validator: string;              // Validator address
  commit: boolean;                // true = commit, false = abort
  timestamp: string;              // ISO 8601 UTC with milliseconds
  signature: string;              // Validator's EIP-191 signature
}
```

### 6.4 Commit Message

**Purpose:** Broadcast finalization of ProofBatch

```typescript
interface Commit {
  batchId: string;                // UUID of ProofBatch
  round: number;
  height: number;                 // New blockchain height
  preVotes: PreVote[];            // All collected pre-votes (evidence)
  preCommits: PreCommit[];        // All collected pre-commits (evidence)
  timestamp: string;              // ISO 8601 UTC with milliseconds
  signature: string;              // Aggregator's signature (optional)
}
```

### 6.5 Evidence Message

**Purpose:** Report Byzantine behavior (double-signing, invalid votes)

```typescript
interface Evidence {
  evidenceType: 'DOUBLE_SIGN' | 'INVALID_VOTE' | 'CONFLICTING_PROPOSAL';
  validator: string;              // Accused validator address
  proof1: any;                    // First signed message
  proof2: any;                    // Conflicting signed message (if applicable)
  reporter: string;               // Validator reporting evidence
  timestamp: string;              // ISO 8601 UTC with milliseconds
  signature: string;              // Reporter's signature
}
```

### 6.6 TimeoutMessage

**Purpose:** Signal timeout and trigger view change

```typescript
interface TimeoutMessage {
  round: number;
  validator: string;              // Validator signaling timeout
  timeoutType: 'PRE_VOTE' | 'PRE_COMMIT' | 'PROPOSER';
  timestamp: string;              // ISO 8601 UTC with milliseconds
  signature: string;              // Validator's signature
}
```

---

## 7. Consensus State Machine

### 7.1 States

```typescript
enum ConsensusState {
  IDLE               = 'IDLE',               // Waiting for proofs to accumulate
  PROPOSE            = 'PROPOSE',            // Proposer creating ProofBatch
  PRE_VOTE           = 'PRE_VOTE',           // Validators voting on proposal
  PRE_VOTE_WAIT      = 'PRE_VOTE_WAIT',      // Waiting for 2/3+ votes
  PRE_COMMIT         = 'PRE_COMMIT',         // Validators committing
  PRE_COMMIT_WAIT    = 'PRE_COMMIT_WAIT',    // Waiting for 2/3+ commits
  COMMIT             = 'COMMIT',             // Finalizing batch
  TIMEOUT_PRE_VOTE   = 'TIMEOUT_PRE_VOTE',   // Pre-vote timeout triggered
  TIMEOUT_PRE_COMMIT = 'TIMEOUT_PRE_COMMIT', // Pre-commit timeout triggered
  TIMEOUT_PROPOSER   = 'TIMEOUT_PROPOSER',   // Proposer offline/failed
}
```

### 7.2 State Transitions

```
                    ┌──────────────┐
                    │     IDLE     │ ◄───────────────┐
                    └──────────────┘                 │
                            │                        │
                   (batch ready)                     │
                            │                        │
                            ▼                        │
                    ┌──────────────┐                 │
              ┌────►│   PROPOSE    │                 │
              │     └──────────────┘                 │
              │             │                        │
              │   (proposal created)                 │
              │             │                        │
              │             ▼                        │
              │     ┌──────────────┐                 │
              │     │   PRE_VOTE   │                 │
              │     └──────────────┘                 │
              │             │                        │
              │    (votes received)                  │
              │             │                        │
              │             ▼                        │
              │     ┌──────────────┐                 │
              │     │PRE_VOTE_WAIT │                 │
              │     └──────────────┘                 │
              │          │      │                    │
              │   (2/3+ votes)  │                    │
              │          │   (timeout)               │
              │          │      │                    │
              │          │      ▼                    │
              │          │  ┌──────────────────┐    │
              │          │  │TIMEOUT_PRE_VOTE  │────┤
              │          │  └──────────────────┘    │
              │          │                          │
              │          ▼                          │
              │     ┌──────────────┐                │
              │     │  PRE_COMMIT  │                │
              │     └──────────────┘                │
              │             │                       │
              │   (commits received)                │
              │             │                       │
              │             ▼                       │
              │     ┌──────────────┐                │
              │     │PRE_COMMIT_WAIT│               │
              │     └──────────────┘                │
              │          │      │                   │
              │  (2/3+ commits) │                   │
              │          │   (timeout)              │
              │          │      │                   │
              │          │      ▼                   │
              │          │  ┌──────────────────┐   │
              │          │  │TIMEOUT_PRE_COMMIT│───┤
              │          │  └──────────────────┘   │
              │          │                         │
              │          ▼                         │
              │     ┌──────────────┐               │
              │     │    COMMIT    │               │
              │     └──────────────┘               │
              │             │                      │
              │      (finalized)                   │
              │             │                      │
              └─────────────┴──────────────────────┘
```

### 7.3 State Descriptions

**IDLE:**
- Waiting for proofs to accumulate in mempool
- Monitoring batch interval timer (10 seconds)
- Transition: When batch ready OR proposer timeout

**PROPOSE:**
- Current proposer creates ProofBatch
- Bundles proofs from mempool (up to 1000)
- Signs and broadcasts ProofBatch to all validators
- Transition: After broadcast → PRE_VOTE

**PRE_VOTE:**
- All validators validate ProofBatch independently
- Each validator votes ACCEPT or REJECT
- Broadcast PreVote message to all validators
- Transition: After voting → PRE_VOTE_WAIT

**PRE_VOTE_WAIT:**
- Collect PreVote messages from all validators
- Monitor for 2/3+ threshold OR timeout (3 seconds)
- Transition: If 2/3+ ACCEPT → PRE_COMMIT, else → TIMEOUT_PRE_VOTE

**PRE_COMMIT:**
- Validators commit to finalizing the batch
- Broadcast PreCommit message
- Transition: After committing → PRE_COMMIT_WAIT

**PRE_COMMIT_WAIT:**
- Collect PreCommit messages
- Monitor for 2/3+ threshold OR timeout (2 seconds)
- Transition: If 2/3+ commits → COMMIT, else → TIMEOUT_PRE_COMMIT

**COMMIT:**
- Execute atomic MongoDB transaction
- Apply all state changes (proof records, rewards)
- Broadcast Commit message to network
- Transition: After finalization → IDLE (next round)

**TIMEOUT_PRE_VOTE / TIMEOUT_PRE_COMMIT / TIMEOUT_PROPOSER:**
- Increment round number
- Select next proposer (round-robin)
- Reset state machine
- Transition: → PROPOSE (with new proposer)

---

## 8. Consensus Rounds

### 8.1 Round Structure

Each consensus round consists of:
1. **Proposal Phase:** Proposer creates and broadcasts ProofBatch
2. **Voting Phase:** Validators vote on ProofBatch validity
3. **Commitment Phase:** Validators commit to finalization
4. **Execution Phase:** Apply state changes and distribute rewards

### 8.2 Round Numbering

```typescript
interface Round {
  roundNumber: number;            // Monotonically increasing (starts at 0)
  height: number;                 // Blockchain height (finalized batches)
  proposerIndex: number;          // proposer_index = round mod validator_count
  startTime: string;              // ISO 8601 UTC with milliseconds
  status: 'IN_PROGRESS' | 'FINALIZED' | 'FAILED';
}
```

**Properties:**
- Round number increments after each finalization OR timeout
- Height increments only after successful finalization
- Multiple rounds can occur at the same height (due to timeouts/failures)

### 8.3 Round Lifecycle

```typescript
// Example: 7 validators, round 42
const validatorCount = 7;
const round = 42;
const proposerIndex = round % validatorCount; // = 0 (validator 0 is proposer)

// Round timeline:
// T+0s:   Proposer creates ProofBatch, broadcasts
// T+0.5s: Validators receive proposal, begin validation
// T+1s:   Validators broadcast PreVote messages
// T+2s:   2/3+ PreVotes collected → PRE_COMMIT phase
// T+3s:   Validators broadcast PreCommit messages
// T+4s:   2/3+ PreCommits collected → COMMIT phase
// T+5s:   Batch finalized, rewards distributed
// T+5.5s: Round 43 begins (next proposer)
```

---

## 9. Proposer Selection

### 9.1 Deterministic Round-Robin

**Algorithm:**
```typescript
function selectProposer(round: number, validators: Validator[]): Validator {
  // Sort validators by address (deterministic ordering)
  const sortedValidators = validators.sort((a, b) => 
    a.address.localeCompare(b.address)
  );
  
  // Select proposer using modulo
  const proposerIndex = round % sortedValidators.length;
  
  return sortedValidators[proposerIndex];
}
```

**Properties:**
- **Deterministic:** All validators compute the same proposer for any given round
- **Fair:** Each validator gets equal opportunity to propose
- **Simple:** No randomness, no leader election complexity
- **Predictable:** Validators know proposer order in advance

### 9.2 Proposer Responsibilities

1. **Batch Creation:** Collect proofs from mempool, create ProofBatch
2. **Validation:** Ensure all proofs in batch are valid (same validation as other validators)
3. **Signing:** Sign ProofBatch with validator key
4. **Broadcasting:** Send ProofBatch to all validators via P2P network
5. **Timeout Handling:** If offline, other validators trigger timeout and skip to next proposer

### 9.3 Proposer Timeout

**Trigger Conditions:**
- Proposer fails to broadcast ProofBatch within 5 seconds
- ProofBatch is invalid or malformed
- Network partition isolates proposer

**Timeout Handling:**
1. Any validator can broadcast TimeoutMessage after 5 seconds
2. If 2/3+ validators signal timeout, round increments
3. Next proposer selected via round-robin
4. Previous proposer is NOT slashed (could be network issue, not malicious)

---

## 10. Voting Rules

### 10.1 Pre-Vote Phase

**Validation Criteria (all must pass for ACCEPT vote):**
1. **Signature Valid:** Proposer's signature verifies correctly
2. **All Proofs Valid:** Every proof in batch passes Phase 2 validation:
   - EIP-191 signature verification
   - Point-in-triangle geometry validation
   - GPS accuracy within 50 meters
   - Speed gate check (<100 km/h)
   - Moratorium check (24-hour cooldown per triangle)
   - Nonce uniqueness (no replay)
3. **Batch Size Valid:** 1 ≤ proof_count ≤ 1000
4. **Proposer Authorized:** Proposer is active validator for current round
5. **Round Correct:** Round number matches current consensus round
6. **Previous Batch Hash:** Correctly references previous finalized batch (chain continuity)

**Vote Casting:**
```typescript
async function castPreVote(batch: ProofBatch): Promise<PreVote> {
  // Validate batch
  const isValid = await validateProofBatch(batch);
  
  // Create vote
  const vote: PreVote = {
    batchId: batch.batchId,
    round: batch.round,
    validator: myValidatorAddress,
    vote: isValid ? 'ACCEPT' : 'REJECT',
    timestamp: new Date().toISOString(),
    signature: '' // Placeholder
  };
  
  // Sign vote
  vote.signature = await signEIP191(vote);
  
  // Broadcast to all validators
  await broadcastMessage(vote);
  
  return vote;
}
```

### 10.2 Pre-Commit Phase

**Commitment Criteria:**
- Only proceed if 2/3+ validators voted ACCEPT in pre-vote phase
- Validator has not detected any Byzantine behavior

**Commit Casting:**
```typescript
async function castPreCommit(batch: ProofBatch, preVotes: PreVote[]): Promise<PreCommit> {
  // Count ACCEPT votes
  const acceptCount = preVotes.filter(v => v.vote === 'ACCEPT').length;
  const quorum = Math.ceil((2 * validatorCount) / 3);
  
  // Check threshold
  const shouldCommit = acceptCount >= quorum;
  
  // Create commit
  const commit: PreCommit = {
    batchId: batch.batchId,
    round: batch.round,
    validator: myValidatorAddress,
    commit: shouldCommit,
    timestamp: new Date().toISOString(),
    signature: '' // Placeholder
  };
  
  // Sign commit
  commit.signature = await signEIP191(commit);
  
  // Broadcast to all validators
  await broadcastMessage(commit);
  
  return commit;
}
```

### 10.3 Quorum Requirements

**Quorum Size:**
```typescript
const quorum = Math.ceil((2 * validatorCount) / 3);

// Examples:
// 4 validators: quorum = 3 (75%)
// 7 validators: quorum = 5 (71%)
// 10 validators: quorum = 7 (70%)
// 50 validators: quorum = 34 (68%)
```

**Why 2/3+?**
- Byzantine Fault Tolerance requires >2f votes, where f = (N-1)/3
- This ensures at least f+1 honest validators agree (majority of honest validators)
- Prevents malicious validators from controlling consensus

---

## 11. Finality

### 11.1 Finality Definition

A ProofBatch is **finalized** when:
1. 2/3+ validators cast ACCEPT pre-votes
2. 2/3+ validators cast commit pre-commits
3. State changes are applied to MongoDB (atomic transaction)
4. Commit message is broadcast to all validators

**Properties:**
- **Immediate:** Finality is achieved within one round (~5 seconds)
- **Deterministic:** No probabilistic finality (unlike PoW's 6-block confirmations)
- **Irreversible:** Once finalized, cannot be rolled back (blockchain immutability)

### 11.2 Finalization Process

```typescript
async function finalizeProofBatch(
  batch: ProofBatch,
  preVotes: PreVote[],
  preCommits: PreCommit[]
): Promise<void> {
  // Start MongoDB transaction
  const session = await mongoClient.startSession();
  session.startTransaction();
  
  try {
    // Apply all proof validations
    for (const proof of batch.proofs) {
      await processLocationProof(proof, session);
    }
    
    // Distribute rewards to proof submitters
    for (const proof of batch.proofs) {
      await distributeReward(proof, session);
    }
    
    // Update validator rewards (for participating in consensus)
    await updateValidatorRewards(preVotes, preCommits, session);
    
    // Record finalized batch
    await saveCommit({
      batchId: batch.batchId,
      round: batch.round,
      height: currentHeight + 1,
      preVotes,
      preCommits,
      timestamp: new Date().toISOString()
    }, session);
    
    // Commit transaction (atomic)
    await session.commitTransaction();
    
    // Broadcast Commit message
    await broadcastCommit(batch, preVotes, preCommits);
    
    // Increment height
    currentHeight++;
    
    console.log(`✅ Finalized batch ${batch.batchId} at height ${currentHeight}`);
  } catch (error) {
    // Rollback on failure
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
}
```

### 11.3 Chain Continuity

Each ProofBatch references the previous finalized batch via hash:

```typescript
batch.previousBatchHash = SHA256(
  concat(
    previousBatch.batchId,
    previousBatch.round,
    previousBatch.height,
    previousBatch.timestamp
  )
)
```

**Properties:**
- Forms immutable chain of finalized batches
- Prevents fork ambiguity
- Enables verification of batch ordering

---

## 12. Fork Resolution

### 12.1 Fork Prevention

**Primary Prevention Mechanisms:**
1. **2/3+ Quorum:** Ensures at least f+1 honest validators agree
2. **Pre-Commit Lock:** Validators commit before finalization (2-phase safety)
3. **Evidence Collection:** All votes are recorded and auditable
4. **Slashing:** Validators penalized for signing conflicting proposals

### 12.2 Conflicting Proposals

**Scenario:** Two validators propose different ProofBatches for the same round

**Detection:**
```typescript
function detectConflictingProposals(
  proposal1: ProofBatch,
  proposal2: ProofBatch
): boolean {
  return (
    proposal1.round === proposal2.round &&
    proposal1.batchId !== proposal2.batchId &&
    proposal1.proposer !== proposal2.proposer
  );
}
```

**Resolution:**
1. **Only One Proposer Per Round:** Round-robin ensures deterministic proposer
2. **Reject Invalid Proposals:** Validators reject proposals from non-designated proposers
3. **Evidence Recording:** If Byzantine proposer submits multiple proposals, evidence collected for slashing

### 12.3 Double-Signing Detection

**Definition:** Validator signs two conflicting votes for the same round

```typescript
interface DoubleSignEvidence {
  validator: string;
  round: number;
  vote1: PreVote | PreCommit;
  vote2: PreVote | PreCommit;
}

function detectDoubleSigning(
  vote1: PreVote | PreCommit,
  vote2: PreVote | PreCommit
): boolean {
  return (
    vote1.validator === vote2.validator &&
    vote1.round === vote2.round &&
    vote1.batchId !== vote2.batchId
  );
}
```

**Consequences:**
- Validator slashed 50% of stake
- Immediate deactivation from validator set
- Evidence broadcast to all validators for verification

### 12.4 Network Partitions

**Scenario:** Network splits into two partitions, each with <2/3 validators

**Behavior:**
- Neither partition can finalize batches (no quorum)
- Validators continue proposing but cannot reach finality
- Timeouts occur repeatedly

**Recovery:**
- When partition heals, validators synchronize state
- Resume consensus from last finalized batch
- No conflicting finalities possible (2/3+ threshold prevents)

---

## 13. Timeout Mechanisms

### 13.1 Timeout Types

**Pre-Vote Timeout (3 seconds):**
- Triggered if <2/3 validators cast pre-votes within 3 seconds
- Action: Increment round, select next proposer

**Pre-Commit Timeout (2 seconds):**
- Triggered if <2/3 validators cast pre-commits within 2 seconds
- Action: Increment round, select next proposer

**Proposer Timeout (5 seconds):**
- Triggered if proposer fails to broadcast ProofBatch within 5 seconds
- Action: Skip to next proposer (round-robin)

### 13.2 Timeout Handling

```typescript
class ConsensusEngine {
  private preVoteTimer: NodeJS.Timeout | null = null;
  private preCommitTimer: NodeJS.Timeout | null = null;
  
  async startPreVoteTimer(round: number): Promise<void> {
    this.preVoteTimer = setTimeout(() => {
      this.handlePreVoteTimeout(round);
    }, 3000); // 3 seconds
  }
  
  async handlePreVoteTimeout(round: number): Promise<void> {
    console.log(`⏰ Pre-vote timeout for round ${round}`);
    
    // Broadcast timeout message
    await this.broadcastTimeout({
      round,
      validator: this.address,
      timeoutType: 'PRE_VOTE',
      timestamp: new Date().toISOString(),
      signature: await this.signTimeout(round)
    });
    
    // Increment round
    this.currentRound++;
    
    // Reset state machine
    this.state = ConsensusState.PROPOSE;
    
    // Select next proposer
    this.currentProposer = this.selectProposer(this.currentRound);
  }
  
  clearPreVoteTimer(): void {
    if (this.preVoteTimer) {
      clearTimeout(this.preVoteTimer);
      this.preVoteTimer = null;
    }
  }
}
```

### 13.3 Timeout Aggregation

**Threshold:** 2/3+ validators must signal timeout to trigger round increment

**Rationale:**
- Prevents single malicious validator from spamming timeouts
- Ensures majority agreement on timeout condition

---

## 14. Safety and Liveness

### 14.1 Safety Proof (Informal)

**Theorem:** No two conflicting ProofBatches can be finalized for the same round.

**Proof Sketch:**
1. Finalization requires 2/3+ validators to pre-commit
2. Pre-commit requires 2/3+ validators to pre-vote ACCEPT
3. Total validator count = N, Byzantine validators ≤ f = (N-1)/3
4. Honest validators ≥ N - f = N - (N-1)/3 = (2N+1)/3
5. For two conflicting batches to finalize, both need 2/3+ votes
6. Total votes required = 2 * (2N/3) = 4N/3 > N (impossible)
7. Therefore, at most one batch can finalize per round ∎

### 14.2 Liveness Proof (Informal)

**Theorem:** The network will eventually finalize a batch (assuming partial synchrony).

**Proof Sketch:**
1. Assume network eventually delivers messages (partial synchrony)
2. If proposer is honest, it will create valid ProofBatch
3. Honest validators (≥ 2/3) will vote ACCEPT for valid batch
4. 2/3+ threshold is met → batch finalizes
5. If proposer is Byzantine, timeout mechanism triggers (5 seconds)
6. Round increments, next proposer selected (round-robin)
7. Eventually, an honest proposer is selected (≤ f rounds)
8. Honest proposer finalizes batch → liveness guaranteed ∎

### 14.3 Assumptions for Safety & Liveness

1. **Cryptographic Assumptions:** ECDSA and SHA-256 are secure
2. **Network Assumptions:** Messages eventually delivered (bounded delays)
3. **Byzantine Tolerance:** At most f = (N-1)/3 validators are malicious
4. **Validator Behavior:** Honest validators follow protocol exactly
5. **Time Synchronization:** Validators have synchronized clocks (±1 second)

---

## 15. Edge Cases

### 15.1 All Proofs Invalid

**Scenario:** Proposer creates ProofBatch with all invalid proofs

**Handling:**
- All honest validators vote REJECT in pre-vote phase
- <2/3 ACCEPT votes → pre-commit phase not reached
- Timeout triggers after 3 seconds
- Round increments, next proposer selected

### 15.2 Partial Proof Invalidity

**Scenario:** ProofBatch contains mix of valid and invalid proofs

**Handling:**
- Honest validators vote REJECT (batch validation is all-or-nothing)
- Proposer is penalized for including invalid proofs (30% slash)
- Timeout triggers, next proposer selected
- Invalid proofs are discarded from mempool

### 15.3 Validator Set Changes During Consensus

**Scenario:** Validator registration/deactivation during active round

**Handling:**
- Validator set changes only applied at epoch boundaries
- Active round continues with current validator set
- New validator set activates after finalization of epoch-ending batch

### 15.4 Simultaneous Timeouts

**Scenario:** Multiple timeout conditions occur simultaneously

**Handling:**
- Validators prioritize proposer timeout (most critical)
- Round increments once per timeout event (not multiple times)
- State machine resets to PROPOSE

### 15.5 Byzantine Proposer

**Scenario:** Proposer creates valid ProofBatch but refuses to broadcast

**Handling:**
- Proposer timeout triggers after 5 seconds
- Validators signal timeout (2/3+ threshold)
- Round increments, next proposer selected
- Original proposer NOT slashed (could be network issue)

### 15.6 Network Partition Recovery

**Scenario:** Network partition heals, validators re-connect

**Handling:**
1. Validators exchange latest finalized batch heights
2. Validators with lower height request sync (batch history)
3. Validators verify batch continuity via previousBatchHash
4. Validators resume consensus from latest finalized batch
5. Any pending proposals for outdated rounds are discarded

---

## 16. References

### 16.1 Consensus Protocols

1. **Tendermint BFT**
   - Kwon, Jae. "Tendermint: Consensus without Mining." (2014)
   - https://tendermint.com/docs/

2. **HotStuff**
   - Yin, Maofan, et al. "HotStuff: BFT Consensus in the Lens of Blockchain." (2018)
   - https://arxiv.org/abs/1803.05069

3. **PBFT (Practical Byzantine Fault Tolerance)**
   - Castro, Miguel, and Barbara Liskov. "Practical Byzantine Fault Tolerance." (1999)
   - https://pmg.csail.mit.edu/papers/osdi99.pdf

4. **Casper FFG**
   - Buterin, Vitalik, and Virgil Griffith. "Casper the Friendly Finality Gadget." (2017)
   - https://arxiv.org/abs/1710.09437

### 16.2 STEP Blockchain Documentation

- `ARCHITECTURE.md` - System architecture overview
- `PHASE3_EXECUTION_PLAN.md` - Multi-validator consensus implementation roadmap
- `ROADMAP.md` - Project timeline and milestones
- `VALIDATOR_GUIDE.md` - Validator setup and operations (to be created)
- `P2P_PROTOCOL.md` - P2P network specification (to be created)

### 16.3 Cryptographic Standards

- **EIP-191:** Signed Data Standard (Ethereum message signing)
- **secp256k1:** Elliptic curve for ECDSA signatures
- **SHA-256:** Cryptographic hash function

---

## Revision History

| Version | Date | Changes | Author |
|---------|------|---------|--------|
| 0.3.1 | 2025-10-05T14:56:15.000Z | Initial draft of PoLC-BFT specification | AI Developer |

---

**End of CONSENSUS_SPEC.md**
