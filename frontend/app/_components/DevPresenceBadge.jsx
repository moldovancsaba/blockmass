"use client";

import { useEffect, useState } from "react";

export default function DevPresenceBadge({ enabled = false }) {
  const [count, setCount] = useState(0);
  const [lastAt, setLastAt] = useState(null);

  useEffect(() => {
    if (!enabled) return;
    let socket;
    let mounted = true;
    (async () => {
      try {
        const { io } = await import("socket.io-client");
        socket = io("/", { path: "/api/socketio" });
        socket.on("metrics", (payload) => {
          if (!mounted) return;
          setCount(payload?.connectedClients ?? 0);
          setLastAt(payload?.ts || null);
        });
        socket.on("presence:update", (msg) => {
          if (!mounted) return;
          setLastAt(new Date(msg?.at ?? Date.now()).toISOString());
        });
      } catch {
        // ignore
      }
    })();
    return () => { mounted = false; try { if (socket) socket.disconnect(); } catch {} };
  }, [enabled]);

  if (!enabled) return null;

  const style = {
    position: "fixed",
    right: 12,
    bottom: 12,
    background: "#000000",
    color: "#FFFFFF",
    border: "1px solid #FFFFFF",
    borderRadius: 8,
    padding: "6px 10px",
    fontSize: 12,
  };

  return (
    <div style={style}>
      dev presence • {count} • {lastAt || "—"}
    </div>
  );
}