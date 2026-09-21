import { llmClient } from "../llm/client.js";
import { Question, Requirement } from "../types.js";

const QUESTION_SYSTEM_PROMPT = `YOU ARE AN ELITE TECHNICAL INTERVIEW ARCHITECT AND HIRING SPECIALIST.
[SYSTEM: GENERATE_QUESTIONS]

TASK:
Generate high-caliber, practical interview questions mapped directly to the provided role requirements, company context, and discovered hiring process details.

STRICT RULES:
1. CATEGORY ALIGNMENT:
   - "technical": Specific code, architecture, framework, database, or algorithmic challenges.
   - "behavioural": Scenario-based questions on teamwork, conflict resolution, mentoring, and ownership (provide STAR method outline).
   - "system-design": End-to-end distributed systems, scalability, data modeling, API design, trade-offs.
   - "company-fit": Alignment with company products, customer impact, values, and why this specific role.
2. MAPPING TO REQUIREMENTS:
   - Every question MUST explicitly specify which requirement ID(s) it tests in "requirement_ids": ["r1", ...].
3. DIFFICULTY:
   - "difficulty" must be an integer: 1 (Fundamental), 2 (Intermediate/Applied), or 3 (Advanced/Architectural).
4. ANSWER OUTLINE:
   - "answer_outline" must give concise, high-yield coaching points (what a strong candidate should mention).
5. OUTPUT SCHEMA:
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
  const reqSummary = requirements
    .map((r) => `[${r.id}] (${r.priority.toUpperCase()} - ${r.kind}): ${r.text}`)
    .join("\n");

  const userPrompt = `Company Context: ${companySummary}
${hiringProcessNotes ? `Discovered Hiring Process Details: ${hiringProcessNotes}` : ""}

Role Requirements to Cover:
${reqSummary}

Generate a comprehensive bank of interview questions testing these requirements across technical, behavioural, system-design, and company-fit categories. Ensure every requirement ID is targeted.`;

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
      // Support both requirement_ids array or single requirement_id from LLM output
      let reqIds: string[] = [];
      if (Array.isArray(q.requirement_ids)) {
        reqIds = q.requirement_ids.filter((id) => reqIdSet.has(id));
      } else if (q.requirement_id && reqIdSet.has(q.requirement_id)) {
        reqIds = [q.requirement_id];
      }

      // If LLM returned an invalid or empty req id, assign round-robin to a requirement
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

      questions.push({
        id: `q${idx + 1}`,
        requirement_ids: reqIds,
        category,
        prompt: q.prompt?.trim() || `Discuss your experience with ${reqIds.join(", ")}.`,
        answer_outline:
          q.answer_outline?.trim() ||
          "Explain technical principles, past project applications, and measurable results.",
        difficulty,
      });
    });

    return questions;
  } catch (err) {
    console.error("[questionGenerator] Error generating question bank:", err);
    // Fallback deterministic questions
    return requirements.map((req, idx) => ({
      id: `q${idx + 1}`,
      requirement_ids: [req.id],
      category: req.kind === "behavioural" ? "behavioural" : "technical",
      prompt: `Can you walk us through how you have applied "${req.text}" in your past engineering projects?`,
      answer_outline:
        "Structure your response with STAR (Situation, Task, Action, Result), emphasizing engineering trade-offs and team impact.",
      difficulty: 2,
    }));
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

  const targets = uncoveredRequirements
    .map((r) => `Requirement ID: ${r.id} (${r.priority} ${r.kind}): ${r.text}`)
    .join("\n");

  const userPrompt = `Company Context: ${companySummary || "Technology firm"}

The following requirements were not covered in the initial question draft:
${targets}

Please generate targeted, practical interview questions for EACH of these missing requirement IDs.`;

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

      newQuestions.push({
        id: `q${existingCount + idx + 1}`,
        requirement_ids: reqIds,
        category,
        prompt:
          q.prompt?.trim() ||
          `Detailed question exploring requirement ${reqIds.join(", ")}`,
        answer_outline:
          q.answer_outline?.trim() ||
          "Key technical factors, trade-offs, and implementation details.",
        difficulty,
      });
    });

    return newQuestions;
  } catch (err) {
    console.error("[questionGenerator] Fallback gap question generation:", err);
    return uncoveredRequirements.map((req, idx) => ({
      id: `q${existingCount + idx + 1}`,
      requirement_ids: [req.id],
      category: req.kind === "behavioural" ? "behavioural" : "technical",
      prompt: `Please detail your experience and practical problem-solving approach regarding: ${req.text}`,
      answer_outline:
        "Provide concrete architecture examples, key metrics, and lessons learned from past systems.",
      difficulty: 2,
    }));
  }
}
