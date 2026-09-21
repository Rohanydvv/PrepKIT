import { InterviewKit, PipelineProgress } from "./types.js";
import { crawlCompanySite } from "./crawler/crawler.js";
import { searchPublicInterviewDiscussion } from "./crawler/publicDiscussion.js";
import { extractRoleAndRequirements } from "./extraction/jdExtractor.js";
import { generateCompanyBrief } from "./generation/briefGenerator.js";
import {
  generateInitialQuestionBank,
  generateQuestionsForGaps,
} from "./generation/questionGenerator.js";
import { generateFlashcards } from "./generation/flashcardGenerator.js";
import { runCoveragePassLoop } from "./coverage/coverageChecker.js";
import { allocateSchedule } from "./scheduler/scheduler.js";
import { validateInterviewKit } from "./validator/kitValidator.js";

export interface PipelineOptions {
  jd: string;
  company_url: string;
  days: number;
  company_name?: string;
  onProgress?: (p: PipelineProgress) => void;
}

/**
 * The Master Interview Prep Kit Pipeline
 *
 * Implements end-to-end research, extraction, generation, and scheduling:
 * - Multi-step deliberate pipeline responding to discovered facts.
 * - Crawls company site, ranks career/about links, respects robots.txt.
 * - Analyzes public interview discussions.
 * - Deterministic coverage gap checker with second-pass loop.
 * - Deterministic arithmetic day-by-day scheduler.
 * - Strict schema enforcement.
 */
export async function generateInterviewPrepKit(
  options: PipelineOptions
): Promise<InterviewKit> {
  const { jd, company_url, days, onProgress } = options;

  const emit = (stage: PipelineProgress["stage"], message: string, percent: number) => {
    if (onProgress) {
      onProgress({ stage, message, percent });
    }
  };

  emit("INIT", "Starting interview preparation pipeline...", 5);

  // Step 1: Extract requirements from Job Description text
  emit("EXTRACTING_REQUIREMENTS", "Extracting role profile and requirements from Job Description...", 15);
  const roleBreakdown = await extractRoleAndRequirements(jd);

  // Step 2: Crawl Company Website
  emit("CRAWLING_COMPANY", `Crawling company site at ${company_url}...`, 30);
  const crawledResult = await crawlCompanySite(company_url);

  // Derive company name if not explicitly provided
  let detectedCompanyName = options.company_name || "";
  if (!detectedCompanyName && crawledResult.homepage?.title) {
    detectedCompanyName = crawledResult.homepage.title.split(/[-|•:]/)[0].trim();
  }
  if (!detectedCompanyName && company_url) {
    try {
      const u = new URL(company_url.startsWith("http") ? company_url : `https://${company_url}`);
      detectedCompanyName = u.hostname.replace(/^www\./, "").split(".")[0];
      detectedCompanyName =
        detectedCompanyName.charAt(0).toUpperCase() + detectedCompanyName.slice(1);
    } catch {
      detectedCompanyName = "Target Company";
    }
  }

  // Step 3: Search Public Interview Discussions
  emit(
    "SEARCHING_PUBLIC_DISCUSSIONS",
    `Searching public interview debriefs and discussions for ${detectedCompanyName}...`,
    45
  );
  const discussionResult = await searchPublicInterviewDiscussion(detectedCompanyName);

  // Step 4: Synthesize Company Brief
  emit("SYNTHESIZING_BRIEF", "Synthesizing company brief and technical operating model...", 55);
  const companyBrief = await generateCompanyBrief(
    crawledResult,
    discussionResult,
    detectedCompanyName
  );

  // Step 5: Generate Initial Question Bank
  emit("GENERATING_QUESTIONS", "Generating category-aligned interview question bank...", 65);
  const hiringProcessNotes = [
    crawledResult.hiringPage ? `Hiring Page: ${crawledResult.hiringPage.text.slice(0, 1500)}` : "",
    discussionResult.found ? `Discussions: ${discussionResult.summary}` : "",
  ]
    .filter(Boolean)
    .join("\n");

  const initialQuestions = await generateInitialQuestionBank(
    roleBreakdown.requirements,
    companyBrief.summary,
    hiringProcessNotes
  );

  // Step 6 & 7: Deterministic Coverage Gap Check & Second-Pass Loop (Section 4)
  emit(
    "CHECKING_COVERAGE",
    "Running deterministic coverage gap verification (Pass 1)...",
    75
  );
  const coverageResult = await runCoveragePassLoop(
    initialQuestions,
    roleBreakdown.requirements,
    async (missingReqs, currentCount) => {
      emit(
        "SECOND_PASS_GENERATION",
        `Second Pass: Closing coverage gaps for ${missingReqs.length} requirement(s)...`,
        82
      );
      return await generateQuestionsForGaps(
        missingReqs,
        currentCount,
        companyBrief.summary
      );
    },
    2 // 2 passes standard
  );

  // Step 8: Generate Flashcards
  emit("GENERATING_FLASHCARDS", "Generating high-yield recall flashcards...", 88);
  const flashcards = await generateFlashcards(
    roleBreakdown.requirements,
    roleBreakdown.title
  );

  // Step 9: Deterministic Arithmetic Schedule Allocation (Section 8)
  emit(
    "ALLOCATING_SCHEDULE",
    `Allocating material across exactly ${days} day(s) using deterministic arithmetic...`,
    94
  );
  const schedule = allocateSchedule(
    coverageResult.questions,
    roleBreakdown.requirements,
    days
  );

  // Build the complete Kit conforming to Appendix A
  const rawKit: InterviewKit = {
    source: {
      company: detectedCompanyName || "Company",
      company_url: crawledResult.baseUrl || company_url,
      role: roleBreakdown.title,
      location: "Unspecified",
      jd_chars: jd.length,
      researched_at: new Date().toISOString(),
      pages_used: crawledResult.pagesUsed,
    },
    company_brief: companyBrief,
    role: roleBreakdown,
    questions: coverageResult.questions,
    flashcards,
    schedule,
    coverage: coverageResult.coverage,
  };

  // Step 10: Strict Appendix A Validation
  emit("VALIDATING_STRUCTURE", "Validating kit structure against Appendix A schema...", 98);
  const validation = validateInterviewKit(rawKit);
  if (!validation.success || !validation.data) {
    console.error("[pipeline] Kit validation errors:", validation.errors);
    throw new Error(
      `Generated kit failed Appendix A validation: ${validation.errors?.join("; ")}`
    );
  }

  emit("COMPLETED", "Interview preparation kit successfully generated!", 100);

  return validation.data;
}
