# TASKLIST

<!--VERSION_INFO_START-->
Current Version: v0.21.57 (synced 2025-10-08T08:27:30.366Z)
<!--VERSION_INFO_END-->

Updated (UTC): 2025-09-28T08:27:26.000Z
Note: Completed tasks must be moved to RELEASE_NOTES.md with the release entry.

Sorted by priority:

- 2025-10-02T10:36:25.000Z — Phase 2 (Manual Anchoring) tasks added.

A) Title: Admin simulation endpoint for anchoring (/api/anchor/run)
   Owner: core
   Expected Delivery: 2025-10-02T12:00:00.000Z
   Details: Mark queued events as sent; protect with X-Admin-Token; no keys on Vercel.

B) Title: Deploy BlockmassAnchor (Sepolia)
   Owner: operator
   Expected Delivery: 2025-10-03T12:00:00.000Z
   Details: Compile and deploy; record ANCHOR_CONTRACT_ADDRESS; no hot keys in server.

C) Title: Configure env ANCHOR_CONTRACT_ADDRESS (Vercel)
   Owner: operator
   Expected Delivery: 2025-10-03T15:00:00.000Z
   Details: Add contract address to env after deploy; no commits with secrets.

D) Title: Switch /api/anchor/run to real tx send
   Owner: core
   Expected Delivery: 2025-10-04T12:00:00.000Z
   Details: Use provider and a safe signing method (manual or external) to call BlockmassAnchor.anchor when ready.

- 2025-10-01T12:40:35.000Z — Off-chain Proof MVP tasks added (owner: core). All timelines in UTC with milliseconds.

1) Title: Data models for Off-chain Proof (Topic, Task, Event, Nonce)
   Owner: core
   Expected Delivery: 2025-10-01T16:00:00.000Z
   Details: Implement Mongoose models under app/_models with indexes and timestamps.

2) Title: Utilities: geohash5 and canonical hashing
   Owner: core
   Expected Delivery: 2025-10-01T16:30:00.000Z
   Details: Minimal geohash encoder and canonicalEvent (SHA-256) without external deps.

3) Title: API: POST /api/attest/nonce
   Owner: core
   Expected Delivery: 2025-10-01T17:00:00.000Z
   Details: Issue nonce with 5-minute TTL (Mongo TTL index), crypto.randomUUID IDs.

4) Title: API: POST /api/events (store + broadcast)
   Owner: core
   Expected Delivery: 2025-10-01T17:30:00.000Z
   Details: Validate nonce, compute contentHash, persist Event, mark nonce used, emit event:new over Socket.IO.

5) Title: API: GET /api/events/list
   Owner: core
   Expected Delivery: 2025-10-01T18:00:00.000Z
   Details: Return last 50 events with safe projection.

6) Title: Socket.IO bootstrap route
   Owner: core
   Expected Delivery: 2025-10-01T18:15:00.000Z
   Details: Ensure server instance exposes globalThis._io for cross-route emits.

7) Title: Dev UI page (/dev)
   Owner: core
   Expected Delivery: 2025-10-01T18:45:00.000Z
   Details: Nonce+record flow with geolocation and live updates.

8) Title: Admin endpoint: POST /api/events/anchor
   Owner: core
   Expected Delivery: 2025-10-01T19:15:00.000Z
   Details: Operator posts txHash and usedEndpoint; optional verify (JSON-RPC receipt) to set blockNumber and status.

9) Title: Docs and governance logging
   Owner: core
   Expected Delivery: 2025-10-01T19:30:00.000Z
   Details: Update WARP.DEV_AI_CONVERSATION.md, ROADMAP.md, TASKLIST.md with ISO timestamps.

1) Title: RPC visibility (pin info in admin UI)
   Owner: AI
   Expected Delivery: 2025-10-01T17:00:00.000Z
   Details: Show usedEndpoint and pin expiration on Chain card subtitle in /admin/health.

2) Title: Env guardrails on boot
   Owner: AI
   Expected Delivery: 2025-10-01T17:00:00.000Z
   Details: Show usedEndpoint and pin expiration on Chain card subtitle in /admin/health.

3) Title: Env guardrails on boot
   Owner: AI
   Expected Delivery: 2025-10-01T18:00:00.000Z
   Details: Assert MONGODB_URI, CHAIN_ID, CHAIN_RPC_URLS; fail fast in Dev; warn single line in Prod.

4) Title: Docs update & release planning to v0.12.0
   Owner: AI
   Expected Delivery: 2025-10-01T19:00:00.000Z
   Details: README policy on TTL Active Users; WARP deployment via GitHub; RELEASE_NOTES.md draft for v0.12.0.

5) Title: Admin token boot check (warn-only)
   Owner: AI
   Expected Delivery: 2025-10-01T19:30:00.000Z
   Details: Warn (do not crash) if ADMIN_API_TOKEN missing when admin routes exist.

6) Title: Native JSON-RPC provider + Chain health integration
   Owner: AI
   Expected Delivery: 2025-09-28T12:00:00.000Z
   Details: Add app/_lib/chain.js, /api/chain, and wire dashboard; no new libs.

2) Title: Documentation update for Blockchain Mode
   Owner: AI
   Expected Delivery: 2025-09-28T12:30:00.000Z
   Details: README, ROADMAP, TASKLIST, ARCHITECTURE, RELEASE_NOTES, WARP.DEV_AI_CONVERSATION.

3) Title: Version bump and sync to v0.3.0
   Owner: AI
   Expected Delivery: 2025-09-28T13:00:00.000Z
   Details: Use npm run version:minor; check badges and env sync.

4) Title: Admin health APIs expansion (public/metrics/deep with admin token)
   Owner: AI
   Expected Delivery: 2025-09-29T12:00:00.000Z
   Details: Implement endpoints and protection, reuse existing db connector.

5) Title: Heartbeat mode (Vercel-friendly active user counting)
   Owner: AI
   Expected Delivery: 2025-09-30T12:00:00.000Z
   Details: HealthPing model with TTL index; aggregate count for dashboard.

6) Title: Socket mode for local/dev
   Owner: AI
   Expected Delivery: 2025-10-01T12:00:00.000Z
   Details: Increment/decrement on WebSocket connect/disconnect; periodic snapshots.

7) Title: Maintain WARP.md in sync with architecture and version bumps
   Owner: AI
   Expected Delivery: 2025-10-05T12:00:00.000Z
   Details: Keep WARP.md updated whenever endpoints, scripts, or governance rules change; ensure commands and links remain accurate.
