/**
 * Simplified Mesh API with lazy imports
 * 
 * Loads modules only when endpoints are called, not at server startup.
 */

import express, { Request, Response } from 'express';

const router = express.Router();

/**
 * GET /mesh/triangleAt
 */
router.get('/triangleAt', async (req: Request, res: Response) => {
  try {
    const { lat, lon, level } = req.query;

    if (!lat || !lon || !level) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_PARAMS', message: 'Required: lat, lon, level' },
        timestamp: new Date().toISOString(),
      });
    }

    // Lazy import
    const { pointToTriangle } = await import('../core/mesh/lookup.js');
    const { encodeTriangleId, estimateSideLength } = await import('../core/mesh/addressing.js');
    const { triangleIdToCentroid } = await import('../core/mesh/polygon.js');

    const triangleId = pointToTriangle(
      parseFloat(lat as string),
      parseFloat(lon as string),
      parseInt(level as string, 10)
    );

    if (!triangleId) {
      return res.status(404).json({
        ok: false,
        error: { code: 'NOT_FOUND', message: 'No triangle found' },
        timestamp: new Date().toISOString(),
      });
    }

    res.json({
      ok: true,
      result: {
        triangleId: encodeTriangleId(triangleId),
        face: triangleId.face,
        level: triangleId.level,
        path: triangleId.path,
        centroid: triangleIdToCentroid(triangleId),
        estimatedSideLength: Math.round(estimateSideLength(triangleId.level)),
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /mesh/search
 */
router.get('/search', async (req: Request, res: Response) => {
  try {
    const { bbox, level, maxResults, includePolygon } = req.query;

    if (!bbox || !level) {
      return res.status(400).json({
        ok: false,
        error: { code: 'MISSING_PARAMS', message: 'Required: bbox, level' },
        timestamp: new Date().toISOString(),
      });
    }

    // Lazy imports
    const { trianglesInBbox } = await import('../core/mesh/lookup.js');
    const { encodeTriangleId } = await import('../core/mesh/addressing.js');
    const { triangleIdToCentroid, triangleIdToPolygon } = await import('../core/mesh/polygon.js');

    const bboxParts = (bbox as string).split(',').map(parseFloat);
    const levelNum = parseInt(level as string, 10);
    const maxResultsNum = maxResults ? Math.min(parseInt(maxResults as string, 10), 10000) : 1000;

    const triangleIds = trianglesInBbox(
      bboxParts as [number, number, number, number],
      levelNum,
      maxResultsNum
    );

    const triangles = triangleIds.map((id) => {
      const result: any = {
        triangleId: encodeTriangleId(id),
        centroid: triangleIdToCentroid(id),
      };

      if (includePolygon === 'true') {
        result.polygon = triangleIdToPolygon(id);
      }

      return result;
    });

    res.json({
      ok: true,
      result: {
        bbox: bboxParts,
        level: levelNum,
        count: triangles.length,
        triangles,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(500).json({
      ok: false,
      error: { code: 'INTERNAL_ERROR', message: error.message },
      timestamp: new Date().toISOString(),
    });
  }
});

/**
 * GET /mesh/polygon/:triangleId
 */
router.get('/polygon/:triangleId', async (req: Request, res: Response) => {
  try {
    const { triangleId } = req.params;

    // Lazy imports
    const { decodeTriangleId } = await import('../core/mesh/addressing.js');
    const { triangleIdToPolygon } = await import('../core/mesh/polygon.js');

    const decoded = decodeTriangleId(triangleId);
    const polygon = triangleIdToPolygon(decoded);

    res.json({
      ok: true,
      result: { triangleId, polygon },
      timestamp: new Date().toISOString(),
    });
  } catch (error: any) {
    res.status(400).json({
      ok: false,
      error: { code: 'INVALID_TRIANGLE_ID', message: error.message },
      timestamp: new Date().toISOString(),
    });
  }
});

export default router;
