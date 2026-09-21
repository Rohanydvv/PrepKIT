import mongoose from "mongoose";
import fs from "fs";
import path from "path";
import { InterviewKit } from "../core/types.js";

export interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

export interface StoredKitRecord {
  id: string;
  userId: string;
  kit: InterviewKit;
  meta: Record<string, { provenance: "generated" | "edited" | "manual"; is_pinned: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface CardReviewData {
  confidence: number; // 1, 2, or 3
  reviewedAt: string;
  reviewCount: number;
}

export interface PracticeSessionRecord {
  id: string;
  userId: string;
  kitId: string;
  cards: Record<string, CardReviewData>;
  updatedAt: string;
}

/**
 * File-based embedded fallback storage for zero-dependency local runs.
 * If MongoDB is not available, all data is safely persisted to `data/db.json`.
 */
class EmbeddedStore {
  private filePath: string;
  private data: {
    users: UserRecord[];
    kits: StoredKitRecord[];
    practiceSessions: PracticeSessionRecord[];
  };

  constructor() {
    const dataDir = path.resolve(process.cwd(), "data");
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

let isMongoConnected = false;

export async function initDatabase(): Promise<void> {
  const mongoUri = process.env.MONGODB_URI;

  if (!mongoUri) {
    console.log("[Database] No MONGODB_URI provided. Using zero-config embedded datastore (data/db.json).");
    return;
  }

  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 3000 });
    isMongoConnected = true;
    console.log("[Database] Connected to MongoDB successfully.");
  } catch (err) {
    console.warn(
      `[Database] MongoDB connection failed (${(err as Error).message}). Falling back smoothly to embedded datastore.`
    );
    isMongoConnected = false;
  }
}

export function isUsingMongoDB(): boolean {
  return isMongoConnected;
}
