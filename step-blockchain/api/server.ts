/**
 * STEP Mesh API Server
 * 
 * HTTP JSON API for querying the STEP mesh system.
 * 
 * Environment variables:
 * - PORT: Server port (default: 3001)
 * - NODE_ENV: 'development' | 'production'
 * - MONGODB_URI: MongoDB connection string (optional for Phase 1)
 * 
 * Why port 3001:
 * - Port 3000 is used by step-explorer (Next.js frontend)
 * - Keeps backend and frontend separate during development
 * - Easy to proxy in production
 */

// Load environment variables from .env file
import { config } from 'dotenv';
config();

import express from 'express';
import { readFileSync } from 'fs';
import { join } from 'path';
import { connectToDb, dbHealth, closeDb } from '../core/db.js';
import meshRouter from './mesh.js';
import proofRouter from './proof.js';

// Read version from package.json (CommonJS-compatible path)
// When compiled, this runs from dist/api/, so need to go up 2 levels: ../../package.json
const packageJson = JSON.parse(
  readFileSync(join(__dirname, '..', '..', 'package.json'), 'utf-8')
);
const VERSION = packageJson.version;

const app = express();
const PORT = process.env.PORT || 5500;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Middleware: JSON body parser
 */
app.use(express.json());

/**
 * Middleware: CORS (allow all origins in development)
 * 
 * Why explicit origin list: Frontend runs on port 5555, need to allow it explicitly
 * Why credentials false: No cookies or auth headers needed for mesh API
 * In production, restrict to specific production domains.
 */
app.use((req, res, next) => {
  const origin = req.headers.origin;
  const allowedOrigins = ['http://localhost:5555', 'http://localhost:3000'];
  
  if (origin && allowedOrigins.includes(origin)) {
    res.header('Access-Control-Allow-Origin', origin);
  } else if (NODE_ENV === 'development') {
    // Fallback for dev: allow all origins
    res.header('Access-Control-Allow-Origin', '*');
  }
  
  res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  
  next();
});

/**
 * Middleware: Request logging
 * 
 * Logs all requests with ISO 8601 UTC timestamp.
 */
