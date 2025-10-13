/**
 * STEP Map Screen
 * 
 * Main mining interface:
 * - Shows user's current location
 * - Displays current triangle overlay
 * - Mine button to submit location proof
 * - Real-time location tracking
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import * as LocationService from '../lib/location';
import * as MeshClient from '../lib/mesh-client';
import * as WalletLib from '../lib/wallet';
import * as ProofCollector from '../lib/proof-collector';
import { Triangle, Wallet } from '../types';
import { ProofSubmissionResponseV2 } from '../types/proof-v2';
import RawEarthMesh3D from '../components/earth/RawEarthMesh3D';

export default function MapScreen() {
  // State
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<LocationService.LocationData | null>(null);
  const [currentTriangle, setCurrentTriangle] = useState<Triangle | null>(null);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [mining, setMining] = useState<boolean>(false);
  const [miningResult, setMiningResult] = useState<'success' | 'failure' | null>(null); // Phase 5: Mining result for flash feedback
  const [fullScreen3D, setFullScreen3D] = useState<boolean>(false);
  const [lastConfidenceScore, setLastConfidenceScore] = useState<ProofSubmissionResponseV2 | null>(null); // Phase 2.5: Last mining confidence score
  const recenterFnRef = React.useRef<(() => void) | null>(null);
  const refetchActiveFnRef = React.useRef<(() => void) | null>(null);

  /**
   * Initialize app on mount:
   * 1. Check/request location permission
   * 2. Load or create wallet
   * 3. Get current location
   * 4. Fetch current triangle
   */
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setLoading(true);

      // 1. Check location permission
      let permission = await LocationService.checkLocationPermission();
      if (!permission.granted) {
        permission = await LocationService.requestLocationPermission();
        if (!permission.granted) {
          Alert.alert(
            'Location Permission Required',
            'STEP needs your location to verify where you are on Earth for mining.',
            [{ text: 'OK' }]
          );
          setLoading(false);
          return;
        }
      }
      setLocationPermission(true);

      // 2. Load or create wallet
      let loadedWallet = await WalletLib.loadWallet();
      if (!loadedWallet) {
        console.log('No wallet found, generating new wallet...');
        loadedWallet = await WalletLib.generateWallet();
      }
      setWallet(loadedWallet);
      console.log('Wallet loaded:', loadedWallet.address);

      // 3. Get current location
      await updateLocation();

      setLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setLoading(false);
      Alert.alert('Initialization Error', String(error));
    }
  };

  /**
   * Update current location and fetch triangle.
   */
  const updateLocation = async () => {
    try {
      // Get GPS location
      const location = await LocationService.getCurrentLocation();
      setCurrentLocation(location);
      console.log(`Location: ${location.latitude}, ${location.longitude} (±${location.accuracy}m)`);

      // Validate accuracy
      if (!LocationService.isAccuracySufficient(location.accuracy)) {
        Alert.alert(
          'GPS Accuracy Warning',
          `GPS accuracy is ${Math.round(location.accuracy)}m. For mining, accuracy must be better than 50m. Please wait for better GPS signal.`
        );
      }

      // Fetch triangle at this location
      // Use level 10 for city-level precision (~1-2km triangles)
      const triangle = await MeshClient.getTriangleAt(
        location.latitude,
        location.longitude,
        10 // City level
      );
      setCurrentTriangle(triangle);
      console.log('Current triangle:', triangle.triangleId);
    } catch (error) {
      console.error('Error updating location:', error);
      Alert.alert('Location Error', String(error));
    }
  };

  /**
   * Mine button handler (Phase 2.5 with ProofPayloadV2):
   * 1. Validate location accuracy
   * 2. Generate nonce for replay protection
   * 3. Collect all proof data (device, cell, GNSS, attestation)
   * 4. Build ProofPayloadV2 with enhanced anti-spoofing data
   * 5. Sign entire payload with EIP-191
   * 6. Submit to validator API
   * 7. Display reward and confidence score breakdown
   */
  const handleMine = async () => {
    if (!currentLocation || !currentTriangle || !wallet) {
      Alert.alert('Not Ready', 'Please wait for location and wallet to load.');
      return;
    }

    if (!LocationService.isAccuracySufficient(currentLocation.accuracy)) {
      Alert.alert(
        'GPS Accuracy Too Low',
        `Current accuracy: ${Math.round(currentLocation.accuracy)}m. Need better than 50m for mining.`
      );
      return;
    }

    try {
      setMining(true);

      // Generate nonce (UUID v4) for replay protection
      // Each proof must have unique nonce, even for same location/triangle
      const nonce = generateUuid();
      
      console.log('[MapScreen] Building ProofPayloadV2 with enhanced anti-spoofing data...');
      
      // Phase 2.5: Build complete proof payload with device data, cell tower, GNSS, attestation
      // This collects all available data sources for maximum confidence score
      const payloadV2 = await ProofCollector.buildProofPayloadV2(
        wallet.address,
        currentTriangle.triangleId,
        {
          lat: currentLocation.latitude,
          lon: currentLocation.longitude,
          alt: currentLocation.altitude ?? undefined, // Convert null to undefined
          accuracy: currentLocation.accuracy,
        },
        nonce
      );
      
      console.log('[MapScreen] ProofPayloadV2 built:', {
        device: payloadV2.device.model,
        hasCell: !!payloadV2.cell,
        hasGnss: payloadV2.gnss?.rawAvailable || false,
        attestation: payloadV2.attestation.substring(0, 30) + '...',
      });

      // Build signable message (v2 uses JSON stringification)
      const message = MeshClient.buildSignableMessageV2(payloadV2);
      console.log('[MapScreen] Signing ProofPayloadV2...');

      // Sign with EIP-191 (Ethereum personal_sign)
      const signature = await WalletLib.signMessage(message);
      console.log('[MapScreen] Signature:', signature.substring(0, 20) + '...');

      // Submit proof to validator (Phase 2.5 endpoint with confidence scoring)
      console.log('[MapScreen] Submitting to Phase 2.5 validator...');
      const result = await MeshClient.submitProofV2(payloadV2, signature);
      
      // DEBUG: Log full API response
      console.log('[MapScreen] ProofSubmissionResponseV2:', JSON.stringify(result, null, 2));
      console.log('[MapScreen] Confidence:', result.confidence, '/', 100);
      console.log('[MapScreen] Confidence Level:', result.confidenceLevel);
      console.log('[MapScreen] Balance:', result.balance);
      console.log('[MapScreen] Reward:', result.reward);
      
      // Store confidence score for UI display
      setLastConfidenceScore(result);
      
      // Handle response
      if (result.ok) {
        // Phase 5: Trigger success flash feedback
        setMiningResult('success');
        setTimeout(() => setMiningResult(null), 300); // Clear after flash duration
        
        // Success - display reward with confidence score breakdown
        const scoreBreakdown = [
          `Total Confidence: ${result.confidence}/100 (${result.confidenceLevel})`,
          '',
          'Score Breakdown:',
          `  • Signature: ${result.scores.signature}/20`,
          `  • GPS Accuracy: ${result.scores.gpsAccuracy}/15`,
          `  • Speed Gate: ${result.scores.speedGate}/10`,
          `  • Moratorium: ${result.scores.moratorium}/5`,
          `  • Attestation: ${result.scores.attestation}/25`,
          `  • GNSS Raw: ${result.scores.gnssRaw}/15`,
          `  • Cell Tower: ${result.scores.cellTower}/10`,
        ].join('\n');
        
        Alert.alert(
          '🎉 Mining Successful!',
          `You earned ${result.reward} STEP tokens!\n\n${scoreBreakdown}\n\nNew Balance: ${result.balance} STEP`
        );
        
        // Refetch active triangles to update click-based colors after mining
        // This ensures the just-mined triangle's color updates immediately
        if (refetchActiveFnRef.current) {
          console.log('[MapScreen] Refetching active triangles after successful mining');
          refetchActiveFnRef.current();
        }
      } else {
        // Phase 5: Trigger failure flash feedback
        setMiningResult('failure');
        setTimeout(() => setMiningResult(null), 300); // Clear after flash duration
        
        // Error - display with confidence breakdown
        const errorDetails = [
          result.error || 'Unknown error',
          '',
          `Confidence: ${result.confidence}/100 (${result.confidenceLevel})`,
          '',
          'Issues detected:',
          ...(result.reasons || ['No specific reasons provided']).map(r => `  • ${r}`),
        ].join('\n');
        
        Alert.alert(
          '❌ Mining Failed',
          errorDetails,
          [{ text: 'OK' }]
        );
      }

      setMining(false);
    } catch (error) {
      console.error('Error mining:', error);
      setMining(false);
      Alert.alert('Mining Error', String(error));
    }
  };
  
  /**
   * Generate UUID v4 for nonce.
   * 
   * Simple implementation using crypto random values.
   * Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
   */
  const generateUuid = (): string => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  
  /**
   * Get user-friendly error message for error codes.
   * 
   * Provides guidance for common issues users can fix.
   */
  const getErrorMessage = (code: string, message: string): string => {
    switch (code) {
      case 'LOW_GPS_ACCURACY':
        return 'GPS accuracy is too low. Move to an open area with clear sky view for better signal.';
      case 'OUT_OF_BOUNDS':
        return 'Your location is outside the triangle boundary. This can happen if GPS drifts. Refresh location and try again.';
      case 'TOO_FAST':
        return 'You\'re moving too fast for mining. Slow down and try again.';
      case 'MORATORIUM':
        return 'Please wait at least 10 seconds between mining attempts.';
      case 'NONCE_REPLAY':
        return 'This proof was already submitted. Please try again.';
      case 'BAD_SIGNATURE':
        return 'Signature verification failed. Please restart the app and try again.';
      case 'NETWORK_ERROR':
        return 'Network error. Check your internet connection and try again.';
      case 'INTERNAL_ERROR':
        if (message.includes('E11000') || message.includes('duplicate key')) {
          return '⚠️ Triangle subdivision failed (Backend Issue)\n\nThis triangle has reached maximum clicks and needs to subdivide into 4 children, but the backend mesh database is not properly seeded.\n\nTechnical: The backend tried to create a subdivision event with null values, causing a database constraint violation.\n\nThis is a BACKEND issue that requires:\n1. Seeding the mesh database\n2. Fixing subdivision logic\n\nYour mobile app is working correctly!';
        }
        return `Backend Internal Error: ${message}`;
      default:
        return `Error: ${message} (Code: ${code})`;
    }
  };

  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#000000" />
        <Text style={styles.loadingText}>Initializing STEP...</Text>
      </View>
    );
  }

  if (!locationPermission) {
    return (
      <View style={styles.centerContainer}>
        <Text style={styles.errorText}>Location permission required</Text>
        <TouchableOpacity style={styles.button} onPress={initializeApp}>
          <Text style={styles.buttonText}>Grant Permission</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="dark" />

      {/* Full-screen 3D view */}
      {fullScreen3D ? (
        <View style={styles.fullScreenContainer}>
          <RawEarthMesh3D
            currentPosition={currentLocation ? {
              lat: currentLocation.latitude,
              lon: currentLocation.longitude,
            } : undefined}
            triangleLevel={10}
            onRecenterReady={(fn) => { recenterFnRef.current = fn; }}
            onRefetchActiveReady={(fn) => { refetchActiveFnRef.current = fn; }}
            isMining={mining}
            miningResult={miningResult}
          />
          
          {/* Floating controls overlay */}
          <View style={styles.floatingControls}>
            <TouchableOpacity
              style={styles.floatingButton}
              onPress={() => setFullScreen3D(false)}
            >
              <Text style={styles.floatingButtonText}>✕ Exit</Text>
            </TouchableOpacity>
            
            <TouchableOpacity
              style={styles.floatingButton}
              onPress={() => {
                if (recenterFnRef.current) {
                  recenterFnRef.current();
                } else {
                  console.warn('Recenter function not ready yet');
                }
              }}
            >
              <Text style={styles.floatingButtonText}>📍 Re-center</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : (
        <>
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>STEP Miner</Text>
            {wallet && (
              <Text style={styles.subtitle}>
                {wallet.address.substring(0, 10)}...{wallet.address.substring(wallet.address.length - 4)}
              </Text>
            )}
          </View>

          {/* 3D Mining Visualization - RAW THREE.JS WITH SPHERICAL TRIANGLES */}
          <View style={styles.mapContainer}>
            <RawEarthMesh3D
              currentPosition={currentLocation ? {
                lat: currentLocation.latitude,
                lon: currentLocation.longitude,
              } : undefined}
              triangleLevel={10}
              onRecenterReady={(fn) => { recenterFnRef.current = fn; }}
              onRefetchActiveReady={(fn) => { refetchActiveFnRef.current = fn; }}
              isMining={mining}
              miningResult={miningResult}
            />
            
            {/* Expand button overlay */}
            <TouchableOpacity
              style={styles.expandButton}
              onPress={() => setFullScreen3D(true)}
            >
              <Text style={styles.expandButtonText}>⛶ Full Screen</Text>
            </TouchableOpacity>
          </View>

          {/* Location Info */}
          {currentLocation && (
            <View style={styles.infoPanel}>
              <Text style={styles.infoTitle}>Current Location</Text>
              <Text style={styles.infoText}>
                Lat: {currentLocation.latitude.toFixed(6)}
              </Text>
              <Text style={styles.infoText}>
                Lon: {currentLocation.longitude.toFixed(6)}
              </Text>
              <Text style={styles.infoText}>
                Accuracy: ±{Math.round(currentLocation.accuracy)}m
              </Text>
              {currentTriangle && (
                <>
                  <Text style={[styles.infoTitle, styles.spacer]}>Current Triangle</Text>
                  <Text style={styles.triangleId}>{currentTriangle.triangleId}</Text>
                  <Text style={styles.infoText}>Level: {currentTriangle.level}</Text>
                </>
              )}
              
              {/* Phase 2.5: Confidence Score Display */}
              {lastConfidenceScore && (
                <>
                  <Text style={[styles.infoTitle, styles.spacer]}>Last Proof Security</Text>
                  <View style={styles.confidenceContainer}>
                    <Text style={[
                      styles.confidenceScore,
                      lastConfidenceScore.confidence >= 90 ? styles.confidenceVeryHigh :
                      lastConfidenceScore.confidence >= 75 ? styles.confidenceHigh :
                      lastConfidenceScore.confidence >= 50 ? styles.confidenceMedium :
                      styles.confidenceLow
                    ]}>
                      {lastConfidenceScore.confidence}/100
                    </Text>
                    <Text style={styles.confidenceLevel}>
                      {lastConfidenceScore.confidenceLevel}
                    </Text>
                  </View>
                  <Text style={styles.confidenceBreakdown}>
                    Sig:{lastConfidenceScore.scores.signature} 
                    GPS:{lastConfidenceScore.scores.gpsAccuracy} 
                    Attest:{lastConfidenceScore.scores.attestation} 
                    GNSS:{lastConfidenceScore.scores.gnssRaw} 
                    Cell:{lastConfidenceScore.scores.cellTower}
                  </Text>
                </>
              )}
            </View>
          )}

          {/* Action Buttons */}
          <View style={styles.actions}>
            <TouchableOpacity
              style={[styles.button, styles.secondaryButton]}
              onPress={updateLocation}
              disabled={mining}
            >
              <Text style={styles.buttonText}>🔄 Refresh Location</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.button,
                styles.primaryButton,
                (mining || !currentTriangle) && styles.buttonDisabled,
              ]}
              onPress={handleMine}
              disabled={mining || !currentTriangle}
            >
              <Text style={styles.buttonText}>
                {mining ? '⏳ Mining...' : '⛏️ MINE'}
              </Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  header: {
    padding: 20,
    paddingTop: 60, // Account for status bar
    backgroundColor: '#000000',
    borderBottomWidth: 2,
    borderBottomColor: '#FFFFFF',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
  },
  subtitle: {
    fontSize: 12,
    color: '#CCCCCC',
    marginTop: 4,
  },
  mapContainer: {
    flex: 1,
    backgroundColor: '#000000',
    margin: 10,
    borderWidth: 2,
    borderColor: '#000000',
  },
  infoPanel: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#000000',
    margin: 10,
    padding: 15,
  },
  infoTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  infoText: {
    fontSize: 12,
    fontFamily: 'monospace',
    marginBottom: 4,
  },
  triangleId: {
    fontSize: 10,
    fontFamily: 'monospace',
    marginBottom: 4,
    color: '#0066CC',
  },
  spacer: {
    marginTop: 16,
  },
  // Phase 2.5: Confidence score UI styles
  confidenceContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    gap: 8,
  },
  confidenceScore: {
    fontSize: 24,
    fontWeight: 'bold',
  },
  confidenceVeryHigh: {
    color: '#00AA00', // Dark green
  },
  confidenceHigh: {
    color: '#88CC00', // Light green
  },
  confidenceMedium: {
    color: '#FF8800', // Orange
  },
  confidenceLow: {
    color: '#CC0000', // Red
  },
  confidenceLevel: {
    fontSize: 12,
    color: '#666',
    fontWeight: '600',
  },
  confidenceBreakdown: {
    fontSize: 10,
    color: '#999',
    marginTop: 4,
    fontFamily: 'monospace',
  },
  actions: {
    padding: 10,
    gap: 10,
  },
  button: {
    backgroundColor: '#000000',
    padding: 16,
    borderRadius: 0,
    borderWidth: 2,
    borderColor: '#000000',
    alignItems: 'center',
  },
  primaryButton: {
    backgroundColor: '#000000',
  },
  secondaryButton: {
    backgroundColor: '#FFFFFF',
  },
  buttonDisabled: {
    backgroundColor: '#CCCCCC',
    borderColor: '#CCCCCC',
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 14,
    color: '#666666',
  },
  errorText: {
    fontSize: 16,
    color: '#CC0000',
    marginBottom: 20,
    textAlign: 'center',
  },
  // Full-screen 3D view styles
  fullScreenContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  floatingControls: {
    position: 'absolute',
    top: 60,
    right: 20,
    gap: 10,
  },
  floatingButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    minWidth: 120,
  },
  floatingButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  expandButton: {
    position: 'absolute',
    top: 10,
    right: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 8,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  expandButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
