/**
 * Standalone Map Screen - Full-Screen Interactive Mesh
 * 
 * Full-screen 3D Earth visualization with minimal UI.
 * Statistics toggle button, bottom navigation only.
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

import * as LocationService from '../lib/location';
import StandaloneEarthMesh3D from '../components/earth/StandaloneEarthMesh3D';

export default function StandaloneMapScreen() {
  // State
  const [currentLocation, setCurrentLocation] = useState<LocationService.LocationData | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [showStats, setShowStats] = useState<boolean>(false);
  const [meshStats, setMeshStats] = useState<{
    totalTriangles: number;
    activeTriangles: number;
    visibleTriangles: number;
    totalClicks: number;
    screenCenterGPS?: { lat: number; lon: number; altitude: number; visibleWidth: number };
  }>({ totalTriangles: 0, activeTriangles: 0, visibleTriangles: 0, totalClicks: 0 });

  /**
   * Initialize app on mount.
   */
  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      setLoading(true);

      // Check/request location permission
      let permission = await LocationService.checkLocationPermission();
      if (!permission.granted) {
        permission = await LocationService.requestLocationPermission();
      }

      // Get current location (silent fail if no permission)
      if (permission.granted) {
        await updateLocation();
      }

      setLoading(false);
    } catch (error) {
      console.error('Error initializing app:', error);
      setLoading(false);
    }
  };

  /**
   * Update current location.
   */
  const updateLocation = async () => {
    try {
      const location = await LocationService.getCurrentLocation();
      setCurrentLocation(location);
      console.log(`[StandaloneMapScreen] Location: ${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`);
    } catch (error) {
      console.error('[StandaloneMapScreen] Error updating location:', error);
    }
  };

  // Loading state
  if (loading) {
    return (
      <View style={styles.centerContainer}>
        <ActivityIndicator size="large" color="#FFFFFF" />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      
      {/* Full-Screen 3D Mesh Visualization */}
      <StandaloneEarthMesh3D
        currentPosition={currentLocation ? {
          lat: currentLocation.latitude,
          lon: currentLocation.longitude,
        } : undefined}
        onMeshStatsUpdate={setMeshStats}
      />

      {/* Statistics Toggle Button */}
      <TouchableOpacity
        style={styles.statsToggleButton}
        onPress={() => setShowStats(!showStats)}
      >
        <Text style={styles.statsToggleText}>{showStats ? '✕' : '📊'}</Text>
      </TouchableOpacity>

      {/* Statistics Panel (Collapsible) */}
      {showStats && (
        <View style={styles.statsPanel}>
          {/* Mesh Statistics */}
          <Text style={styles.statsTitle}>Mesh Statistics</Text>
          <Text style={styles.statsText}>
            Visible: {meshStats.visibleTriangles} (Rendered)
          </Text>
          <Text style={styles.statsText}>
            Active: {meshStats.activeTriangles} (Total Non-Subdivided)
          </Text>
          <Text style={styles.statsText}>
            Total: {meshStats.totalTriangles} (All Levels)
          </Text>
          <Text style={styles.statsText}>
            Clicks: {meshStats.totalClicks}
          </Text>
          
          {/* Screen Center Position */}
          {meshStats.screenCenterGPS && (
            <>
              <Text style={[styles.statsTitle, styles.statsSpacing]}>Screen Center</Text>
              <Text style={styles.statsText}>
                {meshStats.screenCenterGPS.lat.toFixed(4)}, {meshStats.screenCenterGPS.lon.toFixed(4)}
              </Text>
              <Text style={styles.statsText}>
                Alt: {meshStats.screenCenterGPS.altitude.toFixed(1)}km
              </Text>
              <Text style={styles.statsText}>
                View: {meshStats.screenCenterGPS.visibleWidth.toFixed(1)}km wide
              </Text>
            </>
          )}
          
          {/* Device GPS */}
          {currentLocation && (
            <>
              <Text style={[styles.statsTitle, styles.statsSpacing]}>Device GPS</Text>
              <Text style={styles.statsText}>
                {currentLocation.latitude.toFixed(4)}, {currentLocation.longitude.toFixed(4)}
              </Text>
              <Text style={styles.statsText}>
                ±{Math.round(currentLocation.accuracy)}m
              </Text>
            </>
          )}
        </View>
      )}

      {/* Instructions Overlay */}
      <View style={styles.instructionsOverlay}>
        <Text style={styles.instructionsText}>
          Double-tap any triangle to mine it
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  centerContainer: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statsToggleButton: {
    position: 'absolute',
    top: 50,
    right: 20,
    width: 50,
    height: 50,
    borderRadius: 25,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#00FFFF',
  },
  statsToggleText: {
    fontSize: 24,
    color: '#00FFFF',
  },
  statsPanel: {
    position: 'absolute',
    top: 50,
    right: 80,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    padding: 15,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#00FFFF',
    minWidth: 200,
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    color: '#00FFFF',
    marginBottom: 8,
  },
  statsText: {
    fontSize: 12,
    fontFamily: 'monospace',
    color: '#FFFFFF',
    marginBottom: 4,
  },
  statsSpacing: {
    marginTop: 12,
  },
  instructionsOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  instructionsText: {
    fontSize: 14,
    color: '#FFFFFF',
    textAlign: 'center',
  },
});
