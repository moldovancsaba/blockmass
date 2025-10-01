/**
 * Minimal blockchain provider abstraction with native JSON-RPC over fetch.
 * No extra libraries. Works on Vercel Node runtime and locally.
 * 
 * ENV:
 * - CHAIN_RPC_URL: JSON-RPC HTTPS endpoint (e.g. https://cloudflare-eth.com)
 * - CHAIN_RPC_URLS: optional comma-separated list of RPC URLs to try on transient errors (first is primary)
 * - CHAIN_RPC_SERIALIZE: optional boolean ("true"/"1") to force serial execution of all RPC requests; defaults on for cloudflare-eth.com
 * - CHAIN_ID: decimal chain id as string (e.g. "1")
 * - CHAIN_EXPLORER: optional explorer base URL for links
 * - CHAIN_SAMPLE_ERC20: optional ERC20 address for demo read-only calls
 * - CHAIN_SAMPLE_ERC20_DECIMALS: optional decimals for formatting (default 18)
 */

// Read provider URLs: allow CHAIN_RPC_URLS (comma-separated) or single CHAIN_RPC_URL.
const RPC_URLS = (process.env.CHAIN_RPC_URLS || process.env.CHAIN_RPC_URL || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

// Keep the first URL for reporting/debugging; legacy name preserved for response shape
const RPC_URL = RPC_URLS[0];

const DECLARED_CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;
const EXPLORER = process.env.CHAIN_EXPLORER || null;
const SAMPLE_ERC20 = process.env.CHAIN_SAMPLE_ERC20 || null;
const SAMPLE_ERC20_DECIMALS = process.env.CHAIN_SAMPLE_ERC20_DECIMALS ? Number(process.env.CHAIN_SAMPLE_ERC20_DECIMALS) : 18;

// Determine whether to serialize RPC calls (single-flight) to avoid provider rejections like -32046 on Cloudflare.
const SERIALIZE_RPC = (() => {
  const flag = String(process.env.CHAIN_RPC_SERIALIZE || "").toLowerCase();
  if (flag === "1" || flag === "true") return true;
  try {
    const host = RPC_URL ? new URL(RPC_URL).host : "";
    return host.includes("cloudflare-eth.com");
  } catch (_) {
    return false;
  }
})();

// Simple single-flight queue. Why: Some providers reject closely parallel POSTs; queueing improves reliability without deps.
let rpcQueue = Promise.resolve();
function runSerialized(task) {
  const p = rpcQueue.then(task, task);
  // Keep the queue from rejecting and breaking the chain
  rpcQueue = p.catch(() => {});
  return p;
}

// Endpoint pinning to prefer a recently-successful URL for a short window.
// Why: Reduces cross-provider latency variance and avoids per-request flapping while still failing over on errors.
const PIN_TTL_MS = 120_000; // 2 minutes
let PINNED_URL = null;
let PINNED_AT = 0;
function isPinFresh() {
  return PINNED_URL && (Date.now() - PINNED_AT) < PIN_TTL_MS;
}
function setPin(url) {
  PINNED_URL = url;
  PINNED_AT = Date.now();
}

// Telemetry for last RPC execution (for health JSON)
let LAST_USED_ENDPOINT = null;
let LAST_ATTEMPTS_TOTAL = 0;
let LAST_ERROR_CODE = null;

/** Convert hex (0x...) to integer safely. */
function hexToInt(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) return NaN;
  return parseInt(hex, 16);
}

/** Convert hex (0x...) to BigInt safely. */
function hexToBigInt(hex) {
  if (typeof hex !== "string" || !hex.startsWith("0x")) throw new Error("invalid hex");
  return BigInt(hex);
}

