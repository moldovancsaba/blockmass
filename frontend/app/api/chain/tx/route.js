import { provider } from "@/app/_lib/chain";

export const runtime = "nodejs";

function isTxHash(v) {
  return typeof v === "string" && /^0x[0-9a-fA-F]{64}$/.test(v);
}

export async function GET(request) {
  const url = new URL(request.url);
  const hash = url.searchParams.get("hash");
  if (!isTxHash(hash)) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_hash" }),
      { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  }
  try {
    const tx = await provider.rpc("eth_getTransactionByHash", [hash]);
    return new Response(
      JSON.stringify({ ok: true, tx }),
      { headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "rpc_failed" }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  }
}