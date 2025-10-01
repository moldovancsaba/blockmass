# TASKLIST

<!--VERSION_INFO_START-->
Current Version: v0.18.0 (synced 2025-10-01T12:16:13.410Z)
<!--VERSION_INFO_END-->

Updated (UTC): 2025-09-28T08:27:26.000Z
Note: Completed tasks must be moved to RELEASE_NOTES.md with the release entry.

Sorted by priority:

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
