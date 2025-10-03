/**
 * MongoDB Schemas for STEP Blockchain State
 * 
 * Collections:
 * 1. triangles - Triangle state (sparse materialization)
 * 2. triangle_events - Append-only audit log
 * 3. accounts - Wallet balances (Phase 2)
 * 
 * Why sparse materialization:
 * - 2.8 trillion potential triangles
 * - Most triangles will never be mined
 * - Only create document when triangle becomes active
 * - Saves 99.9% storage vs. pre-creating all triangles
 * 
 * Indexes:
 * - 2dsphere on centroid and polygon for geospatial queries
 * - Compound indexes for common query patterns
 * - TTL index for moratorium expiration
 */

import mongoose, { Schema, Document } from 'mongoose';

/**
 * Triangle document in MongoDB.
 * 
 * Lifecycle:
 * 1. Created when first miner attempts (moratoriumStartAt set)
 * 2. State: pending → active → partially_mined → exhausted
 * 3. On 11th click (if level < 21): subdivide into 4 children
 * 
 * Storage estimate:
 * - If 1% of triangles are ever mined: 28 billion documents
 * - Average doc size: ~500 bytes
 * - Total storage: ~14 TB (manageable with sharding)
 */
export interface ITriangle extends Document {
  // Identity (composite key)
  _id: string; // Encoded triangle ID (STEP-TRI-v1:...)
  face: number; // 0-19
  level: number; // 1-21
  pathEncoded: string; // BigInt as string (e.g., "30" for path [0,1,3,2])

  // Hierarchy
  parentId: string | null; // Parent triangle ID (null for level 1)
  childrenIds: string[]; // Array of 4 child IDs (empty until subdivision)

  // Mining state
  state: 'pending' | 'active' | 'partially_mined' | 'exhausted';
  clicks: number; // 0-28 (number of successful mines)
  moratoriumStartAt: Date; // When triangle became mineable (+ 168h)
  lastClickAt: Date | null; // Last successful mine timestamp

  // Geometry (GeoJSON for 2dsphere indexing)
  centroid: {
    type: 'Point';
    coordinates: [number, number]; // [lon, lat]
  };
  polygon: {
    type: 'Polygon';
    coordinates: [number, number][][]; // [[[lon, lat], ...]]
  };

  // Metadata
  createdAt: Date; // ISO 8601 UTC with ms
  updatedAt: Date; // ISO 8601 UTC with ms
}

/**
 * Triangle schema with validation and indexes.
 */
const triangleSchema = new Schema<ITriangle>(
  {
    _id: {
      type: String,
      required: true,
      // Validate STEP-TRI-v1 format
      validate: {
        validator: (v: string) => v.startsWith('STEP-TRI-v1:'),
        message: 'Triangle ID must be in STEP-TRI-v1 format',
      },
    },
    face: {
      type: Number,
      required: true,
      min: 0,
      max: 19,
    },
    level: {
      type: Number,
      required: true,
      min: 1,
      max: 21,
    },
    pathEncoded: {
      type: String,
      required: true,
      default: '0', // Empty path = "0"
    },
    parentId: {
      type: String,
      default: null,
    },
    childrenIds: {
      type: [String],
      default: [],
    },
    state: {
      type: String,
      enum: ['pending', 'active', 'partially_mined', 'exhausted'],
      default: 'pending',
    },
    clicks: {
      type: Number,
      default: 0,
      min: 0,
      max: 28,
    },
    moratoriumStartAt: {
      type: Date,
      required: true,
    },
    lastClickAt: {
      type: Date,
      default: null,
    },
    centroid: {
      type: {
        type: String,
        enum: ['Point'],
        required: true,
      },
      coordinates: {
        type: [Number],
        required: true,
      },
    },
    polygon: {
      type: {
        type: String,
        enum: ['Polygon'],
        required: true,
      },
      coordinates: {
        type: [[[Number]]],
        required: true,
      },
    },
  },
  {
    timestamps: true, // Automatically manage createdAt/updatedAt
    collection: 'triangles',
  }
);

/**
 * Indexes for efficient queries.
 * 
 * Query patterns:
 * 1. Find triangle by ID (primary key)
 * 2. Find triangles in viewport (2dsphere centroid)
 * 3. Find active triangles at level (state + level)
 * 4. Find triangles ready to mine (moratoriumStartAt + state)
 * 5. Find children of parent (parentId)
 */

