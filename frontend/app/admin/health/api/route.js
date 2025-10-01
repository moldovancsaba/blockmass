import { dbHealth, dbConnect } from "@/app/_lib/db";
import { metrics, uptimeSeconds } from "@/app/_lib/metrics";
import { chainHealth } from "@/app/_lib/chain";
import { getEnv } from "@/app/_lib/env";
import HealthPing from "@/app/_models/HealthPing";
import { log } from "@/app/_lib/logger";

export const runtime = "nodejs";

export async function GET(request) {
  const start = Date.now();
  const [db, chain] = await Promise.all([dbHealth(), chainHealth()]);
  const socket = { connectedClients: metrics.socket.connectedClients, lastEventAt: metrics.socket.lastEventAt };
  const system = { uptimeSeconds: uptimeSeconds(), appName: metrics.app.name, runtime: "nodejs" };

  // Canonical TTL count for observability
  const { BLOCKMASS_HEARTBEAT_TTL_SECONDS } = getEnv();
  await dbConnect();
  const windowStart = new Date(Date.now() - BLOCKMASS_HEARTBEAT_TTL_SECONDS * 1000);
  const activeUsers = await HealthPing.countDocuments({ lastSeen: { $gte: windowStart } });

  // Admin-only structured log when token header is present (do not log secret)
  const hasAdminHeader = Boolean(request.headers.get("x-admin-token") || request.headers.get("X-Admin-Token"));
  if (hasAdminHeader) {
    log("info", "/admin/health/api", {
      durMs: Date.now() - start,
      dbOk: db.ok,
      chainOk: chain.ok,
      activeUsers,
      endpoint: chain.usedEndpoint || null,
    });
  }

  return Response.json({ db, socket, system, chain, activeUsers }, {
    headers: { "Cache-Control": "no-store, no-transform" },
  });
}
