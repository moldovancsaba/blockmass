"use client";

import { useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import Link from "next/link";

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
  const [meshStatus, setMeshStatus] = useState(null);
  const [seedingResult, setSedingResult] = useState(null);
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

    // Check mesh status
    fetch("/api/mesh/search?bbox=-180,-90,180,90&level=1&maxResults=1")
      .then((r) => r.json())
      .then((j) => setMeshStatus({ count: j.result?.count || 0 }))
      .catch(() => setMeshStatus({ count: 0 }));

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

  async function seedMesh() {
    setError(null);
    setSedingResult(null);
    setBusy(true);
    try {
      const r = await fetch("/api/mesh/seed", { method: "POST" });
      const j = await r.json();
      setSedingResult(j);
      setMeshStatus({ count: j.count || 0 });
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setBusy(false);
    }
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
      <h1>Dev Tools</h1>
      
      {/* Navigation */}
      <div style={{ marginBottom: 20, padding: 10, background: '#f0f0f0', borderRadius: 8 }}>
        <Link href="/" style={{ marginRight: 15 }}>← Home</Link>
        <Link href="/mesh-mining-3d" style={{ marginRight: 15 }}>3D Mining</Link>
        <Link href="/mine-mobile">Mobile Mining</Link>
      </div>

      <h2>Mesh Seeding</h2>
      <div style={{ marginBottom: 12 }}>
        <p>Status: {meshStatus?.count > 0 ? `✅ ${meshStatus.count} triangles seeded` : '❌ Not seeded'}</p>
        <button onClick={seedMesh} disabled={busy} style={{ padding: 10, marginRight: 10, background: '#0066ff', color: 'white', border: 'none', borderRadius: 4 }}>
          Seed Icosahedron (20 triangles)
        </button>
      </div>
      {seedingResult && (
        <div style={{ marginBottom: 12, padding: 10, background: seedingResult.ok ? '#e0ffe0' : '#ffe0e0', borderRadius: 4 }}>
          <div>{seedingResult.message}</div>
          <div>Triangles: {seedingResult.count}</div>
        </div>
      )}
      
      <hr style={{ margin: '20px 0' }} />

      <h2>Event Capture</h2>
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