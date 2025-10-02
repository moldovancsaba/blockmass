/**
 * STEP Mesh Engine Demo
 * 
 * Simple script to demonstrate mesh functionality.
 * 
 * Run: tsx core/demo.ts
 */

import { pointToTriangle } from './mesh/lookup.js';
import {
  encodeTriangleId,
  estimateSideLength,
  getChildrenIds,
} from './mesh/addressing.js';
import {
  triangleIdToPolygon,
  triangleIdToCentroid,
  triangleIdToArea,
} from './mesh/polygon.js';

console.log(`
═══════════════════════════════════════════════════
  STEP Mesh Engine Demo - v0.1.0
═══════════════════════════════════════════════════
`);

// Test coordinates: Budapest, Hungary
const lat = 47.4979;
const lon = 19.0402;
const level = 10;

console.log(`\n📍 Finding triangle for Budapest:`);
console.log(`   Coordinates: ${lat}°N, ${lon}°E`);
console.log(`   Target level: ${level}\n`);

// Find triangle
const triangleId = pointToTriangle(lat, lon, level);

if (!triangleId) {
  console.error('❌ No triangle found!');
  process.exit(1);
}

console.log(`✅ Triangle found!`);
console.log(`   Face: ${triangleId.face}`);
console.log(`   Level: ${triangleId.level}`);
console.log(`   Path: [${triangleId.path.join(', ')}]`);

// Encode ID
const encoded = encodeTriangleId(triangleId);
console.log(`   Encoded ID: ${encoded}`);

// Get polygon
const polygon = triangleIdToPolygon(triangleId);
console.log(`\n🔷 Polygon vertices:`);
polygon.coordinates[0].slice(0, 3).forEach((coord, i) => {
  console.log(`   Vertex ${i + 1}: [${coord[0].toFixed(4)}°, ${coord[1].toFixed(4)}°]`);
});

// Get centroid
const centroid = triangleIdToCentroid(triangleId);
console.log(`\n📌 Centroid:`);
console.log(`   [${centroid.coordinates[0].toFixed(4)}°, ${centroid.coordinates[1].toFixed(4)}°]`);

// Get area
const area = triangleIdToArea(triangleId);
console.log(`\n📐 Measurements:`);
console.log(`   Area: ${(area / 1_000_000).toFixed(2)} km²`);
console.log(`   Estimated side length: ${(estimateSideLength(level) / 1000).toFixed(2)} km`);

// Get children
const children = getChildrenIds(triangleId);
console.log(`\n🌳 Children (${children.length} triangles at level ${level + 1}):`);
children.forEach((child, i) => {
  console.log(`   Child ${i}: ${encodeTriangleId(child)}`);
});

console.log(`\n═══════════════════════════════════════════════════`);
console.log(`✅ Demo complete! Mesh engine is working.`);
console.log(`═══════════════════════════════════════════════════\n`);
