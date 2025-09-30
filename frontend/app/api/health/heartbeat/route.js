import { NextResponse } from "next/server";
import crypto from "crypto";
import { dbConnect } from "@/app/_lib/db";
import HealthPing from "@/app/_models/HealthPing";
import { getEnv } from "@/app/_lib/env";
import { log } from "@/app/_lib/logger";

export const runtime = "nodejs";

export async function POST(request) {
  const { BLOCKMASS_HEARTBEAT_TTL_SECONDS } = getEnv();
  try {
    const body = await request.json().catch(() => ({}));
    const clientId = String(body.clientId || "").trim();
    if (!clientId) {
      return NextResponse.json({ ok: false, error: "clientId required" }, { status: 400 });
    }

    const ua = request.headers.get("user-agent") || "";
    const xff = (request.headers.get("x-forwarded-for") || "").split(",")[0].trim();
    const ip = xff || "unknown";
    const ipHash = crypto.createHash("sha256").update(ip).digest("hex");

    await dbConnect();
    const now = new Date();
    await HealthPing.findOneAndUpdate(
      { clientId },
      { $set: { lastSeen: now, userAgent: ua, ipHash, meta: body.meta || null } },
      { upsert: true, new: true }
    );

    const windowStart = new Date(Date.now() - BLOCKMASS_HEARTBEAT_TTL_SECONDS * 1000);
    const active = await HealthPing.countDocuments({ lastSeen: { $gte: windowStart } });

    return NextResponse.json({ ok: true, active, ttlSeconds: BLOCKMASS_HEARTBEAT_TTL_SECONDS, ts: now.toISOString() });
  } catch (e) {
    log("error", "heartbeat_failed", { message: e?.message });
    return NextResponse.json({ ok: false, error: e?.message || "unknown" }, { status: 500 });
  }
}
