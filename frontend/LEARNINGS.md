# LEARNINGS

<!--VERSION_INFO_START-->
Current Version: v0.11.0 (synced 2025-10-01T11:06:13.709Z)
<!--VERSION_INFO_END-->

Updated (UTC): 2025-09-27T10:12:29.071Z

- Process: Repository structure places Next.js app under frontend/. Ensure all file operations and documentation paths reflect this to avoid confusion and miswrites.
- Dev: Timestamp enforcement — standardized on new Date().toISOString() for scripts and docs to guarantee ISO 8601 with milliseconds (UTC).
- 2025-09-27T10:12:29.071Z — Build from repo root failed initially due to missing root package.json. Fixed by creating a minimal root package.json that delegates dev/build/start to ./frontend using `npm -C`. Rationale: reuse existing Next app; minimal, non-invasive.
- 2025-09-27T10:12:29.071Z — Next.js warned about inferred workspace root (multiple lockfiles). Fixed by setting `turbopack.root = process.cwd()` in frontend/next.config.mjs to silence the warning reliably under ESM.
- 2025-09-27T10:12:29.071Z — JSX parse error in admin/health page (`items=[...]`). Fixed by using `items={[...]}` to pass an array expression as a prop.
- 2025-09-27T10:41:02.404Z — Duplicate homepage detected (app/page.js and app/page.jsx both mapped to "/"). Resolved by removing app/page.js and keeping app/page.jsx which implements the functional landing page. Rationale: avoid ambiguity and align with current app logic.
- 2025-09-27T10:46:40.975Z — Health API initially required a legacy Mongo env key while .env.local used MONGODB_URI. Interim fix accepted both to unblock development.
- 2025-09-30T11:16:01.000Z — Standardized on MONGODB_URI; removed legacy fallback to eliminate ambiguity across environments.
- 2025-09-27T12:18:29.407Z — Improved UI states: added loading/success/warning/error visuals. StatusCard now supports variant styling; homepage presents friendly status instead of raw JSON. Rationale: immediate clarity on whether the system is healthy and where issues exist.
- 2025-09-30T11:16:01.000Z — Standardized on MONGODB_URI (legacy fallback removed). Rationale: single-source configuration across local and Vercel; clearer onboarding and error messages.
