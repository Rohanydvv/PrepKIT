import express, { Response } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import crypto from "crypto";
import { initDatabase, dataStore, StoredKitRecord, isUsingMongoDB } from "./db.js";
import {
  requireAuth,
  registerUser,
  loginUser,
  AuthenticatedRequest,
} from "./auth.js";
import { createRateLimiter } from "./rateLimiter.js";
import { generateInterviewPrepKit } from "../core/pipeline.js";
import { generateCompanyBrief } from "../core/generation/briefGenerator.js";
import { generateInitialQuestionBank } from "../core/generation/questionGenerator.js";
import { allocateSchedule } from "../core/scheduler/scheduler.js";
import { validateInterviewKit } from "../core/validator/kitValidator.js";
import { evaluateCandidateAnswer } from "./mockInterview.js";
import { crawlCompanySite } from "../core/crawler/crawler.js";
import { searchPublicInterviewDiscussion } from "../core/crawler/publicDiscussion.js";
import { Question } from "../core/types.js";

const app = express();
const PORT = process.env.PORT || 5000;

// Trust reverse proxy (Render, Vercel, Cloudflare) for accurate client IP identification
app.set("trust proxy", 1);

app.use(cors({ origin: true, credentials: true }));
app.use(cookieParser());
app.use(express.json({ limit: "5mb" }));

// Rate limiter for authentication routes (login, signup, register)
// 30 requests per 15 minutes per client IP
const authRateLimiter = createRateLimiter({
  maxRequests: 30,
  windowMs: 15 * 60 * 1000,
  message: "Too many authentication attempts. Please wait a few moments and try again.",
});

// ---------------------------------------------------------------------------
// Health & Diagnostic Endpoint
// ---------------------------------------------------------------------------
app.get("/api/health", (_req, res) => {
  const isMongo = isUsingMongoDB();
  res.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: "1.0.0",
    database: {
      provider: isMongo ? "mongodb" : "embedded",
      connected: isMongo,
      storage: isMongo ? "MongoDB Atlas (persistent)" : "Embedded Store (ephemeral on cloud)",
      hasMongoUri: Boolean(process.env.MONGODB_URI),
    },
  });
});

// ---------------------------------------------------------------------------
// Authentication Endpoints (Section 1)
// ---------------------------------------------------------------------------
async function handleAuthRegister(req: express.Request, res: Response) {
  try {
    const { email, password } = req.body;
    if (!email || typeof email !== "string" || !email.trim()) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Email is required." });
      return;
    }
    if (!password || typeof password !== "string" || password.length < 6) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Password must be at least 6 characters." });
      return;
    }

    const { user, token } = await registerUser(email, password);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.status(201).json({ user, token });
  } catch (err: any) {
    const msg = (err as Error).message || "Registration failed.";
    if (msg.includes("already exists")) {
      res.status(409).json({
        error: "EMAIL_EXISTS",
        message: "An account with this email already exists. Please sign in instead.",
      });
      return;
    }
    res.status(400).json({ error: "REGISTRATION_FAILED", message: msg });
  }
}

// Support both /api/auth/register and /api/auth/signup identically
app.post("/api/auth/register", authRateLimiter, handleAuthRegister);
app.post("/api/auth/signup", authRateLimiter, handleAuthRegister);

app.post("/api/auth/login", authRateLimiter, async (req, res) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      res.status(400).json({ error: "VALIDATION_ERROR", message: "Email and password are required." });
      return;
    }

    const { user, token } = await loginUser(email, password);

    res.cookie("token", token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    res.json({ user, token });
  } catch (err) {
    res.status(401).json({
      error: "INVALID_CREDENTIALS",
      message: (err as Error).message || "Invalid email or password.",
    });
  }
});

app.post("/api/auth/logout", (_req, res) => {
  res.clearCookie("token");
  res.json({ message: "Logged out successfully" });
});

app.get("/api/auth/me", requireAuth, (req: AuthenticatedRequest, res: Response) => {
  res.json({ user: req.user });
});

// ---------------------------------------------------------------------------
// Kit Generation & Management Endpoints (Sections 2, 3, 5, 6, 13)
// ---------------------------------------------------------------------------

// List kits for current authenticated user
app.get("/api/kits", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const userKits = await dataStore.findKitsByUserId(userId);
  res.json({ kits: userKits });
});

// SSE Streaming generation endpoint for real-time progress in UI
// Note: Must be registered before /api/kits/:id to prevent wildcard shadowing
app.get("/api/kits/generate-stream", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const jd = String(req.query.jd || "");
  const company_url = String(req.query.company_url || "");
  const days = parseInt(String(req.query.days || "5"), 10);

  if (!jd || !company_url) {
    res.status(400).json({ error: "Missing jd or company_url parameter" });
    return;
  }

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const sendEvent = (event: string, data: unknown) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  try {
    const kit = await generateInterviewPrepKit({
      jd,
      company_url,
      days,
      onProgress: (progress) => {
        sendEvent("progress", progress);
      },
    });

    const meta: StoredKitRecord["meta"] = {};
    kit.questions.forEach((q) => {
      meta[q.id] = { provenance: "generated", is_pinned: false };
    });
    kit.flashcards.forEach((f) => {
      meta[f.id] = { provenance: "generated", is_pinned: false };
    });

    const newRecord: StoredKitRecord = {
      id: `kit_${crypto.randomUUID()}`,
      userId,
      kit,
      meta,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dataStore.saveKit(newRecord);
    sendEvent("completed", { record: newRecord });
    res.end();
  } catch (err) {
    sendEvent("error", { message: (err as Error).message });
    res.end();
  }
});

