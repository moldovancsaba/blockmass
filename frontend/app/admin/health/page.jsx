import StatusCard from "@/app/_components/StatusCard";
import { dbHealth, dbConnect } from "@/app/_lib/db";
import { metrics, uptimeSeconds } from "@/app/_lib/metrics";
import { chainHealth } from "@/app/_lib/chain";
import HeartbeatPanel from "./HeartbeatPanel";
import SocketPanel from "./SocketPanel";
import HealthPing from "@/app/_models/HealthPing";
import { getEnv } from "@/app/_lib/env";

/**
 * General Dashboard:
 * - MongoDB connection status
 * - User metrics (TTL heartbeat is canonical; sockets are dev aid only)
 * - System metrics
 * - Chain (JSON-RPC) status
 */
export default async function HealthPage() {
  const [db, chain] = await Promise.all([dbHealth(), chainHealth()]);
  const system = { uptimeSeconds: uptimeSeconds(), appName: metrics.app.name, runtime: "nodejs" };

  // Canonical Active Users via TTL heartbeats (durable across serverless instances)
  const { BLOCKMASS_HEARTBEAT_TTL_SECONDS } = getEnv();
  await dbConnect();
  const windowStart = new Date(Date.now() - BLOCKMASS_HEARTBEAT_TTL_SECONDS * 1000);
  const activeUsersTtl = await HealthPing.countDocuments({ lastSeen: { $gte: windowStart } });

  const isProd = process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production";

  return (
    <main style={{maxWidth:820, margin:"40px auto", padding:"0 20px"}}>
      <h1 style={{fontSize:28, fontWeight:800, marginBottom:6}}>General Dashboard</h1>
      <p style={{opacity:0.8, marginBottom:20}}>Live system health for Blockmass.</p>

      <StatusCard
        title="MongoDB"
        items={[
          { label: "Connected", value: db.ok },
          { label: "State", value: db.state },
          { label: "Host", value: db.host || "n/a" },
          { label: "Error", value: db.error || "none" },
        ]}
      />

      <StatusCard
        title="Active Users"
        items={[
          { label: "Count", value: activeUsersTtl },
          { label: "Note", value: "calculated via TTL heartbeats" },
        ]}
      />

      {!isProd && (
        <StatusCard
          title="Users (Sockets — dev aid)"
          items={[
            { label: "Active Users (sockets)", value: metrics.socket.connectedClients },
            { label: "Last Socket Event", value: metrics.socket.lastEventAt || "n/a" },
            { label: "Note", value: "ephemeral — serverless counters may vary" },
          ]}
        />
      )}

      {/* Live panels (client) */}
      {!isProd && <SocketPanel />}
      <HeartbeatPanel />

      <StatusCard
        title="System"
        items={[
          { label: "App Name", value: system.appName },
          { label: "Uptime (s)", value: system.uptimeSeconds },
          { label: "Runtime", value: system.runtime },
        ]}
      />

      <StatusCard
        title="Chain"
        note={chain.usedEndpoint ? `Endpoint: ${chain.usedEndpoint} — pin expires: ${chain.pinExpiresAt || 'n/a'}` : undefined}
        items={[
          { label: "OK", value: chain.ok },
          { label: "RPC Configured", value: chain.rpcUrlConfigured },
          { label: "Chain ID (hex/dec)", value: chain.chainIdHex ? `${chain.chainIdHex} / ${chain.chainId}` : "n/a" },
          { label: "Declared Chain ID", value: chain.declaredChainId ?? "n/a" },
          { label: "ID Matches Declared", value: chain.chainIdMatchesDeclared ?? "n/a" },
          { label: "Latest Block", value: chain.latestBlock ?? "n/a" },
          { label: "Explorer", value: chain.explorerBaseUrl || "n/a" },
          { label: "Used Endpoint", value: chain.usedEndpoint || "n/a" },
          { label: "Attempts (last)", value: chain.attemptsTotal ?? 0 },
          { label: "Last Error Code", value: chain.lastErrorCode || "none" },
          { label: "Error", value: chain.error || chain.sampleErc20?.error || "none" },
        ]}
      />
    </main>
  );
}
