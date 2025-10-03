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

import express from 'express';
import { connectToDb, dbHealth } from '../core/db.js';
import meshRouter from './mesh-simple.js';
import proofRouter from './proof.js';

const app = express();
const PORT = process.env.PORT || 3002;
const NODE_ENV = process.env.NODE_ENV || 'development';

/**
 * Middleware: JSON body parser
 */
app.use(express.json());

/**
 * Middleware: CORS (allow all origins in development)
 * 
 * In production, restrict to specific origins.
 */
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*'); // TODO: Restrict in production
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
    version: '0.1.0',
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
    version: '0.1.0',
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
 * Start server
 * 
 * Initializes MongoDB connection, then starts HTTP server.
 */
async function startServer() {
  try {
    // Initialize MongoDB connection
    console.log(`[${new Date().toISOString()}] Connecting to MongoDB...`);
    await connectToDb();
    console.log(`[${new Date().toISOString()}] MongoDB connected successfully`);
    
    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`
┌─────────────────────────────────────────────┐
│  STEP Mesh API Server                       │
├─────────────────────────────────────────────┤
│  Version:     0.1.0                         │
│  Port:        ${PORT}                            │
│  Environment: ${NODE_ENV}                    │
│  Started:     ${new Date().toISOString()}   │
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
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Failed to start server:`, error);
    process.exit(1);
  }
}

startServer();

export default app;
