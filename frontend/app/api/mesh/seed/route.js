import { NextResponse } from 'next/server';
import mongoose from '@/app/_lib/db';
import Triangle from '@/app/_models/Triangle';

// Icosahedron vertices (unit sphere)
const ICOSAHEDRON_VERTICES = [
  [0, 1, 0],           // Top
  [0.894427, 0.447214, 0],  // Face 1
  [0.276393, 0.723607, 0.630925],  // Face 2
  [-0.723607, 0.447214, 0.525731],  // Face 3
  [-0.723607, 0.447214, -0.525731], // Face 4
  [-0.276393, 0.723607, -0.630925], // Face 5
  [0.276393, 0.723607, -0.630925],  // Face 6
  [0.723607, 0.447214, -0.525731],  // Face 7
  [0.723607, 0.447214, 0.525731],   // Face 8
  [-0.276393, 0.723607, 0.630925],  // Face 9
  [-0.894427, 0.447214, 0],         // Face 10
  [-0.894427, -0.447214, 0],        // Face 11
  [-0.276393, -0.723607, 0.630925], // Face 12
  [0.276393, -0.723607, 0.630925],  // Face 13
  [0.894427, -0.447214, 0],         // Face 14
  [0.723607, -0.447214, -0.525731], // Face 15
  [-0.723607, -0.447214, -0.525731],// Face 16
  [-0.723607, -0.447214, 0.525731], // Face 17
  [0.276393, -0.723607, -0.630925], // Face 18
  [0.723607, -0.447214, 0.525731],  // Face 19
  [0, -1, 0],            // Bottom
];

// Icosahedron faces (vertex indices) - 20 triangles
const ICOSAHEDRON_FACES = [
  [0, 1, 2],   // Top region
  [0, 2, 3],
  [0, 3, 4],
  [0, 4, 5],
  [0, 5, 6],
  [0, 6, 7],
  [0, 7, 8],
  [0, 8, 9],
  [0, 9, 10],
  [0, 10, 1],
  [11, 12, 13], // Bottom region
  [11, 13, 14],
  [11, 14, 15],
  [11, 15, 16],
  [11, 16, 17],
  [11, 17, 18],
  [11, 18, 19],
  [11, 19, 12],
  [11, 12, 10],
  [11, 10, 9],
];

// Face letters for triangle IDs (A-T)
const FACE_LETTERS = 'ABCDEFGHIJKLMNOPQRST';

// Convert 3D vector to lat/lon
function vector3ToLatLon(v) {
  const r = Math.sqrt(v[0]*v[0] + v[1]*v[1] + v[2]*v[2]);
  const lat = Math.asin(v[1] / r) * (180 / Math.PI);
  const lon = Math.atan2(v[0], v[2]) * (180 / Math.PI);
  return [lon, lat]; // GeoJSON format: [lon, lat]
}

// Generate triangle ID
function generateTriangleId(faceIndex, level, path = '') {
  const faceLetter = FACE_LETTERS[faceIndex];
  return `STEP-TRI-v1:${faceLetter}${level}-${path.padStart(20, '0')}-V75`;
}

export async function POST(request) {
  try {
    await mongoose.connect();

    // Check if mesh already exists
    const existingCount = await Triangle.countDocuments({ level: 1 });
    if (existingCount > 0) {
      return NextResponse.json({
        ok: true,
        message: 'Mesh already seeded',
        count: existingCount,
      });
    }

    const triangles = [];
    const bulkOps = [];

    // Create Level 1 triangles (icosahedron faces)
    for (let i = 0; i < ICOSAHEDRON_FACES.length; i++) {
      const face = ICOSAHEDRON_FACES[i];
      
      // Get vertices in 3D
      const v3d = face.map(idx => ICOSAHEDRON_VERTICES[idx]);
      
      // Convert to lat/lon for polygon
      const coords = v3d.map(v => vector3ToLatLon(v));
      
      // Calculate centroid
      const centroidLon = coords.reduce((sum, c) => sum + c[0], 0) / 3;
      const centroidLat = coords.reduce((sum, c) => sum + c[1], 0) / 3;

      const triangleId = generateTriangleId(i, 1, '');

      const triangleData = {
        triangleId,
        level: 1,
        centroid: {
          type: 'Point',
          coordinates: [centroidLon, centroidLat],
        },
        polygon: {
          type: 'Polygon',
          coordinates: [[...coords, coords[0]]], // Close the polygon
        },
        clicks: 0,
        status: 'pending',
        parent: null,
        children: [],
      };

      bulkOps.push({
        insertOne: { document: triangleData },
      });
    }

    // Bulk insert all triangles
    if (bulkOps.length > 0) {
      await Triangle.bulkWrite(bulkOps);
    }

    const count = await Triangle.countDocuments({ level: 1 });

    return NextResponse.json({
      ok: true,
      message: 'Successfully seeded icosahedron mesh',
      count,
      triangles: triangles.map(t => t.triangleId),
    });
  } catch (error) {
    console.error('Mesh seed error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
