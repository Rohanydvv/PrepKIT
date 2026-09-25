import { llmClient } from "../llm/client.js";
import { Question, Requirement } from "../types.js";
import {
  generateDeterministicQuestions,
  deduplicateQuestions,
} from "./deterministicQuestions.js";

// Re-export deterministic questions & deduplicator for external consumers
export { generateDeterministicQuestions, deduplicateQuestions } from "./deterministicQuestions.js";

const QUESTION_SYSTEM_PROMPT = `YOU ARE AN ELITE TECHNICAL INTERVIEW ARCHITECT AND HIRING SPECIALIST.
[SYSTEM: GENERATE_QUESTIONS]

TASK:
Generate a comprehensive, high-caliber bank of interview questions mapped directly to the provided role requirements, company context, and discovered hiring process details.

STRICT RULES:
1. QUESTION VOLUME & COVERAGE:
   - For EACH requirement, generate 2 to 3 targeted questions covering different angles (e.g. practical implementation, edge cases & failure recovery, system architecture & trade-offs, or behavioural/leadership impact).
   - Ensure EVERY requirement ID from the input is explicitly targeted by at least one question.
   - For a role with N requirements, generate between Math.max(8, N * 2) and Math.min(25, N * 3) questions total.
2. CATEGORY ALIGNMENT:
   - "technical": Specific code, architecture, framework, database, or algorithmic challenges.
   - "behavioural": Scenario-based questions on teamwork, conflict resolution, mentoring, and ownership (provide STAR method outline).
   - "system-design": End-to-end distributed systems, scalability, data modeling, API design, trade-offs.
   - "company-fit": Alignment with company products, customer impact, values, and why this specific role.
3. MAPPING TO REQUIREMENTS:
   - Every question MUST explicitly specify which requirement ID(s) it tests in "requirement_ids": ["r1", ...].
   - Do NOT copy raw JD text or section headings into the question prompt.
   - Questions must be natural, realistic interview prompts.
4. DIFFICULTY:
   - "difficulty" must be an integer: 1 (Fundamental), 2 (Intermediate/Applied), or 3 (Advanced/Architectural).
5. ANSWER OUTLINE:
   - "answer_outline" must give concise, high-yield coaching points (what a strong candidate should mention).
6. OUTPUT SCHEMA:
   Return valid JSON with this exact shape:
   {
     "questions": [
       {
         "requirement_ids": ["r1"],
         "category": "technical",
         "prompt": "How does React Fiber work under the hood and how does concurrent rendering prevent UI blocking?",
         "answer_outline": "Explain time-slicing, reconciler work loop, lanes priority, and cooperative multitasking.",
         "difficulty": 3
       }
     ]
   }
`;

const GAP_QUESTIONS_SYSTEM_PROMPT = `YOU ARE AN INTERVIEW GAP ANALYZER AND REMEDIATION SPECIALIST.
[SYSTEM: GENERATE_GAP_QUESTIONS]

TASK:
Generate targeted interview questions specifically covering the missing/uncovered requirements below.
Every question you produce MUST map to at least one of the uncovered requirement IDs provided.
Do NOT copy raw JD text. Formulate natural interview questions.

OUTPUT SCHEMA:
Return valid JSON:
{
  "questions": [
    {
      "requirement_ids": ["r2"],
      "category": "technical",
      "prompt": "...",
      "answer_outline": "...",
      "difficulty": 2
    }
  ]
}
`;

export async function generateInitialQuestionBank(
  requirements: Requirement[],
  companySummary: string,
  hiringProcessNotes?: string
): Promise<Question[]> {
  if (requirements.length === 0) return [];

  // Offline / Mock mode optimization: use deterministic generator directly
  if (llmClient.getActiveProvider() === "mock") {
    return generateDeterministicQuestions(requirements, companySummary, 0);
  }

  const reqSummary = requirements
    .map((r) => `[${r.id}] (${r.priority.toUpperCase()} - ${r.kind}): ${r.text}`)
    .join("\n");

  const minExpected = Math.max(requirements.length * 2, 8);
  const userPrompt = `Company Context: ${companySummary}
${hiringProcessNotes ? `Discovered Hiring Process Details: ${hiringProcessNotes}` : ""}

Role Requirements to Cover:
${reqSummary}

Generate a comprehensive bank of at least ${minExpected} interview questions testing these requirements across technical, behavioural, system-design, and company-fit categories.
Ensure EVERY requirement ID is targeted with multiple questions covering practical implementation and architectural trade-offs.
Do NOT copy raw JD text or section headings into questions.`;

  try {
    const res = await llmClient.generateJson<{
      questions?: Array<{
        requirement_ids?: string[];
        requirement_id?: string;
        category?: "technical" | "behavioural" | "system-design" | "company-fit";
        prompt?: string;
        answer_outline?: string;
        difficulty?: 1 | 2 | 3;
      }>;
    }>(QUESTION_SYSTEM_PROMPT, userPrompt);

    const rawList = Array.isArray(res.questions) ? res.questions : [];
    const questions: Question[] = [];
    const reqIdSet = new Set(requirements.map((r) => r.id));

    rawList.forEach((q, idx) => {
      let reqIds: string[] = [];
      if (Array.isArray(q.requirement_ids)) {
        reqIds = q.requirement_ids.filter((id) => reqIdSet.has(id));
      } else if (q.requirement_id && reqIdSet.has(q.requirement_id)) {
        reqIds = [q.requirement_id];
      }

      if (reqIds.length === 0 && requirements.length > 0) {
        reqIds = [requirements[idx % requirements.length].id];
      }

      const category: "technical" | "behavioural" | "system-design" | "company-fit" =
        q.category &&
        ["technical", "behavioural", "system-design", "company-fit"].includes(q.category)
          ? q.category
          : "technical";

      const difficulty: 1 | 2 | 3 =
        q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3
          ? q.difficulty
          : 2;

      const cleanPrompt = q.prompt?.trim() || "";
      if (cleanPrompt.length > 20 && !cleanPrompt.includes("About the Role:")) {
        questions.push({
          id: `q${questions.length + 1}`,
          requirement_ids: reqIds,
          category,
          prompt: cleanPrompt,
          answer_outline:
            q.answer_outline?.trim() ||
            "Explain technical principles, past project applications, and measurable results.",
          difficulty,
        });
      }
    });

    let deduplicated = deduplicateQuestions(questions);

    // If any requirement has zero coverage, augment with deterministic questions
    const coveredReqs = new Set(deduplicated.flatMap((q) => q.requirement_ids));
    const uncoveredReqs = requirements.filter((r) => !coveredReqs.has(r.id));
    if (uncoveredReqs.length > 0) {
      const augmented = generateDeterministicQuestions(
        uncoveredReqs,
        companySummary,
        deduplicated.length
      );
      deduplicated = deduplicateQuestions([...deduplicated, ...augmented]);
    }

    // If LLM returned fewer questions than expected, augment with deterministic question bank
    if (deduplicated.length < minExpected) {
      const extraQuestions = generateDeterministicQuestions(
        requirements,
        companySummary,
        deduplicated.length
      );
      deduplicated = deduplicateQuestions([...deduplicated, ...extraQuestions]);
    }

    return deduplicated;
  } catch (err) {
    console.warn(
      "[questionGenerator] LLM generation failed, using deterministic question engine:",
      (err as Error).message
    );
    return generateDeterministicQuestions(requirements, companySummary, 0);
  }
}

