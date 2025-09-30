"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [api, setApi] = useState({ db: null, socket: null });
  const [err, setErr] = useState("");

  useEffect(() => {
    let aborted = false;
    let intervalId;
    let socket;

    async function boot() {
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
        socket.on("disconnect", () => {
          if (aborted) return;
          setApi((prev) => ({
            ...prev,
            socket: {
              connectedClients: Math.max(0, (prev?.socket?.connectedClients ?? 1) - 1),
              lastEventAt: Date.now(),
            },
          }));
        });
      } catch {
        // Fallback: no realtime updates if socket client fails to load
      }

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
      try { if (socket) socket.disconnect(); } catch {}
    };
  }, []);

  const loading = !api.db || !api.socket;
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

        <Card title="Socket" tone={socketActive ? "success" : (loading ? "info" : "warning")}>
          {loading ? (
            <div>Loading…</div>
          ) : (
            <ul style={{margin:0, paddingLeft:18}}>
              <li><strong>Active Users:</strong> {api.socket?.connectedClients ?? 0}</li>
              <li><strong>Last Event:</strong> {api.socket?.lastEventAt ? new Date(api.socket.lastEventAt).toISOString() : "n/a"}</li>
            </ul>
          )}
        </Card>
      </div>
    </main>
  );
}