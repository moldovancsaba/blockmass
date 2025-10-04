/**
 * MongoDB Connection Module
 * 
 * Provides a singleton database connection with health monitoring.
 * 
 * Why singleton:
 * - Prevents multiple connection instances during hot-reload in dev
 * - Ensures consistent connection pooling across the application
 * - Centralizes connection lifecycle management
 * 
 * Health monitoring:
 * - Tracks connection status, timestamps, and error states
 * - Used by /health/db endpoint for operational visibility
 * 
 * Usage:
 *   import { connectToDb, dbHealth } from './core/db.js';
 *   await connectToDb();
 *   const health = dbHealth();
 */

import mongoose from 'mongoose';

// Module-level state for singleton pattern
let cachedConnection: mongoose.Connection | null = null;
let isConnecting = false;
let connectedAt: string | null = null;
let lastErrorAt: string | null = null;
let lastError: string | null = null;

/**
 * Get MongoDB URI from environment.
 * 
 * Required for all deployments. No default provided to prevent
 * accidental connections to wrong databases.
 */
function getMongoUri(): string {
  const uri = process.env.MONGODB_URI;
  
  if (!uri) {
    throw new Error(
      'MONGODB_URI environment variable is required. ' +
      'Example: mongodb://localhost:27017/step'
    );
  }
  
  return uri;
}

/**
 * Connect to MongoDB with singleton pattern.
 * 
 * On first call: establishes connection
 * On subsequent calls: returns cached connection
 * 
 * Why Mongoose:
 * - Schema validation and indexes
 * - Transaction support (critical for atomic proof validation)
 * - Model abstraction reduces boilerplate
 * 
 * @returns Mongoose connection instance
 */
export async function connectToDb(): Promise<mongoose.Connection> {
  // Return cached connection if already established
  if (cachedConnection && cachedConnection.readyState === 1) {
    return cachedConnection;
  }
  
  // Prevent concurrent connection attempts
  if (isConnecting) {
    // Wait for ongoing connection to complete
    while (isConnecting) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (cachedConnection && cachedConnection.readyState === 1) {
      return cachedConnection;
    }
  }
  
  try {
    isConnecting = true;
    
    const uri = getMongoUri();
    const timestamp = new Date().toISOString();
    
    console.log(`[${timestamp}] Connecting to MongoDB...`);
    
    // Connect with recommended options for production
    // Why strict timeouts: Prevent indefinite hangs during server startup if MongoDB is unreachable
    // Why configurable via env: Allow tuning for different network conditions (dev vs prod)
    await mongoose.connect(uri, {
      // Connection pool settings
      maxPoolSize: parseInt(process.env.MONGODB_MAX_POOL_SIZE || '10', 10),
      minPoolSize: parseInt(process.env.MONGODB_MIN_POOL_SIZE || '2', 10),
      
      // Timeout settings - strict defaults to fail fast rather than hang
      serverSelectionTimeoutMS: parseInt(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || '10000', 10),
      connectTimeoutMS: parseInt(process.env.MONGODB_CONNECT_TIMEOUT_MS || '10000', 10),
      socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT_MS || '20000', 10),
      
      // Retry settings
      retryWrites: true,
      retryReads: true,
    });
    
    cachedConnection = mongoose.connection;
    connectedAt = timestamp;
    lastError = null;
    lastErrorAt = null;
    
    console.log(`[${timestamp}] MongoDB connected successfully`);
    console.log(`  Database: ${cachedConnection.db?.databaseName || 'unknown'}`);
    console.log(`  Host: ${cachedConnection.host}`);
    
    // Set up connection event handlers for monitoring
    cachedConnection.on('error', (err) => {
      const errorTimestamp = new Date().toISOString();
      lastError = err.message;
      lastErrorAt = errorTimestamp;
      console.error(`[${errorTimestamp}] MongoDB error:`, err.message);
    });
    
    cachedConnection.on('disconnected', () => {
      const timestamp = new Date().toISOString();
      console.warn(`[${timestamp}] MongoDB disconnected`);
      // Don't clear cachedConnection - mongoose will auto-reconnect
    });
    
    cachedConnection.on('reconnected', () => {
      const timestamp = new Date().toISOString();
      console.log(`[${timestamp}] MongoDB reconnected`);
      lastError = null;
    });
    
    return cachedConnection;
    
  } catch (error) {
    const timestamp = new Date().toISOString();
    lastError = error instanceof Error ? error.message : String(error);
    lastErrorAt = timestamp;
    
    console.error(`[${timestamp}] Failed to connect to MongoDB:`, lastError);
    
    throw new Error(
      `MongoDB connection failed: ${lastError}. ` +
      'Check MONGODB_URI and ensure MongoDB is running.'
    );
  } finally {
    isConnecting = false;
  }
}

/**
 * Get database health status.
 * 
 * Used by health check endpoints to report operational status.
 * 
 * Status values:
 * - 'ok': Connected and ready
 * - 'degraded': Connected but has recent errors
 * - 'down': Not connected
 * 
 * @returns Health status object with timestamps in ISO 8601 with milliseconds
 */
export function dbHealth(): {
  status: 'ok' | 'degraded' | 'down';
  connectedAt: string | null;
  lastErrorAt: string | null;
  lastError: string | null;
  info?: {
    database?: string;
    host?: string;
    readyState?: number;
  };
} {
  // Not connected
  if (!cachedConnection || cachedConnection.readyState !== 1) {
    return {
      status: 'down',
      connectedAt,
      lastErrorAt,
      lastError,
    };
  }
  
  // Connected with recent errors (within last 5 minutes)
  if (lastErrorAt) {
    const errorAge = Date.now() - new Date(lastErrorAt).getTime();
    if (errorAge < 5 * 60 * 1000) {
      return {
        status: 'degraded',
        connectedAt,
        lastErrorAt,
        lastError,
        info: {
          database: cachedConnection.db?.databaseName,
          host: cachedConnection.host,
          readyState: cachedConnection.readyState,
        },
      };
    }
  }
  
  // Healthy
  return {
    status: 'ok',
    connectedAt,
    lastErrorAt,
    lastError: null, // Clear old errors after 5 minutes
    info: {
      database: cachedConnection.db?.databaseName,
      host: cachedConnection.host,
      readyState: cachedConnection.readyState,
    },
  };
}

/**
 * Gracefully close the database connection.
 * 
 * Should be called during application shutdown to ensure
 * all pending operations complete before process exit.
 * 
 * Usage:
 *   process.on('SIGTERM', async () => {
 *     await closeDb();
 *     process.exit(0);
 *   });
 */
export async function closeDb(): Promise<void> {
  if (cachedConnection) {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] Closing MongoDB connection...`);
    
    await mongoose.disconnect();
    cachedConnection = null;
    
    console.log(`[${timestamp}] MongoDB connection closed`);
  }
}
