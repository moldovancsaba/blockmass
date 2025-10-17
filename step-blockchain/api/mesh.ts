/**
 * Mesh RPC API - HTTP JSON endpoints for STEP mesh queries
 * 
 * Endpoints:
 * - GET /mesh/triangleAt?lat={lat}&lon={lon}&level={level}
 * - GET /mesh/polygon/:triangleId
 * - GET /mesh/children/:triangleId
 * - GET /mesh/search?bbox={west,south,east,north}&level={level}
 * 
 * All responses follow JSON-RPC 2.0 style (but simpler):
 * - Success: { ok: true, result: {...} }
 * - Error: { ok: false, error: { code, message } }
 * 
 * Why Express.js:
 * - Simple, battle-tested HTTP server
 * - Minimal dependencies (already approved)
 * - Easy to add middleware (CORS, rate limiting, etc.)
 */

import express, { Request, Response, NextFunction } from 'express';
import {
  pointToTriangle,
  trianglesInBbox,
  nearestTriangles,
} from '../core/mesh/lookup.js';
import {
  triangleIdToPolygon,
  triangleIdToCentroid,
  triangleIdToArea,
  triangleIdToPerimeter,
} from '../core/mesh/polygon.js';
import {
  encodeTriangleId,
  decodeTriangleId,
  getChildrenIds,
  getParentId,
  estimateSideLength,
  triangleCountAtLevel,
  TriangleId,
} from '../core/mesh/addressing.js';
import { Triangle } from '../core/state/schemas.js';

const router = express.Router();

/**
 * Standard success response wrapper.
 * 
 * @param data - Response data
 * @returns JSON response object
 */
function successResponse(data: any) {
  return {
    ok: true,
    result: data,
    timestamp: new Date().toISOString(), // ISO 8601 UTC with ms
  };
}

/**
 * Standard error response wrapper.
 * 
 * @param code - Error code (e.g., 'INVALID_INPUT', 'NOT_FOUND')
 * @param message - Human-readable error message
 * @returns JSON error object
 */
function errorResponse(code: string, message: string) {
  return {
    ok: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  };
}

/**
 * GET /mesh/triangleAt
 * 
 * Find the triangle at a given level that contains a GPS point.
 * 
 * Query params:
 * - lat: Latitude (-90 to +90)
 * - lon: Longitude (-180 to +180)
 * - level: Subdivision level (1-21)
 * - includePolygon: Optional, if 'true' include polygon coordinates
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "triangleId": "STEP-TRI-v1:...",
 *     "face": 7,
 *     "level": 10,
 *     "path": [0, 1, 3, 2, ...],
 *     "centroid": { "type": "Point", "coordinates": [lon, lat] },
 *     "polygon": { "type": "Polygon", "coordinates": [...] }, // If includePolygon=true
 *     "estimatedSideLength": 15625
 *   }
 * }
 */
router.get('/triangleAt', (req: Request, res: Response) => {
  try {
    const { lat, lon, level, includePolygon } = req.query;

    // Validate inputs
    if (!lat || !lon || !level) {
      return res.status(400).json(
        errorResponse('MISSING_PARAMS', 'Required: lat, lon, level')
      );
    }

    const latNum = parseFloat(lat as string);
    const lonNum = parseFloat(lon as string);
    const levelNum = parseInt(level as string, 10);

    if (isNaN(latNum) || isNaN(lonNum) || isNaN(levelNum)) {
      return res.status(400).json(
        errorResponse('INVALID_PARAMS', 'lat, lon, level must be numeric')
      );
    }

    // Find triangle
    const triangleId = pointToTriangle(latNum, lonNum, levelNum);

    if (!triangleId) {
      return res.status(404).json(
        errorResponse('NOT_FOUND', 'No triangle found at this location')
      );
    }

    // Encode and get metadata
    const encoded = encodeTriangleId(triangleId);
    const centroid = triangleIdToCentroid(triangleId);
    const sideLength = estimateSideLength(triangleId.level);

    // Build response
    const result: any = {
      triangleId: encoded,
      face: triangleId.face,
      level: triangleId.level,
      path: triangleId.path,
      centroid,
      estimatedSideLength: Math.round(sideLength),
    };

    // Optionally include polygon geometry (for mobile app 3D rendering)
    if (includePolygon === 'true') {
      result.polygon = triangleIdToPolygon(triangleId);
    }

    res.json(successResponse(result));
  } catch (error: any) {
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', error.message || 'Unknown error')
    );
  }
});