// 2dsphere index for geospatial queries
triangleSchema.index({ centroid: '2dsphere' });
triangleSchema.index({ polygon: '2dsphere' });

// Compound index for common queries
triangleSchema.index({ level: 1, state: 1 });
triangleSchema.index({ face: 1, level: 1 });
triangleSchema.index({ parentId: 1 });

// Partial index for active triangles (most common query)
triangleSchema.index(
  { level: 1, state: 1, moratoriumStartAt: 1 },
  {
    partialFilterExpression: {
      state: { $in: ['active', 'partially_mined'] },
    },
  }
);

/**
 * Triangle model.
 */
export const Triangle = mongoose.model<ITriangle>('Triangle', triangleSchema);

// ============================================================================
// TRIANGLE EVENTS (Audit Log)
// ============================================================================

/**
 * Triangle event document in MongoDB.
 * 
 * Append-only audit log of all state changes.
 * 
 * Event types:
 * - create: Triangle document created
 * - click: Successful mine
 * - subdivide: Triangle divided into 4 children
 * - state_change: State transition
 * 
 * Storage estimate:
 * - 7.7 trillion STEP tokens = 7.7 trillion click events (worst case)
 * - Average event size: ~300 bytes
 * - Total storage: ~2.3 PB (requires archiving strategy)
 */
export interface ITriangleEvent extends Document {
  _id: string; // UUID v4
  triangleId: string; // Triangle ID (STEP-TRI-v1:...)
  eventType: 'create' | 'click' | 'subdivide' | 'state_change';
  timestamp: Date; // ISO 8601 UTC with ms
  
  // Replay protection fields (Phase 2)
  account?: string; // Wallet address (for 'click' events)
  nonce?: string; // Client-provided nonce (for 'click' events)
  signature?: string; // Proof signature (for 'click' events)

  // Event-specific payload
  payload: {
    // For 'click' events
    minerAddress?: string; // Wallet address (deprecated, use account)
    reward?: string; // Token amount (as string to preserve precision)
    clickNumber?: number; // 1-28
    lat?: number; // GPS latitude
    lon?: number; // GPS longitude
    accuracy?: number; // GPS accuracy in meters
    speed?: number; // Speed in m/s (computed from prev event)

    // For 'subdivide' events
    childrenIds?: string[]; // Array of 4 child IDs

    // For 'state_change' events
    oldState?: string;
    newState?: string;

    // Generic metadata
    [key: string]: any;
  };
}

/**
 * Triangle event schema.
 */
const triangleEventSchema = new Schema<ITriangleEvent>(
  {
    _id: {
      type: String,
      required: true,
    },
    triangleId: {
      type: String,
      required: true,
      validate: {
        validator: (v: string) => v.startsWith('STEP-TRI-v1:'),
        message: 'Triangle ID must be in STEP-TRI-v1 format',
      },
    },
    eventType: {
      type: String,
      enum: ['create', 'click', 'subdivide', 'state_change'],
      required: true,
    },
    timestamp: {
      type: Date,
      required: true,
    },
    // Phase 2: Replay protection fields
    account: {
      type: String,
      required: false, // Only required for 'click' events
      index: true,
    },
    nonce: {
      type: String,
      required: false, // Only required for 'click' events
      index: true,
    },
    signature: {
      type: String,
      required: false, // Only required for 'click' events
    },
    payload: {
      type: Schema.Types.Mixed,
      required: true,
    },
  },
  {
    collection: 'triangle_events',
    timestamps: false, // We manage timestamp manually
  }
);

/**
 * Indexes for event queries.
 * 
 * Query patterns:
 * 1. Get all events for a triangle (triangleId)
 * 2. Get recent events (timestamp DESC)
 * 3. Get events by type (eventType + timestamp)
 * 4. Prevent nonce replay (account + nonce) - UNIQUE INDEX
 * 5. Get last proof for account (account + timestamp)
 */
triangleEventSchema.index({ triangleId: 1, timestamp: -1 });
triangleEventSchema.index({ eventType: 1, timestamp: -1 });
triangleEventSchema.index({ timestamp: -1 }); // For recent events

// Phase 2: Replay protection - compound unique index on (account, nonce)
// This prevents double-spend attacks at the database level
// Why sparse: Only 'click' events have nonce; other events don't need this constraint
triangleEventSchema.index(
  { account: 1, nonce: 1 },
  { 
    unique: true,
    sparse: true, // Only index documents where both account and nonce exist
    name: 'account_nonce_unique',
  }
);

