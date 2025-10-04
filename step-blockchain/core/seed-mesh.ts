/**
 * STEP Mesh Database Seeding Script
 * 
 * Populates MongoDB with real triangle data for development and testing.
 * 
 * Purpose:
 * - Replace mock triangle fallback in mobile app with real mesh data
 * - Enable triangle breakdown and navigation testing (parent/children)
 * - Provide test data for Budapest and SF simulator coordinates
 * 
 * Strategy:
 * - Seeds triangles at levels 1, 5, 10, 15 for test locations
 * - Includes full ancestor chains (for parent navigation)
 * - Includes children for subdivision testing
 * - Uses idempotent upserts for safe re-execution
 * 
 * Usage:
 *   npm run seed
 * 
 * Rollback:
 *   db.triangles.deleteMany({ dataset: "seed-mesh:<timestamp>" })
 * 
 * Version: 0.2.1
 * Author: AI Developer
 * Created: 2025-10-04T09:20:00.000Z
 */

// Load environment variables from .env file
// Required for MongoDB connection URI
import { config } from 'dotenv';
config();

import { connectToDb, closeDb } from './db.js';
import { Triangle } from './state/schemas.js';
import { pointToTriangle } from './mesh/lookup.js';
import {
  encodeTriangleId,
  getParentId,
  getChildrenIds,
  pathToBigInt,
  TriangleId,
} from './mesh/addressing.js';
import {
  triangleIdToPolygon,
  triangleIdToCentroid,
} from './mesh/polygon.js';

/**
 * Test coordinates for seeding.
 * 
 * Budapest: Production location for field testing
 * SF Simulator: iOS simulator default location for development
 */
const TEST_COORDS = [
  { name: 'Budapest', lat: 47.4979, lon: 19.0402 },
  { name: 'SF Simulator', lat: 37.785834, lon: -122.406417 },
];

/**
 * Target levels to seed.
 * 
 * Level 1: Base icosahedron (20 triangles globally)
 * Level 5: City-level coverage (~5,000 triangles per continent)
 * Level 10: Neighborhood-level (~15 km triangles)
 * Level 15: Block-level (~500m triangles)
 */
const TARGET_LEVELS = [1, 5, 10, 15];

/**
 * Dataset tag for this seed run.
 * Allows selective rollback of seeded data.
 * Format: seed-mesh:YYYY-MM-DDTHH:MM:SS.sssZ
 */
const RUN_DATASET_TAG = `seed-mesh:${new Date().toISOString()}`;

/**
 * Main seeding function.
 * 
 * Algorithm:
 * 1. Connect to MongoDB
 * 2. For each test coordinate:
 *    a. Find triangles at target levels covering the point
 *    b. Build ancestor chains (for parent navigation)
 *    c. Add children (for subdivision testing)
 * 3. For each unique triangle:
 *    a. Compute geometry (polygon, centroid)
 *    b. Upsert to database (idempotent)
 *    c. Update parent-child relationships
 * 4. Close MongoDB connection
 */
