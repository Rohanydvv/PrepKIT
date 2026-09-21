import { llmClient } from "../llm/client.js";
import { Requirement, RoleBreakdown } from "../types.js";
import { sanitizeUntrustedContent } from "../crawler/cleaner.js";

const SYSTEM_PROMPT = `YOU ARE A SPECIALIZED JOB DESCRIPTION ANALYZER AND REQUIREMENT EXTRACTOR.
[SYSTEM: EXTRACT_ROLE_REQUIREMENTS]

TASK:
Analyze the provided Job Description text and extract the core role information and requirements.

RULES:
1. STRICT TRUTHFULNESS:
   - Extract ONLY what is explicitly stated or directly implied in the job description.
   - If the job description is a two-line stub or very thin, DO NOT invent requirements. Extract only the few requirements that exist and keep it thin.
   - Inventing requirements a description does not contain is strictly forbidden.
2. REQUIREMENT SCHEMA:
   - "id": stable identifier ("r1", "r2", "r3", ...)
   - "text": concise wording of the specific requirement
   - "kind": exactly one of "technical", "behavioural", or "domain"
     * "technical": programming languages, frameworks, system design, databases, tooling
     * "behavioural": leadership, mentoring, communication, teamwork, agile processes
     * "domain": industry knowledge (e.g., fintech, HIPAA, payments, e-commerce)
   - "priority": exactly one of "must" or "nice"
     * "must": required, minimum experience, non-negotiable prerequisites
     * "nice": preferred, bonus points, nice-to-have, plus
3. OUTPUT FORMAT:
   Return valid JSON with this exact shape:
   {
     "title": "Senior Backend Engineer",
     "seniority": "Senior",
     "responsibilities": ["Design microservices", "Mentor juniors"],
     "requirements": [
       {
         "id": "r1",
         "text": "5+ years experience with Node.js and distributed systems",
         "kind": "technical",
         "priority": "must"
       }
     ]
   }
`;

export async function extractRoleAndRequirements(
  rawJdText: string
): Promise<RoleBreakdown> {
  const sanitizedJd = sanitizeUntrustedContent(rawJdText);

  const userPrompt = `<untrusted_content_job_description>
${sanitizedJd}
</untrusted_content_job_description>

Please extract the role breakdown and requirements according to the instructions.`;

  try {
    const rawResult = await llmClient.generateJson<{
      title?: string;
      seniority?: string;
      responsibilities?: string[];
      requirements?: Array<{
        id?: string;
        text?: string;
        kind?: "technical" | "behavioural" | "domain";
        priority?: "must" | "nice";
      }>;
    }>(SYSTEM_PROMPT, userPrompt);

    // Normalize and sanitize output
    let title = rawResult.title?.trim() || "Software Engineer";
    if (title.startsWith("<") && title.endsWith(">")) {
      title = title.replace(/<[^>]+>/g, "").trim() || "Software Engineer";
    }
    const seniority = rawResult.seniority?.trim() || "Mid-Level";
    const responsibilities =
      Array.isArray(rawResult.responsibilities) && rawResult.responsibilities.length > 0
        ? rawResult.responsibilities.map((r) => String(r).trim()).filter(Boolean)
        : ["Execute core engineering responsibilities for the role"];

    const rawReqs = Array.isArray(rawResult.requirements) ? rawResult.requirements : [];

    const requirements: Requirement[] = rawReqs.map((req, idx) => {
      const id = req.id && /^r\d+$/i.test(req.id) ? req.id.toLowerCase() : `r${idx + 1}`;
      const text = req.text ? String(req.text).trim() : `Requirement ${idx + 1}`;
      const kind: "technical" | "behavioural" | "domain" =
        req.kind === "technical" || req.kind === "behavioural" || req.kind === "domain"
          ? req.kind
          : "technical";
      const priority: "must" | "nice" =
        req.priority === "nice" ? "nice" : "must";

      return { id, text, kind, priority };
    });

    // If no requirements were extracted (e.g. absolute minimal 1-line input), generate a single honest must-have requirement
    if (requirements.length === 0) {
      requirements.push({
        id: "r1",
        text: sanitizedJd.slice(0, 100).trim() || "Core role responsibilities",
        kind: "technical",
        priority: "must",
      });
    }

    return {
      title,
      seniority,
      responsibilities,
      requirements,
    };
  } catch (err) {
    console.error("[jdExtractor] Fallback extraction on error:", err);
    return {
      title: "Engineering Role",
      seniority: "Mid-Level",
      responsibilities: ["Core role execution and team collaboration"],
      requirements: [
        {
          id: "r1",
          text: sanitizedJd.slice(0, 120).trim() || "Core technical skills",
          kind: "technical",
          priority: "must",
        },
      ],
    };
  }
}
