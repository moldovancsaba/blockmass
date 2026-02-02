import { NextResponse } from 'next/server';
import mongoose from '@/app/_lib/db';
import Triangle from '@/app/_models/Triangle';

export async function GET(request, { params }) {
  try {
    await mongoose.connect();

    const { id } = params;
    const triangleId = decodeURIComponent(id);

    const triangle = await Triangle.findOne({ triangleId: triangleId }).lean();

    if (!triangle || !triangle.polygon) {
      return NextResponse.json(
        { ok: false, error: 'Triangle or polygon not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ok: true,
      result: {
        triangleId: triangle.triangleId,
        level: triangle.level,
        polygon: triangle.polygon,
        centroid: triangle.centroid,
        clicks: triangle.clicks,
        status: triangle.status,
      },
    });
  } catch (error) {
    console.error('Polygon fetch error:', error);
    return NextResponse.json(
      { ok: false, error: error.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
