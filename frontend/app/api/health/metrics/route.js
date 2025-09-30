import { NextResponse } from "next/server";
import { dbHealth } from "@/app/_lib/db";
import { metrics, uptimeSeconds } from "@/app/_lib/metrics";
import { getEnv } from "@/app/_lib/env";
import { isAdminRequest } from "@/app/_lib/auth";
import { dbConnect } from "@/app/_lib/db";
import HealthPing from "@/app/_models/HealthPing";

export const runtime = "nodejs";

export async function GET(request) {
  if (!isAdminRequest(request)) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const ts = new Date().toISOString();
  const { BLOCKMASS_HEARTBEAT_TTL_SECONDS, NEXT_PUBLIC_APP_VERSION } = getEnv();
  const db = await dbHealth();

  await dbConnect();
  const windowStart = new Date(Date.now() - BLOCKMASS_HEARTBEAT_TTL_SECONDS * 1000);
  const active = await HealthPing.countDocuments({ lastSeen: { $gte: windowStart } });

  const system = {
    uptimeSeconds: uptimeSeconds(),
    nodeVersion: process.version,
    runtime: "nodejs",
    memory: process.memoryUsage(),
    version: NEXT_PUBLIC_APP_VERSION,
    ts,
  };
  const socket = { connectedClients: metrics.socket.connectedClients, lastEventAt: metrics.socket.lastEventAt };

  return NextResponse.json({ ok: true, db, activeUsers: active, socket, system });
}
