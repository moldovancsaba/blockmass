"use client";

import Link from "next/link";

export default function DriverHome() {
  return (
    <main style={{ maxWidth: 720, margin: "40px auto", padding: "0 20px" }}>
      <div style={{ marginBottom: 24 }}>
        <Link href="/" style={{ color: "#000", textDecoration: "none", fontSize: 14 }}>
          ← Back to Home
        </Link>
      </div>

      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>Driver Verification</h1>
      <p style={{ opacity: 0.8, marginBottom: 32 }}>
        Prove you visited target locations with GPS verification and distance calculation.
      </p>

      <div style={{ display: "grid", gap: 16 }}>
        <Link
          href="/driver/setup"
          style={{
            border: "1px solid #000",
            background: "#FFF",
            color: "#000",
            borderRadius: 12,
            padding: 20,
            textDecoration: "none",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Setup Locations</div>
          <div style={{ opacity: 0.8, fontSize: 14 }}>
            Define your name and target destinations (copy coordinates from a map).
          </div>
        </Link>

        <Link
          href="/driver/verify"
          style={{
            border: "1px solid #000",
            background: "#FFF",
            color: "#000",
            borderRadius: 12,
            padding: 20,
            textDecoration: "none",
            display: "block",
          }}
        >
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>Verify Location</div>
          <div style={{ opacity: 0.8, fontSize: 14 }}>
            Select a destination, capture GPS, and record proof of visit with distance verification.
          </div>
        </Link>
      </div>
    </main>
  );
}
