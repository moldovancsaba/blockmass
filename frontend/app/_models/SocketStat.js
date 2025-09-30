import mongoose from "mongoose";

const SocketStatSchema = new mongoose.Schema(
  {
    at: { type: Date, default: () => new Date(), index: true },
    count: { type: Number, required: true },
    source: { type: String, enum: ["socket", "heartbeat"], required: true },
    env: { type: String, default: process.env.NODE_ENV || "development" },
  },
  { versionKey: false }
);

export default mongoose.models.SocketStat || mongoose.model("SocketStat", SocketStatSchema);