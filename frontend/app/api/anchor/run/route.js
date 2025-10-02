export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { headers } from "next/headers";
import { dbConnect } from "@/app/_lib/db";
import EventModel from "@/app/_models/Event";
import { provider } from "@/app/_lib/chain";

const LIMIT = 10;

export async function POST() {
  const h = await headers();
  const token = h.get("x-admin-token") || "";
  if (token !== (process.env.ADMIN_API_TOKEN || "")) {
    return new NextResponse(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    });
  }

  await dbConnect();

  const pending = await EventModel.find({ "anchor.status": "queued" })
    .sort({ createdAt: 1 })
    .limit(LIMIT)
    .lean();

  if (pending.length === 0) {
    return new NextResponse(JSON.stringify({ ok: true, anchored: 0, items: [] }), {
      headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" },
    });
  }

  const results = [];
  for (const e of pending) {
    // MVP: no actual on-chain tx for now. We simulate success and mark as sent.
    await EventModel.updateOne(
      { _id: e._id },
      { $set: { "anchor.status": "sent", "anchor.usedEndpoint": "simulation" } }
    );
    results.push({ eventId: e._id, contentHash: e.contentHash, status: "sent" });
  }

  return new NextResponse(
    JSON.stringify({ ok: true, anchored: results.length, items: results }),
    { headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" } }
  );
}
