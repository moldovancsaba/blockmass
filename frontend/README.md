# Blockmass

<!--VERSION_BADGE_START-->
![Version](https://img.shields.io/badge/version-v0.11.0-blue)
Last synced: 2025-10-01T11:06:13.709Z
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

## Deploy
- Push to GitHub, connect Vercel, add MONGODB_URI, ADMIN_API_TOKEN, and CHAIN_* env in Production/Preview/Development.
- After deploy, verify /admin/health (Mongo, Users, System, Chain) and /api/chain.
