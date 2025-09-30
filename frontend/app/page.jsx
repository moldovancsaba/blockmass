"use client";

import { useEffect, useState, useRef } from "react";

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

export default function Home() {
  const [api, setApi] = useState({ db: null, socket: null });
  const [err, setErr] = useState("");
  const [ttlActive, setTtlActive] = useState(null);
  const [ttlLastTs, setTtlLastTs] = useState(null);
  const [ttlSeconds, setTtlSeconds] = useState(60);
  const clientIdRef = useRef(null);

  useEffect(() => {
    let aborted = false;
    let intervalId;
    let socket;
    let heartbeatTimer;

    async function boot() {
      clientIdRef.current = getClientId();

      // Initial health snapshot
      try {
        const res = await fetch("/admin/health/api");
        const data = await res.json();
        if (!aborted) setApi(data);
      } catch (e) {
        if (!aborted) setErr(e.message || "failed to load");
      }

      // Try real-time socket (singleton server at /api/socketio)
      try {
        const { io } = await import("socket.io-client");
        socket = io("/", { path: "/api/socketio" });
        socket.on("metrics", (payload) => {
          if (aborted) return;
          setApi((prev) => ({
            ...prev,
            socket: {
              connectedClients: payload?.connectedClients ?? prev?.socket?.connectedClients ?? 0,
              lastEventAt: payload?.lastEventAt ?? prev?.socket?.lastEventAt ?? null,
            },
          }));
        });
        socket.on("connect_error", () => {
          // Socket unavailable (e.g., serverless). We'll rely on heartbeat fallback.
        });
      } catch {
        // No realtime available; rely on heartbeat fallback
      }

      // Heartbeat fallback (works on Vercel): ping half-ttl to keep active count fresh
      async function heartbeatOnce() {
        try {
          const res = await fetch("/api/health/heartbeat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ clientId: clientIdRef.current }),
          });
          const json = await res.json();
          if (json?.ok) {
            if (!aborted && typeof json.active === "number") setTtlActive(json.active);
            if (!aborted && typeof json.ttlSeconds === "number") setTtlSeconds(json.ttlSeconds);
            if (!aborted && json.ts) setTtlLastTs(json.ts);
          }
        } catch {}
      }
      await heartbeatOnce();
      heartbeatTimer = setInterval(heartbeatOnce, Math.max(5, Math.floor(ttlSeconds / 2)) * 1000);

      // Poll health for DB/system/chain
      intervalId = setInterval(async () => {
        try {
          const res = await fetch("/admin/health/api");
          const data = await res.json();
          if (!aborted) setApi(data);
        } catch {}
      }, 5000);
    }

    boot();

    return () => {
      aborted = true;
      if (intervalId) clearInterval(intervalId);
      if (heartbeatTimer) clearInterval(heartbeatTimer);
      try { if (socket) socket.disconnect(); } catch {}
    };
  }, [ttlSeconds]);

  const loading = !api.db; // socket is optional; we have heartbeat fallback
  const dbOk = api.db?.ok === true;
  const socketActive = (api.socket?.connectedClients ?? 0) > 0 || !!api.socket?.lastEventAt;

  function Card({ title, tone, children }) {
    // High-contrast card enforcing BLACK-on-WHITE or WHITE-on-BLACK only.
    const invert = tone === "error"; // emphasize error states
    const bg = invert ? "#000000" : "#FFFFFF";
    const fg = invert ? "#FFFFFF" : "#000000";
    const border = invert ? "#FFFFFF" : "#000000";
    return (
      <div style={{border:`1px solid ${border}`, background:bg, color:fg, borderRadius:12, padding:16}}>
        <div style={{fontWeight:700, marginBottom:6}}>{title}</div>
        {children}
      </div>
    );
  }

  return (
    <main style={{maxWidth:820, margin:"40px auto", padding:"0 20px"}}>
      <h1 style={{fontSize:28, fontWeight:800, marginBottom:10}}>Blockmass</h1>
      <p style={{opacity:0.8, marginBottom:24}}>Foundation online. This page mirrors the Health Dashboard.</p>

      {err && <div style={{color:"crimson", marginBottom:12}}>Failed to load health data: {err}</div>}
      {loading && !err && <div style={{opacity:0.7, marginBottom:12}}>Loading health data…</div>}

      <div style={{display:"grid", gridTemplateColumns:"1fr", gap:12}}>
        <Card title="MongoDB" tone={dbOk ? "success" : (loading ? "info" : "error") }>
          {loading ? (
            <div>Loading…</div>
          ) : dbOk ? (
            <ul style={{margin:0, paddingLeft:18}}>
              <li><strong>Connected:</strong> true</li>
              <li><strong>State:</strong> {typeof api.db.state === "number" ? api.db.state : "n/a"}</li>
              <li><strong>Host:</strong> {api.db.host || "n/a"}</li>
            </ul>
          ) : (
            <div>
              <div style={{marginBottom:6}}>Database connection failed.</div>
              <div><strong>Error:</strong> {api.db?.error || "unknown"}</div>
            </div>
          )}
        </Card>

        <Card title="Users" tone={(ttlActive ?? 0) > 0 || socketActive ? "success" : (loading ? "info" : "warning")}>
          {loading ? (
            <div>Loading…</div>
          ) : (
            <ul style={{margin:0, paddingLeft:18}}>
              <li><strong>Active Users (TTL):</strong> {ttlActive ?? 0}</li>
              <li><strong>Last Heartbeat:</strong> {ttlLastTs || "n/a"}</li>
              <li><strong>Active Users (sockets):</strong> {api.socket?.connectedClients ?? 0}</li>
              <li><strong>Last Socket Event:</strong> {api.socket?.lastEventAt ? new Date(api.socket.lastEventAt).toISOString() : "n/a"}</li>
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}
