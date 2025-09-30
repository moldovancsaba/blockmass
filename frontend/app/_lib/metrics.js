/**
 * In-memory metrics store for the Health Dashboard.
 * Works in serverless by using global to persist within the runtime.
 */
const globalKey = "__blockmass_metrics__";
if (!global[globalKey]) {
  global[globalKey] = {
    startedAt: Date.now(),
    socket: { connectedClients: 0, lastEventAt: null },
    app: { name: process.env.NEXT_PUBLIC_APP_NAME || "Blockmass" },
  };
}
export const metrics = global[globalKey];

export function incClients() {
  metrics.socket.connectedClients += 1;
  metrics.socket.lastEventAt = Date.now();
}
export function decClients() {
  metrics.socket.connectedClients = Math.max(0, metrics.socket.connectedClients - 1);
  metrics.socket.lastEventAt = Date.now();
}

export function uptimeSeconds() {
  return Math.floor((Date.now() - metrics.startedAt) / 1000);
}