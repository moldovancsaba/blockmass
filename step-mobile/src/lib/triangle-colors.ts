/**
 * Triangle Color Utilities
 * 
 * Level-based color system for spherical triangle visualization.
 * 
 * Why this exists:
 * - Each subdivision level (1-21) has a distinct color
 * - Helps users understand triangle size at a glance
 * - Level 1 (~7052 km) to Level 21 (~27 m) represented by unique colors
 * - Triangles subdivide after 2 clicks (not 10)
 * 
 * Color scheme:
 * - Level-based colors (no click-based gradients)
 * - 21 distinct colors for 21 levels
 * - No overlay layer needed
 */

/**
 * Linear interpolation between two values.
 * 
 * @param a - Start value
 * @param b - End value
 * @param t - Interpolation factor (0.0 to 1.0)
 * @returns Interpolated value
 */
function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * Convert RGB values (0-255) to hex color string.
 * 
 * @param r - Red component (0-255)
 * @param g - Green component (0-255)
 * @param b - Blue component (0-255)
 * @returns Hex color string (e.g., '#FF5733')
 */
function rgbToHex(r: number, g: number, b: number): string {
  const toHex = (n: number) => {
    const hex = Math.round(n).toString(16);
    return hex.length === 1 ? '0' + hex : hex;
  };
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/**
 * Level-based color mapping for spherical triangles.
 * Each subdivision level (1-21) has a distinct color for visual identification.
 * 
 * Level sizes:
 * - Level 1: ~7052 km sided spherical triangles
 * - Level 2: ~3526 km
 * - ...
 * - Level 21: ~27 m (finest detail)
 * 
 * @param level - Subdivision level (1-21)
 * @returns Hex color string for this level
 */
/**
 * Export both new and deprecated functions for compatibility.
 * Main export: getLevelColor() - use this for all new code.
 */
export function getLevelColor(level: number): string {
  // Natural gradient: Ocean Blue → Cyan → Grass Green → Gold → Chocolate Brown
  // Levels 1-5: Ocean → Cyan (water)
  // Levels 6-10: Cyan → Green (vegetation)
  // Levels 11-15: Green → Gold (harvest)
  // Levels 16-21: Gold → Brown (earth/soil)
  const LEVEL_COLORS: Record<number, string> = {
    // Ocean Blue → Cyan
    1: '#0066CC',  // ~7052 km - Deep ocean blue
    2: '#0088DD',  // ~3526 km
    3: '#00AAEE',  // ~3526 km
    4: '#00CCFF',  // ~1763 km
    5: '#00FFFF',  // ~882 km - Cyan
    
    // Cyan → Grass Green
    6: '#00DDCC',  // ~441 km
    7: '#00BB99',  // ~220 km
    8: '#00AA77',  // ~110 km
    9: '#00AA55',  // ~55 km
    10: '#00AA00', // ~27.5 km - Grass green
    
    // Green → Gold
    11: '#33BB00', // ~13.7 km
    12: '#66CC00', // ~6886 m
    13: '#99DD00', // ~3443 m
    14: '#CCDD00', // ~3443 m
    15: '#FFD700', // ~1721 m - Gold (wheat)
    
    // Gold → Chocolate Brown
    16: '#DDBB00', // ~861 m
    17: '#BB9900', // ~430 m
    18: '#AA7733', // ~215 m
    19: '#995533', // ~107 m
    20: '#8B4513', // ~54 m - Chocolate brown
    21: '#6B3410', // ~27 m - Dark chocolate
  };

  // Return color for level, or default to white if out of range
  return LEVEL_COLORS[level] || '#FFFFFF';
}

/**
 * DEPRECATED: Old click-based color function.
 * Kept for backward compatibility but no longer used in rendering.
 * Use getLevelColor() instead.
 */
export function getTriangleColor(clicks: number): string {
  // Deprecated - use getLevelColor() instead
  return getLevelColor(Math.min(clicks + 1, 21));
}

/**
 * Get emissive color intensity for current triangle (user's position).
 * 
 * Why this exists:
 * - Current triangle must stand out from all other triangles
 * - Bright emissive material creates visual "glow" effect
 * - Helps user always know exactly where they are on the mesh
 * 
 * @returns Bright red emissive color
 */
export function getCurrentTriangleColor(): string {
  return '#FF0000'; // Bright red, matching existing implementation
}

/**
 * Get emissive color for neighbor triangles.
 * 
 * Why this exists:
 * - Neighbor triangles show where user can mine next (adjacent to current position)
 * - Green color distinguishes neighbors from current (red) and other triangles (blue/yellow/orange)
 * - Helps user understand spatial relationships in the mesh
 * 
 * @returns Bright green emissive color
 */
export function getNeighborTriangleColor(): string {
  return '#00FF00'; // Bright green, matching existing implementation
}

/**
 * Get opacity based on triangle state and camera distance.
 * 
 * Why this exists:
 * - Backface culling: triangles facing away from camera should be invisible
 * - LOD: distant triangles can be more transparent to reduce visual clutter
 * - Performance: invisible triangles can be skipped in rendering
 * 
 * @param isFacingCamera - Whether triangle normal faces camera
 * @param distance - Distance from camera (optional, for LOD)
 * @returns Opacity value (0.0 = invisible, 1.0 = fully opaque)
 */
export function getTriangleOpacity(
  isFacingCamera: boolean,
  distance?: number
): number {
  // Backface culling - hide triangles facing away
  if (!isFacingCamera) {
    return 0;
  }

  // Optional LOD based on distance
  if (distance !== undefined) {
    // Closer triangles = more opaque
    // Distant triangles = more transparent
    const normalizedDistance = Math.max(0, Math.min(1, distance / 5));
    return lerp(1.0, 0.3, normalizedDistance);
  }

  return 1.0; // Fully opaque by default
}

/**
 * Get click overlay color based on click count (0-10).
 * Returns gray color with increasing opacity.
 * 0 clicks = no overlay, 1-10 clicks = progressively more opaque gray.
 * 
 * @param clicks - Number of clicks (0-10)
 * @returns Hex color with alpha or null if no overlay needed
 */
export function getClickOverlayColor(clicks: number): string | null {
  if (clicks <= 0 || clicks > 10) {
    return null;
  }
  
  // Click overlay colors: #44444420 (1 click) to #444444FF (10 clicks)
  const overlays = [
    '#44444420', // 1 click
    '#44444444', // 2 clicks
    '#44444466', // 3 clicks
    '#44444488', // 4 clicks
    '#444444AA', // 5 clicks
    '#444444BB', // 6 clicks
    '#444444CC', // 7 clicks
    '#444444DD', // 8 clicks
    '#444444EE', // 9 clicks
    '#444444FF', // 10 clicks
  ];
  
  return overlays[clicks - 1];
}

/**
 * Get Three.js material properties for a spherical triangle.
 * Uses level-based coloring system (no click overlays).
 * 
 * @param level - Subdivision level (1-21)
 * @param isGPS - Is this the user's GPS triangle?
 * @param isFacingCamera - Is triangle visible (backface culling)?
 * @returns Material properties object
 */
export function getTriangleMaterialProps(
  level: number,
  isGPS: boolean = false,
  isFacingCamera: boolean = true
) {
  const levelColor = getLevelColor(level);
  
  // GPS triangle: add emissive glow
  if (isGPS) {
    return {
      color: levelColor,
      emissive: levelColor,
      emissiveIntensity: 0.5,
      opacity: getTriangleOpacity(isFacingCamera),
      transparent: true,
    };
  }

  // Regular triangle: level color with subtle glow
  return {
    color: levelColor,
    emissive: levelColor,
    emissiveIntensity: 0.2,
    opacity: getTriangleOpacity(isFacingCamera),
    transparent: true,
  };
}

/**
 * Get material properties for click overlay layer.
 * This is rendered on top of the base triangle to show mining progress.
 * 
 * @param clicks - Number of clicks (0-10)
 * @param isFacingCamera - Is triangle visible
 * @returns Material properties for overlay, or null if no overlay needed
 */
export function getClickOverlayMaterialProps(
  clicks: number,
  isFacingCamera: boolean = true
): { color: string; opacity: number; transparent: boolean } | null {
  const overlayColor = getClickOverlayColor(clicks);
  if (!overlayColor) {
    return null;
  }
  
  // Parse hex color with alpha
  const alphaHex = overlayColor.slice(-2);
  const alpha = parseInt(alphaHex, 16) / 255;
  
  return {
    color: '#444444',
    opacity: alpha * getTriangleOpacity(isFacingCamera),
    transparent: true,
  };
}
