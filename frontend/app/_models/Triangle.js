import mongoose from 'mongoose';

const triangleSchema = new mongoose.Schema({
  triangleId: { type: String, required: true, unique: true },
  level: { type: Number, required: true },
  centroid: {
    type: { type: String, enum: ['Point'], required: true },
    coordinates: { type: [Number], required: true }, // [lon, lat]
  },
  polygon: {
    type: { type: String, enum: ['Polygon'], required: true },
    coordinates: { type: [[[Number]]], required: true },
  },
  clicks: { type: Number, default: 0 },
  status: { type: String, enum: ['pending', 'active', 'mined_out', 'subdivided'], default: 'pending' },
  parent: String,
  children: [String],
  lastMinedAt: Date,
}, { timestamps: true });

// 2dsphere indexes for geospatial queries
triangleSchema.index({ centroid: '2dsphere' });
triangleSchema.index({ 'polygon': '2dsphere' });
triangleSchema.index({ triangleId: 1 });
triangleSchema.index({ level: 1, status: 1 });

const Triangle = mongoose.models.Triangle || mongoose.model('Triangle', triangleSchema);

export default Triangle;
