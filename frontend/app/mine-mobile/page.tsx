'use client';

import { useState, useEffect, useCallback } from 'react';

interface LocationData {
  coords: {
    latitude: number;
    longitude: number;
    accuracy: number;
    altitude: number | null;
    altitudeAccuracy: number | null;
    heading: number | null;
    speed: number | null;
  };
  timestamp: number;
}

interface MiningResult {
  ok: boolean;
  reward?: string;
  triangleId?: string;
  level?: number;
  clicks?: number;
  balance?: string;
  error?: string;
  code?: string;
}

export default function MobileMiningPage() {
  const [location, setLocation] = useState<LocationData | null>(null);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [isMining, setIsMining] = useState(false);
  const [miningResult, setMiningResult] = useState<MiningResult | null>(null);
  const [walletAddress, setWalletAddress] = useState<string>('');
  const [showWalletInput, setShowWalletInput] = useState(true);

  // Request location on mount
  useEffect(() => {
    if (typeof window === 'undefined' || !navigator.geolocation) {
      setLocationError('Geolocation is not supported by your browser');
      return;
    }

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    };

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
          timestamp: position.timestamp,
        });
        setLocationError(null);
      },
      (error) => {
        switch (error.code) {
          case error.PERMISSION_DENIED:
            setLocationError('Location permission denied. Please enable location access in your browser settings.');
            break;
          case error.POSITION_UNAVAILABLE:
            setLocationError('Location information is unavailable.');
            break;
          case error.TIMEOUT:
            setLocationError('Location request timed out.');
            break;
          default:
            setLocationError(`Unknown error: ${error.message}`);
        }
      },
      options
    );
  }, []);

  // Collect all available location data
  const collectLocationData = useCallback((): LocationData | null => {
    if (!location) return null;

    return {
      coords: {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy,
        altitude: location.coords.altitude,
        altitudeAccuracy: location.coords.altitudeAccuracy,
        heading: location.coords.heading,
        speed: location.coords.speed,
      },
      timestamp: location.timestamp,
    };
  }, [location]);

  // Submit proof to API
  const submitProof = useCallback(async () => {
    const data = collectLocationData();
    if (!data) {
      setMiningResult({ ok: false, error: 'No location data available', code: 'NO_LOCATION' });
      return;
    }

    if (!walletAddress || !walletAddress.startsWith('0x')) {
      setMiningResult({ ok: false, error: 'Invalid wallet address', code: 'INVALID_WALLET' });
      return;
    }

    setIsMining(true);
    setMiningResult(null);

    try {
      // Find triangle at current location
      const triangleResponse = await fetch(
        `/api/mesh/triangleAt?lat=${data.coords.latitude}&lon=${data.coords.longitude}&level=10`
      );
      
      if (!triangleResponse.ok) {
        throw new Error('Failed to find triangle at location');
      }
      
      const triangleData = await triangleResponse.json();
      
      if (!triangleData.ok || !triangleData.result?.triangleId) {
        setMiningResult({ ok: false, error: 'No triangle found at this location', code: 'NO_TRIANGLE' });
        setIsMining(false);
        return;
      }

      // Build proof payload
      const timestamp = new Date(data.timestamp).toISOString();
      const nonce = crypto.randomUUID();
      
      const proofPayload = {
        version: 'STEP-PROOF-v1',
        account: walletAddress.toLowerCase(),
        triangleId: triangleData.result.triangleId,
        lat: data.coords.latitude,
        lon: data.coords.longitude,
        accuracy: data.coords.accuracy,
        timestamp,
        nonce,
      };

      // For PoC, create a mock signature (in production, use actual wallet signing)
      // This is just for testing the backend without a wallet
      const message = `STEP-PROOF-v1|account:${proofPayload.account}|triangle:${proofPayload.triangleId}|lat:${proofPayload.lat}|lon:${proofPayload.lon}|acc:${proofPayload.accuracy}|ts:${proofPayload.timestamp}|nonce:${proofPayload.nonce}`;
      
      // Create a simple hash-based signature for PoC demo
      const encoder = new TextEncoder();
      const dataHash = encoder.encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', dataHash);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      const hashHex = '0x' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      // Add 65-byte signature format (for EIP-191 compatibility)
      const signature = hashHex + '00'.repeat(65 - hashHex.length);

      // Submit proof
      const response = await fetch('/api/proof/submit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ payload: proofPayload, signature }),
      });

      const result = await response.json();
      setMiningResult(result);
      
      // Refresh location after mining
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          setLocation({
            coords: {
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              altitude: pos.coords.altitude,
              altitudeAccuracy: pos.coords.altitudeAccuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
            },
            timestamp: pos.timestamp,
          });
        },
        (err) => console.error('Failed to refresh location:', err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      );
      
    } catch (error) {
      console.error('Mining failed:', error);
      setMiningResult({ ok: false, error: error instanceof Error ? error.message : 'Unknown error', code: 'SUBMIT_ERROR' });
    } finally {
      setIsMining(false);
    }
  }, [collectLocationData, walletAddress]);

  // Refresh location manually
  const refreshLocation = () => {
    setLocationError(null);
    setMiningResult(null);
    
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setLocation({
          coords: {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude,
            accuracy: position.coords.accuracy,
            altitude: position.coords.altitude,
            altitudeAccuracy: position.coords.altitudeAccuracy,
            heading: position.coords.heading,
            speed: position.coords.speed,
          },
          timestamp: position.timestamp,
        });
      },
      (error) => {
        setLocationError(error.message);
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  return (
    <div style={{ 
      minHeight: '100vh', 
      background: 'linear-gradient(135deg, #001133 0%, #002244 100%)',
      color: 'white',
      padding: '20px',
      fontFamily: 'system-ui, -apple-system, sans-serif'
    }}>
      <div style={{ maxWidth: '500px', margin: '0 auto' }}>
        <h1 style={{ fontSize: '24px', marginBottom: '20px', textAlign: 'center' }}>
          📱 Mobile Mining
        </h1>

        {/* Wallet Input */}
        {showWalletInput && (
          <div style={{ 
            background: 'rgba(255,255,255,0.1)', 
            padding: '15px', 
            borderRadius: '12px',
            marginBottom: '20px'
          }}>
            <label style={{ display: 'block', marginBottom: '8px', fontSize: '14px' }}>
              Wallet Address (for rewards)
            </label>
            <input
              type="text"
              placeholder="0x..."
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              style={{
                width: '100%',
                padding: '10px',
                borderRadius: '8px',
                border: '1px solid rgba(255,255,255,0.3)',
                background: 'rgba(255,255,255,0.1)',
                color: 'white',
                fontSize: '14px',
                boxSizing: 'border-box'
              }}
            />
            <button
              onClick={() => setShowWalletInput(false)}
              style={{
                marginTop: '10px',
                padding: '8px 16px',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer'
              }}
            >
              Continue
            </button>
          </div>
        )}

        {/* Location Display */}
        <div style={{ 
          background: 'rgba(255,255,255,0.1)', 
          padding: '15px', 
          borderRadius: '12px',
          marginBottom: '20px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <h2 style={{ fontSize: '16px', margin: 0 }}>📍 Current Location</h2>
            <button
              onClick={refreshLocation}
              style={{
                padding: '6px 12px',
                background: 'rgba(255,255,255,0.2)',
                border: 'none',
                borderRadius: '6px',
                color: 'white',
                cursor: 'pointer',
                fontSize: '12px'
              }}
            >
              Refresh
            </button>
          </div>
          
          {locationError ? (
            <p style={{ color: '#ff6b6b', fontSize: '14px' }}>⚠️ {locationError}</p>
          ) : location ? (
            <div style={{ fontSize: '14px', lineHeight: '1.8' }}>
              <p><strong>Latitude:</strong> {location.coords.latitude.toFixed(6)}°</p>
              <p><strong>Longitude:</strong> {location.coords.longitude.toFixed(6)}°</p>
              <p><strong>Accuracy:</strong> {location.coords.accuracy.toFixed(0)}m</p>
              {location.coords.altitude && (
                <p><strong>Altitude:</strong> {location.coords.altitude.toFixed(1)}m</p>
              )}
              {location.coords.speed !== null && (
                <p><strong>Speed:</strong> {(location.coords.speed * 3.6).toFixed(1)} km/h</p>
              )}
            </div>
          ) : (
            <p style={{ fontSize: '14px' }}>🔄 Acquiring location...</p>
          )}
        </div>

        {/* Mining Button */}
        <button
          onClick={submitProof}
          disabled={isMining || !location || !walletAddress}
          style={{
            width: '100%',
            padding: '18px',
            fontSize: '18px',
            fontWeight: 'bold',
            background: isMining || !location || !walletAddress 
              ? 'rgba(255,255,255,0.2)' 
              : 'linear-gradient(135deg, #00ff88 0%, #00cc66 100%)',
            border: 'none',
            borderRadius: '12px',
            color: isMining || !location || !walletAddress ? 'rgba(255,255,255,0.5)' : '#001133',
            cursor: isMining || !location || !walletAddress ? 'not-allowed' : 'pointer',
            marginBottom: '20px'
          }}
        >
          {isMining ? '⛏️ Mining...' : '⛏️ Mine This Location'}
        </button>

        {/* Result Display */}
        {miningResult && (
          <div style={{ 
            background: miningResult.ok ? 'rgba(0,255,136,0.2)' : 'rgba(255,107,107,0.2)', 
            padding: '15px', 
            borderRadius: '12px',
            border: `2px solid ${miningResult.ok ? '#00ff88' : '#ff6b6b'}`
          }}>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '16px' }}>
              {miningResult.ok ? '✅ Mining Successful' : '❌ Mining Failed'}
            </h3>
            
            {miningResult.ok ? (
              <div style={{ fontSize: '14px', lineHeight: '1.8' }}>
                <p><strong>Triangle:</strong> {miningResult.triangleId?.substring(0, 20)}...</p>
                <p><strong>Level:</strong> {miningResult.level}</p>
                <p><strong>Clicks:</strong> {miningResult.clicks}/11</p>
                <p><strong>Reward:</strong> {miningResult.reward} STEP</p>
                <p><strong>Balance:</strong> {miningResult.balance} STEP</p>
              </div>
            ) : (
              <div style={{ fontSize: '14px' }}>
                <p><strong>Error:</strong> {miningResult.error}</p>
                {miningResult.code && <p><strong>Code:</strong> {miningResult.code}</p>}
                <p style={{ fontSize: '12px', opacity: 0.7, marginTop: '10px' }}>
                  Tip: Ensure GPS accuracy is under 50m and move to a different location if the error persists.
                </p>
              </div>
            )}
          </div>
        )}

        {/* Info Section */}
        <div style={{ 
          marginTop: '20px', 
          padding: '15px', 
          background: 'rgba(255,255,255,0.05)', 
          borderRadius: '12px',
          fontSize: '12px',
          lineHeight: '1.6'
        }}>
          <h4 style={{ margin: '0 0 10px 0' }}>📋 How It Works</h4>
          <ol style={{ margin: 0, paddingLeft: '20px' }}>
            <li>Allow location access when prompted</li>
            <li>Ensure GPS accuracy is under 50m</li>
            <li>Tap "Mine This Location" to submit proof</li>
            <li>Earn STEP tokens for each valid proof</li>
            <li>11 proofs on a triangle triggers subdivision</li>
          </ol>
        </div>

        {/* Back to Home */}
        <a 
          href="/" 
          style={{ 
            display: 'block', 
            textAlign: 'center', 
            marginTop: '20px', 
            color: 'rgba(255,255,255,0.6)',
            textDecoration: 'none'
          }}
        >
          ← Back to Home
        </a>
      </div>
    </div>
  );
}