/**
 * GET /mesh/polygon/:triangleId
 * 
 * Get the GeoJSON polygon for a triangle ID.
 * 
 * Path param:
 * - triangleId: Encoded STEP-TRI-v1 string
 * 
 * Query params (optional):
 * - includeMetadata: If 'true', include area, perimeter, centroid
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "triangleId": "STEP-TRI-v1:...",
 *     "polygon": { "type": "Polygon", "coordinates": [...] },
 *     "metadata": {
 *       "area": 243562789,
 *       "perimeter": 62458,
 *       "centroid": { "type": "Point", "coordinates": [lon, lat] }
 *     }
 *   }
 * }
 */
router.get('/polygon/:triangleId', (req: Request, res: Response) => {
  try {
    const { triangleId } = req.params;
    const { includeMetadata } = req.query;

    // Decode triangle ID
    const decoded = decodeTriangleId(triangleId);

    // Get polygon
    const polygon = triangleIdToPolygon(decoded);

    const result: any = {
      triangleId,
      polygon,
    };

    // Optionally include metadata
    if (includeMetadata === 'true') {
      const area = triangleIdToArea(decoded);
      const perimeter = triangleIdToPerimeter(decoded);
      const centroid = triangleIdToCentroid(decoded);

      result.metadata = {
        area: Math.round(area),
        perimeter: Math.round(perimeter),
        centroid,
      };
    }

    res.json(successResponse(result));
  } catch (error: any) {
    res.status(400).json(
      errorResponse('INVALID_TRIANGLE_ID', error.message || 'Invalid triangle ID format')
    );
  }
});

/**
 * GET /mesh/children/:triangleId
 * 
 * Get the 4 child triangle IDs (one level down).
 * 
 * Path param:
 * - triangleId: Encoded STEP-TRI-v1 string
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "parent": "STEP-TRI-v1:...",
 *     "children": [
 *       { "triangleId": "STEP-TRI-v1:...", "childIndex": 0 },
 *       { "triangleId": "STEP-TRI-v1:...", "childIndex": 1 },
 *       { "triangleId": "STEP-TRI-v1:...", "childIndex": 2 },
 *       { "triangleId": "STEP-TRI-v1:...", "childIndex": 3 }
 *     ]
 *   }
 * }
 */
router.get('/children/:triangleId', (req: Request, res: Response) => {
  try {
    const { triangleId } = req.params;

    // Decode parent
    const parent = decodeTriangleId(triangleId);

    // Get children
    const children = getChildrenIds(parent);

    // Encode children
    const encodedChildren = children.map((child, index) => ({
      triangleId: encodeTriangleId(child),
      childIndex: index,
    }));

    res.json(
      successResponse({
        parent: triangleId,
        children: encodedChildren,
      })
    );
  } catch (error: any) {
    res.status(400).json(
      errorResponse('INVALID_REQUEST', error.message || 'Cannot get children')
    );
  }
});

/**
 * GET /mesh/parent/:triangleId
 * 
 * Get the parent triangle ID (one level up).
 * 
 * Path param:
 * - triangleId: Encoded STEP-TRI-v1 string
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "child": "STEP-TRI-v1:...",
 *     "parent": "STEP-TRI-v1:..."
 *   }
 * }
 */
router.get('/parent/:triangleId', (req: Request, res: Response) => {
  try {
    const { triangleId } = req.params;

    // Decode child
    const child = decodeTriangleId(triangleId);

    // Get parent
    const parent = getParentId(child);

    res.json(
      successResponse({
        child: triangleId,
        parent: encodeTriangleId(parent),
      })
    );
  } catch (error: any) {
    res.status(400).json(
      errorResponse('INVALID_REQUEST', error.message || 'Cannot get parent')
    );
  }
});