// Generate new kit with standard POST
app.post("/api/kits/generate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const { jd, company_url, days } = req.body;

  if (!jd || typeof jd !== "string" || !jd.trim()) {
    res.status(400).json({ error: "Job description is required" });
    return;
  }
  if (!company_url || typeof company_url !== "string" || !company_url.trim()) {
    res.status(400).json({ error: "Company URL is required" });
    return;
  }

  const daysInt = parseInt(days, 10) || 5;

  try {
    const kit = await generateInterviewPrepKit({
      jd,
      company_url,
      days: daysInt,
    });

    // Initialize item metadata (provenance: generated, is_pinned: false)
    const meta: StoredKitRecord["meta"] = {};
    kit.questions.forEach((q) => {
      meta[q.id] = { provenance: "generated", is_pinned: false };
    });
    kit.flashcards.forEach((f) => {
      meta[f.id] = { provenance: "generated", is_pinned: false };
    });

    const newRecord: StoredKitRecord = {
      id: `kit_${crypto.randomUUID()}`,
      userId,
      kit,
      meta,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await dataStore.saveKit(newRecord);

    res.status(201).json({ record: newRecord });
  } catch (err) {
    console.error("[generate error]", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// Get single kit
app.get("/api/kits/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const kitId = String(req.params.id);
  const record = await dataStore.findKitById(kitId);

  if (!record || record.userId !== userId) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }

  res.json({ record });
});

// Update kit (Builder changes: edits, reorder, additions, pinning)
app.put("/api/kits/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const kitId = String(req.params.id);
  const existing = await dataStore.findKitById(kitId);

  if (!existing || existing.userId !== userId) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }

  const { kit, meta } = req.body;

  // Validate structural integrity of updated kit
  const validation = validateInterviewKit(kit);
  if (!validation.success || !validation.data) {
    res.status(400).json({ error: "Validation failed", details: validation.errors });
    return;
  }

  existing.kit = validation.data;
  if (meta) {
    existing.meta = meta;
  }
  existing.updatedAt = new Date().toISOString();

  await dataStore.saveKit(existing);
  res.json({ record: existing });
});

// Delete kit
app.delete("/api/kits/:id", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const kitId = String(req.params.id);
  const existing = await dataStore.findKitById(kitId);

  if (!existing || existing.userId !== userId) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }

  await dataStore.deleteKit(kitId);
  res.json({ message: "Kit deleted successfully" });
});

// ---------------------------------------------------------------------------
// Section Regeneration with State Preservation (Section 6)
// ---------------------------------------------------------------------------
app.post("/api/kits/:id/regenerate-section", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const kitId = String(req.params.id);
  const record = await dataStore.findKitById(kitId);

  if (!record || record.userId !== userId) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }

  const { section, category } = req.body;
  const currentKit = record.kit;
  const currentMeta = record.meta || {};

  try {
    if (section === "company_brief") {
      // Regenerate brief
      const crawled = await crawlCompanySite(currentKit.source.company_url);
      const discussions = await searchPublicInterviewDiscussion(currentKit.source.company);
      const newBrief = await generateCompanyBrief(crawled, discussions, currentKit.source.company);
      currentKit.company_brief = newBrief;
    } else if (section === "schedule") {
      // Regenerate schedule deterministically
      currentKit.schedule = allocateSchedule(
        currentKit.questions,
        currentKit.role.requirements,
        currentKit.schedule.days_available
      );
    } else if (section === "category" && category) {
      // Regenerate specific question category with STRICT state preservation!
      // Section 6: "Regenerating one section must not discard edits the user has made elsewhere,
      // and a question the user wrote or edited by hand must survive a regeneration of its category."

      // 1. Separate preserved questions vs replaceable questions
      const preservedQuestions: Question[] = [];
      const preservedQIds = new Set<string>();

      currentKit.questions.forEach((q) => {
        const itemMeta = currentMeta[q.id];
        const isTargetCategory = q.category === category;

        if (!isTargetCategory) {
          // Other categories are 100% untouched
          preservedQuestions.push(q);
          preservedQIds.add(q.id);
        } else {
          // Inside target category: keep if edited, manual, or pinned
          const isEdited = itemMeta?.provenance === "edited";
          const isManual = itemMeta?.provenance === "manual";
          const isPinned = itemMeta?.is_pinned === true;

          if (isEdited || isManual || isPinned) {
            preservedQuestions.push(q);
            preservedQIds.add(q.id);
          }
        }
      });

      // 2. Generate new fresh candidates for target category
      const freshQuestions = await generateInitialQuestionBank(
        currentKit.role.requirements,
        currentKit.company_brief.summary
      );

      // Filter candidates for this specific category
      const newCategoryCandidates = freshQuestions.filter((q) => q.category === category);

      // Assign unique stable IDs that don't collide
      let nextIdNum = currentKit.questions.length + 1;
      const addedQuestions: Question[] = [];

      newCategoryCandidates.slice(0, 3).forEach((candidate) => {
        while (currentKit.questions.some((q) => q.id === `q${nextIdNum}`)) {
          nextIdNum++;
        }
        const newId = `q${nextIdNum++}`;
        const newQ: Question = {
          ...candidate,
          id: newId,
        };
        addedQuestions.push(newQ);
        currentMeta[newId] = { provenance: "generated", is_pinned: false };
      });

      // Merge preserved and newly generated questions
      currentKit.questions = [...preservedQuestions, ...addedQuestions];

      // Re-allocate schedule so it reflects the updated questions
      currentKit.schedule = allocateSchedule(
        currentKit.questions,
        currentKit.role.requirements,
        currentKit.schedule.days_available
      );
    } else {
      res.status(400).json({ error: "Invalid section specified for regeneration." });
      return;
    }

    record.updatedAt = new Date().toISOString();
    await dataStore.saveKit(record);

    res.json({ record });
  } catch (err) {
    console.error("[regeneration error]", err);
    res.status(500).json({ error: (err as Error).message });
  }
});

