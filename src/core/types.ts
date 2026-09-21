import { z } from "zod";

// ==============================================================================
// Appendix A - Strict Kit Structure Schemas and Types
// ==============================================================================

export const RequirementKindSchema = z.enum(["technical", "behavioural", "domain"]);
export type RequirementKind = z.infer<typeof RequirementKindSchema>;

export const RequirementPrioritySchema = z.enum(["must", "nice"]);
export type RequirementPriority = z.infer<typeof RequirementPrioritySchema>;

export const RequirementSchema = z.object({
  id: z.string(), // stable e.g. "r1", "r2"
  text: z.string(),
  kind: RequirementKindSchema,
  priority: RequirementPrioritySchema,
});
export type Requirement = z.infer<typeof RequirementSchema>;

export const KitSourceSchema = z.object({
  company: z.string(),
  company_url: z.string(),
  role: z.string(),
  location: z.string(),
  jd_chars: z.number().int().nonnegative(),
  researched_at: z.string(), // ISO-8601 string
  pages_used: z.array(z.string()),
});
export type KitSource = z.infer<typeof KitSourceSchema>;

export const CompanyBriefSchema = z.object({
  summary: z.string(),
  what_they_do: z.string(),
  sources: z.array(z.string()),
});
export type CompanyBrief = z.infer<typeof CompanyBriefSchema>;

export const RoleBreakdownSchema = z.object({
  title: z.string(),
  seniority: z.string(),
  responsibilities: z.array(z.string()),
  requirements: z.array(RequirementSchema),
});
export type RoleBreakdown = z.infer<typeof RoleBreakdownSchema>;

export const QuestionCategorySchema = z.enum([
  "technical",
  "behavioural",
  "system-design",
  "company-fit",
]);
export type QuestionCategory = z.infer<typeof QuestionCategorySchema>;

export const QuestionSchema = z.object({
  id: z.string(), // stable e.g. "q1", "q2"
  requirement_ids: z.array(z.string()),
  category: QuestionCategorySchema,
  prompt: z.string(),
  answer_outline: z.string(),
  difficulty: z.union([z.literal(1), z.literal(2), z.literal(3)]), // 1 to 3 integer
});
export type Question = z.infer<typeof QuestionSchema>;

export const FlashcardSchema = z.object({
  id: z.string(), // stable e.g. "f1", "f2"
  front: z.string(),
  back: z.string(),
  requirement_ids: z.array(z.string()),
});
export type Flashcard = z.infer<typeof FlashcardSchema>;

export const ScheduleDaySchema = z.object({
  day: z.number().int().positive(),
  focus: z.string(),
  question_ids: z.array(z.string()),
  minutes: z.number().int().positive(), // integer minutes
});
export type ScheduleDay = z.infer<typeof ScheduleDaySchema>;

export const ScheduleSchema = z.object({
  days_available: z.number().int().positive(),
  days: z.array(ScheduleDaySchema),
});
export type Schedule = z.infer<typeof ScheduleSchema>;

export const CoverageSchema = z.object({
  uncovered_requirement_ids: z.array(z.string()),
  passes: z.number().int().positive(),
});
export type Coverage = z.infer<typeof CoverageSchema>;

/**
 * Core Interview Kit Schema and Structure.
 */
export const InterviewKitSchema = z.object({
  source: KitSourceSchema,
  company_brief: CompanyBriefSchema,
  role: RoleBreakdownSchema,
  questions: z.array(QuestionSchema),
  flashcards: z.array(FlashcardSchema),
  schedule: ScheduleSchema,
  coverage: CoverageSchema,
});
export type InterviewKit = z.infer<typeof InterviewKitSchema>;

// ==============================================================================
// State metadata for The Builder (Section 6)
// ==============================================================================

export type ItemProvenance = "generated" | "edited" | "manual";

export interface ItemMetadata {
  provenance: ItemProvenance;
  is_pinned: boolean;
}

export type BuilderQuestion = Question & ItemMetadata;
export type BuilderFlashcard = Flashcard & ItemMetadata;

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
  meta: Record<string, { provenance: ItemProvenance; is_pinned: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface CardReviewData {
  confidence: number;
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

// ==============================================================================
// Appendix B - Batch Input and Output Schemas and Types
// ==============================================================================

export const BatchCaseInputSchema = z.object({
  id: z.string(),
  jd: z.string(),
  company_url: z.string(),
  days: z.number().int().positive(),
});
export type BatchCaseInput = z.infer<typeof BatchCaseInputSchema>;

export const BatchCaseErrorSchema = z.object({
  code: z.string(),
  message: z.string(),
});
export type BatchCaseError = z.infer<typeof BatchCaseErrorSchema>;

export const BatchCaseResultSchema = z.discriminatedUnion("status", [
  z.object({
    id: z.string(),
    status: z.literal("ok"),
    kit: InterviewKitSchema,
    error: z.null(),
  }),
  z.object({
    id: z.string(),
    status: z.literal("failed"),
    kit: z.null(),
    error: BatchCaseErrorSchema,
  }),
]);
export type BatchCaseResult = z.infer<typeof BatchCaseResultSchema>;

export const BatchOutputSchema = z.object({
  version: z.literal("1.0"),
  generated_at: z.string(), // ISO-8601 string
  kits: z.array(BatchCaseResultSchema),
});
export type BatchOutput = z.infer<typeof BatchOutputSchema>;

// Pipeline status events for progress streaming
export type PipelineStage =
  | "INIT"
  | "VALIDATING_INPUT"
  | "CRAWLING_COMPANY"
  | "SEARCHING_PUBLIC_DISCUSSIONS"
  | "EXTRACTING_REQUIREMENTS"
  | "SYNTHESIZING_BRIEF"
  | "GENERATING_QUESTIONS"
  | "CHECKING_COVERAGE"
  | "SECOND_PASS_GENERATION"
  | "GENERATING_FLASHCARDS"
  | "ALLOCATING_SCHEDULE"
  | "VALIDATING_STRUCTURE"
  | "COMPLETED"
  | "FAILED";

export interface PipelineProgress {
  stage: PipelineStage;
  message: string;
  percent: number;
  data?: unknown;
}
