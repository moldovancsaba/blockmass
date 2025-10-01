import { NextResponse } from "next/server";
import { getEnv } from "@/app/_lib/env";
import { dbHealth, dbConnect } from "@/app/_lib/db";
import { chainHealth } from "@/app/_lib/chain";
import HealthPing from "@/app/_models/HealthPing";

export const runtime = "nodejs";

export async function GET() {
  const { NEXT_PUBLIC_APP_VERSION, NEXT_PUBLIC_APP_NAME, BLOCKMASS_HEARTBEAT_TTL_SECONDS } = getEnv();
  const ts = new Date().toISOString();

  // Gather DB health and canonical Active Users via TTL
  const db = await dbHealth();
  await dbConnect();
  const windowStart = new Date(Date.now() - BLOCKMASS_HEARTBEAT_TTL_SECONDS * 1000);
  const activeUsers = await HealthPing.countDocuments({ lastSeen: { $gte: windowStart } });

  // Chain health subset
  const chain = await chainHealth();

  // Compute simple status
  let status = "ok";
  if (!db.ok && !chain.ok) status = "down";
  else if (!db.ok || !chain.ok) status = "degraded";

  const payload = {
    status,
    version: NEXT_PUBLIC_APP_VERSION,
    appName: NEXT_PUBLIC_APP_NAME,
    ts,
    db: { ok: db.ok, host: db.host || null },
    activeUsers,
    chain: {
      ok: chain.ok,
      chainId: chain.chainId ?? null,
      latestBlock: chain.latestBlock ?? null,
      usedEndpoint: chain.usedEndpoint ?? null,
    },
  };

  return NextResponse.json(payload, {
    headers: { "Cache-Control": "no-store, no-transform" },
  });
}
