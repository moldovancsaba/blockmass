import StatusCard from "@/app/_components/StatusCard";
import { dbHealth } from "@/app/_lib/db";
import { metrics, uptimeSeconds } from "@/app/_lib/metrics";
import { chainHealth } from "@/app/_lib/chain";
import HeartbeatPanel from "./HeartbeatPanel";
import SocketPanel from "./SocketPanel";

/**
 * General Dashboard:
 * - MongoDB connection status
 * - User (socket) status
 * - System metrics
 * - Chain (JSON-RPC) status
 */
export default async function HealthPage() {
  const [db, chain] = await Promise.all([dbHealth(), chainHealth()]);
  const socket = { activeUsers: metrics.socket.connectedClients, lastEventAt: metrics.socket.lastEventAt };
  const system = { uptimeSeconds: uptimeSeconds(), appName: metrics.app.name, runtime: "nodejs" };

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
        title="Users (Snapshot)"
        items={[
          { label: "Active Users (sockets)", value: socket.activeUsers },
          { label: "Last Socket Event", value: socket.lastEventAt || "n/a" },
        ]}
      />

      {/* Live panels (client) */}
      <SocketPanel />
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
        items={[
          { label: "OK", value: chain.ok },
          { label: "RPC Configured", value: chain.rpcUrlConfigured },
          { label: "Chain ID (hex/dec)", value: chain.chainIdHex ? `${chain.chainIdHex} / ${chain.chainId}` : "n/a" },
          { label: "Declared Chain ID", value: chain.declaredChainId ?? "n/a" },
          { label: "ID Matches Declared", value: chain.chainIdMatchesDeclared ?? "n/a" },
          { label: "Latest Block", value: chain.latestBlock ?? "n/a" },
          { label: "Explorer", value: chain.explorerBaseUrl || "n/a" },
          { label: "Sample ERC20", value: chain.sampleErc20?.address || "n/a" },
          { label: "Total Supply (fmt)", value: chain.sampleErc20?.totalSupplyFormatted ?? "n/a" },
          { label: "Error", value: chain.error || chain.sampleErc20?.error || "none" },
        ]}
      />
    </main>
  );
}
