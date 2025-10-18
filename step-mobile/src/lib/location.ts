/**
 * STEP Location Service
 * 
 * Handles GPS location capture with permission management.
 * Uses expo-location for cross-platform GPS access.
 * 
 * Features:
 * - Permission request (foreground + background in future)
 * - Current position fetch with accuracy
 * - Location watching (continuous updates)
 * - Error handling for denied permissions, GPS off, etc.
 */

import * as Location from 'expo-location';

export interface LocationData {
  latitude: number;
  longitude: number;
  accuracy: number; // meters
  altitude: number | null;
  heading: number | null;
  speed: number | null;
  timestamp: number; // milliseconds since epoch
}

export interface LocationPermissionStatus {
  granted: boolean;
  canAskAgain: boolean;
  status: 'granted' | 'denied' | 'undetermined';
}

/**
 * Request foreground location permissions.
 * 
 * Shows native permission dialog to user.
 * Required before accessing GPS.
 * 
 * @returns Permission status
 */
export async function requestLocationPermission(): Promise<LocationPermissionStatus> {
  try {
    const { status, canAskAgain } = await Location.requestForegroundPermissionsAsync();
    
    return {
      granted: status === 'granted',
      canAskAgain,
      status: status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined',
    };
  } catch (error) {
    console.error('Error requesting location permission:', error);
    return {
      granted: false,
      canAskAgain: false,
      status: 'denied',
    };
  }
}

/**
 * Check current location permission status without requesting.
 * 
 * @returns Permission status
 */
export async function checkLocationPermission(): Promise<LocationPermissionStatus> {
  try {
    const { status, canAskAgain } = await Location.getForegroundPermissionsAsync();
    
    return {
      granted: status === 'granted',
      canAskAgain,
      status: status === 'granted' ? 'granted' : status === 'denied' ? 'denied' : 'undetermined',
    };
  } catch (error) {
    console.error('Error checking location permission:', error);
    return {
      granted: false,
      canAskAgain: false,
      status: 'denied',
    };
  }
}

/**
 * Get current GPS location (one-time read).
 * 
 * Requires location permission.
 * Uses high accuracy mode for mining (GPS + network).
 * 
 * @returns Current location data
 * @throws Error if permission denied or location unavailable
 */
export async function getCurrentLocation(): Promise<LocationData> {
  // Check permission first
  const permission = await checkLocationPermission();
  if (!permission.granted) {
    throw new Error('Location permission not granted');
  }
  
  try {
    // Request high accuracy location
    // accuracy: 6 = BestForNavigation (highest accuracy, uses GPS)
    const location = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.BestForNavigation,
    });
    
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy || 0,
      altitude: location.coords.altitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
      timestamp: location.timestamp,
    };
  } catch (error) {
    console.error('Error getting current location:', error);
    throw new Error('Failed to get location. Please enable GPS and try again.');
  }
}

/**
 * Get last known location (cached, may be stale).
 * 
 * Faster than getCurrentLocation but may be outdated.
 * Useful for quick location estimate.
 * 
 * @returns Last known location, or null if unavailable
 */
export async function getLastKnownLocation(): Promise<LocationData | null> {
  try {
    const location = await Location.getLastKnownPositionAsync();
    
    if (!location) {
      return null;
    }
    
    return {
      latitude: location.coords.latitude,
      longitude: location.coords.longitude,
      accuracy: location.coords.accuracy || 0,
      altitude: location.coords.altitude,
      heading: location.coords.heading,
      speed: location.coords.speed,
      timestamp: location.timestamp,
    };
  } catch (error) {
    console.warn('Error getting last known location:', error);
    return null;
  }
}

/**
 * Start watching location (continuous updates).
 * 
 * Returns a subscription that can be removed.
 * Useful for real-time map tracking.
 * 
 * @param callback - Called on each location update
 * @param options - Watch options (accuracy, distance filter)
 * @returns Subscription object with remove() method
 */
export async function watchLocation(
  callback: (location: LocationData) => void,
  options: {
    accuracy?: Location.Accuracy;
    distanceInterval?: number; // meters
  } = {}
): Promise<{ remove: () => void }> {
  const permission = await checkLocationPermission();
  if (!permission.granted) {
    throw new Error('Location permission not granted');
  }
  
  const subscription = await Location.watchPositionAsync(
    {
      accuracy: options.accuracy || Location.Accuracy.High,
      distanceInterval: options.distanceInterval || 10, // Update every 10 meters
    },
    (location) => {
      callback({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
        accuracy: location.coords.accuracy || 0,
        altitude: location.coords.altitude,
        heading: location.coords.heading,
        speed: location.coords.speed,
        timestamp: location.timestamp,
      });
    }
  );
  
  return subscription;
}

/**
 * Check if location services are enabled on device.
 * 
 * @returns True if GPS/location services are enabled
 */
export async function isLocationEnabled(): Promise<boolean> {
  try {
    return await Location.hasServicesEnabledAsync();
  } catch (error) {
    console.error('Error checking location services:', error);
    return false;
  }
}

/**
 * Calculate distance between two GPS coordinates (Haversine formula).
 * 
 * @param lat1 - Latitude of point 1
 * @param lon1 - Longitude of point 1
 * @param lat2 - Latitude of point 2
 * @param lon2 - Longitude of point 2
 * @returns Distance in meters
 */
export function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Validate location accuracy for mining.
 * 
 * Mining requires high accuracy to prevent GPS spoofing.
 * 
 * @param accuracy - GPS accuracy in meters
 * @returns True if accuracy is sufficient for mining
 */
export function isAccuracySufficient(accuracy: number): boolean {
  // Require accuracy better than 50 meters for mining
  // TODO: Make this configurable, may need to be stricter (20m) in production
  const MAX_ACCURACY_METERS = 50;
  return accuracy > 0 && accuracy <= MAX_ACCURACY_METERS;
}
