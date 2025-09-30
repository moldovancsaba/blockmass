/**
 * Minimal blockchain provider abstraction with native JSON-RPC over fetch.
 * No extra libraries. Works on Vercel Node runtime and locally.
 * 
 * ENV:
 * - CHAIN_RPC_URL: JSON-RPC HTTPS endpoint (e.g. https://cloudflare-eth.com)
 * - CHAIN_ID: decimal chain id as string (e.g. "1")
 * - CHAIN_EXPLORER: optional explorer base URL for links
 * - CHAIN_SAMPLE_ERC20: optional ERC20 address for demo read-only calls
 * - CHAIN_SAMPLE_ERC20_DECIMALS: optional decimals for formatting (default 18)
 */

const RPC_URL = process.env.CHAIN_RPC_URL;
const DECLARED_CHAIN_ID = process.env.CHAIN_ID ? Number(process.env.CHAIN_ID) : undefined;
const EXPLORER = process.env.CHAIN_EXPLORER || null;
const SAMPLE_ERC20 = process.env.CHAIN_SAMPLE_ERC20 || null;
const SAMPLE_ERC20_DECIMALS = process.env.CHAIN_SAMPLE_ERC20_DECIMALS ? Number(process.env.CHAIN_SAMPLE_ERC20_DECIMALS) : 18;

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
async function rpcOnce(method, params = [], { timeoutMs = 8000 } = {}) {
  if (!RPC_URL) throw new Error("CHAIN_RPC_URL not set");
  const body = { jsonrpc: "2.0", id: Date.now(), method, params };

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(RPC_URL, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      cache: "no-store",
    });

    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      const err = new Error(`RPC HTTP ${res.status} ${res.statusText} ${txt}`);
      err.httpStatus = res.status;
      throw err;
    }
    const data = await res.json();
    if (data.error) {
      const err = new Error(`RPC Error ${data.error.code}: ${data.error.message}`);
      err.rpcCode = data.error.code;
      throw err;
    }
    return data.result;
  } finally {
    clearTimeout(t);
  }
}

/** JSON-RPC helper with small retry against transient provider errors. */
async function rpc(method, params = [], { timeoutMs = 8000, attempts = 3 } = {}) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try {
      return await rpcOnce(method, params, { timeoutMs });
    } catch (e) {
      lastErr = e;
      const code = e?.rpcCode;
      const http = e?.httpStatus;
      const transient = code === -32046 || code === -32603 || http === 429 || (http >= 500 && http < 600);
      if (!transient || i === attempts - 1) break;
      // backoff with jitter: 120ms, 200ms, 320ms (+/- 40ms)
      const base = [120, 200, 320][i] || 320;
      const jitter = Math.floor(Math.random() * 80) - 40;
      await new Promise((r) => setTimeout(r, Math.max(80, base + jitter)));
    }
  }
  throw lastErr;
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
      chainId: cid.chainId,
      chainIdHex: cid.hex,
      declaredChainId: declared,
      chainIdMatchesDeclared: matchesDeclared,
      latestBlock: blk.number,
      latestBlockHex: blk.hex,
      explorerBaseUrl: EXPLORER,
      sampleErc20: sample,
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message || "unknown",
      rpcUrlConfigured: Boolean(RPC_URL),
      declaredChainId: DECLARED_CHAIN_ID ?? null,
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
