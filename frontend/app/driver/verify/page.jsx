"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { calculateDistance } from "@/app/_lib/geo/distance";

const STORAGE_KEY = "blockmass_driver_config";

export default function DriverVerify() {
  const [config, setConfig] = useState(null);
  const [selectedLocation, setSelectedLocation] = useState(null);
  const [nonce, setNonce] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        setConfig(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Failed to load config", e);
    }
  }, []);

  async function getNonce() {
    setError(null);
    setResult(null);
    setBusy(true);
    try {
      const res = await fetch("/api/attest/nonce", { method: "POST" });
      if (!res.ok) throw new Error("Failed to get nonce");
      const data = await res.json();
      setNonce(data.nonce);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function captureAndVerify() {
    if (!selectedLocation || !nonce) {
      setError("Select a location and get a nonce first");
      return;
    }

    setError(null);
    setResult(null);
    setBusy(true);

    try {
      const position = await new Promise((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
        });
      });

      const { latitude, longitude, accuracy } = position.coords;
      const targetLat = parseFloat(selectedLocation.lat);
      const targetLon = parseFloat(selectedLocation.lon);

      if (isNaN(targetLat) || isNaN(targetLon)) {
        throw new Error("Invalid target coordinates");
      }

      const distanceM = Math.round(calculateDistance(latitude, longitude, targetLat, targetLon));

      const payload = {
        topicId: "driver",
        taskId: selectedLocation.id.toString(),
        occurredAt: new Date().toISOString(),
        lat: latitude,
        lon: longitude,
        accuracyM: Math.round(accuracy || 0),
        nonce,
        meta: {
          driverName: config.driverName,
          targetLocation: {
            label: selectedLocation.label,
            lat: targetLat,
            lon: targetLon,
          },
          distanceM,
        },
      };

      const res = await fetch("/api/events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to record event");
      }

      const data = await res.json();

      let proofMessage = "";
      if (distanceM < 10) {
        proofMessage = `You are within 10 meters of ${selectedLocation.label}`;
      } else if (distanceM < 50) {
        proofMessage = `You are within 50 meters of ${selectedLocation.label}`;
      } else if (distanceM < 100) {
        proofMessage = `You are within 100 meters of ${selectedLocation.label}`;
      } else if (distanceM < 500) {
        proofMessage = `You are within 500 meters of ${selectedLocation.label}`;
      } else {
        proofMessage = `You are ${distanceM} meters from ${selectedLocation.label}`;
      }

      setResult({
        ...data,
        distanceM,
        proofMessage,
        targetLabel: selectedLocation.label,
      });
      setNonce(null);
      setSelectedLocation(null);
    } catch (e) {
      setError(e.message || "Failed to capture location");
    } finally {
      setBusy(false);
    }
  }

  if (!config || !config.locations || config.locations.length === 0) {
    return (
      <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
        <div style={{ marginBottom: 24 }}>
          <Link href="/driver" style={{ color: "#000", textDecoration: "none", fontSize: 14 }}>
            ← Back to Driver Home
          </Link>
        </div>

        <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>Verify Location</h1>
        <div
          style={{
            padding: 20,
            border: "1px solid #000",
            borderRadius: 12,
            background: "#FFF",
          }}
        >
          <p>No locations configured. Please go to Setup Locations first.</p>
          <Link
            href="/driver/setup"
            style={{
              display: "inline-block",
              marginTop: 12,
              padding: "10px 20px",
              border: "1px solid #000",
              background: "#000",
              color: "#FFF",
              borderRadius: 6,
              textDecoration: "none",
            }}
          >
            Go to Setup
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/driver" style={{ color: "#000", textDecoration: "none", fontSize: 14 }}>
          ← Back to Driver Home
        </Link>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>Verify Location</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Driver: <strong>{config.driverName || "Not set"}</strong>
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 8 }}>
          Select Target Location
        </label>
        <select
          value={selectedLocation?.id.toString() || ""}
          onChange={(e) => {
            const loc = config.locations.find((l) => l.id.toString() === e.target.value);
            setSelectedLocation(loc || null);
            setNonce(null);
            setResult(null);
            setError(null);
          }}
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #000",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          <option value="">-- Choose a destination --</option>
          {config.locations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.label || "Unnamed"} ({loc.lat}, {loc.lon})
            </option>
          ))}
        </select>
      </div>

      {selectedLocation && (
        <div style={{ marginBottom: 24 }}>
          <button
            onClick={getNonce}
            disabled={busy}
            style={{
              padding: "10px 20px",
              border: "1px solid #000",
              background: nonce ? "#FFF" : "#000",
              color: nonce ? "#000" : "#FFF",
              borderRadius: 6,
              cursor: busy ? "not-allowed" : "pointer",
              fontSize: 14,
              marginRight: 12,
              opacity: busy ? 0.5 : 1,
            }}
          >
            {nonce ? "✓ Nonce Ready" : "Get Nonce"}
          </button>
          <button
            onClick={captureAndVerify}
            disabled={!nonce || busy}
            style={{
              padding: "10px 20px",
              border: "1px solid #000",
              background: nonce && !busy ? "#000" : "#FFF",
              color: nonce && !busy ? "#FFF" : "#000",
              borderRadius: 6,
              cursor: !nonce || busy ? "not-allowed" : "pointer",
              fontSize: 14,
              fontWeight: 700,
              opacity: !nonce || busy ? 0.5 : 1,
            }}
          >
            {busy ? "Capturing..." : "Capture & Verify"}
          </button>
        </div>
      )}

      {error && (
        <div
          style={{
            padding: 16,
            border: "1px solid #000",
            background: "#000",
            color: "#FFF",
            borderRadius: 6,
            marginBottom: 24,
          }}
        >
          {error}
        </div>
      )}

      {result && (
        <div
          style={{
            padding: 20,
            border: "2px solid #000",
            background: "#FFF",
            borderRadius: 12,
            marginBottom: 24,
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 12 }}>
            ✓ Proof Recorded
          </div>
          <div style={{ fontSize: 16, marginBottom: 12 }}>{result.proofMessage}</div>
          <div style={{ opacity: 0.7, fontSize: 14 }}>
            <div><strong>Event ID:</strong> {result.eventId}</div>
            <div><strong>Content Hash:</strong> {result.contentHash}</div>
            <div><strong>Distance:</strong> {result.distanceM} meters</div>
          </div>
        </div>
      )}
    </main>
  );
}
