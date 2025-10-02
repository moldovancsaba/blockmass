"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

const STORAGE_KEY = "blockmass_driver_config";

export default function DriverSetup() {
  const [driverName, setDriverName] = useState("");
  const [locations, setLocations] = useState([]);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const config = JSON.parse(stored);
        setDriverName(config.driverName || "");
        setLocations(config.locations || []);
      }
    } catch (e) {
      console.error("Failed to load config", e);
    }
  }, []);

  function addLocation() {
    setLocations([...locations, { id: Date.now(), label: "", lat: "", lon: "" }]);
  }

  function removeLocation(id) {
    setLocations(locations.filter((loc) => loc.id !== id));
  }

  function updateLocation(id, field, value) {
    setLocations(
      locations.map((loc) => (loc.id === id ? { ...loc, [field]: value } : loc))
    );
  }

  function saveConfig() {
    try {
      const config = { driverName, locations };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert("Failed to save configuration: " + e.message);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/driver" style={{ color: "#000", textDecoration: "none", fontSize: 14 }}>
          ← Back to Driver Home
        </Link>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>Setup Locations</h1>
      <p style={{ opacity: 0.8, marginBottom: 24 }}>
        Define your driver name and target destinations. Coordinates can be copied from Google Maps or any map service.
      </p>

      <div style={{ marginBottom: 24 }}>
        <label style={{ display: "block", fontWeight: 700, marginBottom: 6 }}>Driver Name</label>
        <input
          type="text"
          value={driverName}
          onChange={(e) => setDriverName(e.target.value)}
          placeholder="Enter your name"
          style={{
            width: "100%",
            padding: 10,
            border: "1px solid #000",
            borderRadius: 6,
            fontSize: 14,
          }}
        />
      </div>

      <div style={{ marginBottom: 24 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <label style={{ fontWeight: 700 }}>Target Locations</label>
          <button
            onClick={addLocation}
            style={{
              padding: "8px 16px",
              border: "1px solid #000",
              background: "#FFF",
              borderRadius: 6,
              cursor: "pointer",
              fontSize: 14,
            }}
          >
            + Add Location
          </button>
        </div>

        {locations.length === 0 && (
          <div style={{ opacity: 0.6, fontSize: 14, marginBottom: 12 }}>
            No locations added yet. Click "Add Location" to define destinations.
          </div>
        )}

        {locations.map((loc) => (
          <div
            key={loc.id}
            style={{
              border: "1px solid #000",
              borderRadius: 6,
              padding: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ marginBottom: 8 }}>
              <input
                type="text"
                value={loc.label}
                onChange={(e) => updateLocation(loc.id, "label", e.target.value)}
                placeholder="Location label (e.g., Customer A)"
                style={{
                  width: "100%",
                  padding: 8,
                  border: "1px solid #CCC",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 8 }}>
              <input
                type="text"
                value={loc.lat}
                onChange={(e) => updateLocation(loc.id, "lat", e.target.value)}
                placeholder="Latitude (e.g., 47.1234)"
                style={{
                  padding: 8,
                  border: "1px solid #CCC",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
              <input
                type="text"
                value={loc.lon}
                onChange={(e) => updateLocation(loc.id, "lon", e.target.value)}
                placeholder="Longitude (e.g., -122.5678)"
                style={{
                  padding: 8,
                  border: "1px solid #CCC",
                  borderRadius: 4,
                  fontSize: 14,
                }}
              />
            </div>
            <button
              onClick={() => removeLocation(loc.id)}
              style={{
                padding: "6px 12px",
                border: "1px solid #000",
                background: "#FFF",
                borderRadius: 4,
                cursor: "pointer",
                fontSize: 12,
              }}
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={saveConfig}
        style={{
          padding: "12px 24px",
          border: "1px solid #000",
          background: "#000",
          color: "#FFF",
          borderRadius: 6,
          cursor: "pointer",
          fontSize: 16,
          fontWeight: 700,
        }}
      >
        Save Configuration
      </button>

      {saved && (
        <div
          style={{
            marginTop: 12,
            padding: 12,
            background: "#FFF",
            border: "1px solid #000",
            borderRadius: 6,
            fontSize: 14,
          }}
        >
          ✓ Configuration saved successfully!
        </div>
      )}
    </main>
  );
}
