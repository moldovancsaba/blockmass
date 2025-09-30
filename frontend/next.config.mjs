/** @type {import('next').NextConfig} */
// What: Locally, set Turbopack root to the project directory (process.cwd()) to avoid workspace-root warnings.
// Why: Prevents Next.js from inferring a workspace root when multiple lockfiles exist.
// Note: Disabled on Vercel to avoid mismatch with outputFileTracingRoot.
const isVercel = !!process.env.VERCEL;
const nextConfig = {
  ...(isVercel ? {} : { turbopack: { root: process.cwd() } }),
};

export default nextConfig;
