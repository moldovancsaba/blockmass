import mongoose from "mongoose";

// Define once across hot reloads
const HealthPingSchema = new mongoose.Schema(
  {
    clientId: { type: String, required: true, index: true },
    lastSeen: { type: Date, required: true, default: () => new Date() },
    userAgent: { type: String },
    ipHash: { type: String },
    meta: { type: mongoose.Schema.Types.Mixed },
    createdAt: { type: Date, default: () => new Date() },
  },
  { versionKey: false }
);

// TTL index for lastSeen, serverless-friendly active user calc
const ttl = parseInt(process.env.BLOCKMASS_HEARTBEAT_TTL_SECONDS || "60", 10);
const ttlSeconds = Number.isFinite(ttl) && ttl > 0 ? ttl : 60;
HealthPingSchema.index({ lastSeen: 1 }, { expireAfterSeconds: ttlSeconds });

export default mongoose.models.HealthPing || mongoose.model("HealthPing", HealthPingSchema);