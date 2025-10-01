import { Server } from "socket.io";
import { incClients, decClients, metrics } from "@/app/_lib/metrics";

export const config = {
  api: { bodyParser: false },
};

function emitMetrics(io) {
  const payload = {
    connectedClients: metrics.socket.connectedClients,
    lastEventAt: metrics.socket.lastEventAt,
    ts: new Date().toISOString(),
  };
  io.emit("metrics", payload);
}

function baseUrlFromHeaders(h = {}) {
  const proto = h["x-forwarded-proto"] || h["X-Forwarded-Proto"] || "http";
  const host = h["host"] || h["Host"];
  if (!host) return null;
  return `${proto}://${host}`;
}

async function bestEffortHeartbeat(baseUrl, clientId) {
  if (!baseUrl) return;
  try {
    await fetch(`${baseUrl}/api/health/heartbeat`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ clientId, meta: { via: "socketio" } }),
    });
  } catch {}
}

export default function handler(req, res) {
  // Ensure Node runtime and a single Socket.IO server instance per process
  if (!res.socket?.server) {
    res.status(500).end("Socket server not initialized");
    return;
  }

  if (!res.socket.server.io) {
    const io = new Server(res.socket.server, {
      path: "/api/socketio",
      addTrailingSlash: false,
      cors: { origin: true, methods: ["GET", "POST"] },
    });
    res.socket.server.io = io;

    io.on("connection", (socket) => {
      incClients();
      emitMetrics(io);
      io.emit("presence:update", { at: Date.now() });
      socket.emit("ready", { ts: new Date().toISOString() });

      // Best-effort heartbeat sync to keep TTL canonical metric authoritative
      const base = baseUrlFromHeaders(socket.request?.headers || {});
      bestEffortHeartbeat(base, `socket:${socket.id}`);

      socket.on("join", (room) => {
        if (typeof room === "string" && room.trim()) socket.join(room.trim());
      });

      socket.on("ping", (msg) => {
        socket.emit("pong", msg ?? { ts: new Date().toISOString() });
      });

      socket.on("broadcast", (event) => {
        // Example broadcast; secure and scope in real use cases
        io.emit("event", { ...event, ts: new Date().toISOString() });
      });

      socket.on("disconnect", () => {
        decClients();
        emitMetrics(io);
        io.emit("presence:update", { at: Date.now() });
        bestEffortHeartbeat(base, `socket:${socket.id}`);
      });
    });
  }

  res.end();
}