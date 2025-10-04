/**
 * Mesh Explorer - Blind Map Triangle Visualization
 * 
 * Pure geometric visualization of STEP mesh without background map.
 * Black triangles on white canvas, high-contrast, minimal design.
 * 
 * Features:
 * - Canvas-based rendering (fast, no external dependencies)
 * - Equirectangular projection (lat/lon → screen coordinates)
 * - Zoom and pan with mouse/touch
 * - Click triangle to inspect
 * - Level selector (1-21)
 * - Viewport-based queries (only render visible triangles)
 * 
 * Why Canvas over SVG:
 * - Faster for thousands of triangles
 * - Better zoom/pan performance
 * - Hardware accelerated
 */

'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface TriangleData {
  triangleId: string;
  centroid: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  polygon?: {
    type: 'Polygon';
    coordinates: [number, number][][]; // [[[lon, lat], ...]]
  };
}

interface ViewportState {
  centerLon: number; // -180 to 180
  centerLat: number; // -90 to 90
  zoom: number; // 1 = whole Earth fits screen, 5 = max zoom
  rotation: number; // Globe rotation in degrees (0-360)
}

export default function MeshExplorerPage() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [baseLevel, setBaseLevel] = useState(3); // User-selected base level
  const [viewport, setViewport] = useState<ViewportState>({
    centerLon: 0,
    centerLat: 0,
    zoom: 25.0, // Start at ISS altitude (400km)
    rotation: 0,
  });
  const [triangles, setTriangles] = useState<TriangleData[]>([]);
  const [selectedTriangle, setSelectedTriangle] = useState<TriangleData | null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState<{ x: number; y: number } | null>(null);
  const [touchDistance, setTouchDistance] = useState<number | null>(null);

  // Canvas dimensions
  const [canvasSize, setCanvasSize] = useState({ width: 1200, height: 600 });

  /**
   * Calculate min/max zoom based on triangle visibility.
   * 
   * RULE 1 (Min zoom): Don't zoom out past 512 visible triangles
   * - Total triangles at level L = 20 × 4^(L-1)
   * - Visible triangles ≈ Total / 2 (front hemisphere in orthographic projection)
   * - We want: Visible ≤ 512
   * - So: Total / 2 ≤ 512 → Total ≤ 1024
   * - Min zoom = calculated to show exactly 512 visible triangles
   * 
   * For levels with < 1024 total triangles:
   * - Min zoom shows the whole hemisphere
   * 
   * For levels with > 1024 total triangles:
   * - Min zoom restricts view to show only 512 triangles
   * - zoom = sqrt(Total / 1024) approximately
   * 
   * RULE 2 (Max zoom): Always allow zooming to 100m altitude
   * - altitude ≈ 10,018,500 / zoom
   * - 100 = 10,018,500 / zoom → zoom = 100,185
   */
  const getZoomLimits = useCallback(() => {
    // Calculate total triangles at current level
    const totalTriangles = 20 * Math.pow(4, baseLevel - 1);
    
    // Calculate min zoom to show max 512 visible triangles
    // Visible triangles ≈ (Total / 2) / (zoom_factor^2)
    // We want: (Total / 2) / (zoom_factor^2) = 512
    // zoom_factor^2 = Total / 1024
    // zoom_factor = sqrt(Total / 1024)
    
    let minZoom;
    if (totalTriangles <= 1024) {
      // Few triangles - can zoom out to see whole hemisphere
      minZoom = 25.0; // ISS altitude
    } else {
      // Many triangles - restrict zoom out to show max 512 visible
      // Approximate: need to zoom in enough to reduce visible area
      const zoomFactor = Math.sqrt(totalTriangles / 1024);
      minZoom = 25.0 * zoomFactor;
    }
    
    // Max zoom: street level (100 meters altitude)
    const maxZoom = 100000;
    
    return { minZoom, maxZoom };
  }, [baseLevel]);

  /**
   * Level is FIXED at baseLevel - does not change with zoom.
   * User explicitly selects the triangle detail level.
   */
  const level = baseLevel;
  const { minZoom, maxZoom } = getZoomLimits();

  /**
   * Calculate approximate viewing altitude in meters.
   * 
   * At zoom=1, we see ~180° vertically (half of Earth)
   * Earth radius = 6,371 km
   * View height in degrees = 180 / zoom
   * View height in km ≈ (180 / zoom) × (Earth circumference / 360)
   *                    ≈ (180 / zoom) × (40,075 / 360)
   *                    ≈ 20,037 / zoom km
   * 
   * Altitude above surface ≈ view_height (simplified)
   */
  const getViewAltitude = useCallback(() => {
    // View width in km at current zoom
    const viewWidthKm = 20037 / viewport.zoom;
    const altitudeKm = viewWidthKm / 2; // Simplified: altitude ≈ half view width
    const altitudeMeters = Math.round(altitudeKm * 1000);
    
    // Always format in meters with comma separators
    return altitudeMeters.toLocaleString('en-US');
  }, [viewport.zoom]);

  // Auto-adjust zoom when base level changes
  useEffect(() => {
    // When user changes base level, reset zoom to show exactly 512 visible triangles
    console.log(`Base level changed to ${baseLevel}, resetting zoom to ${minZoom.toFixed(1)} (512 triangles visible)`);
    setViewport((prev) => ({
      ...prev,
      zoom: minZoom, // Reset to 512 visible triangles
      centerLon: 0,
      centerLat: 0,
      rotation: 0,
    }));
  }, [baseLevel, minZoom]);

  /**
   * Convert lat/lon to canvas x/y using Orthographic projection (globe view).
   * 
   * Orthographic projection shows Earth as a 3D sphere viewed from infinite distance.
   * Only the front hemisphere is visible (back side is culled).
   * 
   * @param lon - Longitude (-180 to 180)
   * @param lat - Latitude (-90 to 90)
   * @returns {x, y, visible} - Canvas coordinates and visibility flag
   */
  const latLonToCanvas = useCallback(
    (lon: number, lat: number): { x: number; y: number; visible: boolean } => {
      const { width, height } = canvasSize;
      const { centerLon, centerLat, zoom, rotation } = viewport;

      // Convert to radians
      const lonRad = ((lon - centerLon - rotation) * Math.PI) / 180;
      const latRad = (lat * Math.PI) / 180;
      const centerLatRad = (centerLat * Math.PI) / 180;

      // Rotate around Y axis (longitude)
      const cosLat = Math.cos(latRad);
      const x3d = Math.cos(lonRad) * cosLat;
      const y3d = Math.sin(latRad);
      const z3d = Math.sin(lonRad) * cosLat;

      // Rotate around X axis (latitude view angle)
      const cosCenterLat = Math.cos(centerLatRad);
      const sinCenterLat = Math.sin(centerLatRad);
      const y3dRotated = y3d * cosCenterLat - z3d * sinCenterLat;
      const z3dRotated = y3d * sinCenterLat + z3d * cosCenterLat;

      // Visibility test: point is visible if z > 0 (on front hemisphere)
      const visible = z3dRotated > -0.1; // Small epsilon for edge points

      // Project to 2D (orthographic: just drop Z coordinate)
      const radius = Math.min(width, height) / 2.5; // Globe radius
      const x = width / 2 + x3d * radius * zoom;
      const y = height / 2 - y3dRotated * radius * zoom; // Flip Y

      return { x, y, visible };
    },
    [canvasSize, viewport]
  );

  /**
   * Convert canvas x/y back to approximate lat/lon.
   * 
   * Used for click detection. This is an approximation for orthographic projection.
   */
  const canvasToLatLon = useCallback(
    (x: number, y: number): { lon: number; lat: number } => {
      const { width, height } = canvasSize;
      const { centerLon, centerLat, zoom, rotation } = viewport;

      const radius = Math.min(width, height) / 2.5;
      const dx = (x - width / 2) / (radius * zoom);
      const dy = (height / 2 - y) / (radius * zoom);

      // Clamp to unit circle
      const r = Math.sqrt(dx * dx + dy * dy);
      if (r > 1) {
        // Click outside globe
        return { lon: centerLon, lat: centerLat };
      }

      // Inverse orthographic projection (approximate)
      const lat = Math.asin(dy) * (180 / Math.PI);
      const lon = centerLon + rotation + Math.atan2(dx, Math.sqrt(1 - dx * dx - dy * dy)) * (180 / Math.PI);

      return { lon, lat };
    },
    [canvasSize, viewport]
  );

  /**
   * Compute bounding box for current viewport.
   * 
   * Strategy: For low levels (1-5), always fetch the whole world regardless of zoom.
   * For high levels (6+), fetch viewport bbox to avoid hitting 10k triangle API limit.
   * 
   * CRITICAL: Levels 1-5 have < 10k total triangles, so we can always fetch all of them.
   * This prevents triangles from disappearing when zooming in at low levels.
   */
  const getViewportBbox = useCallback((): [number, number, number, number] => {
    // Calculate expected triangles at this level for whole world
    const totalTriangles = 20 * Math.pow(4, level - 1);
    
    // RULE: If total triangles < 10k (API limit), always fetch whole world
    // Level 1: 20 triangles
    // Level 2: 80 triangles
    // Level 3: 320 triangles
    // Level 4: 1,280 triangles
    // Level 5: 5,120 triangles (fits within 10k limit)
    // Level 6: 20,480 triangles (exceeds 10k limit - need bbox)
    // Level 7+: Much more (need bbox)
    if (level <= 5) {
      console.log(`Level ${level}: Fetching whole world (${totalTriangles} triangles, always full world for levels 1-5)`);
      return [-180, -90, 180, 90];
    }

    // At higher levels (7+), calculate visible region based on zoom to avoid API limit
    // Orthographic projection shows ~180°/zoom vertically
    const viewDegrees = 180 / viewport.zoom;
    
    // Use large margin (5x) to ensure we always have triangles during rotation
    // Better to fetch too many than to have them disappear!
    const margin = 5.0;
    const lonRange = viewDegrees * margin;
    const latRange = viewDegrees * margin;

    const west = Math.max(-180, viewport.centerLon + viewport.rotation - lonRange / 2);
    const east = Math.min(180, viewport.centerLon + viewport.rotation + lonRange / 2);
    const south = Math.max(-90, viewport.centerLat - latRange / 2);
    const north = Math.min(90, viewport.centerLat + latRange / 2);

    console.log(`Level ${level}, zoom ${viewport.zoom.toFixed(0)}: Fetching bbox [${west.toFixed(0)}, ${south.toFixed(0)}, ${east.toFixed(0)}, ${north.toFixed(0)}] (~${totalTriangles} total at level)`);

    return [west, south, east, north];
  }, [level, viewport]);

  /**
   * Fetch triangles from Mesh API for current viewport.
   */
  const fetchTriangles = useCallback(async () => {
    setLoading(true);
    try {
      const bbox = getViewportBbox();
      const bboxStr = bbox.join(',');

      // Query step-blockchain API (running on port 3002)
      // Request includePolygon=true to get full polygon data for rendering
      // Calculate expected triangle count: 20 * 4^(level-1)
      const expectedCount = 20 * Math.pow(4, level - 1);
      const maxResults = Math.min(10000, Math.ceil(expectedCount * 1.1)); // Add 10% buffer
      
      console.log(`Fetching triangles: bbox=${bboxStr}, level=${level} (base=${baseLevel}), expecting ~${expectedCount}, requesting ${maxResults}, zoom=${viewport.zoom.toFixed(2)}`);
      
      const response = await fetch(
        `http://localhost:5500/mesh/search?bbox=${bboxStr}&level=${level}&maxResults=${maxResults}&includePolygon=true`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.ok && data.result.triangles) {
        console.log(`Fetched ${data.result.triangles.length} triangles at level ${level}`);
        setTriangles(data.result.triangles);
      } else {
        console.warn('API response:', data);
      }
    } catch (error) {
      console.error('Failed to fetch triangles:', error);
      setTriangles([]); // Clear triangles on error
    } finally {
      setLoading(false);
    }
  }, [level, getViewportBbox]);

  /**
   * Fetch full polygon data for a triangle when selected.
   */
  const fetchTrianglePolygon = useCallback(async (triangleId: string) => {
    try {
      const response = await fetch(
        `http://localhost:5500/mesh/polygon/${encodeURIComponent(triangleId)}`
      );

      if (!response.ok) {
        throw new Error(`API error: ${response.status}`);
      }

      const data = await response.json();

      if (data.ok && data.result.polygon) {
        return data.result.polygon;
      }
    } catch (error) {
      console.error('Failed to fetch polygon:', error);
    }
    return null;
  }, []);

  /**
   * Render triangles on canvas.
   */
  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    console.log(`Rendering ${triangles.length} triangles at level ${level}, zoom=${viewport.zoom.toFixed(2)}, altitude=${getViewAltitude()}m`);
    
    let visibleCount = 0;

    // Clear canvas (white background)
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw triangles with visibility culling
    ctx.strokeStyle = '#000000'; // Black lines
    ctx.lineWidth = 1.5; // Slightly thicker for better visibility

    triangles.forEach((triangle) => {
      // If triangle has full polygon, draw it
      if (triangle.polygon) {
        const coords = triangle.polygon.coordinates[0];

        // Check if centroid is visible (simple visibility test)
        const centroidProjection = latLonToCanvas(
          triangle.centroid.coordinates[0],
          triangle.centroid.coordinates[1]
        );

        if (!centroidProjection.visible) {
          return; // Skip triangles whose center is on back side
        }
        
        visibleCount++;

        // Project all vertices
        const projectedCoords = coords.slice(0, 3).map((coord) => latLonToCanvas(coord[0], coord[1]));

        // Draw complete triangle (first 3 vertices only, ignore closing point)
        ctx.beginPath();
        ctx.moveTo(projectedCoords[0].x, projectedCoords[0].y);
        ctx.lineTo(projectedCoords[1].x, projectedCoords[1].y);
        ctx.lineTo(projectedCoords[2].x, projectedCoords[2].y);
        ctx.closePath();
        ctx.stroke();

        // Highlight selected triangle
        if (selectedTriangle?.triangleId === triangle.triangleId) {
          ctx.fillStyle = 'rgba(0, 0, 0, 0.15)';
          ctx.fill();
        }
      } else {
        // Just draw centroid dot if visible
        const p = latLonToCanvas(
          triangle.centroid.coordinates[0],
          triangle.centroid.coordinates[1]
        );

        if (p.visible) {
          ctx.fillStyle = '#000000';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });

    // Draw loading indicator
    if (loading) {
      ctx.fillStyle = '#000000';
      ctx.font = '16px monospace';
      ctx.fillText('Loading...', 10, 30);
    }
    
    console.log(`Drew ${visibleCount} visible triangles out of ${triangles.length} total`);
  }, [triangles, selectedTriangle, loading, latLonToCanvas, level, viewport.zoom, getViewAltitude]);

  /**
   * Handle canvas click - find clicked triangle.
   */
  const handleCanvasClick = useCallback(
    async (e: React.MouseEvent<HTMLCanvasElement>) => {
      if (isDragging) return; // Don't select if user was dragging

      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;

      const { lon, lat } = canvasToLatLon(x, y);

      // Query API for triangle at this point
      try {
        const response = await fetch(
          `http://localhost:5500/mesh/triangleAt?lat=${lat}&lon=${lon}&level=${level}`
        );

        if (!response.ok) return;

        const data = await response.json();

        if (data.ok && data.result.triangleId) {
          // Fetch full polygon for this triangle
          const polygon = await fetchTrianglePolygon(data.result.triangleId);

          setSelectedTriangle({
            triangleId: data.result.triangleId,
            centroid: data.result.centroid,
            polygon,
          });

          // Add to triangles list if not already there
          setTriangles((prev) => {
            const exists = prev.some((t) => t.triangleId === data.result.triangleId);
            if (exists) {
              return prev.map((t) =>
                t.triangleId === data.result.triangleId ? { ...t, polygon } : t
              );
            }
            return [...prev, { ...data.result, polygon }];
          });
        }
      } catch (error) {
        console.error('Failed to query triangle:', error);
      }
    },
    [level, canvasToLatLon, fetchTrianglePolygon, isDragging]
  );

  /**
   * Handle mouse drag for panning.
   */
  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    setIsDragging(true);
    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDragging || !dragStart) return;

    const dx = e.clientX - dragStart.x;
    const dy = e.clientY - dragStart.y;

    // Rotate globe with drag
    const rotationDelta = (dx / canvasSize.width) * (180 / viewport.zoom);
    const latDelta = (dy / canvasSize.height) * (90 / viewport.zoom);

    setViewport((prev) => ({
      ...prev,
      rotation: (prev.rotation + rotationDelta) % 360,
      centerLat: Math.max(-90, Math.min(90, prev.centerLat + latDelta)),
    }));

    setDragStart({ x: e.clientX, y: e.clientY });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
    setDragStart(null);
  };

  /**
   * Handle touch events for pinch-to-zoom on canvas.
   */
  const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2) {
      // Two fingers - pinch zoom
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      setTouchDistance(distance);
    } else if (e.touches.length === 1) {
      // Single finger - pan
      setIsDragging(true);
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (e.touches.length === 2 && touchDistance) {
      // Pinch zoom
      e.preventDefault();
      const touch1 = e.touches[0];
      const touch2 = e.touches[1];
      const distance = Math.hypot(
        touch2.clientX - touch1.clientX,
        touch2.clientY - touch1.clientY
      );
      
      const scale = distance / touchDistance;
      const newZoom = viewport.zoom * scale;
      const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
      
      setViewport((prev) => ({ ...prev, zoom: clampedZoom }));
      setTouchDistance(distance);
    } else if (e.touches.length === 1 && isDragging && dragStart) {
      // Pan
      const dx = e.touches[0].clientX - dragStart.x;
      const dy = e.touches[0].clientY - dragStart.y;
      
      const rotationDelta = (dx / canvasSize.width) * (180 / viewport.zoom);
      const latDelta = (dy / canvasSize.height) * (90 / viewport.zoom);
      
      setViewport((prev) => ({
        ...prev,
        rotation: (prev.rotation + rotationDelta) % 360,
        centerLat: Math.max(-90, Math.min(90, prev.centerLat + latDelta)),
      }));
      
      setDragStart({ x: e.touches[0].clientX, y: e.touches[0].clientY });
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    setDragStart(null);
    setTouchDistance(null);
  };


  /**
   * Handle mouse wheel for zooming (enforces limits).
   * Smoother zoom: 10x slower than before (1% per scroll instead of 5%)
   */
  const handleWheel = (e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    // Changed from 0.95/1.05 (5% per scroll) to 0.99/1.01 (1% per scroll) for smoother zooming
    const zoomDelta = e.deltaY > 0 ? 0.99 : 1.01;
    const newZoom = viewport.zoom * zoomDelta;
    const clampedZoom = Math.max(minZoom, Math.min(maxZoom, newZoom));
    
    setViewport((prev) => ({ ...prev, zoom: clampedZoom }));
  };

  // Fetch triangles when level changes or viewport moves significantly
  useEffect(() => {
    console.log(`Level changed to ${level}, fetching new triangles...`);
    fetchTriangles();
  }, [level, fetchTriangles]);

  // Refetch when viewport changes significantly
  useEffect(() => {
    if (level > 5) {
      // High levels (6+): Debounce viewport changes - only refetch after 500ms of no movement
      // This prevents excessive API calls when panning/rotating
      const timer = setTimeout(() => {
        console.log(`Viewport moved at level ${level}, refetching bbox...`);
        fetchTriangles();
      }, 500);
      
      return () => clearTimeout(timer);
    } else {
      // Low levels (1-5): Always fetch whole world, so only refetch on zoom changes
      // This ensures triangles stay visible when zooming in/out
      const timer = setTimeout(() => {
        console.log(`Zoom changed at level ${level}, refetching whole world...`);
        fetchTriangles();
      }, 300);
      
      return () => clearTimeout(timer);
    }
  }, [level, viewport.centerLon, viewport.centerLat, viewport.rotation, viewport.zoom, fetchTriangles]);

  // Render when triangles or viewport changes
  useEffect(() => {
    render();
  }, [render]);

  // Update canvas size on mount, disable page scroll and pinch zoom
  useEffect(() => {
    const updateSize = () => {
      // Fullscreen canvas
      const width = window.innerWidth;
      const height = window.innerHeight;
      setCanvasSize({ width, height });
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    
    // Disable page scrolling
    document.body.style.overflow = 'hidden';
    
    // Disable pinch-to-zoom on page (but allow on canvas)
    const preventDefault = (e: TouchEvent) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    };
    document.addEventListener('touchmove', preventDefault, { passive: false });
    
    // Add meta viewport to disable zoom
    let metaTag = document.querySelector('meta[name="viewport"]');
    const originalContent = metaTag?.getAttribute('content');
    if (metaTag) {
      metaTag.setAttribute('content', 'width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no');
    }
    
    return () => {
      window.removeEventListener('resize', updateSize);
      document.body.style.overflow = '';
      document.removeEventListener('touchmove', preventDefault);
      if (metaTag && originalContent) {
        metaTag.setAttribute('content', originalContent);
      }
    };
  }, []);

  return (
    <div className="fixed inset-0 bg-white text-black overflow-hidden" style={{ width: '100vw', height: '100vh' }}>
      {/* Top overlay - Controls */}
      <div className="absolute top-4 left-4 right-4 z-10 flex items-center justify-between pointer-events-none">
        <div className="bg-white bg-opacity-90 border-2 border-black px-4 py-2 pointer-events-auto">
          <h1 className="text-xl font-bold">STEP Mesh Explorer</h1>
        </div>

        {/* Controls */}
        <div className="flex gap-2 items-center pointer-events-auto">
          <label className="flex items-center gap-2 bg-white bg-opacity-90 border-2 border-black px-3 py-2">
            <span className="text-xs font-mono font-bold">Level:</span>
            <select
              value={baseLevel}
              onChange={(e) => setBaseLevel(parseInt(e.target.value, 10))}
              className="border border-black px-2 py-1 font-mono text-sm bg-white"
            >
              {Array.from({ length: 21 }, (_, i) => i + 1).map((l) => (
                <option key={l} value={l}>
                  Level {l} {l >= 15 ? '(Street)' : l >= 10 ? '(Building)' : l >= 5 ? '(City)' : '(Region)'}
                </option>
              ))}
            </select>
          </label>

          <button
            onClick={fetchTriangles}
            className="bg-white bg-opacity-90 border-2 border-black px-3 py-2 text-sm hover:bg-black hover:text-white transition-colors"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>

          <button
            onClick={() => {
              setViewport({ centerLon: 0, centerLat: 0, zoom: 25.0, rotation: 0 });
              setSelectedTriangle(null);
            }}
            className="bg-white bg-opacity-90 border-2 border-black px-3 py-2 text-sm hover:bg-black hover:text-white transition-colors"
          >
            Reset
          </button>
        </div>
      </div>

      {/* Bottom overlay - Stats */}
      <div className="absolute bottom-4 left-4 z-10 bg-white bg-opacity-90 border-2 border-black p-3 font-mono text-xs pointer-events-none">
        <div className="flex flex-col gap-1">
          <div><span className="font-bold">Triangles:</span> {triangles.length} <span className="opacity-60">| Level: {level} (base: {baseLevel})</span></div>
          <div><span className="font-bold">Altitude:</span> {getViewAltitude()} m</div>
          <div><span className="font-bold">View:</span> [{viewport.centerLat.toFixed(1)}° lat, {viewport.rotation.toFixed(0)}° rot]</div>
          {selectedTriangle && (
            <div className="mt-1 pt-1 border-t border-black">
              <span className="font-bold">Selected:</span> {selectedTriangle.triangleId}
            </div>
          )}
        </div>
      </div>

      {/* Canvas - Fullscreen */}
      <canvas
        ref={canvasRef}
        width={canvasSize.width}
        height={canvasSize.height}
        onClick={handleCanvasClick}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        className="absolute inset-0 cursor-crosshair touch-none"
        style={{ width: '100%', height: '100%' }}
      />

      {/* Instructions overlay - Top right */}
      <div className="absolute top-4 right-4 z-10 bg-white bg-opacity-90 border-2 border-black p-3 font-mono text-xs pointer-events-none" style={{ maxWidth: '200px' }}>
        <p className="font-bold mb-1">Controls:</p>
        <p>• Drag to rotate</p>
        <p>• Scroll to zoom</p>
        <p>• Click triangle to select</p>
      </div>
    </div>
  );
}
