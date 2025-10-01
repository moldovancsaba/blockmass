# ROADMAP

<!--VERSION_INFO_START-->
Current Version: v0.18.0 (synced 2025-10-01T12:16:13.410Z)
<!--VERSION_INFO_END-->

Planning timestamp (UTC): 2025-09-28T08:27:26.000Z
Author: AI (Agent Mode)

Guidelines:
- Forward-looking items only (no history)
- Group by Quarter/Milestone
- Include priorities and dependencies

## Q4 2025 — Health Dashboard and Foundation

Priority: High
- Chain read-only endpoints: /api/chain/block, /api/chain/tx, /api/chain/balance (no-store; validate inputs; reuse provider)
- RPC visibility: expose pinned usedEndpoint and pin expiration in admin UI
- Env guardrails: assert MONGODB_URI, CHAIN_ID, and at least one CHAIN_RPC_URLS on boot (clear messages)
- Version automation (predev patch, minor before commit) — dependency: Node scripts

Deployment Note:
- Deployments are managed via GitHub. Do not add or modify Vercel config.

Priority: Medium
- Admin health API endpoints (public/metrics/deep) improvements — dependency: env token protection
- Heartbeat mode for active connections (Vercel-friendly) — dependency: HealthPing model, TTL index
- Socket mode for local/dev realtime counter — dependency: Node runtime
- WARP onboarding documentation maintenance (keep WARP.md aligned with architecture and releases) — dependency: versioning scripts and governance rules

Priority: Low
- Minimal wallet connect (EIP-1193) and basic contract calls without adding frameworks — dependency: UX approval
- Optional on-chain event indexing to MongoDB using scheduled serverless jobs — dependency: cron availability

Milestone Dependencies:
- M1: Version automation → M2: Health endpoints → M3: Realtime modes → M4: Read-only chain data → M5: Optional indexing/wallet