// ---------------------------------------------------------------------------
// Practice Mode Endpoints (Section 7)
// ---------------------------------------------------------------------------
app.get("/api/kits/:id/practice", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const kitId = String(req.params.id);
  const record = await dataStore.findKitById(kitId);

  if (!record || record.userId !== userId) {
    res.status(404).json({ error: "Kit not found" });
    return;
  }

  const session = (await dataStore.findPracticeSession(userId, kitId)) || {
    id: `ps_${crypto.randomUUID()}`,
    userId,
    kitId,
    cards: {},
    updatedAt: new Date().toISOString(),
  };

  // Order flashcards by confidence (least confident first, unreviewed first)
  const flashcards = [...record.kit.flashcards].sort((a, b) => {
    const revA = session.cards[a.id];
    const revB = session.cards[b.id];

    const confA = revA ? revA.confidence : 0; // 0 = unreviewed
    const confB = revB ? revB.confidence : 0;

    return confA - confB;
  });

  const reviewedCount = Object.keys(session.cards).length;
  const masteredCount = Object.values(session.cards).filter((c) => c.confidence === 3).length;

  res.json({
    flashcards,
    session,
    stats: {
      totalCards: record.kit.flashcards.length,
      reviewedCount,
      masteredCount,
      progressPercent: Math.round((reviewedCount / (record.kit.flashcards.length || 1)) * 100),
    },
  });
});

app.post("/api/kits/:id/practice/record", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const userId = req.user!.id;
  const kitId = String(req.params.id);
  const { cardId, confidence } = req.body;

  if (!cardId || ![1, 2, 3].includes(confidence)) {
    res.status(400).json({ error: "Valid cardId and confidence rating (1, 2, 3) are required" });
    return;
  }

  let session = await dataStore.findPracticeSession(userId, kitId);
  if (!session) {
    session = {
      id: `ps_${crypto.randomUUID()}`,
      userId,
      kitId,
      cards: {},
      updatedAt: new Date().toISOString(),
    };
  }

  const existingReview = session.cards[cardId];
  session.cards[cardId] = {
    confidence,
    reviewedAt: new Date().toISOString(),
    reviewCount: (existingReview?.reviewCount || 0) + 1,
  };
  session.updatedAt = new Date().toISOString();

  await dataStore.savePracticeSession(session);
  res.json({ success: true, session });
});

// ---------------------------------------------------------------------------
// Creative Feature: Mock Interview Coach (Section 14)
// ---------------------------------------------------------------------------
app.post("/api/mock-interview/evaluate", requireAuth, async (req: AuthenticatedRequest, res: Response) => {
  const { questionPrompt, category, answerOutline, candidateAnswer } = req.body;

  if (!questionPrompt || !candidateAnswer) {
    res.status(400).json({ error: "questionPrompt and candidateAnswer are required." });
    return;
  }

  try {
    const evaluation = await evaluateCandidateAnswer(
      questionPrompt,
      category || "technical",
      answerOutline || "Core concepts and trade-offs",
      candidateAnswer
    );
    res.json({ evaluation });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

// Start server
export async function startServer() {
  await initDatabase();
  return app.listen(PORT, () => {
    console.log(`[Express] Backend API running at http://localhost:${PORT}`);
  });
}

if (process.env.NODE_ENV !== "test") {
  startServer();
}

export default app;
