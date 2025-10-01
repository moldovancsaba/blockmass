import mongoose from "mongoose";

const NonceSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // uuid v4
    value: { type: String, required: true },
    userId: { type: String, default: "" },
    expiresAt: { type: Date, required: true },
    used: { type: Boolean, default: false },
  },
  { timestamps: true }
);

NonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
NonceSchema.index({ value: 1 }, { unique: true });

export default mongoose.models.Nonce || mongoose.model("Nonce", NonceSchema);