/**
 * Targeted Question Generator for Second-Pass Gap Coverage (Section 4)
 */
export async function generateQuestionsForGaps(
  uncoveredRequirements: Requirement[],
  existingCount: number,
  companySummary?: string
): Promise<Question[]> {
  if (uncoveredRequirements.length === 0) return [];

  if (llmClient.getActiveProvider() === "mock") {
    return generateDeterministicQuestions(uncoveredRequirements, companySummary, existingCount);
  }

  const targets = uncoveredRequirements
    .map((r) => `Requirement ID: ${r.id} (${r.priority} ${r.kind}): ${r.text}`)
    .join("\n");

  const userPrompt = `Company Context: ${companySummary || "Technology firm"}

The following requirements were not covered in the initial question draft:
${targets}

Please generate targeted, practical interview questions for EACH of these missing requirement IDs. Do NOT copy raw JD headers.`;

  try {
    const res = await llmClient.generateJson<{
      questions?: Array<{
        requirement_ids?: string[];
        requirement_id?: string;
        category?: "technical" | "behavioural" | "system-design" | "company-fit";
        prompt?: string;
        answer_outline?: string;
        difficulty?: 1 | 2 | 3;
      }>;
    }>(GAP_QUESTIONS_SYSTEM_PROMPT, userPrompt);

    const rawList = Array.isArray(res.questions) ? res.questions : [];
    const newQuestions: Question[] = [];
    const reqIdSet = new Set(uncoveredRequirements.map((r) => r.id));

    rawList.forEach((q, idx) => {
      let reqIds: string[] = [];
      if (Array.isArray(q.requirement_ids)) {
        reqIds = q.requirement_ids.filter((id) => reqIdSet.has(id));
      } else if (q.requirement_id && reqIdSet.has(q.requirement_id)) {
        reqIds = [q.requirement_id];
      }

      if (reqIds.length === 0) {
        reqIds = [uncoveredRequirements[idx % uncoveredRequirements.length].id];
      }

      const category: "technical" | "behavioural" | "system-design" | "company-fit" =
        q.category &&
        ["technical", "behavioural", "system-design", "company-fit"].includes(q.category)
          ? q.category
          : "technical";

      const difficulty: 1 | 2 | 3 =
        q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3
          ? q.difficulty
          : 2;

      const cleanPrompt = q.prompt?.trim() || "";
      if (cleanPrompt.length > 20 && !cleanPrompt.includes("About the Role:")) {
        newQuestions.push({
          id: `q${existingCount + newQuestions.length + 1}`,
          requirement_ids: reqIds,
          category,
          prompt: cleanPrompt,
          answer_outline:
            q.answer_outline?.trim() ||
            "Key technical factors, trade-offs, and implementation details.",
          difficulty,
        });
      }
    });

    let deduplicated = deduplicateQuestions(newQuestions);

    // Ensure every single uncovered requirement is covered
    const coveredInGaps = new Set(deduplicated.flatMap((q) => q.requirement_ids));
    const stillMissing = uncoveredRequirements.filter((r) => !coveredInGaps.has(r.id));
    if (stillMissing.length > 0) {
      const fallbackQuestions = generateDeterministicQuestions(
        stillMissing,
        companySummary,
        existingCount + deduplicated.length
      );
      deduplicated = deduplicateQuestions([...deduplicated, ...fallbackQuestions]);
    }

    if (deduplicated.length === 0) {
      return generateDeterministicQuestions(uncoveredRequirements, companySummary, existingCount);
    }

    return deduplicated;
  } catch (err) {
    console.warn(
      "[questionGenerator] LLM gap generation failed, using deterministic gap engine:",
      (err as Error).message
    );
    return generateDeterministicQuestions(uncoveredRequirements, companySummary, existingCount);
  }
}
