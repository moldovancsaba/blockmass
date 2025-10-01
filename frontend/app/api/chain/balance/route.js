import { getBalance } from "@/app/_lib/chain";

export const runtime = "nodejs";

function isAddress(v) {
  return typeof v === "string" && /^0x[0-9a-fA-F]{40}$/.test(v);
}

export async function GET(request) {
  const url = new URL(request.url);
  const address = url.searchParams.get("address");
  if (!isAddress(address)) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_address" }),
      { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  }
  try {
    const res = await getBalance(address);
    // BigInt -> string to be JSON-safe
    const wei = res.wei.toString();
    return new Response(
      JSON.stringify({ ok: true, address, wei, hex: res.hex }),
      { headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "rpc_failed" }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  }
}