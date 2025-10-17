/**
 * Global Mesh State Schema
 * 
 * Purpose: Store global mining state for all users to see and interact with.
 * Each triangle can be clicked 0-10 times, auto-subdividing at 10 clicks.
 * 
 * Storage strategy:
 * - Single document per triangle (scalable)
 * - Base 20 triangles pre-seeded on server startup
 * - Children created on-demand when parent reaches 10 clicks
 * - Indexed by triangle ID for fast lookup
 * 
 * Why MongoDB:
 * - Flexible schema for dynamic subdivision tree
 * - Atomic increment operations for thread-safe click counting
 * - Indexed queries for fast triangle lookups
 */

import { Schema, model, Document } from 'mongoose';

/**
 * GlobalMeshTriangle represents one triangle in the global mesh.
 * All users see and interact with the same state.
 */
export interface GlobalMeshTriangle extends Document {
  // Unique triangle identifier (e.g., "ICO-0", "ICO-0-2", "ICO-0-2-3")
  triangleId: string;
  
  // Vertices on unit sphere (serialized from Vector3)
  vertices: [[number, number, number], [number, number, number], [number, number, number]];
  
  // Base color from vibrant palette
  baseColor: string;
  
  // Click count (0-10, auto-subdivides at 10)
  clicks: number;
  
  // Is this triangle subdivided? (true = hidden, children active)
  subdivided: boolean;
  
  // Child triangle IDs (if subdivided)
  children: string[];
  
  // Parent triangle ID (null for base 20)
  parent: string | null;
  
  // Subdivision level (0 = base icosahedron, 1+ = subdivisions)
  level: number;
  
  // Timestamps
  createdAt: Date;
  lastMined: Date | null; // Last time someone clicked this triangle
}

/**
 * Mongoose schema definition
 */
const globalMeshTriangleSchema = new Schema<GlobalMeshTriangle>({
  triangleId: {
    type: String,
    required: true,
    unique: true,
    index: true, // Fast lookup by ID
  },
  vertices: {
    type: [[Number, Number, Number], [Number, Number, Number], [Number, Number, Number]],
    required: true,
  },
  baseColor: {
    type: String,
    required: true,
  },
  clicks: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 10,
  },
  subdivided: {
    type: Boolean,
    required: true,
    default: false,
  },
  children: {
    type: [String],
    default: [],
  },
  parent: {
    type: String,
    default: null,
  },
  level: {
    type: Number,
    required: true,
    min: 0,
  },
  createdAt: {
    type: Date,
    default: () => new Date(),
  },
  lastMined: {
    type: Date,
    default: null,
  },
}, {
  timestamps: true, // Adds createdAt and updatedAt automatically
  collection: 'global_mesh_triangles',
});

// Compound index for efficient parent/child queries
globalMeshTriangleSchema.index({ parent: 1, subdivided: 1 });
globalMeshTriangleSchema.index({ level: 1, subdivided: 1 });

/**
 * Export the Mongoose model
 */
export const GlobalMeshTriangleModel = model<GlobalMeshTriangle>(
  'GlobalMeshTriangle',
  globalMeshTriangleSchema
);
