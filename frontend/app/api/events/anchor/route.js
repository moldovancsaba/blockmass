export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { dbConnect } from "@/app/_lib/db";
import EventModel from "@/app/_models/Event";

function unauthorized() {
  return new NextResponse(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "content-type": "application/json" } });
}

function bad(message) {
  return new NextResponse(JSON.stringify({ error: message }), { status: 400, headers: { "content-type": "application/json" } });
}

async function fetchReceipt(usedEndpoint, txHash) {
  const body = { jsonrpc: "2.0", id: 1, method: "eth_getTransactionReceipt", params: [txHash] };
  const r = await fetch(usedEndpoint, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) return null;
  const j = await r.json().catch(() => null);
  return j?.result || null;
}

export async function POST(req) {
  const adminToken = process.env.ADMIN_API_TOKEN;
  const hdr = req.headers.get("x-admin-token") || "";
  if (!adminToken || hdr !== adminToken) return unauthorized();

  await dbConnect();
  const body = await req.json().catch(() => null);
  if (!body) return bad("Invalid JSON");

  const { eventId, txHash, usedEndpoint, verify } = body || {};
  if (!eventId) return bad("Missing eventId");
  if (!txHash) return bad("Missing txHash");

  let status = "sent";
  let blockNumber = null;

  if (verify && usedEndpoint) {
    const receipt = await fetchReceipt(usedEndpoint, txHash);
    if (receipt && receipt.blockNumber) {
      try {
        blockNumber = parseInt(receipt.blockNumber, 16);
        status = "confirmed";
      } catch (_) {
        blockNumber = null;
        status = "sent";
      }
    }
  }

  const update = { anchor: { status, txHash, blockNumber, usedEndpoint: usedEndpoint || "" } };
  const updated = await EventModel.findOneAndUpdate({ _id: eventId }, { $set: update }, { new: true }).lean();
  if (!updated) return bad("Event not found");

  return new NextResponse(JSON.stringify(updated.anchor), { headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } });
}
