import { dbHealth } from "@/app/_lib/db";
import { metrics, uptimeSeconds } from "@/app/_lib/metrics";
import { chainHealth } from "@/app/_lib/chain";

export const runtime = "nodejs";

export async function GET() {
  const [db, chain] = await Promise.all([dbHealth(), chainHealth()]);
  const socket = { connectedClients: metrics.socket.connectedClients, lastEventAt: metrics.socket.lastEventAt };
  const system = { uptimeSeconds: uptimeSeconds(), appName: metrics.app.name, runtime: "nodejs" };
  return Response.json({ db, socket, system, chain }, {
    headers: { "Cache-Control": "no-store, no-transform" },
  });
}
