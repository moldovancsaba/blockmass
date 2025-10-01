import { NextResponse } from "next/server";
import { dbHealth } from "@/app/_lib/db";
import { metrics, uptimeSeconds } from "@/app/_lib/metrics";
import { getEnv } from "@/app/_lib/env";
import { isAdminRequest } from "@/app/_lib/auth";
import { dbConnect } from "@/app/_lib/db";
import HealthPing from "@/app/_models/HealthPing";

export const runtime = "nodejs";

export async function GET(request) {
  const start = Date.now();
  if (!isAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const ts = new Date().toISOString();
  const { BLOCKMASS_HEARTBEAT_TTL_SECONDS, NEXT_PUBLIC_APP_VERSION } = getEnv();
  const db = await dbHealth();

  await dbConnect();
  const windowStart = new Date(Date.now() - BLOCKMASS_HEARTBEAT_TTL_SECONDS * 1000);
  const active = await HealthPing.countDocuments({ lastSeen: { $gte: windowStart } });

  // Optional chain snapshot for logging
  const ch = await (async () => {
    try { const c = await (await import("@/app/_lib/chain")).chainHealth(); return c; } catch { return { ok: false }; }
  })();

  const system = {
    uptimeSeconds: uptimeSeconds(),
    nodeVersion: process.version,
    runtime: "nodejs",
    memory: process.memoryUsage(),
    version: NEXT_PUBLIC_APP_VERSION,
    ts,
  };
  const socket = { connectedClients: metrics.socket.connectedClients, lastEventAt: metrics.socket.lastEventAt };

  // Structured admin log
  log("info", "/api/health/metrics", {
    durMs: Date.now() - start,
    dbOk: db.ok,
    chainOk: ch.ok,
    activeUsers: active,
    endpoint: ch.usedEndpoint || null,
  });

  return NextResponse.json(
    { ok: true, db, activeUsers: active, socket, system },
    { headers: { "Cache-Control": "no-store, no-transform" } }
  );
}
