# ARCHITECTURE

<!--VERSION_INFO_START-->
Current Version: v0.20.0 (synced 2025-10-02T10:45:20.584Z)
<!--VERSION_INFO_END-->

Updated (UTC): 2025-09-28T08:27:26.000Z

Current System Overview:
- Framework: Next.js (App Router) — Runtime: nodejs (Node >=18.18.0 or >=20; currently local v22.19.0)
- Data: MongoDB via Mongoose (single DB: blockmass)
- Realtime: Connection counter via API fallback (socket health endpoint)
- Chain: Native JSON-RPC provider (server-only) via fetch, exposed at GET /api/chain; read-only endpoints at /api/chain/block, /api/chain/tx, /api/chain/balance; optional ERC20 sample read (totalSupply)
- UI: Minimal dashboard at /admin/health without breadcrumbs (policy-compliant)

Repository Layout and Roles:
- / (root): package.json with delegated scripts (postinstall/dev/build/start) that call into ./frontend using `npm -C`. No root dependencies or build artifacts.
- /frontend: Next.js application, package.json with version automation and scripts.

Component Details (role, dependencies, status):
- app/_lib/db.js — role: cached Mongoose connector; deps: mongoose; status: active
- app/_lib/metrics.js — role: in-memory metrics store; deps: none; status: active (serverless-aware)
- app/_lib/chain.js — role: minimal JSON-RPC provider; deps: fetch; status: active (supports eth_call; failover, pinning, telemetry)
- app/api/chain/route.js — role: chain health endpoint; deps: chain provider; status: active
- app/api/chain/block/route.js — role: read-only block fetch; deps: chain provider; status: active (validated; no-store)
- app/api/chain/tx/route.js — role: read-only tx fetch; deps: chain provider; status: active (validated; no-store)
- app/api/chain/balance/route.js — role: read-only balance; deps: chain provider; status: active (validated; no-store)
- app/api/socket/route.js — role: health ops for connection counter; deps: metrics; status: active
- app/admin/health/api/route.js — role: admin health aggregator; deps: db, metrics, chain; status: active (structured logs on admin header)
- app/admin/health/page.jsx — role: dashboard UI; deps: StatusCard; status: active

Notes:
- Turbopack root is explicitly set in frontend/next.config.mjs to avoid workspace-root inference warnings when multiple lockfiles exist (root and frontend).
- Global cache is used for Mongoose to avoid multiple connections across hot reloads (resource-preserving in dev/serverless).
- Chain env keys (server-only): CHAIN_RPC_URLS (canonical) or CHAIN_RPC_URL (legacy), CHAIN_RPC_SERIALIZE, CHAIN_ID, CHAIN_EXPLORER; optional CHAIN_SAMPLE_ERC20 and CHAIN_SAMPLE_ERC20_DECIMALS. Provider reads process.env directly in server code.
- Provider behavior: retry on transient errors, multi-endpoint failover, endpoint pinning (120s), telemetry (usedEndpoint, attempts, lastErrorCode, pinExpiresAt) used in UI.
- Admin routes log a single structured line only with admin header; public routes never log secrets.
- All timestamps should be ISO 8601 with milliseconds (UTC) across logs and docs.