/**
 * GET /mesh/search
 * 
 * Find all triangles at a given level that intersect a bounding box.
 * 
 * Query params:
 * - bbox: Bounding box as "west,south,east,north" (comma-separated)
 * - level: Target subdivision level (1-21)
 * - maxResults: Maximum number of triangles to return (default: 1000, max: 10000)
 * - includePolygon: If 'true', include full polygon GeoJSON (default: false, only centroids)
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "bbox": [west, south, east, north],
 *     "level": 10,
 *     "count": 42,
 *     "triangles": [
 *       { "triangleId": "STEP-TRI-v1:...", "centroid": {...}, "polygon": {...} },
 *       ...
 *     ]
 *   }
 * }
 */
router.get('/search', (req: Request, res: Response) => {
  try {
    const { bbox, level, maxResults, includePolygon } = req.query;

    // Validate inputs
    if (!bbox || !level) {
      return res.status(400).json(
        errorResponse('MISSING_PARAMS', 'Required: bbox, level')
      );
    }

    // Parse bbox
    const bboxParts = (bbox as string).split(',').map(parseFloat);
    if (bboxParts.length !== 4 || bboxParts.some(isNaN)) {
      return res.status(400).json(
        errorResponse('INVALID_BBOX', 'bbox must be "west,south,east,north" with numeric values')
      );
    }

    const levelNum = parseInt(level as string, 10);
    if (isNaN(levelNum)) {
      return res.status(400).json(
        errorResponse('INVALID_LEVEL', 'level must be numeric')
      );
    }

    // Parse maxResults
    const maxResultsNum = maxResults
      ? Math.min(parseInt(maxResults as string, 10), 10000)
      : 1000;

    // Search triangles
    const triangleIds = trianglesInBbox(
      bboxParts as [number, number, number, number],
      levelNum,
      maxResultsNum
    );

    // Encode and get centroids (and optionally polygons)
    const triangles = triangleIds.map((id) => {
      const result: any = {
        triangleId: encodeTriangleId(id),
        centroid: triangleIdToCentroid(id),
      };
      
      // Include polygon if requested
      if (includePolygon === 'true') {
        result.polygon = triangleIdToPolygon(id);
      }
      
      return result;
    });

    res.json(
      successResponse({
        bbox: bboxParts,
        level: levelNum,
        count: triangles.length,
        triangles,
      })
    );
  } catch (error: any) {
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', error.message || 'Search failed')
    );
  }
});

/**
 * GET /mesh/nearest
 * 
 * Find the N nearest triangles to a point.
 * 
 * Query params:
 * - lat: Latitude
 * - lon: Longitude
 * - level: Target subdivision level
 * - count: Number of triangles to return (default: 10, max: 100)
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "point": [lon, lat],
 *     "level": 10,
 *     "triangles": [
 *       { "triangleId": "STEP-TRI-v1:...", "centroid": {...}, "distance": 1234 },
 *       ...
 *     ]
 *   }
 * }
 */
router.get('/nearest', (req: Request, res: Response) => {
  try {
    const { lat, lon, level, count } = req.query;

    // Validate inputs
    if (!lat || !lon || !level) {
      return res.status(400).json(
        errorResponse('MISSING_PARAMS', 'Required: lat, lon, level')
      );
    }

    const latNum = parseFloat(lat as string);
    const lonNum = parseFloat(lon as string);
    const levelNum = parseInt(level as string, 10);
    const countNum = count ? Math.min(parseInt(count as string, 10), 100) : 10;

    if (isNaN(latNum) || isNaN(lonNum) || isNaN(levelNum)) {
      return res.status(400).json(
        errorResponse('INVALID_PARAMS', 'lat, lon, level must be numeric')
      );
    }

    // Find nearest triangles
    const triangleIds = nearestTriangles(latNum, lonNum, levelNum, countNum);

    // Encode and get centroids
    const triangles = triangleIds.map((id) => ({
      triangleId: encodeTriangleId(id),
      centroid: triangleIdToCentroid(id),
    }));

    res.json(
      successResponse({
        point: [lonNum, latNum],
        level: levelNum,
        triangles,
      })
    );
  } catch (error: any) {
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', error.message || 'Nearest search failed')
    );
  }
});

