import { llmClient } from "../llm/client.js";
import { Flashcard, Requirement } from "../types.js";

const FLASHCARD_SYSTEM_PROMPT = `YOU ARE A HIGH-YIELD TECHNICAL RETENTION & INTERVIEW DRILL SPECIALIST.
[SYSTEM: GENERATE_FLASHCARDS]

TASK:
Create focused, high-yield flashcards to help a candidate rapidly recall critical concepts, trade-offs, and mental models for the role requirements.

RULES:
1. SCHEMA:
   - "front": Clear, challenging concept question or quick-recall prompt.
   - "back": Concise, high-density answer (key definitions, trade-offs, architectural points).
   - "requirement_ids": Array of requirement IDs tested (e.g. ["r1"]).
2. OUTPUT FORMAT:
   Return valid JSON:
   {
     "flashcards": [
       {
         "front": "What is the CAP Theorem and what does PACELC add to it?",
         "back": "CAP: In partition, choose Consistency vs Availability. PACELC: If Partition choose Availability or Consistency; Else (normal operation) choose Latency or Consistency.",
         "requirement_ids": ["r1"]
       }
     ]
   }
`;

export async function generateFlashcards(
  requirements: Requirement[],
  roleTitle: string
): Promise<Flashcard[]> {
  const reqSummary = requirements
    .map((r) => `[${r.id}] (${r.priority} ${r.kind}): ${r.text}`)
    .join("\n");

  const userPrompt = `Role: ${roleTitle}

Target Requirements:
${reqSummary}

Generate high-yield flashcards testing these requirements for rapid interview drill practice.`;

  try {
    const res = await llmClient.generateJson<{
      flashcards?: Array<{
        front?: string;
        back?: string;
        requirement_ids?: string[];
        requirement_id?: string;
      }>;
    }>(FLASHCARD_SYSTEM_PROMPT, userPrompt);

    const rawList = Array.isArray(res.flashcards) ? res.flashcards : [];
    const flashcards: Flashcard[] = [];
    const reqIdSet = new Set(requirements.map((r) => r.id));

    rawList.forEach((fc, idx) => {
      let reqIds: string[] = [];
      if (Array.isArray(fc.requirement_ids)) {
        reqIds = fc.requirement_ids.filter((id) => reqIdSet.has(id));
      } else if (fc.requirement_id && reqIdSet.has(fc.requirement_id)) {
        reqIds = [fc.requirement_id];
      }

      if (reqIds.length === 0 && requirements.length > 0) {
        reqIds = [requirements[idx % requirements.length].id];
      }

      flashcards.push({
        id: `f${idx + 1}`,
        front: fc.front?.trim() || `Core concept for ${reqIds.join(", ")}`,
        back: fc.back?.trim() || "Key architectural and implementation principles.",
        requirement_ids: reqIds,
      });
    });

    if (flashcards.length > 0) {
      return flashcards;
    }
  } catch (err) {
    console.error("[flashcardGenerator] Fallback flashcard generation:", err);
  }

  // Fallback generation
  return requirements.map((req, idx) => ({
    id: `f${idx + 1}`,
    front: `Quick Recall: What are the key best practices and pitfalls of "${req.text}"?`,
    back: `Emphasize performance optimizations, clean separation of concerns, defensive testing, and common edge cases.`,
    requirement_ids: [req.id],
  }));
}
