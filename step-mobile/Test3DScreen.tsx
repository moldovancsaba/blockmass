/**
 * Test3DScreen - Phase 1 Verification
 * 
 * What: Simple test screen to verify SphereMesh3D renders correctly
 * Why: Validate Phase 1 deliverables before proceeding to Phase 2
 * 
 * To test:
 * 1. Replace MapScreen import in App.tsx with this Test3DScreen
 * 2. Run: npm run ios or npm run android
 * 3. Verify: Blue Earth sphere visible, can rotate with touch, pinch-to-zoom works
 * 4. Expected: 60 fps, smooth rotation, no crashes
 * 
 * Reference: MOBILE_3D_MINING_PLAN.md Phase 1 Acceptance Criteria
 * Created: 2025-10-08T09:30:00.000Z
 */

import React, { useState } from 'react';
import { View, Text, StyleSheet, SafeAreaView } from 'react-native';
import EarthMining3D from './src/components/earth/EarthMining3D';

export default function Test3DScreen() {
  const [isReady, setIsReady] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Mock GPS position for testing (San Francisco)
  // Phase 2 will fetch and render spherical triangles at this location
  const mockPosition = {
    lat: 37.7749,
    lon: -122.4194,
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Info Overlay */}
      <View style={styles.overlay}>
        <Text style={styles.title}>Phase 1-3: Complete Visualization</Text>
        <Text style={styles.status}>
          {error ? `❌ Error: ${error.message}` : isReady ? '✅ Ready' : '⏳ Loading...'}
        </Text>
        <Text style={styles.location}>
          📍 San Francisco, CA{'\n'}
          {mockPosition.lat.toFixed(4)}°N, {Math.abs(mockPosition.lon).toFixed(4)}°W
        </Text>
        <Text style={styles.instructions}>
          • Touch drag: Rotate Earth{'\n'}
          • Pinch: Zoom in/out{'\n'}
          • Gold fill: Current triangle{'\n'}
          • Red border (5px): Current triangle{'\n'}
          • Gray fill: Neighbor triangles{'\n'}
          • Black borders (2px): Neighbors{'\n'}
          • Red dot: Your position{'\n'}
          • Expected: Smooth 30+ fps
        </Text>
      </View>

      {/* Complete 3D Mining Visualization (Phase 1-3) */}
      <EarthMining3D
        currentPosition={mockPosition}
        triangleLevel={10}
        onReady={() => {
          console.log('[Test3DScreen] 3D engine ready!');
          setIsReady(true);
        }}
        onError={(err) => {
          console.error('[Test3DScreen] 3D error:', err);
          setError(err);
        }}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  overlay: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    zIndex: 10,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    padding: 16,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FFFFFF',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  status: {
    fontSize: 14,
    color: '#00FF00',
    marginBottom: 8,
  },
  location: {
    fontSize: 12,
    color: '#FFD700',
    marginBottom: 12,
    fontFamily: 'monospace',
  },
  instructions: {
    fontSize: 12,
    color: '#CCCCCC',
    lineHeight: 18,
  },
});