app.use((req, res, next) => {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] ${req.method} ${req.path}`);
  next();
});

/**
 * Health check endpoint
 * 
 * Returns server status, version, and database health.
 */
app.get('/health', async (req, res) => {
  const health = await dbHealth();
  
  res.json({
    ok: true,
    service: 'step-mesh-api',
    version: VERSION,
    environment: NODE_ENV,
    database: health,
    timestamp: new Date().toISOString(),
  });
});

/**
 * Root endpoint
 * 
 * Returns API documentation links.
 */
app.get('/', (req, res) => {
  res.json({
    service: 'STEP Mesh API',
    version: VERSION,
    documentation: 'https://github.com/step-protocol/step-blockchain',
    endpoints: {
      health: 'GET /health',
      mesh: {
        triangleAt: 'GET /mesh/triangleAt?lat={lat}&lon={lon}&level={level}',
        polygon: 'GET /mesh/polygon/:triangleId',
        children: 'GET /mesh/children/:triangleId',
        parent: 'GET /mesh/parent/:triangleId',
        search: 'GET /mesh/search?bbox={west,south,east,north}&level={level}',
        nearest: 'GET /mesh/nearest?lat={lat}&lon={lon}&level={level}&count={count}',
        info: 'GET /mesh/info/:triangleId',
        stats: 'GET /mesh/stats?level={level}',
      },
      proof: {
        submit: 'POST /proof/submit',
        status: 'GET /proof/status/:proofId',
      },
    },
  });
});

/**
 * Mount mesh API router
 */
app.use('/mesh', meshRouter);

/**
 * Mount proof validation API router
 */
app.use('/proof', proofRouter);

/**
 * 404 handler
 */
app.use((req, res) => {
  res.status(404).json({
    ok: false,
    error: {
      code: 'NOT_FOUND',
      message: `Endpoint not found: ${req.method} ${req.path}`,
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Global error handler
 */
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error(`[${new Date().toISOString()}] ERROR:`, err);
  
  res.status(500).json({
    ok: false,
    error: {
      code: 'INTERNAL_SERVER_ERROR',
      message: NODE_ENV === 'development' ? err.message : 'Internal server error',
    },
    timestamp: new Date().toISOString(),
  });
});

/**
 * Start server (non-blocking)
 * 
 * Why non-blocking: Start HTTP server immediately, initialize DB in background
 * Why guard timeout: Prevent indefinite waits if MongoDB is unreachable
 * Why mesh route gating: Provide 503 errors instead of crashes when DB isn't ready
 */

const STARTUP_DB_WAIT_MS = parseInt(process.env.STARTUP_DB_WAIT_MS || '15000', 10);
let dbReady = false;
let lastDbError: string | null = null;

// Initialize DB in background (non-blocking)
(async () => {
  const now = new Date().toISOString();
  console.log(`[${now}] [api] Starting DB init with ${STARTUP_DB_WAIT_MS}ms guard timeout...`);
  
  try {
    // Race between DB init and guard timeout
    await Promise.race([
      connectToDb(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error(`DB init guard timeout after ${STARTUP_DB_WAIT_MS}ms`)), STARTUP_DB_WAIT_MS)
      )
    ]);
    
    dbReady = true;
    lastDbError = null;
    console.log(`[${new Date().toISOString()}] [api] DB ready - mesh endpoints now active`);
  } catch (error: any) {
    // Check if DB actually connected despite timeout
    const health = dbHealth();
    dbReady = health.status === 'ok';
    lastDbError = error?.message || String(error);
    
    console.warn(`[${new Date().toISOString()}] [api] Proceeding without DB ready. Reason: ${lastDbError}`);
    console.warn(`[${new Date().toISOString()}] [api] Mesh endpoints will return 503 until DB connects`);
  }
})();

// Middleware: Guard DB-dependent routes
function requireDbReady(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!dbReady) {
    return res.status(503).json({
      ok: false,
      error: {
        code: 'SERVICE_UNAVAILABLE',
        message: 'Database not ready',
        hint: 'Retry shortly; backend is initializing DB connection',
        details: lastDbError || undefined,
      },
      timestamp: new Date().toISOString(),
    });
  }
  return next();
}

// Apply DB readiness guard to mesh and proof routes
app.use('/mesh', requireDbReady);
app.use('/proof', requireDbReady);

// Start HTTP server immediately (non-blocking)
const server = app.listen(PORT, () => {
  const now = new Date().toISOString();
  console.log(`
┌─────────────────────────────────────────────┐
│  STEP Mesh API Server                       │
├─────────────────────────────────────────────┤
│  Version:     0.2.0                         │
│  Port:        ${PORT}                            │
│  Environment: ${NODE_ENV}                    │
│  Started:     ${now}   │
└─────────────────────────────────────────────┘

API endpoints:
  → http://localhost:${PORT}/
  → http://localhost:${PORT}/health
  → http://localhost:${PORT}/mesh/triangleAt?lat=47.4979&lon=19.0402&level=10
  → http://localhost:${PORT}/proof/submit (POST)
  → http://localhost:${PORT}/proof/config

Press Ctrl+C to stop.
  `.trim());
});

// Process hooks for graceful shutdown
process.on('SIGTERM', async () => {
  console.log(`[${new Date().toISOString()}] [api] SIGTERM received; shutting down`);
  try { await closeDb(); } catch {}
  server.close(() => process.exit(0));
});

process.on('SIGINT', async () => {
  console.log(`[${new Date().toISOString()}] [api] SIGINT received; shutting down`);
  try { await closeDb(); } catch {}
  server.close(() => process.exit(0));
});

export default app;
