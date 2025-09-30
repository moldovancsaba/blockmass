# Release Notes

## [v0.7.0] — 2025-09-30T14:49:40.812Z
✅ Improved
- JSON-RPC now retries transient provider errors (-32046, -32603, HTTP 429/5xx) with small jittered backoff (120–320ms)
- Keeps sequential call order in chainHealth to further reduce rejections

## [v0.6.0] — 2025-09-30T14:32:34.836Z
✅ Fixed
- Chain health calls are sequential with a tiny delay to avoid provider errors like Cloudflare RPC “Cannot fulfill request” (-32046)

✅ Notes
- Public RPCs can be rate-limited or reject parallel calls; this change increases reliability without adding dependencies

## [v0.5.0] — 2025-09-30T12:02:59.512Z
✅ Added
- Canonicalized DB env to MONGODB_URI with deprecated MONGO_URI fallback in code
- Real-time Socket.IO server (pages/api/socketio.js) with singleton init; live metrics broadcast
- Live socket panels on Home and /admin/health; kept heartbeat TTL panel for durable active count

✅ Changed
- Removed duplicate default route: kept app/page.jsx; deleted app/page.js
- Clarified next.config.mjs comments (project dir root)
- Updated .gitignore to ignore __MACOSX/

✅ Documentation
- README and WARP updated to emphasize MONGODB_URI and ADMIN_API_TOKEN requirements
- .env.example now authoritative with required keys and optional ERC20 demo

## [v0.4.0] — 2025-09-30T08:44:31.085Z
✅ Added
- WARP.md at repo root: commands, env, architecture, governance highlights for Warp usage

✅ Documentation
- Synced version across README, ROADMAP, TASKLIST, ARCHITECTURE, LEARNINGS via scripts

✅ Notes
- Docs-only change; no runtime code modified

## [v0.3.0] — 2025-09-28T08:27:26.000Z
✅ Added
- Minimal JSON-RPC provider over fetch (no new dependencies)
- New API: GET /api/chain — chain health summary
- Health Dashboard now displays Chain status card

✅ Security/Compliance
- No new libraries; CHAIN_* env introduced (server-only)
- ISO 8601 UTC timestamps with milliseconds across docs

ℹ️ Notes
- Optional ERC20 demo added: when CHAIN_SAMPLE_ERC20 is set, the Health Dashboard displays the token address and formatted totalSupply (via JSON-RPC eth_call).

## [v0.2.0] — 2025-09-27T18:39:35.570Z
✅ Added
- Root-level package.json to delegate dev/build/start to ./frontend
- UI state enhancements: clear loading/success/warning/error feedback (homepage and admin dashboard)
- High-contrast rule enforcement: BLACK on WHITE by default; WHITE on BLACK for errors

✅ Changed
- StatusCard component: variant-aware styling with optional note → now high-contrast only
- Homepage health polling and connect-first flow for socket metrics

✅ Fixed
- JSX parse error in admin health page (prop array syntax)
- Turbopack workspace root warning handled via explicit root in next.config.mjs
- Duplicate homepage route (removed app/page.js)
- Env mismatch: accept both MONGO_URI and MONGODB_URI
- Suppressed npm funding prompt via .npmrc (project-scoped)

✅ Security/Compliance
- No new deps; minimal changes
- ISO 8601 UTC timestamps with ms across docs

## 0.1.0 — 2025-09-26T09:38:06.000Z
✅ New Features
- Next.js skeleton with Health Dashboard (/admin/health)
- MongoDB connection via Mongoose with cached client
- Socket connection counter via API
- Public home mirroring live health data

✅ Fixed Bugs
- n/a

✅ Known Issues
- Socket.io is tracked via API fallback; real-time channels are not yet broadcasting payloads.

✅ Future Roadmap
- Add real Socket.io broadcasts for on-chain events
- Add basic user sessions and role-based access to /admin
- Add blockchain layer (provider abstraction) without extra frameworks


Step 2 — Run locally, then prepare GitHub and Vercel

cd ~/Users/moldovan/Projects/blockmass/frontend
npm run dev


cd ~/Users/moldovan/Projects/blockmass/frontend
git add .
git commit -m "blockmass: 0.1.0 foundation with health dashboard, mongo, socket counter"
gh repo create moldovancsaba/blockmass --public --source=. --remote=origin --push