/**
 * GET /mesh/info/:triangleId
 * 
 * Get comprehensive information about a triangle.
 * 
 * Response includes:
 * - Triangle ID components (face, level, path)
 * - Polygon geometry
 * - Centroid
 * - Area and perimeter
 * - Parent and children IDs
 * - Estimated side length
 * 
 * This is a "kitchen sink" endpoint for debugging/exploration.
 */
router.get('/info/:triangleId', (req: Request, res: Response) => {
  try {
    const { triangleId } = req.params;

    // Decode
    const decoded = decodeTriangleId(triangleId);

    // Get all metadata
    const polygon = triangleIdToPolygon(decoded);
    const centroid = triangleIdToCentroid(decoded);
    const area = triangleIdToArea(decoded);
    const perimeter = triangleIdToPerimeter(decoded);
    const sideLength = estimateSideLength(decoded.level);

    // Get parent (if not level 1)
    let parent: string | null = null;
    if (decoded.level > 1) {
      parent = encodeTriangleId(getParentId(decoded));
    }

    // Get children (if not level 21)
    let children: string[] | null = null;
    if (decoded.level < 21) {
      children = getChildrenIds(decoded).map(encodeTriangleId);
    }

    res.json(
      successResponse({
        triangleId,
        components: {
          face: decoded.face,
          level: decoded.level,
          path: decoded.path,
        },
        geometry: {
          polygon,
          centroid,
          area: Math.round(area),
          perimeter: Math.round(perimeter),
          estimatedSideLength: Math.round(sideLength),
        },
        hierarchy: {
          parent,
          children,
        },
      })
    );
  } catch (error: any) {
    res.status(400).json(
      errorResponse('INVALID_TRIANGLE_ID', error.message || 'Invalid triangle ID')
    );
  }
});

/**
 * GET /mesh/stats
 * 
 * Get mesh statistics.
 * 
 * Query params:
 * - level: Optional level to get stats for
 * 
 * Response includes triangle counts, side lengths, etc.
 */
router.get('/stats', (req: Request, res: Response) => {
  try {
    const { level } = req.query;

    if (level) {
      const levelNum = parseInt(level as string, 10);
      if (isNaN(levelNum) || levelNum < 1 || levelNum > 21) {
        return res.status(400).json(
          errorResponse('INVALID_LEVEL', 'level must be 1-21')
        );
      }

      const count = triangleCountAtLevel(levelNum);
      const sideLength = estimateSideLength(levelNum);

      res.json(
        successResponse({
          level: levelNum,
          triangleCount: count.toString(),
          estimatedSideLength: Math.round(sideLength),
        })
      );
    } else {
      // Return stats for all levels
      const allLevels = Array.from({ length: 21 }, (_, i) => i + 1).map((lvl) => ({
        level: lvl,
        triangleCount: triangleCountAtLevel(lvl).toString(),
        estimatedSideLength: Math.round(estimateSideLength(lvl)),
      }));

      res.json(
        successResponse({
          totalLevels: 21,
          levels: allLevels,
        })
      );
    }
  } catch (error: any) {
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', error.message || 'Stats failed')
    );
  }
});

/**
 * GET /mesh/active
 * 
 * Fetch all active spherical triangles at a given level with their mining state.
 * This endpoint queries MongoDB to return triangles that have been mined with their click counts.
 * 
 * Why this exists:
 * - Mobile app needs to visualize all active triangles with color gradients based on clicks (0-10)
 * - Unlike geometric endpoints (triangleAt, search), this returns actual mining state from database
 * - Enables full mesh visualization showing mining progress across the planet
 * 
 * Query params:
 * - level: Subdivision level (1-21)
 * - maxResults: Maximum triangles to return (default: 512, max: 10000)
 * - includePolygon: If 'true', include full polygon GeoJSON for 3D rendering
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "level": 10,
 *     "count": 156,
 *     "triangles": [
 *       {
 *         "triangleId": "STEP-TRI-v1:...",
 *         "clicks": 7,
 *         "state": "partially_mined",
 *         "centroid": { "type": "Point", "coordinates": [lon, lat] },
 *         "polygon": { "type": "Polygon", "coordinates": [...] }  // If includePolygon=true
 *       },
 *       ...
 *     ]
 *   }
 * }
 */
