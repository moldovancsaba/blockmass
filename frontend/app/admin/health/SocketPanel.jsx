"use client";

import { useEffect, useState } from "react";
import StatusCard from "@/app/_components/StatusCard";

export default function SocketPanel() {
  const [connected, setConnected] = useState(false);
  const [count, setCount] = useState(0);
  const [lastEventAt, setLastEventAt] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    let socket;
    let mounted = true;
    async function init() {
      try {
        const { io } = await import("socket.io-client");
        socket = io("/", { path: "/api/socketio" });
        socket.on("connect", () => { if (mounted) setConnected(true); });
        socket.on("disconnect", () => { if (mounted) setConnected(false); });
        socket.on("metrics", (payload) => {
          if (!mounted) return;
          setCount(payload?.connectedClients ?? 0);
          setLastEventAt(payload?.lastEventAt ?? null);
        });
      } catch (e) {
        if (mounted) setErr(e?.message || "socket_init_failed");
      }
    }
    init();
    return () => { mounted = false; try { if (socket) socket.disconnect(); } catch {} };
  }, []);

  const items = [
    { label: "Connected", value: connected },
    { label: "Active Users (sockets)", value: count },
    { label: "Last Socket Event", value: lastEventAt || "n/a" },
    { label: "Error", value: err || "none" },
  ];

  return <StatusCard title="Users (Live Sockets)" items={items} />;
}