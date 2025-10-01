/**
 * env.js
 * What: Centralized environment access with minimal validation.
 * Why: Single source of truth and clear errors, without adding new deps.
 */
import { log } from "@/app/_lib/logger";

function hasAnyRpcUrl() {
  const urls = (process.env.CHAIN_RPC_URLS || process.env.CHAIN_RPC_URL || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return urls.length > 0;
}

export function bootValidateEnv() {
  // Validate once per process to avoid noisy logs
  if (global.__bm_env_validated__) return true;
  global.__bm_env_validated__ = true;

  const missing = [];
  if (!process.env.MONGODB_URI) missing.push("MONGODB_URI");
  if (!process.env.CHAIN_ID) missing.push("CHAIN_ID");
  if (!hasAnyRpcUrl()) missing.push("CHAIN_RPC_URLS");

  if (missing.length === 0) {
    // Warn once if ADMIN_API_TOKEN is not set (admin routes will 401)
    if (!process.env.ADMIN_API_TOKEN && !global.__bm_admin_token_warned__) {
      global.__bm_admin_token_warned__ = true;
      log("warn", "admin_token_missing", {
        hint: "Admin metrics require X-Admin-Token header; set ADMIN_API_TOKEN",
      });
    }
    return true;
  }

  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";
  if (isProd) {
    log("error", "env_missing", { keys: missing });
    return false;
  }
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
}

// Validate at module load to fail fast in dev; warn once in prod
bootValidateEnv();

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
