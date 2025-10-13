/**
 * Raw Three.js Test - Direct expo-gl implementation
 * 
 * BYPASSES @react-three/fiber completely
 * Uses raw Three.js + expo-gl for guaranteed rendering
 */

import React, { useEffect, useRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { GLView } from 'expo-gl';
import { Renderer, TextureLoader } from 'expo-three';
import * as THREE from 'three';

export default function RawThreeTest() {
  const timeoutRef = useRef<number | null>(null);

  const onContextCreate = async (gl: any) => {
    console.log('[RawThreeTest] GL Context created');

    // Setup renderer
    const renderer = new Renderer({ gl });
    renderer.setSize(gl.drawingBufferWidth, gl.drawingBufferHeight);
    renderer.setClearColor(0xFFFFFF, 1.0); // White background
    console.log('[RawThreeTest] Renderer created');

    // Setup scene
    const scene = new THREE.Scene();
    console.log('[RawThreeTest] Scene created');

    // Setup camera
    const camera = new THREE.PerspectiveCamera(
      75,
      gl.drawingBufferWidth / gl.drawingBufferHeight,
      0.1,
      1000
    );
    camera.position.z = 5;
    console.log('[RawThreeTest] Camera at z=5');

    // Add lights
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    const directionalLight = new THREE.DirectionalLight(0xffffff, 1.0);
    directionalLight.position.set(5, 5, 5);
    scene.add(directionalLight);
    console.log('[RawThreeTest] Lights added');

    // Create BRIGHT RED cube at origin
    const geometry = new THREE.BoxGeometry(1, 1, 1);
    const material = new THREE.MeshBasicMaterial({ 
      color: 0xff0000,
      side: THREE.DoubleSide 
    });
    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(0, 0, 0);
    scene.add(cube);
    console.log('[RawThreeTest] RED CUBE added at origin');

    // Create BRIGHT GREEN sphere
    const sphereGeo = new THREE.SphereGeometry(0.8, 32, 32);
    const sphereMat = new THREE.MeshBasicMaterial({ 
      color: 0x00ff00,
      side: THREE.DoubleSide 
    });
    const sphere = new THREE.Mesh(sphereGeo, sphereMat);
    sphere.position.set(2, 0, 0);
    scene.add(sphere);
    console.log('[RawThreeTest] GREEN SPHERE added at x=2');

    // Log scene
    console.log('[RawThreeTest] Scene children:', scene.children.length);
    scene.children.forEach(child => {
      console.log(`[RawThreeTest] - ${child.type}:`, child);
    });

    // Render loop
    const render = () => {
      timeoutRef.current = requestAnimationFrame(render);

      // Rotate cube
      cube.rotation.x += 0.01;
      cube.rotation.y += 0.01;

      // Rotate sphere
      sphere.rotation.y += 0.02;

      // Render scene
      renderer.render(scene, camera);
      gl.endFrameEXP();
    };

    console.log('[RawThreeTest] Starting render loop');
    render();
  };

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        cancelAnimationFrame(timeoutRef.current);
      }
    };
  }, []);

  return (
    <View style={styles.container}>
      <GLView style={styles.glView} onContextCreate={onContextCreate} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FF00FF', // Magenta to verify container
  },
  glView: {
    flex: 1,
    backgroundColor: '#FFFF00', // Yellow to verify GLView
  },
});
