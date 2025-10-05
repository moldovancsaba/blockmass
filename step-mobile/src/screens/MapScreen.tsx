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
  ScrollView,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import * as LocationService from '../lib/location';
import * as MeshClient from '../lib/mesh-client';
import * as WalletLib from '../lib/wallet';
import { collectProofData } from '../lib/proof-collector';
import { Triangle } from '../types';
import { ProofCollectionProgress, ProofSubmissionResponseV2 } from '../types/proof-v2';
import * as TestMode from '../lib/test-mode';

export default function MapScreen() {
  // State
  const [locationPermission, setLocationPermission] = useState<boolean>(false);
  const [currentLocation, setCurrentLocation] = useState<LocationService.LocationData | null>(null);
  const [currentTriangle, setCurrentTriangle] = useState<Triangle | null>(null);
  const [wallet, setWallet] = useState<WalletLib.Wallet | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [mining, setMining] = useState<boolean>(false);
  const [collectionProgress, setCollectionProgress] = useState<ProofCollectionProgress | null>(null);
  const [lastResult, setLastResult] = useState<ProofSubmissionResponseV2 | null>(null);
  const [testMode, setTestModeState] = useState<boolean>(TestMode.isTestModeEnabled());
  const [compareMode, setCompareMode] = useState<boolean>(false);
  const [comparisonResult, setComparisonResult] = useState<{
    testMode: ProofSubmissionResponseV2 | null;
    production: ProofSubmissionResponseV2 | null;
  }>({ testMode: null, production: null });

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
   * Mine button handler (Phase 2.5 - ProofPayloadV2):
   * 1. Validate location accuracy
   * 2. Collect all proof data (location, GNSS, cell, attestation)
   * 3. Build ProofPayloadV2 payload
   * 4. Sign payload with wallet
   * 5. Submit to validator API
   * 6. Display confidence score and reward
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
      setCollectionProgress(null);
      setLastResult(null);

      console.log(`[MapScreen] Starting Phase 2.5 proof collection... (Test Mode: ${testMode ? 'ON' : 'OFF'})`);

      // Collect all proof data (location, GNSS, cell, attestation)
      // Use test mode if enabled (DEV only)
      const collectionOptions = {
        includeGnss: true,  // Android only, will be skipped on iOS
        includeCell: true,
        onProgress: (progress) => {
          console.log(`[MapScreen] ${progress.message} (${progress.percentage}%)`);
          setCollectionProgress(progress);
        },
      };

      const collectionResult = testMode
        ? await TestMode.collectProofDataTestMode(
            wallet.address,
            currentTriangle.triangleId,
            collectionOptions
          )
        : await collectProofData(
            wallet.address,
            currentTriangle.triangleId,
            collectionOptions
          );

      if (!collectionResult.success || !collectionResult.payload) {
        setMining(false);
        setCollectionProgress(null);
        Alert.alert(
          'Collection Failed',
          collectionResult.error || 'Failed to collect proof data'
        );
        return;
      }

      const payload = collectionResult.payload;

      // Display warnings if any
      if (collectionResult.warnings && collectionResult.warnings.length > 0) {
        console.warn('[MapScreen] Collection warnings:', collectionResult.warnings);
      }

      console.log('[MapScreen] Proof data collected successfully');
      console.log(`[MapScreen] Collection time: ${collectionResult.collectionTime}ms`);

      // Sign the payload
      setCollectionProgress({
        step: 'signing',
        message: 'Signing with wallet...',
        percentage: 95,
      });

      const message = MeshClient.buildSignableMessageV2(payload);
      const signature = await WalletLib.signMessage(message);
      console.log('[MapScreen] Payload signed');

      // Submit to validator (or use test mode, or compare both)
      console.log(`[MapScreen] Submitting to validator API... (Test Mode: ${testMode ? 'ON' : 'OFF'}, Compare: ${compareMode ? 'ON' : 'OFF'})`);
      
      let result: ProofSubmissionResponseV2;
      
      if (compareMode) {
        // COMPARE MODE: Submit to both test and production
        console.log('[MapScreen] COMPARE MODE: Testing both fake and real data');
        
        // Test mode result
        const testResult = await TestMode.submitProofTestMode(payload, signature);
        
        // Production API result
        const prodResult = await MeshClient.submitProofV2(payload, signature);
        
        // Store both for comparison display
        setComparisonResult({
          testMode: testResult,
          production: prodResult,
        });
        
        // Use production result as primary
        result = prodResult;
        
        console.log('[MapScreen] COMPARE MODE Results:');
        console.log(`  Test Mode: ${testResult.confidence}/100`);
        console.log(`  Production: ${prodResult.confidence}/100`);
        console.log(`  Difference: ${Math.abs(testResult.confidence - prodResult.confidence)} points`);
      } else {
        // Normal mode
        result = testMode
          ? await TestMode.submitProofTestMode(payload, signature)
          : await MeshClient.submitProofV2(payload, signature);
        
        // Clear comparison when not in compare mode
        setComparisonResult({ testMode: null, production: null });
      }

      // Store result for display
      setLastResult(result);
      setCollectionProgress(null);
      setMining(false);

      // Handle response
      if (result.ok) {
        // Success - show confidence score breakdown
        const confidenceEmoji = getConfidenceEmoji(result.confidence);
        
        // Build alert message
        let alertMessage = `Confidence Score: ${result.confidence}/100 (${result.confidenceLevel})\n\n`;
        
        // Add comparison if in compare mode
        if (compareMode && comparisonResult.testMode && comparisonResult.production) {
          const diff = Math.abs(comparisonResult.testMode.confidence - comparisonResult.production.confidence);
          alertMessage += `🔬 COMPARISON:\n`;
          alertMessage += `Test Mode: ${comparisonResult.testMode.confidence}/100\n`;
          alertMessage += `Production: ${comparisonResult.production.confidence}/100\n`;
          alertMessage += `Difference: ${diff} points\n\n`;
        }
        
        alertMessage += `Score Breakdown:\n` +
          `• Signature: ${result.scores.signature}/20\n` +
          `• GPS Accuracy: ${result.scores.gpsAccuracy}/15\n` +
          `• Speed Gate: ${result.scores.speedGate}/10\n` +
          `• Moratorium: ${result.scores.moratorium}/5\n` +
          `• Attestation: ${result.scores.attestation}/25\n` +
          `• GNSS Raw: ${result.scores.gnssRaw}/15\n` +
          `• Cell Tower: ${result.scores.cellTower}/10\n\n` +
          `Reward: ${result.reward} STEP\n` +
          `New Balance: ${result.balance} STEP`;
        
        Alert.alert(
          `${confidenceEmoji} Mining Successful!`,
          alertMessage
        );
      } else {
        // Error
        Alert.alert(
          'Mining Failed',
          result.error || result.message || 'Unknown error',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('[MapScreen] Mining error:', error);
      setMining(false);
      setCollectionProgress(null);
      Alert.alert('Mining Error', String(error));
    }
  };

  /**
   * Get emoji for confidence level
   */
  const getConfidenceEmoji = (confidence: number): string => {
    if (confidence >= 90) return '🏆';
    if (confidence >= 75) return '🎉';
    if (confidence >= 60) return '✅';
    if (confidence >= 40) return '⚠️';
    return '❌';
  };

  /**
   * Toggle test mode on/off
   */
  const toggleTestMode = () => {
    const newValue = !testMode;
    setTestModeState(newValue);
    TestMode.setTestMode(newValue);
    
    // If turning on test mode, turn off compare mode
    if (newValue && compareMode) {
      setCompareMode(false);
    }
    
    Alert.alert(
      'Test Mode',
      `Test mode is now ${newValue ? 'ENABLED' : 'DISABLED'}.\n\n` +
      (newValue
        ? 'The app will use simulated data for testing UI and flows without real hardware attestation.'
        : 'The app will use real data collection and API calls.'),
      [{ text: 'OK' }]
    );
  };

  /**
   * Toggle compare mode on/off
   */
  const toggleCompareMode = () => {
    const newValue = !compareMode;
    setCompareMode(newValue);
    
    // If turning on compare mode, turn off test mode
    if (newValue && testMode) {
      setTestModeState(false);
      TestMode.setTestMode(false);
    }
    
    Alert.alert(
      'Compare Mode',
      `Compare mode is now ${newValue ? 'ENABLED' : 'DISABLED'}.\n\n` +
      (newValue
        ? 'The app will submit to BOTH test mode and production API, showing you the difference in confidence scores.\n\nThis helps you see how fake data compares to real calculations.'
        : 'The app will use normal submission mode.'),
      [{ text: 'OK' }]
    );
  };

  /**
   * Wake up production API
   */
  const wakeUpApi = async () => {
    try {
      setLoading(true);
      console.log('[MapScreen] Waking up production API...');
      
      const response = await fetch('https://step-blockchain-api.onrender.com/health');
      const data = await response.json();
      
      setLoading(false);
      Alert.alert(
        '🚀 API Awake!',
        `Production API is ready.\n\nService: ${data.service}\nVersion: ${data.version}\n\nYou can now mine with production data.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      setLoading(false);
      Alert.alert(
        'Wake Up Failed',
        `Could not reach API: ${error}\n\nMake sure you have internet connection.`,
        [{ text: 'OK' }]
      );
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

      {/* Header - Fixed at top */}
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View>
            <Text style={styles.title}>STEP Miner</Text>
            {wallet && (
              <Text style={styles.subtitle}>
                {wallet.address.substring(0, 10)}...{wallet.address.substring(wallet.address.length - 4)}
              </Text>
            )}
          </View>
          {__DEV__ && (
            <View style={styles.headerButtons}>
              <TouchableOpacity
                style={[styles.testModeButton, testMode && styles.testModeButtonActive]}
                onPress={toggleTestMode}
              >
                <Text style={styles.testModeButtonText}>
                  {testMode ? '🧪 TEST' : '💼 PROD'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.testModeButton, compareMode && styles.compareModeActive]}
                onPress={toggleCompareMode}
              >
                <Text style={styles.testModeButtonText}>
                  {compareMode ? '🔬 CMP' : '🔵 ---'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
        {testMode && (
          <View style={styles.testModeBanner}>
            <Text style={styles.testModeBannerText}>
              ⚠️ TEST MODE: Using simulated data
            </Text>
          </View>
        )}
        {compareMode && (
          <View style={styles.compareModeBanner}>
            <Text style={styles.compareModeBannerText}>
              🔬 COMPARE MODE: Testing fake vs real data
            </Text>
          </View>
        )}
      </View>

      {/* Scrollable Content */}
      <ScrollView 
        style={styles.scrollContent}
        contentContainerStyle={styles.scrollContentContainer}
        showsVerticalScrollIndicator={true}
      >
        {/* Map Placeholder - TODO: Replace with actual map */}
        <View style={styles.mapPlaceholder}>
          <Text style={styles.mapText}>📍 Map View</Text>
          <Text style={styles.mapSubtext}>(Mapbox integration coming soon)</Text>
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
        </View>
      )}

      {/* Collection Progress */}
      {collectionProgress && (
        <View style={styles.progressPanel}>
          <Text style={styles.progressTitle}>📡 Collecting Proof Data</Text>
          <View style={styles.progressBar}>
            <View style={[styles.progressFill, { width: `${collectionProgress.percentage}%` }]} />
          </View>
          <Text style={styles.progressText}>{collectionProgress.message}</Text>
          <Text style={styles.progressPercentage}>{collectionProgress.percentage}%</Text>
        </View>
      )}

      {/* Last Result - Confidence Score Display */}
      {lastResult && lastResult.ok && (
        <View style={styles.resultPanel}>
          <Text style={styles.resultTitle}>
            {getConfidenceEmoji(lastResult.confidence)} Last Mining Result
          </Text>
          <View style={styles.confidenceDisplay}>
            <Text style={styles.confidenceScore}>{lastResult.confidence}/100</Text>
            <Text style={styles.confidenceLevel}>{lastResult.confidenceLevel}</Text>
          </View>
          <View style={styles.scoreBreakdown}>
            <ScoreRow label="Signature" score={lastResult.scores.signature} max={20} />
            <ScoreRow label="GPS Accuracy" score={lastResult.scores.gpsAccuracy} max={15} />
            <ScoreRow label="Speed Gate" score={lastResult.scores.speedGate} max={10} />
            <ScoreRow label="Moratorium" score={lastResult.scores.moratorium} max={5} />
            <ScoreRow label="Attestation" score={lastResult.scores.attestation} max={25} />
            <ScoreRow label="GNSS Raw" score={lastResult.scores.gnssRaw} max={15} />
            <ScoreRow label="Cell Tower" score={lastResult.scores.cellTower} max={10} />
          </View>
          <View style={styles.rewardDisplay}>
            <Text style={styles.rewardText}>Reward: {lastResult.reward} STEP</Text>
            <Text style={styles.balanceText}>Balance: {lastResult.balance} STEP</Text>
          </View>
        </View>
      )}

        {/* Comparison Results */}
        {compareMode && comparisonResult.testMode && comparisonResult.production && (
          <View style={styles.comparisonPanel}>
            <Text style={styles.comparisonTitle}>🔬 Comparison Results</Text>
            <View style={styles.comparisonRow}>
              <View style={styles.comparisonColumn}>
                <Text style={styles.comparisonLabel}>Test Mode (Fake)</Text>
                <Text style={styles.comparisonScore}>{comparisonResult.testMode.confidence}/100</Text>
                <Text style={styles.comparisonLevel}>{comparisonResult.testMode.confidenceLevel}</Text>
              </View>
              <View style={styles.comparisonDivider} />
              <View style={styles.comparisonColumn}>
                <Text style={styles.comparisonLabel}>Production (Real)</Text>
                <Text style={styles.comparisonScore}>{comparisonResult.production.confidence}/100</Text>
                <Text style={styles.comparisonLevel}>{comparisonResult.production.confidenceLevel}</Text>
              </View>
            </View>
            <View style={styles.comparisonDiff}>
              <Text style={styles.comparisonDiffText}>
                Difference: {Math.abs(comparisonResult.testMode.confidence - comparisonResult.production.confidence)} points
              </Text>
            </View>
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

        {__DEV__ && !testMode && (
          <TouchableOpacity
            style={[styles.button, styles.wakeUpButton]}
            onPress={wakeUpApi}
            disabled={mining || loading}
          >
            <Text style={styles.buttonText}>🚀 Wake Up API</Text>
          </TouchableOpacity>
        )}

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
      </ScrollView>
    </View>
  );
}

/**
 * Score row component for confidence breakdown
 */
function ScoreRow({ label, score, max }: { label: string; score: number; max: number }) {
  const percentage = max > 0 ? (score / max) * 100 : 0;
  const barColor = percentage >= 80 ? '#00CC00' : percentage >= 50 ? '#FFAA00' : '#CC0000';

  return (
    <View style={styles.scoreRow}>
      <Text style={styles.scoreLabel}>{label}</Text>
      <View style={styles.scoreBarContainer}>
        <View style={[styles.scoreBar, { width: `${percentage}%`, backgroundColor: barColor }]} />
      </View>
      <Text style={styles.scoreValue}>{score}/{max}</Text>
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
  headerTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  headerButtons: {
    flexDirection: 'row',
    gap: 8,
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
  testModeButton: {
    backgroundColor: '#333333',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#666666',
  },
  testModeButtonActive: {
    backgroundColor: '#FF9800',
    borderColor: '#FF9800',
  },
  compareModeActive: {
    backgroundColor: '#2196F3',
    borderColor: '#2196F3',
  },
  testModeButtonText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: 'bold',
  },
  testModeBanner: {
    backgroundColor: '#FF9800',
    paddingVertical: 8,
    marginTop: 12,
    borderRadius: 4,
  },
  testModeBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  compareModeBanner: {
    backgroundColor: '#2196F3',
    paddingVertical: 8,
    marginTop: 12,
    borderRadius: 4,
  },
  compareModeBannerText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  comparisonPanel: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
    margin: 10,
    padding: 15,
  },
  comparisonTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1565C0',
    textAlign: 'center',
  },
  comparisonRow: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  comparisonColumn: {
    flex: 1,
    alignItems: 'center',
  },
  comparisonDivider: {
    width: 2,
    backgroundColor: '#2196F3',
    marginHorizontal: 10,
  },
  comparisonLabel: {
    fontSize: 11,
    color: '#1565C0',
    marginBottom: 8,
  },
  comparisonScore: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#1565C0',
  },
  comparisonLevel: {
    fontSize: 10,
    color: '#1565C0',
    marginTop: 4,
  },
  comparisonDiff: {
    backgroundColor: '#FFFFFF',
    padding: 8,
    borderRadius: 4,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  comparisonDiffText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: '#1565C0',
    textAlign: 'center',
  },
  wakeUpButton: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  scrollContent: {
    flex: 1,
  },
  scrollContentContainer: {
    flexGrow: 1,
    paddingBottom: 20, // Extra padding at bottom
  },
  mapPlaceholder: {
    height: 200, // Fixed height instead of flex: 1
    backgroundColor: '#F0F0F0',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#000000',
    margin: 10,
  },
  mapText: {
    fontSize: 32,
  },
  mapSubtext: {
    fontSize: 12,
    color: '#666666',
    marginTop: 8,
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
    marginTop: 12,
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
  progressPanel: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
    margin: 10,
    padding: 15,
  },
  progressTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#1565C0',
  },
  progressBar: {
    height: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#2196F3',
    marginBottom: 8,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#2196F3',
  },
  progressText: {
    fontSize: 12,
    color: '#1565C0',
    marginBottom: 4,
  },
  progressPercentage: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#1565C0',
    textAlign: 'right',
  },
  resultPanel: {
    backgroundColor: '#F1F8E9',
    borderWidth: 2,
    borderColor: '#8BC34A',
    margin: 10,
    padding: 15,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 12,
    color: '#558B2F',
  },
  confidenceDisplay: {
    alignItems: 'center',
    marginBottom: 16,
  },
  confidenceScore: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#558B2F',
  },
  confidenceLevel: {
    fontSize: 14,
    color: '#558B2F',
    marginTop: 4,
  },
  scoreBreakdown: {
    marginBottom: 12,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  scoreLabel: {
    fontSize: 11,
    width: 80,
    color: '#33691E',
  },
  scoreBarContainer: {
    flex: 1,
    height: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#8BC34A',
    marginHorizontal: 8,
    overflow: 'hidden',
  },
  scoreBar: {
    height: '100%',
  },
  scoreValue: {
    fontSize: 11,
    fontFamily: 'monospace',
    width: 40,
    textAlign: 'right',
    color: '#33691E',
  },
  rewardDisplay: {
    borderTopWidth: 1,
    borderTopColor: '#8BC34A',
    paddingTop: 12,
    marginTop: 8,
  },
  rewardText: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#558B2F',
    marginBottom: 4,
  },
  balanceText: {
    fontSize: 12,
    color: '#558B2F',
  },
});
