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
      socket.emit("ready", { ts: new Date().toISOString() });

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
      });
    });
  }

  res.end();
}