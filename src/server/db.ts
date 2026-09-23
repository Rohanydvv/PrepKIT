import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import {
  InterviewKit,
  UserRecord,
  StoredKitRecord,
  CardReviewData,
  PracticeSessionRecord,
} from "../core/types.js";

export type { UserRecord, StoredKitRecord, CardReviewData, PracticeSessionRecord };

/**
 * File-based embedded fallback storage for zero-dependency local runs.
 * If MongoDB is not available, all data is safely persisted to `data/db.json`.
 */
export class EmbeddedStore {
  private filePath: string;
  private data: {
    users: UserRecord[];
    kits: StoredKitRecord[];
    practiceSessions: PracticeSessionRecord[];
  };

  constructor() {
    const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), "data");
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    this.filePath = path.join(dataDir, "db.json");
    this.data = this.load();
  }

  private load() {
    if (fs.existsSync(this.filePath)) {
      try {
        return JSON.parse(fs.readFileSync(this.filePath, "utf-8"));
      } catch {
        // Corrupt file, reinit
      }
    }
    return { users: [], kits: [], practiceSessions: [] };
  }

  private save() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.data, null, 2), "utf-8");
  }

  getData() {
    return this.data;
  }

  // User methods
  findUserByEmail(email: string): UserRecord | undefined {
    return this.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  }

  findUserById(id: string): UserRecord | undefined {
    return this.data.users.find((u) => u.id === id);
  }

  createUser(user: UserRecord): UserRecord {
    this.data.users.push(user);
    this.save();
    return user;
  }

  // Kit methods
  findKitsByUserId(userId: string): StoredKitRecord[] {
    return this.data.kits
      .filter((k) => k.userId === userId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }

  findKitById(id: string): StoredKitRecord | undefined {
    return this.data.kits.find((k) => k.id === id);
  }

  saveKit(record: StoredKitRecord): StoredKitRecord {
    const idx = this.data.kits.findIndex((k) => k.id === record.id);
    if (idx >= 0) {
      this.data.kits[idx] = record;
    } else {
      this.data.kits.push(record);
    }
    this.save();
    return record;
  }

  deleteKit(id: string): boolean {
    const initialLen = this.data.kits.length;
    this.data.kits = this.data.kits.filter((k) => k.id !== id);
    if (this.data.kits.length !== initialLen) {
      this.save();
      return true;
    }
    return false;
  }

  // Practice session methods
  findPracticeSession(userId: string, kitId: string): PracticeSessionRecord | undefined {
    return this.data.practiceSessions.find(
      (ps) => ps.userId === userId && ps.kitId === kitId
    );
  }

  savePracticeSession(record: PracticeSessionRecord): PracticeSessionRecord {
    const idx = this.data.practiceSessions.findIndex((ps) => ps.id === record.id);
    if (idx >= 0) {
      this.data.practiceSessions[idx] = record;
    } else {
      this.data.practiceSessions.push(record);
    }
    this.save();
    return record;
  }
}

export const embeddedStore = new EmbeddedStore();

// ---------------------------------------------------------------------------
// Mongoose Schemas & Models for MongoDB Atlas
// ---------------------------------------------------------------------------
const userSchema = new mongoose.Schema<UserRecord>(
  {
    id: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    createdAt: { type: String, required: true },
  },
  { collection: "users" }
);

const kitSchema = new mongoose.Schema<StoredKitRecord>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    kit: { type: mongoose.Schema.Types.Mixed, required: true },
    meta: { type: mongoose.Schema.Types.Mixed, default: {} },
    createdAt: { type: String, required: true },
    updatedAt: { type: String, required: true },
  },
  { collection: "kits" }
);

const practiceSessionSchema = new mongoose.Schema<PracticeSessionRecord>(
  {
    id: { type: String, required: true, unique: true },
    userId: { type: String, required: true, index: true },
    kitId: { type: String, required: true, index: true },
    cards: { type: mongoose.Schema.Types.Mixed, default: {} },
    updatedAt: { type: String, required: true },
  },
  { collection: "practice_sessions" }
);

