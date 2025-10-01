/**
 * env.js
 * What: Centralized environment access with minimal validation.
 * Why: Single source of truth and clear errors, without adding new deps.
 */
export function getEnv() {
  const ttl = parseInt(process.env.BLOCKMASS_HEARTBEAT_TTL_SECONDS || "60", 10);
  // What: Canonicalize DB env to MONGODB_URI only.
  // Why: Prevent ambiguity between multiple keys; aligns local and Vercel.
  const mongodbUri = process.env.MONGODB_URI || "";
  return {
    MONGODB_URI: mongodbUri,

    ADMIN_API_TOKEN: process.env.ADMIN_API_TOKEN || "",
    BLOCKMASS_HEARTBEAT_TTL_SECONDS: Number.isFinite(ttl) && ttl > 0 ? ttl : 60,
    NEXT_PUBLIC_APP_VERSION: process.env.NEXT_PUBLIC_APP_VERSION || "v0.0.0",
    NEXT_PUBLIC_APP_NAME: process.env.NEXT_PUBLIC_APP_NAME || "Blockmass",
  };
}

export function requireEnvVar(name) {
  const val = process.env[name];
  if (!val) throw new Error(`${name} not set`);
  return val;
}
