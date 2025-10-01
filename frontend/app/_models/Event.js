import mongoose from "mongoose";

const GeoSchema = new mongoose.Schema(
  {
    latE7: { type: Number, required: true },
    lonE7: { type: Number, required: true },
    geohash5: { type: String, required: true },
    accuracyM: { type: Number, required: true },
  },
  { _id: false }
);

const VerificationSchema = new mongoose.Schema(
  {
    nonce: { type: String, required: true },
    userSig: { type: String, default: "" },
    ipCountry: { type: String, default: "" },
    ipCity: { type: String, default: "" },
    ipOk: { type: Boolean, default: false },
    venueTokenId: { type: String, default: "" },
    venueOk: { type: Boolean, default: false },
  },
  { _id: false }
);

const AnchorSchema = new mongoose.Schema(
  {
    status: { type: String, default: "queued" }, // queued|sent|confirmed|failed|skipped
    txHash: { type: String, default: "" },
    blockNumber: { type: Number, default: null },
    usedEndpoint: { type: String, default: "" },
  },
  { _id: false }
);

const EventSchema = new mongoose.Schema(
  {
    _id: { type: String, required: true }, // uuid v4
    topicId: { type: String, required: true }, // uuid v4
    taskId: { type: String, required: true }, // uuid v4
    occurredAt: { type: String, required: true }, // ISO8601 string
    geo: { type: GeoSchema, required: true },
    verification: { type: VerificationSchema, required: true },
    contentHash: { type: String, required: true }, // hex
    anchor: { type: AnchorSchema, default: () => ({}) },
  },
  { timestamps: true }
);

EventSchema.index({ "geo.geohash5": 1, occurredAt: -1 });
EventSchema.index({ topicId: 1, taskId: 1, occurredAt: -1 });

export default mongoose.models.Event || mongoose.model("Event", EventSchema);
