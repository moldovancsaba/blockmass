/**
 * env.js
 * What: Centralized environment access with minimal validation.
 * Why: Single source of truth and clear errors, without adding new deps.
 */
export function getEnv() {
  const ttl = parseInt(process.env.BLOCKMASS_HEARTBEAT_TTL_SECONDS || "60", 10);
  const mongodbUri = process.env.MONGODB_URI || process.env.MONGO_URI || ""; // MONGO_URI is deprecated fallback
  const mongoDeprecatedFallback = Boolean(!process.env.MONGODB_URI && process.env.MONGO_URI);
  return {
    // Canonical key (preferred everywhere in docs):
    MONGODB_URI: mongodbUri,
    // Deprecated legacy key (exposed only for visibility; avoid using in new code):
    MONGO_URI: process.env.MONGO_URI || "",
    MONGO_URI_DEPRECATED_IN_USE: mongoDeprecatedFallback,

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
