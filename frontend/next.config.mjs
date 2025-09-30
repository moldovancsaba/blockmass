/** @type {import('next').NextConfig} */
// What: Explicitly set Turbopack root to the project directory (process.cwd()).
// Why: Prevents Next.js from inferring a workspace root when multiple lockfiles exist,
//      eliminating noisy warnings during build.
const nextConfig = {
  turbopack: {
    // __dirname is not available in ESM; process.cwd() resolves to the Next project dir
    root: process.cwd(),
  },
};

export default nextConfig;
