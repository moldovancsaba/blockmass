export const runtime = "nodejs";
import { NextResponse } from "next/server";
import { dbConnect } from "@/app/_lib/db";
import EventModel from "@/app/_models/Event";

export async function GET() {
  await dbConnect();
  const items = await EventModel.find({}).sort({ occurredAt: -1 }).limit(50).lean();
  const out = items.map((e) => ({
    id: e._id,
    topicId: e.topicId,
    taskId: e.taskId,
    occurredAt: e.occurredAt,
    geohash5: e.geo?.geohash5 || "",
    accuracyM: e.geo?.accuracyM ?? null,
    contentHash: e.contentHash,
    anchor: e.anchor || { status: "queued", txHash: "", blockNumber: null, usedEndpoint: "" },
  }));
  return new NextResponse(JSON.stringify({ ok: true, items: out }), {
    headers: { "content-type": "application/json", "cache-control": "no-store, no-transform" },
  });
}