export const UserModel =
  (mongoose.models.User as mongoose.Model<UserRecord>) ||
  mongoose.model<UserRecord>("User", userSchema);

export const KitModel =
  (mongoose.models.Kit as mongoose.Model<StoredKitRecord>) ||
  mongoose.model<StoredKitRecord>("Kit", kitSchema);

export const PracticeSessionModel =
  (mongoose.models.PracticeSession as mongoose.Model<PracticeSessionRecord>) ||
  mongoose.model<PracticeSessionRecord>("PracticeSession", practiceSessionSchema);

// ---------------------------------------------------------------------------
// Connection Lifecycle & Reuse
// ---------------------------------------------------------------------------
let mongooseConnectionPromise: Promise<typeof mongoose> | null = null;
let reconnectTimer: NodeJS.Timeout | null = null;

// Attach connection lifecycle events once
if (typeof mongoose.connection?.on === "function") {
  mongoose.connection.on("connected", () => {
    console.log("[Database] MongoDB Atlas connection established successfully.");
  });

  mongoose.connection.on("disconnected", () => {
    console.warn("[Database] MongoDB Atlas connection lost.");
    scheduleReconnect();
  });

  mongoose.connection.on("error", (err) => {
    console.error(`[Database] MongoDB Atlas connection error: ${err.message}`);
  });
}

function scheduleReconnect() {
  if (reconnectTimer || !process.env.MONGODB_URI) return;
  reconnectTimer = setTimeout(async () => {
    reconnectTimer = null;
    if (mongoose.connection.readyState !== 1) {
      console.log("[Database] Attempting background reconnection to MongoDB Atlas...");
      try {
        await initDatabase();
      } catch {
        // Will be rescheduled if disconnected
      }
    }
  }, 10000);
  reconnectTimer.unref();
}

export async function initDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri || !mongoUri.trim()) {
    console.log("[Database] No MONGODB_URI provided. Using zero-config embedded datastore (data/db.json).");
    return;
  }

  // Reuse existing connection if alive
  if (mongoose.connection.readyState === 1) {
    return;
  }

  if (!mongooseConnectionPromise || mongoose.connection.readyState === 0) {
    console.log("[Database] Connecting to MongoDB Atlas...");
    mongooseConnectionPromise = mongoose.connect(mongoUri, {
      serverSelectionTimeoutMS: 5000,
    });
  }

  try {
    await mongooseConnectionPromise;
    console.log("[Database] Connected to MongoDB Atlas successfully.");

    // Seed initial demo data from db.json if database is currently empty
    await seedFromLocalIfEmpty();
  } catch (err) {
    console.warn(
      `[Database] MongoDB Atlas connection attempt failed (${(err as Error).message}).`
    );
    mongooseConnectionPromise = null;
    scheduleReconnect();
  }
}

export function isUsingMongoDB(): boolean {
  return mongoose.connection.readyState === 1;
}

export async function ensureDbConnected(): Promise<boolean> {
  if (isUsingMongoDB()) return true;
  if (process.env.MONGODB_URI && process.env.MONGODB_URI.trim()) {
    try {
      await initDatabase();
      return isUsingMongoDB();
    } catch {
      return false;
    }
  }
  return false;
}

async function seedFromLocalIfEmpty(): Promise<void> {
  try {
    const userCount = await UserModel.countDocuments();
    if (userCount === 0) {
      const local = embeddedStore.getData();
      if (local.users && local.users.length > 0) {
        console.log(`[Database] Seeding ${local.users.length} initial user(s) to MongoDB Atlas...`);
        await UserModel.insertMany(local.users);
      }
      if (local.kits && local.kits.length > 0) {
        console.log(`[Database] Seeding ${local.kits.length} initial kit(s) to MongoDB Atlas...`);
        await KitModel.insertMany(local.kits);
      }
      if (local.practiceSessions && local.practiceSessions.length > 0) {
        await PracticeSessionModel.insertMany(local.practiceSessions);
      }
    }
  } catch (err) {
    console.warn(`[Database] Initial seed check skipped: ${(err as Error).message}`);
  }
}

