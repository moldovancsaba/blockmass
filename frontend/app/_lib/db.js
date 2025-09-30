import mongoose from "mongoose";

let cached = global._mongooseConn;
if (!cached) cached = global._mongooseConn = { conn: null, promise: null };

/**
 * Connect to MongoDB via Mongoose.
 * Reuses a cached connection across hot reloads and serverless invocations.
 */
export async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    // What: Prefer MONGODB_URI with a temporary fallback to MONGO_URI (deprecated).
    // Why: Provide compatibility while teams migrate to the canonical key.
    const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
    if (!uri) throw new Error("MONGODB_URI not set (MONGO_URI deprecated fallback not found)");
    cached.promise = mongoose.connect(uri, { dbName: "blockmass" }).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}

/**
 * Basic health info for the DB layer.
 */
export async function dbHealth() {
  try {
    const conn = await dbConnect();
    const state = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
    return { ok: true, state, host: conn.connection.host };
  } catch (e) {
    return { ok: false, error: e.message || "unknown" };
  }
}
