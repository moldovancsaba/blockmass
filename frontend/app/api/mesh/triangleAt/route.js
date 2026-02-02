import { NextResponse } from 'next/server';
import mongoose from '@/app/_lib/db';
import Triangle from '@/app/_models/Triangle';

export async function GET(request) {
  try {
    await mongoose.connect();

    const { searchParams } = new URL(request.url);
    const lat = parseFloat(searchParams.get('lat'));
    const lon = parseFloat(searchParams.get('lon'));
    const level = parseInt(searchParams.get('level')) || 10;

    if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
      return NextResponse.json(
        { ok: false, error: 'Invalid coordinates' },
        { status: 400 }
      );
    }

    // Find triangle containing the point using $geoIntersects
    const triangle = await Triangle.findOne({
      level,
      polygon: {
        $geoIntersects: {
          $geometry: {
            type: 'Point',
            coordinates: [lon, lat],
          },
        },
      },
    }).lean();

    if (!triangle) {
      return NextResponse.json({
        ok: true,
        result: {
          triangleId: null,
          message: 'No triangle found at this location for the specified level',
        },
      });
    }

    return NextResponse.json({
      ok: true,
      result: {
        triangleId: triangle.triangleId,
        level: triangle.level,
        centroid: triangle.centroid,
        clicks: triangle.clicks,
        status: triangle.status,
      },
    });
  } catch (error) {
    console.error('Triangle lookup error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
