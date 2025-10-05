"use client";

import Link from "next/link";
import { useState } from "react";

const USE_CASES = [
  {
    id: "mesh-mining-3d",
    title: "⛏️  STEP Mesh Mining",
    description:
      "Interactive 3D mining game. Start with icosahedron on Earth sphere, click triangles to mine them (0-11 clicks), subdivide into 4 children. Real production game!",
    path: "/mesh-mining-3d",
    featured: true,
  },
  {
    id: "driver",
    title: "Driver Verification",
    description:
      "Prove that a driver visited target locations. Set destinations, capture GPS proof, verify distance from target.",
    path: "/driver",
  },
  {
    id: "inspector",
    title: "Inspector Check-In",
    description:
      "Record site inspections with location proof. Verify inspectors are at the correct facility or equipment.",
    path: "/inspector",
    comingSoon: true,
  },
  {
    id: "volunteer",
    title: "Volunteer Attendance",
    description:
      "Confirm volunteer participation at events or venues. Create tamper-proof attendance records.",
    path: "/volunteer",
    comingSoon: true,
  },
];

export default function Home() {
  const [apiStatus, setApiStatus] = useState(null);
  const [isWakingUp, setIsWakingUp] = useState(false);

  const wakeUpApi = async () => {
    setIsWakingUp(true);
    setApiStatus('Waking up server... (may take 30-60 seconds)');
    
    try {
      const response = await fetch('https://step-blockchain-api.onrender.com/health');
      const data = await response.json();
      setApiStatus(`✅ Server is awake! Version: ${data.version || 'unknown'}`);
    } catch (error) {
      setApiStatus('⚠️ Server wake-up in progress, try again in 30 seconds');
    } finally {
      setIsWakingUp(false);
    }
  };

  return (
    <main style={{ maxWidth: 820, margin: "40px auto", padding: "0 20px" }}>
      <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 10 }}>Blockmass</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Select a use case to create verifiable proof-of-location records.
      </p>

      {/* API Server Wake-Up Button */}
      <div style={{ 
        marginBottom: 24, 
        padding: 16, 
        border: '2px solid #0066ff', 
        borderRadius: 12,
        background: '#f0f7ff'
      }}>
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12
        }}>
          <div>
            <div style={{ fontWeight: 700, marginBottom: 4, color: '#0066ff' }}>
              🚀 STEP Blockchain API
            </div>
            <div style={{ fontSize: 14, opacity: 0.8 }}>
              Server sleeps after 30 minutes of inactivity. Click to wake up!
            </div>
          </div>
          <button
            onClick={wakeUpApi}
            disabled={isWakingUp}
            style={{
              padding: '10px 20px',
              fontSize: 14,
              fontWeight: 700,
              border: '2px solid #0066ff',
              borderRadius: 8,
              background: isWakingUp ? '#ccc' : '#0066ff',
              color: '#fff',
              cursor: isWakingUp ? 'wait' : 'pointer',
              transition: 'all 0.2s',
            }}
          >
            {isWakingUp ? 'Waking Up...' : 'Wake Up Server'}
          </button>
        </div>
        {apiStatus && (
          <div style={{ 
            marginTop: 12, 
            padding: 12, 
            background: '#fff',
            borderRadius: 8,
            fontSize: 14,
            fontFamily: 'monospace'
          }}>
            {apiStatus}
          </div>
        )}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 16 }}>
        {USE_CASES.map((useCase) => (
          <UseCaseCard key={useCase.id} useCase={useCase} />
        ))}
      </div>

      <div style={{ marginTop: 32, padding: 16, borderTop: "1px solid #000" }}>
        <div style={{ fontSize: 14, opacity: 0.7 }}>
          <Link href="/admin/health" style={{ color: "#000", marginRight: 16 }}>
            Admin Dashboard
          </Link>
          <Link href="/dev" style={{ color: "#000" }}>
            Dev Tools
          </Link>
        </div>
      </div>
    </main>
  );
}

function UseCaseCard({ useCase }) {
  const { title, description, path, comingSoon, featured } = useCase;
  const style = {
    border: featured ? "2px solid #00ff00" : "1px solid #000",
    background: featured ? "#000" : "#FFF",
    color: featured ? "#00ff00" : "#000",
    borderRadius: 12,
    padding: 20,
    textDecoration: "none",
    display: "block",
    transition: "all 0.2s",
    opacity: comingSoon ? 0.5 : 1,
    cursor: comingSoon ? "not-allowed" : "pointer",
    boxShadow: featured ? "0 0 20px rgba(0, 255, 0, 0.3)" : "none",
  };

  const content = (
    <>
      <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8 }}>
        {title}
        {comingSoon && (
          <span style={{ fontSize: 12, marginLeft: 8, opacity: 0.6 }}>(Coming Soon)</span>
        )}
      </div>
      <div style={{ opacity: 0.8, fontSize: 14 }}>{description}</div>
    </>
  );

  if (comingSoon) {
    return <div style={style}>{content}</div>;
  }

  return (
    <Link href={path} style={style}>
      {content}
    </Link>
  );
}