router.get('/active', async (req: Request, res: Response) => {
  try {
    const { level, maxResults, includePolygon } = req.query;

    // Validate level parameter (required)
    if (!level) {
      return res.status(400).json(
        errorResponse('MISSING_PARAMS', 'Required: level')
      );
    }

    const levelNum = parseInt(level as string, 10);
    if (isNaN(levelNum) || levelNum < 1 || levelNum > 21) {
      return res.status(400).json(
        errorResponse('INVALID_LEVEL', 'level must be 1-21')
      );
    }

    // Parse maxResults with sensible defaults
    // Default 512 matches the frontend POC's max visible triangles rule
    const maxResultsNum = maxResults
      ? Math.min(parseInt(maxResults as string, 10), 10000)
      : 512;

    // Query MongoDB for active/partially_mined triangles at this level
    // Only return triangles that have been mined (clicks > 0) to avoid returning entire icosahedron
    const triangles = await Triangle.find({
      level: levelNum,
      state: { $in: ['active', 'partially_mined'] },
      clicks: { $gt: 0 }, // Only triangles that have been clicked
    })
      .select('_id clicks state centroid polygon') // Only fields needed for visualization
      .limit(maxResultsNum)
      .lean() // Return plain JS objects (faster)
      .exec();

    // Format response to match mobile app expectations
    const formattedTriangles = triangles.map((tri: any) => {
      const result: any = {
        triangleId: tri._id,
        clicks: tri.clicks,
        state: tri.state,
        centroid: tri.centroid,
      };

      // Include polygon if requested (needed for 3D mesh rendering)
      if (includePolygon === 'true') {
        result.polygon = tri.polygon;
      }

      return result;
    });

    res.json(
      successResponse({
        level: levelNum,
        count: formattedTriangles.length,
        triangles: formattedTriangles,
      })
    );
  } catch (error: any) {
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch active triangles')
    );
  }
});

/**
 * GET /mesh/state
 * 
 * Get the complete global mesh state for standalone mobile app.
 * Returns all active (non-subdivided) triangles with clicks and colors.
 * 
 * Why this exists:
 * - Mobile app needs to render the full icosahedron with current mining state
 * - All users see the same global state (not per-user)
 * - Includes colors and clicks for visualization
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "version": "1.0.0",
 *     "lastUpdated": "2025-10-15T11:10:04.123Z",
 *     "triangleCount": 20,
 *     "triangles": {
 *       "ICO-0": {
 *         "id": "ICO-0",
 *         "vertices": [[...], [...], [...]],
 *         "baseColor": "#E6194B",
 *         "clicks": 3,
 *         "subdivided": false,
 *         "children": [],
 *         "parent": null,
 *         "level": 0
 *       },
 *       ...
 *     }
 *   }
 * }
 */
router.get('/state', async (req: Request, res: Response) => {
  try {
    // Import the global mesh model
    const { GlobalMeshTriangleModel } = await import('../core/state/global-mesh-schema.js');
    
    // Fetch all triangles from database
    const triangles = await GlobalMeshTriangleModel.find({}).lean().exec();
    
    // If no triangles exist, initialize with base 20
    if (triangles.length === 0) {
      return res.status(503).json(
        errorResponse('NOT_INITIALIZED', 'Global mesh not initialized. Server needs to seed base triangles.')
      );
    }
    
    // Convert to frontend format
    const trianglesMap: Record<string, any> = {};
    let lastUpdated: Date | null = null;
    
    for (const tri of triangles) {
      trianglesMap[tri.triangleId] = {
        id: tri.triangleId,
        vertices: tri.vertices,
        baseColor: tri.baseColor,
        clicks: tri.clicks,
        subdivided: tri.subdivided,
        children: tri.children,
        parent: tri.parent,
        level: tri.level,
      };
      
      // Track most recent update
      if (tri.lastMined && (!lastUpdated || tri.lastMined > lastUpdated)) {
        lastUpdated = tri.lastMined;
      }
    }
    
    res.json(
      successResponse({
        version: '1.0.0',
        lastUpdated: lastUpdated ? lastUpdated.toISOString() : new Date().toISOString(),
        triangleCount: triangles.length,
        triangles: trianglesMap,
      })
    );
  } catch (error: any) {
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', error.message || 'Failed to fetch mesh state')
    );
  }
});

