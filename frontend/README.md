# Blockmass

<!--VERSION_BADGE_START-->
![Version](https://img.shields.io/badge/version-v0.16.0-blue)
Last synced: 2025-10-01T11:26:12.345Z
<!--VERSION_BADGE_END-->

Minimal, rule-compliant foundation:
- Next.js (App Router) on Vercel
- MongoDB + Mongoose
- Socket.io (tracked via API fallback)
- General Dashboard at /admin/health
- Chain health via native JSON-RPC (no new libraries) and public API at /api/chain

## Quick start
From repo root:
1) Set MONGODB_URI in frontend/.env.local
2) npm install
3) npm run dev
4) Open http://localhost:3000 and http://localhost:3000/admin/health

## Blockchain Mode — Native JSON-RPC
What was added:
- Minimal server-side blockchain provider at `app/_lib/chain.js` using `fetch` with JSON-RPC.
- New endpoint `GET /api/chain` returns a chain health summary (chain ID, latest block, config checks).
- Admin dashboard now shows a "Chain" card with real-time status.

Configure (server-only) env in `frontend/.env.local`:
- `CHAIN_RPC_URLS` — comma-separated prioritized list of RPC URLs to try on transient errors (first is primary)
- `CHAIN_RPC_SERIALIZE` — optional boolean ("true"/"1") to force serial execution of RPCs; auto-enabled when using cloudflare-eth.com
- `CHAIN_ID` — decimal chain id as string (default: "1")
- `CHAIN_EXPLORER` — optional explorer base URL (default: https://etherscan.io)

Switch networks:
- Change the above env values, restart dev or redeploy. No code changes required.

Optional demo — ERC20 totalSupply:
- Set CHAIN_SAMPLE_ERC20 and CHAIN_SAMPLE_ERC20_DECIMALS in .env.local (defaults in .env.example use DAI mainnet, 18 decimals).
- The Health Dashboard will show the sample token address and formatted totalSupply when configured.

Security/Compliance:
- No new dependencies. All chain access remains server-side.
- Timestamps and docs comply with ISO 8601 UTC with milliseconds.

## Chain read-only endpoints (no-store)
- GET /api/chain/block?number=latest|0xHEX|DEC — returns block header/fields (validated)
- GET /api/chain/tx?hash=0x... — returns transaction (validated)
- GET /api/chain/balance?address=0x... — returns balance in wei and hex (validated)

## Public health payload
- GET /api/health/public returns:
  - status: ok | degraded | down (db.ok && chain.ok → ok; one false → degraded; both false → down)
  - version, appName, ts (ISO 8601 UTC with milliseconds)
  - db.ok, db.host
  - activeUsers (TTL, canonical)
  - chain.ok, chain.chainId, chain.latestBlock, chain.usedEndpoint

## Active Users policy
- Canonical metric comes from TTL-backed heartbeats in MongoDB (durable and serverless-safe).
- Socket counters are dev/preview aids; hidden in Production.

## Deploy
- Deployments are managed via GitHub. Do not perform Vercel-specific operations or edits; treat vercel.json as legacy.
- After deploy, verify:
  - /admin/health (Mongo, Active Users via TTL, System, Chain)
  - /api/health/public (enriched JSON)
  - /api/chain and the read-only chain endpoints above.