// ---------------------------------------------------------------------------
// Unified Async DataStore
// Routes to MongoDB Atlas in Production; falls back to EmbeddedStore locally.
// ---------------------------------------------------------------------------
export const dataStore = {
  async findUserByEmail(email: string): Promise<UserRecord | undefined> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      const doc = await UserModel.findOne({ email: email.toLowerCase().trim() }).lean();
      if (!doc) return undefined;
      return {
        id: doc.id,
        email: doc.email,
        passwordHash: doc.passwordHash,
        createdAt: doc.createdAt,
      };
    }
    return embeddedStore.findUserByEmail(email);
  },

  async findUserById(id: string): Promise<UserRecord | undefined> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      const doc = await UserModel.findOne({ id }).lean();
      if (!doc) return undefined;
      return {
        id: doc.id,
        email: doc.email,
        passwordHash: doc.passwordHash,
        createdAt: doc.createdAt,
      };
    }
    return embeddedStore.findUserById(id);
  },

  async createUser(user: UserRecord): Promise<UserRecord> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      await UserModel.create(user);
      return user;
    }

    const isCloudOrProd =
      process.env.RENDER === "true" ||
      process.env.VERCEL === "1" ||
      process.env.NODE_ENV === "production";

    if (isCloudOrProd && process.env.MONGODB_URI) {
      throw new Error(
        "Persistent database unavailable: Cannot save user account because MongoDB Atlas is unreachable. Please verify that your MongoDB Atlas Network Access whitelist allows 0.0.0.0/0."
      );
    }

    return embeddedStore.createUser(user);
  },

  async findKitsByUserId(userId: string): Promise<StoredKitRecord[]> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      const docs = await KitModel.find({ userId }).sort({ updatedAt: -1 }).lean();
      return docs.map((d) => ({
        id: d.id,
        userId: d.userId,
        kit: d.kit,
        meta: d.meta || {},
        createdAt: d.createdAt,
        updatedAt: d.updatedAt,
      }));
    }
    return embeddedStore.findKitsByUserId(userId);
  },

  async findKitById(id: string): Promise<StoredKitRecord | undefined> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      const doc = await KitModel.findOne({ id }).lean();
      if (!doc) return undefined;
      return {
        id: doc.id,
        userId: doc.userId,
        kit: doc.kit,
        meta: doc.meta || {},
        createdAt: doc.createdAt,
        updatedAt: doc.updatedAt,
      };
    }
    return embeddedStore.findKitById(id);
  },

  async saveKit(record: StoredKitRecord): Promise<StoredKitRecord> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      await KitModel.findOneAndUpdate({ id: record.id }, record, {
        upsert: true,
        new: true,
      });
      return record;
    }
    return embeddedStore.saveKit(record);
  },

  async deleteKit(id: string): Promise<boolean> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      const res = await KitModel.deleteOne({ id });
      return res.deletedCount > 0;
    }
    return embeddedStore.deleteKit(id);
  },

  async findPracticeSession(userId: string, kitId: string): Promise<PracticeSessionRecord | undefined> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      const doc = await PracticeSessionModel.findOne({ userId, kitId }).lean();
      if (!doc) return undefined;
      return {
        id: doc.id,
        userId: doc.userId,
        kitId: doc.kitId,
        cards: doc.cards || {},
        updatedAt: doc.updatedAt,
      };
    }
    return embeddedStore.findPracticeSession(userId, kitId);
  },

  async savePracticeSession(record: PracticeSessionRecord): Promise<PracticeSessionRecord> {
    await ensureDbConnected();
    if (isUsingMongoDB()) {
      await PracticeSessionModel.findOneAndUpdate({ id: record.id }, record, {
        upsert: true,
        new: true,
      });
      return record;
    }
    return embeddedStore.savePracticeSession(record);
  },
};
