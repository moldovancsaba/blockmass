"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";

function nowIsoMs() {
  return new Date().toISOString();
}

export default function DevCapture() {
  const [nonce, setNonce] = useState(null);
  const [expiresAt, setExpiresAt] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]);
  const socketRef = useRef(null);

  useEffect(() => {
    fetch("/api/socketio").catch(() => {});
    const s = io({ path: "/api/socketio" });
    socketRef.current = s;
    s.on("event:new", (msg) => setItems((prev) => [msg, ...prev]));

    fetch("/api/events/list")
      .then((r) => r.json())
      .then((j) => setItems(j.items || []))
      .catch(() => {});

    return () => {
      s.close();
    };
  }, []);

  async function getNonce() {
    setError(null);
    setResult(null);
    const r = await fetch("/api/attest/nonce", { method: "POST" });
    if (!r.ok) {
      setError("Failed to get nonce");
      return;
    }
    const j = await r.json();
    setNonce(j.nonce);
    setExpiresAt(j.expiresAt);
  }

  async function recordEvent() {
    setError(null);
    setResult(null);
    if (!nonce) {
      setError("Get a nonce first");
      return;
    }
    setBusy(true);
    try {
      await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true, timeout: 10000 });
      }).then(async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const accuracyM = Math.round(pos.coords.accuracy || 0);
        const payload = {
          topicId: "00000000-0000-0000-0000-000000000001",
          taskId: "00000000-0000-0000-0000-000000000001",
          occurredAt: nowIsoMs(),
          lat,
          lon,
          accuracyM,
          nonce,
        };
        const r = await fetch("/api/events", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (!r.ok) {
          const t = await r.text();
          throw new Error(t);
        }
        const j = await r.json();
        setResult(j);
        setNonce(null);
        setExpiresAt(null);
      });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <h1>Dev Capture</h1>
      <div style={{ marginBottom: 12 }}>
        <button onClick={getNonce} disabled={busy} style={{ padding: 10, marginRight: 10 }}>Get nonce</button>
        <button onClick={recordEvent} disabled={busy || !nonce} style={{ padding: 10 }}>Record event</button>
      </div>
      <div style={{ marginBottom: 12 }}>
        <div>Nonce: {nonce || "-"}</div>
        <div>Expires At: {expiresAt || "-"}</div>
      </div>
      {result && (
        <div style={{ marginBottom: 12 }}>
          <div>Recorded Event ID: {result.eventId}</div>
          <div>Content Hash: {result.contentHash}</div>
        </div>
      )}
      {error && (
        <div style={{ marginBottom: 12, color: "red" }}>{error}</div>
      )}
      <h2>Recent events</h2>
      <ul>
        {items.map((e) => (
          <li key={e.id || e.contentHash}>
            <div>ID: {e.id}</div>
            <div>Topic: {e.topicId} Task: {e.taskId}</div>
            <div>Occurred: {e.occurredAt}</div>
            <div>Geohash5: {e.geohash5} AccuracyM: {e.accuracyM}</div>
            <div>Hash: {e.contentHash}</div>
            <div>Anchor: {e.anchor?.status} {e.anchor?.txHash}</div>
            <hr />
          </li>
        ))}
      </ul>
    </main>
  );
}