import { NextResponse } from 'next/server';
import mongoose from '@/app/_lib/db';
import Triangle from '@/app/_models/Triangle';

export async function GET(request) {
  try {
    await mongoose.connect();

    const { searchParams } = new URL(request.url);
    const bbox = searchParams.get('bbox')?.split(',').map(Number);
    const level = parseInt(searchParams.get('level')) || 10;
    const maxResults = parseInt(searchParams.get('maxResults')) || 100;
    const includePolygon = searchParams.get('includePolygon') === 'true';

    if (!bbox || bbox.length !== 4) {
      return NextResponse.json(
        { ok: false, error: 'Invalid bbox parameter' },
        { status: 400 }
      );
    }

    const [minLon, minLat, maxLon, maxLat] = bbox;

    // Build query
    const query = {
      level,
      'centroid.coordinates': {
        $geoWithin: {
          $box: [[minLon, minLat], [maxLon, maxLat]],
        },
      },
    };

    // Build projection
    const projection = {
      triangleId: 1,
      level: 1,
      centroid: 1,
      clicks: 1,
      status: 1,
      ...(includePolygon && { polygon: 1 }),
    };

    const triangles = await Triangle.find(query, projection)
      .limit(maxResults)
      .lean();

    return NextResponse.json({
      ok: true,
      result: {
        triangles,
        count: triangles.length,
      },
    });
  } catch (error) {
    console.error('Mesh search error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