async function seed() {
  const startTime = Date.now();
  console.log(`\n${'='.repeat(70)}`);
  console.log(`  STEP Mesh Database Seeding`);
  console.log(`${'='.repeat(70)}`);
  console.log(`  Started: ${new Date().toISOString()}`);
  console.log(`  Dataset Tag: ${RUN_DATASET_TAG}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    // Connect to MongoDB
    console.log(`[${new Date().toISOString()}] Connecting to MongoDB...`);
    await connectToDb();
    console.log(`[${new Date().toISOString()}] MongoDB connected\n`);

    // Ensure indexes are synced
    console.log(`[${new Date().toISOString()}] Syncing triangle indexes...`);
    await Triangle.syncIndexes();
    console.log(`[${new Date().toISOString()}] Indexes synced\n`);

    // Collect all unique triangles to insert
    const trianglesToSeed = new Map<string, TriangleId>();

    // For each test location
    for (const coord of TEST_COORDS) {
      console.log(`\n${'─'.repeat(70)}`);
      console.log(`Processing: ${coord.name} (${coord.lat}, ${coord.lon})`);
      console.log(`${'─'.repeat(70)}\n`);

      // For each target level
      for (const level of TARGET_LEVELS) {
        console.log(`  Level ${level}:`);

        // Find triangle at this level covering the point
        const triangleId = pointToTriangle(coord.lat, coord.lon, level);

        if (!triangleId) {
          console.warn(`    ⚠️  No triangle found at level ${level}`);
          continue;
        }

        const encodedId = encodeTriangleId(triangleId);
        console.log(`    ✓ Triangle found: ${encodedId.substring(0, 40)}...`);

        // Add this triangle to collection
        trianglesToSeed.set(encodedId, triangleId);

        // Add full ancestor chain (for parent navigation)
        // This ensures users can navigate from deep levels back to level 1
        let currentId = triangleId;
        while (currentId.level > 1) {
          const parentId = getParentId(currentId);
          const parentEncoded = encodeTriangleId(parentId);
          if (!trianglesToSeed.has(parentEncoded)) {
            trianglesToSeed.set(parentEncoded, parentId);
            console.log(`    ↑ Added parent: ${parentEncoded.substring(0, 40)}... (level ${parentId.level})`);
          }
          currentId = parentId;
        }

        // Add children (for subdivision testing)
        // This enables testing the subdivision UI when triangles are "mined out"
        if (level < 21) {
          try {
            const children = getChildrenIds(triangleId);
            console.log(`    ↓ Adding ${children.length} children...`);
            for (const child of children) {
              const childEncoded = encodeTriangleId(child);
              if (!trianglesToSeed.has(childEncoded)) {
                trianglesToSeed.set(childEncoded, child);
              }
            }
          } catch (error) {
            // Level 21 cannot subdivide
            console.log(`    ℹ️  Level ${level} children not added (max depth or error)`);
          }
        }
      }
    }

    console.log(`\n${'='.repeat(70)}`);
    console.log(`  Total unique triangles to seed: ${trianglesToSeed.size}`);
    console.log(`${'='.repeat(70)}\n`);

    // Now upsert all triangles to database
    let insertedCount = 0;
    let updatedCount = 0;
    let errorCount = 0;

    console.log(`[${new Date().toISOString()}] Upserting triangles to database...\n`);

    for (const [encodedId, triangleId] of trianglesToSeed.entries()) {
      try {
        // Compute geometry
        // GeoJSON format: coordinates are [longitude, latitude] (NOT lat/lon!)
        // This is critical for MongoDB 2dsphere indexes and GeoJSON spec compliance
        const polygon = triangleIdToPolygon(triangleId);
        const centroid = triangleIdToCentroid(triangleId);

        // Compute parent ID (null for level 1)
        const parentId = triangleId.level > 1 ? encodeTriangleId(getParentId(triangleId)) : null;

        // Compute children IDs (empty array for level 21)
        let childrenIds: string[] = [];
        if (triangleId.level < 21) {
          try {
            const children = getChildrenIds(triangleId);
            childrenIds = children.map((c) => encodeTriangleId(c));
          } catch (error) {
            // Level 21 or error
            childrenIds = [];
          }
        }

        // Encode path as BigInt string for MongoDB storage
        const pathEncoded = pathToBigInt(triangleId.path).toString();

        // Prepare document for upsert
        // Why upsert: Makes script idempotent - can run multiple times safely
        // $set: Updates fields that might change (geometry, relationships)
        // $setOnInsert: Only sets these fields if document is being created
        const result = await Triangle.updateOne(
          { _id: encodedId },
          {
            $set: {
              // Update geometry (in case mesh utils improve)
              centroid,
              polygon,
              // Update relationships
              parentId,
              childrenIds,
              // Identity fields
              face: triangleId.face,
              level: triangleId.level,
              pathEncoded,
            },
            $setOnInsert: {
              // Only set these on insert (don't overwrite existing state)
              state: 'pending',
              clicks: 0,
              // Moratorium starts now for new triangles
              // In production, this would be set when first mined
              moratoriumStartAt: new Date(),
              lastClickAt: null,
              // Dataset tag for rollback capability
              dataset: RUN_DATASET_TAG,
            },
          },
          {
            upsert: true,
            // Return the document after update
            // @ts-ignore - Mongoose typing issue with upsert
            new: true,
          }
        );

        if (result.upsertedCount > 0) {
          insertedCount++;
          if (insertedCount <= 5 || insertedCount % 20 === 0) {
            console.log(`  ✓ Inserted: ${encodedId.substring(0, 50)}... (level ${triangleId.level})`);
          }
        } else if (result.modifiedCount > 0) {
          updatedCount++;
          if (updatedCount <= 3) {
            console.log(`  ↻ Updated: ${encodedId.substring(0, 50)}... (level ${triangleId.level})`);
          }
        }
      } catch (error) {
        errorCount++;
        console.error(`  ✗ Error seeding ${encodedId}:`, error instanceof Error ? error.message : error);
        if (errorCount > 10) {
          throw new Error(`Too many errors (${errorCount}). Aborting seed.`);
        }
      }
    }

    // Print summary
    const endTime = Date.now();
    const duration = ((endTime - startTime) / 1000).toFixed(2);

    console.log(`\n${'='.repeat(70)}`);
    console.log(`  Seeding Complete!`);
    console.log(`${'='.repeat(70)}`);
    console.log(`  Inserted:  ${insertedCount} new triangles`);
    console.log(`  Updated:   ${updatedCount} existing triangles`);
    console.log(`  Errors:    ${errorCount}`);
    console.log(`  Duration:  ${duration}s`);
    console.log(`  Dataset:   ${RUN_DATASET_TAG}`);
    console.log(`${'='.repeat(70)}\n`);

    // Verify database state
    console.log(`[${new Date().toISOString()}] Verifying database state...\n`);
    
    const levelCounts = await Promise.all(
      TARGET_LEVELS.map(async (level) => {
        const count = await Triangle.countDocuments({ level });
        return { level, count };
      })
    );

    console.log(`Triangle counts by level:`);
    for (const { level, count } of levelCounts) {
      console.log(`  Level ${level.toString().padStart(2)}: ${count.toString().padStart(6)} triangles`);
    }

    console.log(`\n✅ Mesh database seeded successfully!\n`);
    console.log(`Next steps:`);
    console.log(`  1. Restart mesh API: npm run dev`);
    console.log(`  2. Test mobile app - should now show real triangle data`);
    console.log(`  3. Verify no 404 warnings in mobile app logs\n`);

    console.log(`Rollback command (if needed):`);
    console.log(`  db.triangles.deleteMany({ dataset: "${RUN_DATASET_TAG}" })\n`);

  } catch (error) {
    console.error(`\n❌ Seeding failed:`, error);
    console.error(`\nError details:`, error instanceof Error ? error.stack : error);
    process.exit(1);
  } finally {
    // Always close database connection
    console.log(`[${new Date().toISOString()}] Closing MongoDB connection...`);
    await closeDb();
    console.log(`[${new Date().toISOString()}] MongoDB connection closed\n`);
  }
}

// Run seeding
seed().catch((error) => {
  console.error('Unhandled error in seed script:', error);
  process.exit(1);
});
