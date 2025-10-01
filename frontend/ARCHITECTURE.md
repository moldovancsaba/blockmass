# ARCHITECTURE

<!--VERSION_INFO_START-->
Current Version: v0.9.0 (synced 2025-10-01T09:11:46.081Z)
<!--VERSION_INFO_END-->

Updated (UTC): 2025-09-28T08:27:26.000Z

Current System Overview:
- Framework: Next.js (App Router) — Runtime: nodejs (Node >=18.18.0 or >=20; currently local v22.19.0)
- Data: MongoDB via Mongoose (single DB: blockmass)
- Realtime: Connection counter via API fallback (socket health endpoint)
- Chain: Native JSON-RPC provider (server-only) via fetch, exposed at GET /api/chain; optional ERC20 sample read (totalSupply) when CHAIN_SAMPLE_ERC20 is set
- UI: Minimal dashboard at /admin/health without breadcrumbs (policy-compliant)

Repository Layout and Roles:
- / (root): package.json with delegated scripts (postinstall/dev/build/start) that call into ./frontend using `npm -C`. No root dependencies or build artifacts.
- /frontend: Next.js application, package.json with version automation and scripts.

Component Details (role, dependencies, status):
- app/_lib/db.js — role: cached Mongoose connector; deps: mongoose; status: active
- app/_lib/metrics.js — role: in-memory metrics store; deps: none; status: active (serverless-aware)
- app/_lib/chain.js — role: minimal JSON-RPC provider; deps: fetch; status: active (supports eth_call and optional ERC20 totalSupply demo)
- app/api/chain/route.js — role: chain health endpoint; deps: chain provider; status: active
- app/api/socket/route.js — role: health ops for connection counter; deps: metrics; status: active
- app/admin/health/api/route.js — role: admin health aggregator; deps: db, metrics, chain; status: active
- app/admin/health/page.jsx — role: dashboard UI; deps: StatusCard; status: active

Notes:
- Turbopack root is explicitly set in frontend/next.config.mjs to avoid workspace-root inference warnings when multiple lockfiles exist (root and frontend).
- Global cache is used for Mongoose to avoid multiple connections across hot reloads (resource-preserving in dev/serverless).
- Chain env keys (server-only): CHAIN_RPC_URL or CHAIN_RPC_URLS, CHAIN_RPC_SERIALIZE, CHAIN_ID, CHAIN_EXPLORER; optional CHAIN_SAMPLE_ERC20 and CHAIN_SAMPLE_ERC20_DECIMALS. Provider reads process.env directly in server code.
- All timestamps should be ISO 8601 with milliseconds (UTC) across logs and docs.