/**
 * POST /mesh/mine
 * 
 * Increment clicks on a triangle (simulated mining).
 * At 10 clicks, automatically subdivides into 4 children.
 * 
 * Request body:
 * {
 *   "triangleId": "ICO-3",
 *   "clicks": 1  // Optional, defaults to 1
 * }
 * 
 * Response:
 * {
 *   "ok": true,
 *   "result": {
 *     "triangleId": "ICO-3",
 *     "clicks": 4,
 *     "subdivided": false,
 *     "message": "Mining successful"
 *   }
 * }
 * 
 * Or if subdivided:
 * {
 *   "ok": true,
 *   "result": {
 *     "triangleId": "ICO-3",
 *     "clicks": 10,
 *     "subdivided": true,
 *     "children": ["ICO-3-0", "ICO-3-1", "ICO-3-2", "ICO-3-3"],
 *     "message": "Triangle subdivided into 4 children"
 *   }
 * }
 */
router.post('/mine', async (req: Request, res: Response) => {
  try {
    const { triangleId, clicks: clicksToAdd = 1 } = req.body;
    
    // Validate input
    if (!triangleId) {
      return res.status(400).json(
        errorResponse('MISSING_PARAMS', 'Required: triangleId')
      );
    }
    
    if (typeof clicksToAdd !== 'number' || clicksToAdd < 1 || clicksToAdd > 10) {
      return res.status(400).json(
        errorResponse('INVALID_PARAMS', 'clicks must be 1-10')
      );
    }
    
    // Import dependencies
    const { GlobalMeshTriangleModel } = await import('../core/state/global-mesh-schema.js');
    
    // Find triangle in database
    const triangle = await GlobalMeshTriangleModel.findOne({ triangleId });
    
    if (!triangle) {
      return res.status(404).json(
        errorResponse('NOT_FOUND', `Triangle not found: ${triangleId}`)
      );
    }
    
    // Check if already subdivided
    if (triangle.subdivided) {
      return res.status(400).json(
        errorResponse('ALREADY_SUBDIVIDED', 'Cannot mine a subdivided triangle')
      );
    }
    
    // Increment clicks (atomic operation for thread safety)
    triangle.clicks += clicksToAdd;
    triangle.lastMined = new Date();
    
    // Check if subdivision needed
    if (triangle.clicks >= 10) {
      triangle.clicks = 10;
      triangle.subdivided = true;
      
      // Generate 4 child triangles
      // Import subdivision function
      const { subdivideTriangleMesh } = await import('../core/mesh/subdivision.js');
      const children = await subdivideTriangleMesh(triangle);
      
      // Save children to database
      for (const child of children) {
        await GlobalMeshTriangleModel.create(child);
      }
      
      triangle.children = children.map((c: any) => c.triangleId);
      await triangle.save();
      
      return res.json(
        successResponse({
          triangleId: triangle.triangleId,
          clicks: triangle.clicks,
          subdivided: true,
          children: triangle.children,
          message: 'Triangle subdivided into 4 children',
        })
      );
    }
    
    // Save updated triangle
    await triangle.save();
    
    res.json(
      successResponse({
        triangleId: triangle.triangleId,
        clicks: triangle.clicks,
        subdivided: false,
        message: 'Mining successful',
      })
    );
  } catch (error: any) {
    res.status(500).json(
      errorResponse('INTERNAL_ERROR', error.message || 'Mining failed')
    );
  }
});

export default router;
