import { provider } from "@/app/_lib/chain";

export const runtime = "nodejs";

function toBlockTag(input) {
  if (!input || input === "latest") return "latest";
  const s = String(input).trim();
  if (/^0x[0-9a-fA-F]+$/.test(s)) return s;
  if (/^[0-9]+$/.test(s)) {
    try {
      const bi = BigInt(s);
      if (bi < 0n) throw new Error("neg");
      return "0x" + bi.toString(16);
    } catch {
      return null;
    }
  }
  return null;
}

export async function GET(request) {
  const url = new URL(request.url);
  const numberParam = url.searchParams.get("number") || "latest";
  const tag = toBlockTag(numberParam);
  if (!tag) {
    return new Response(
      JSON.stringify({ ok: false, error: "invalid_number_param" }),
      { status: 400, headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  }
  try {
    const block = await provider.rpc("eth_getBlockByNumber", [tag, false]);
    return new Response(
      JSON.stringify({ ok: true, tag, block }),
      { headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: e?.message || "rpc_failed" }),
      { status: 502, headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
    );
  }
}