/**
 * Seed Global Mesh State
 * 
 * Purpose: Initialize MongoDB with the 20 base icosahedron triangles.
 * Run this once after deploying the backend to seed the global mesh.
 * 
 * Usage:
 *   npx ts-node scripts/seed-global-mesh.ts
 */

import { config } from 'dotenv';
config();

import { connectToDb, closeDb } from '../core/db';
import { GlobalMeshTriangleModel } from '../core/state/global-mesh-schema';
import { ICOSAHEDRON_VERTICES, ICOSAHEDRON_FACES } from '../core/mesh/icosahedron';

// 20 vibrant colors for base triangles (must match mobile app)
const VIBRANT_COLORS = [
  '#E6194B', '#3CB44B', '#FFE119', '#4363D8', '#F58231',
  '#911EB4', '#46F0F0', '#F032E6', '#BCF60C', '#FABEBE',
  '#008080', '#E6BEFF', '#9A6324', '#FFFAC8', '#800000',
  '#AAFFC3', '#808000', '#FFD8B1', '#000075', '#808080',
];

async function seedGlobalMesh() {
  console.log('[seed-global-mesh] Starting...');
  
  try {
    // Connect to MongoDB
    console.log('[seed-global-mesh] Connecting to MongoDB...');
    await connectToDb();
    console.log('[seed-global-mesh] Connected to MongoDB');
    
    // Check if mesh already exists
    const existingCount = await GlobalMeshTriangleModel.countDocuments();
    if (existingCount > 0) {
      console.log(`[seed-global-mesh] ⚠️  Mesh already exists with ${existingCount} triangles`);
      console.log('[seed-global-mesh] To reset, manually clear the collection first');
      await closeDb();
      return;
    }
    
    // Generate 20 base triangles
    console.log('[seed-global-mesh] Generating 20 base triangles...');
    const baseTriangles: any[] = [];
    
    for (let i = 0; i < ICOSAHEDRON_FACES.length; i++) {
      const face = ICOSAHEDRON_FACES[i];
      const v0 = ICOSAHEDRON_VERTICES[face.vertices[0]];
      const v1 = ICOSAHEDRON_VERTICES[face.vertices[1]];
      const v2 = ICOSAHEDRON_VERTICES[face.vertices[2]];
      
      baseTriangles.push({
        triangleId: `ICO-${i}`,
        vertices: [
          [v0.x, v0.y, v0.z],
          [v1.x, v1.y, v1.z],
          [v2.x, v2.y, v2.z],
        ],
        baseColor: VIBRANT_COLORS[i],
        clicks: 0,
        subdivided: false,
        children: [],
        parent: null,
        level: 0,
        createdAt: new Date(),
        lastMined: null,
      });
    }
    
    // Insert into database
    console.log('[seed-global-mesh] Inserting into MongoDB...');
    await GlobalMeshTriangleModel.insertMany(baseTriangles);
    
    console.log(`[seed-global-mesh] ✅ Successfully seeded ${baseTriangles.length} base triangles`);
    console.log('[seed-global-mesh] Global mesh is ready for mining!');
    
    // Verify
    const finalCount = await GlobalMeshTriangleModel.countDocuments();
    console.log(`[seed-global-mesh] Verification: ${finalCount} triangles in database`);
    
  } catch (error) {
    console.error('[seed-global-mesh] ❌ Error:', error);
    throw error;
  } finally {
    await closeDb();
    console.log('[seed-global-mesh] Done');
  }
}

// Run if called directly
if (require.main === module) {
  seedGlobalMesh()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { seedGlobalMesh };
