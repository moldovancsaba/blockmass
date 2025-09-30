# WARP.md

This file provides guidance to WARP (warp.dev) when working with code in this repository.

Repository layout and runtimes
- Root delegates all scripts to ./frontend via npm -C. Work from repo root unless otherwise noted.
- App: Next.js (App Router), Node runtime (>=18.18 or >=20). Next 15, React 19. Data: MongoDB via Mongoose. Realtime: in-memory counters + optional TTL-backed heartbeat. Chain: native JSON-RPC over fetch (no extra libs).

Common commands (from repo root)
- Install: npm install
  • postinstall runs npm -C frontend install
- Dev: npm run dev
  • Triggers predev → npm run version:patch in ./frontend, then next dev --turbopack
- Build: npm run build
- Start (after build): npm run start

Versioning utilities (run in ./frontend when needed)
- npm run version:patch — increments PATCH and syncs docs/env (auto-runs before dev)
- npm run version:minor — increments MINOR and resets PATCH to 0; syncs docs/env
- npm run version:major — increments MAJOR and resets MINOR/PATCH; syncs docs/env
- npm run setup:env — scaffolds .env.local from .env.example if present (else create .env.local manually)

Environment (create frontend/.env.local)
- Mongo (required): MONGODB_URI — database: blockmass
- Admin auth (for metrics endpoint): ADMIN_API_TOKEN
- Heartbeat TTL (optional): BLOCKMASS_HEARTBEAT_TTL_SECONDS (default 60)
- UI version (auto-managed): NEXT_PUBLIC_APP_VERSION (written by sync script)
- Chain (server-only):
  • CHAIN_RPC_URL — JSON-RPC HTTPS endpoint (e.g., https://cloudflare-eth.com)
  • CHAIN_ID — decimal chain id (as string)
  • CHAIN_EXPLORER — base URL for links
  • Optional demo: CHAIN_SAMPLE_ERC20, CHAIN_SAMPLE_ERC20_DECIMALS

Quick verification endpoints (while dev server is running)
- UI dashboard: http://localhost:3000/admin/health
- Public health: curl http://localhost:3000/api/health/public
- Chain summary: curl http://localhost:3000/api/chain
- Admin metrics (requires header):
  • curl -H "X-Admin-Token: <ADMIN_API_TOKEN>" http://localhost:3000/api/health/metrics
- Heartbeat (POST JSON; returns active count within TTL window):
  • curl -X POST http://localhost:3000/api/health/heartbeat \
      -H "content-type: application/json" \
      -d '{"clientId":"dev-123","meta":{"env":"local"}}'

High-level architecture and flow
- Core libs (frontend/app/_lib)
  • db.js — cached Mongoose connector; accepts MONGO_URI or MONGODB_URI; exports dbHealth() for status
  • metrics.js — in-memory metrics store with incClients/decClients and uptimeSeconds()
  • chain.js — native JSON-RPC provider (rpc, ethCall, getChainId, getBlockNumber, getBalance, getErc20TotalSupply, health)
  • env.js — centralized env access; exposes validated keys for server and client-safe version
  • logger.js — ISO 8601 UTC (with milliseconds) structured logs
- Data models (frontend/app/_models)
  • HealthPing.js — TTL-indexed heartbeat pings (active users by recent lastSeen)
  • SocketStat.js — document schema for socket/heartbeat counts (used for historical snapshots if desired)
- API routes (frontend/app/api)
  • /api/health/public — status and version (uses env.js)
  • /api/health/metrics — admin-protected metrics (X-Admin-Token); combines db health, heartbeat counts, uptime, memory, version
  • /api/health/heartbeat (POST) — upserts client ping, returns active user count within TTL window
  • /api/socket — simple connect/disconnect ops updating in-memory counters
  • /api/chain — chain health summary via chain.js (Node runtime)
- UI
  • /admin/health — server component that aggregates dbHealth(), metrics, and chain.health(); renders StatusCard components
  • Home (/) mirrors health snapshot for quick visibility
- Build configuration
  • frontend/next.config.mjs sets turbopack.root = process.cwd() to avoid workspace-root inference warnings when multiple lockfiles exist

Governance highlights that affect terminal work
- Versioning and release protocol
  • Before dev: patch bump happens automatically (predev)
  • Before commit to GitHub: bump MINOR and reset PATCH to 0 (npm run version:minor), then sync docs and env
  • Major only when explicitly instructed; follow Major Update Protocol
  • Keep README.md, ROADMAP.md, TASKLIST.md, ARCHITECTURE.md, LEARNINGS.md, RELEASE_NOTES.md in sync with the current version
- Mandatory plan logging
  • Record planning/delivery notes with ISO 8601 (UTC with milliseconds) timestamps in ROADMAP.md and WARP.DEV_AI_CONVERSATION.md; ensure TASKLIST.md reflects active/upcoming items
- Timestamp format
  • Always ISO 8601 with milliseconds in UTC (YYYY-MM-DDTHH:MM:SS.sssZ)
- Tests
  • Tests are prohibited by policy; there are no test commands. Validate via endpoints and UI.
- UI policy
  • No breadcrumbs. Maintain high-contrast styles (black/white only) as implemented.
- Reuse-before-creation and stack compliance
  • Prefer extending existing libs and patterns in app/_lib and API routes over adding dependencies

Notes
- The root package.json delegates all npm scripts into ./frontend. Prefer running npm install/dev/build/start from repo root.
- If .env.example is missing, create frontend/.env.local manually with the keys above.

Compliance and follow-ups for this change (not executed here)
- Add a dated entry (ISO 8601 with ms) to frontend/WARP.DEV_AI_CONVERSATION.md noting that WARP.md was added.
- Update ROADMAP.md and TASKLIST.md per Mandatory Task Delivery Logging.
- Since this is a docs-only change, bump MINOR (npm -C frontend run version:minor) to keep protocol compliance, then sync docs.
- Verify build and basic dev boot before commit (npm run build; optional quick dev smoke), then commit with a versioned message and push.