/** Format BigInt units to decimal string. */
function formatUnits(bi, decimals) {
  const neg = bi < 0n;
  const base = 10n ** BigInt(decimals);
  const n = neg ? -bi : bi;
  const whole = n / base;
  const frac = n % base;
  const fracStr = frac.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${neg ? "-" : ""}${whole.toString()}${fracStr ? "." + fracStr : ""}`;
}

/** JSON-RPC core once helper with basic timeout. */
async function rpcOnceWithUrl(url, method, params = [], { timeoutMs = 8000 } = {}) {
  if (!url) throw new Error("CHAIN_RPC_URL not set");
  const body = { jsonrpc: "2.0", id: Date.now(), method, params };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        // Provide a simple UA for providers that behave differently without it
        "user-agent": "blockmass-jsonrpc/1",
      },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const err = new Error(`RPC HTTP ${res.status} ${res.statusText} ${txt}`);
      err.httpStatus = res.status;
      err.rpcUrl = url;
      throw err;
    }
    const data = await res.json();
    if (data.error) {
      const err = new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
      err.rpcCode = data.error.code;
      err.rpcUrl = url;
      throw err;
    }
    return data.result;
  } finally {
    clearTimeout(t);
  }
}

/** JSON-RPC helper with retry and multi-endpoint fallback for transient errors.
 * Adds lightweight pinning: prefer the last successful endpoint for PIN_TTL_MS.
 */
async function rpcCore(method, params = [], { timeoutMs = 8000, attempts = 3 } = {}) {
  if (!RPC_URLS.length) throw new Error("CHAIN_RPC_URL not set");

  // Build tryOrder: pinned first (if fresh), then remaining endpoints in configured order
  const urls = RPC_URLS.slice();
  const tryOrder = isPinFresh() ? [PINNED_URL, ...urls.filter((u) => u !== PINNED_URL)] : urls;

  let lastErr;
  LAST_USED_ENDPOINT = null;
  LAST_ATTEMPTS_TOTAL = 0;
  LAST_ERROR_CODE = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    for (let idx = 0; idx < tryOrder.length; idx++) {
      const url = tryOrder[idx];
      try {
        const result = await rpcOnceWithUrl(url, method, params, { timeoutMs });
        LAST_USED_ENDPOINT = url;
        LAST_ERROR_CODE = null;
        setPin(url);
        return result;
      } catch (e) {
        lastErr = e;
        LAST_ATTEMPTS_TOTAL += 1;
        const code = e?.rpcCode;
        const http = e?.httpStatus;
        const transient = code === -32046 || code === -32603 || http === 429 || (http >= 500 && http < 600);
        LAST_ERROR_CODE = code ?? http ?? 'unknown';
        // If not transient, fail fast
        if (!transient) throw e;
        // Otherwise continue to next URL in list
      }
    }
    // backoff with jitter between attempts: ~300ms → ~900ms
    const base = attempt === 0 ? 300 : 900;
    const jitter = Math.floor(Math.random() * 120);
    await new Promise((r) => setTimeout(r, base + jitter));
  }
  throw lastErr;
}

async function rpc(method, params = [], { timeoutMs = 8000, attempts = 3 } = {}) {
  const exec = () => rpcCore(method, params, { timeoutMs, attempts });
  return SERIALIZE_RPC ? runSerialized(exec) : exec();
}

/** Raw eth_call helper. */
export async function ethCall(to, data, blockTag = "latest") {
  if (!/^0x[a-fA-F0-9]{40}$/.test(to || "")) throw new Error("Invalid to address");
  if (typeof data !== "string" || !data.startsWith("0x")) throw new Error("Invalid data hex");
  return rpc("eth_call", [{ to, data }, blockTag]);
}

/** Public API: safe wrappers that return structured results. */
export async function getChainId() {
  const hex = await rpc("eth_chainId");
  const id = hexToInt(hex);
  return { chainId: id, hex };
}

export async function getBlockNumber() {
  const hex = await rpc("eth_blockNumber");
  const number = hexToInt(hex);
  return { number, hex };
}

export async function getBalance(address) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address || "")) {
    throw new Error("Invalid address format");
  }
  const hex = await rpc("eth_getBalance", [address, "latest"]);
  const wei = hexToBigInt(hex);
  return { wei, hex };
}

/** ERC20 totalSupply(address) read-only call. */
export async function getErc20TotalSupply(address, decimals = 18) {
  if (!/^0x[a-fA-F0-9]{40}$/.test(address || "")) throw new Error("Invalid ERC20 address");
  const selector = "0x18160ddd"; // keccak256(totalSupply()) first 4 bytes
  const hex = await ethCall(address, selector);
  const bi = hexToBigInt(hex);
  return { hex, value: bi, decimals, formatted: formatUnits(bi, decimals) };
}

/**
 * Health summary combining basic liveness checks.
 * Does not throw; always returns { ok, ... } structure.
 *
 * Note: Some public RPC providers (e.g., Cloudflare) may rate-limit or reject
 * closely parallel requests. To improve reliability, we perform calls
 * sequentially with a tiny delay between them.
 */
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export async function chainHealth() {
  try {
    // Sequential calls to reduce provider rejections like -32046 "Cannot fulfill request"
    const cid = await getChainId();
    await sleep(50);
    const blk = await getBlockNumber();
    const declared = DECLARED_CHAIN_ID ?? null;
    const matchesDeclared = declared ? declared === cid.chainId : null;

    let sample = null;
    if (SAMPLE_ERC20) {
      try {
        const res = await getErc20TotalSupply(SAMPLE_ERC20, SAMPLE_ERC20_DECIMALS);
        sample = {
          address: SAMPLE_ERC20,
          totalSupplyHex: res.hex,
          totalSupply: res.value.toString(),
          totalSupplyFormatted: res.formatted,
          decimals: res.decimals,
        };
      } catch (e) {
        sample = { address: SAMPLE_ERC20, error: e.message || "erc20_read_failed" };
      }
    }

    return {
      ok: true,
      rpcUrlConfigured: Boolean(RPC_URL),
      rpcSerialization: SERIALIZE_RPC,
      chainId: cid.chainId,
      chainIdHex: cid.hex,
      declaredChainId: declared,
      chainIdMatchesDeclared: matchesDeclared,
      latestBlock: blk.number,
      latestBlockHex: blk.hex,
      explorerBaseUrl: EXPLORER,
      sampleErc20: sample,
      usedEndpoint: LAST_USED_ENDPOINT,
      attemptsTotal: LAST_ATTEMPTS_TOTAL,
      lastErrorCode: LAST_ERROR_CODE,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message || "unknown",
      rpcUrlConfigured: Boolean(RPC_URL),
      rpcSerialization: SERIALIZE_RPC,
      declaredChainId: DECLARED_CHAIN_ID ?? null,
      usedEndpoint: LAST_USED_ENDPOINT,
      attemptsTotal: LAST_ATTEMPTS_TOTAL,
      lastErrorCode: LAST_ERROR_CODE,
    };
  }
}

/**
 * Provider facade you can extend later (sendRawTransaction, getTransaction, etc).
 * Keeping signatures minimal for now.
 */
export const provider = {
  rpc,
  ethCall,
  getChainId,
  getBlockNumber,
  getBalance,
  getErc20TotalSupply,
  health: chainHealth,
};