// Index for finding last proof by account (for speed/moratorium checks)
triangleEventSchema.index({ account: 1, timestamp: -1 });

/**
 * Triangle event model.
 */
export const TriangleEvent = mongoose.model<ITriangleEvent>(
  'TriangleEvent',
  triangleEventSchema
);

// ============================================================================
// ACCOUNTS (Wallet Balances) - Phase 2
// ============================================================================

/**
 * Account document in MongoDB.
 * 
 * Stores wallet balances and nonces for transfers.
 * 
 * Balance precision:
 * - Stored as string to preserve full 18 decimal places
 * - Use BigInt for arithmetic
 * - Example: "1000000000000000000" = 1 STEP token
 */
export interface IAccount extends Document {
  _id: string; // Wallet address (0x... format, 42 chars)
  balance: string; // Token balance in wei (as string)
  nonce: number; // Transaction counter (prevents replay attacks)
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Account schema.
 */
const accountSchema = new Schema<IAccount>(
  {
    _id: {
      type: String,
      required: true,
      // Validate Ethereum-style address format
      validate: {
        validator: (v: string) => /^0x[a-fA-F0-9]{40}$/.test(v),
        message: 'Address must be 42-char hex string starting with 0x',
      },
    },
    balance: {
      type: String,
      required: true,
      default: '0',
      // Validate numeric string
      validate: {
        validator: (v: string) => /^\d+$/.test(v),
        message: 'Balance must be numeric string',
      },
    },
    nonce: {
      type: Number,
      required: true,
      default: 0,
      min: 0,
    },
  },
  {
    timestamps: true,
    collection: 'accounts',
  }
);

/**
 * Indexes for account queries.
 */
accountSchema.index({ balance: -1 }); // For leaderboards

/**
 * Account model.
 */
export const Account = mongoose.model<IAccount>('Account', accountSchema);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

/**
 * Create or update a triangle document.
 * 
 * Sparse materialization: only create if doesn't exist.
 * 
 * @param triangleId - Encoded triangle ID
 * @param update - Fields to update
 * @returns Triangle document
 */
export async function upsertTriangle(
  triangleId: string,
  update: Partial<ITriangle>
): Promise<ITriangle> {
  const triangle = await Triangle.findByIdAndUpdate(
    triangleId,
    { $set: update },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  if (!triangle) {
    throw new Error(`Failed to upsert triangle: ${triangleId}`);
  }

  return triangle;
}

/**
 * Log a triangle event (append-only).
 * 
 * @param triangleId - Encoded triangle ID
 * @param eventType - Event type
 * @param payload - Event-specific data
 * @returns Event document
 */
export async function logTriangleEvent(
  triangleId: string,
  eventType: ITriangleEvent['eventType'],
  payload: ITriangleEvent['payload']
): Promise<ITriangleEvent> {
  // Generate UUID v4
  const eventId = generateUUID();

  const event = await TriangleEvent.create({
    _id: eventId,
    triangleId,
    eventType,
    timestamp: new Date(), // ISO 8601 UTC with ms
    payload,
  });

  return event;
}

/**
 * Generate UUID v4 (simple implementation).
 * 
 * For production, use a proper UUID library.
 * 
 * @returns UUID v4 string
 */
function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Get or create an account.
 * 
 * @param address - Wallet address
 * @returns Account document
 */
export async function getOrCreateAccount(address: string): Promise<IAccount> {
  let account = await Account.findById(address);

  if (!account) {
    account = await Account.create({
      _id: address,
      balance: '0',
      nonce: 0,
    });
  }

  return account;
}

/**
 * Update account balance (atomic operation).
 * 
 * @param address - Wallet address
 * @param amount - Amount to add (can be negative for deductions)
 * @returns Updated account
 */
export async function updateBalance(
  address: string,
  amount: bigint
): Promise<IAccount> {
  const account = await getOrCreateAccount(address);

  // Convert string balance to BigInt
  const currentBalance = BigInt(account.balance);
  const newBalance = currentBalance + amount;

  if (newBalance < 0n) {
    throw new Error(
      `Insufficient balance: ${address} has ${currentBalance}, tried to deduct ${-amount}`
    );
  }

  // Update balance
  account.balance = newBalance.toString();
  await account.save();

  return account;
}
