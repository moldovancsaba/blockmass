"use client";

import { useEffect, useRef, useState } from "react";
import StatusCard from "@/app/_components/StatusCard";

function genId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

function getClientId() {
  try {
    const key = "bm_client_id";
    const fromStore = localStorage.getItem(key);
    if (fromStore) return fromStore;
    const id = genId();
    localStorage.setItem(key, id);
    return id;
  } catch {
    return genId();
  }
}

export default function HeartbeatPanel() {
  const [active, setActive] = useState(null);
  const [ttl, setTtl] = useState(60);
  const [lastTs, setLastTs] = useState(null);
  const timerRef = useRef(null);
  const clientIdRef = useRef(null);

  useEffect(() => {
    clientIdRef.current = getClientId();

    async function ping() {
      try {
        const res = await fetch("/api/health/heartbeat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ clientId: clientIdRef.current }),
        });
        const json = await res.json();
        if (json && json.ok) {
          if (typeof json.active === "number") setActive(json.active);
          if (typeof json.ttlSeconds === "number") setTtl(json.ttlSeconds);
          if (json.ts) setLastTs(json.ts);
        }
      } catch {
        // ignore transient errors
      }
    }

    // initial ping
    ping();

    // schedule at half TTL (min 5s)
    function schedule() {
      if (timerRef.current) clearInterval(timerRef.current);
      const intervalMs = Math.max(5, Math.floor(ttl / 2)) * 1000;
      timerRef.current = setInterval(ping, intervalMs);
    }

    schedule();

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [ttl]);

  const items = [
    { label: "Active Users (live)", value: active ?? "…" },
    { label: "TTL (s)", value: ttl },
    { label: "Last Heartbeat", value: lastTs || "n/a" },
  ];

  return <StatusCard title="Users (Live Heartbeat)" items={items} />;
}