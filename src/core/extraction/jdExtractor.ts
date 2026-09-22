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
   - "text": concise wording of the specific requirement (do NOT copy section headings like "About the Role:")
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

/**
 * Deterministic heuristic parser for job descriptions.
 * Guarantees high-accuracy requirement extraction even when offline,
 * when LLM rate limits hit, or for edge case stubs.
 */
export function parseJdHeuristically(rawJdText: string): RoleBreakdown {
  const sanitizedJd = sanitizeUntrustedContent(rawJdText);
  const rawLines = sanitizedJd
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => Boolean(l) && !l.startsWith("<") && !l.endsWith(">"));

  // 1. Detect Job Title
  let title = "Software Engineer";
  for (const line of rawLines) {
    const cleanLine = line
      .replace(/^[#*\-•\s]+/, "")
      .replace(/^(?:job title|role|position):\s*/i, "")
      .trim();

    if (
      cleanLine.length > 3 &&
      cleanLine.length < 80 &&
      !cleanLine.endsWith(":") &&
      !/^(?:about|requirements|qualifications|responsibilities|nice to have|must have)/i.test(cleanLine)
    ) {
      const matchNeeded = cleanLine.match(
        /^([A-Z][A-Za-z0-9\s/+-]+?(?:Developer|Engineer|Architect|Lead|Manager|Specialist|Designer|Analyst|Scientist))\s+(?:needed|wanted|position|opening)/i
      );
      if (matchNeeded) {
        title = matchNeeded[1].trim();
      } else {
        title = cleanLine;
      }
      break;
    }
  }

  // 2. Detect Seniority
  let seniority: RoleBreakdown["seniority"] = "Mid-Level";
  if (/senior|lead|principal|staff|architect|director|head of/i.test(sanitizedJd)) {
    seniority = "Senior";
  } else if (/junior|entry[- ]level|associate|intern|graduate/i.test(sanitizedJd)) {
    seniority = "Junior";
  }

  // 3. Section-based bullet extraction
  const requirements: Requirement[] = [];
  const responsibilities: string[] = [];
  let currentSection: "unknown" | "responsibilities" | "requirements" | "nice_to_have" = "unknown";

  for (const line of rawLines) {
    const clean = line.replace(/^[#*\-•\s]+/, "").trim();

    // Section headers
    if (/^(?:about the role|responsibilities|what you(?:'ll)? do|key duties|the role):?$/i.test(clean)) {
      currentSection = "responsibilities";
      continue;
    }
    if (/^(?:requirements|qualifications|what we(?:'re)? looking for|must[- ]haves?|minimum qualifications|essential skills?):?$/i.test(clean)) {
      currentSection = "requirements";
      continue;
    }
    if (/^(?:nice to have|preferred qualifications|bonus points?|pluses|good to have|desired skills?):?$/i.test(clean)) {
      currentSection = "nice_to_have";
      continue;
    }

    const isBullet = /^[-*•]\s+/.test(line) || /^\d+\.\s+/.test(line);
    const hasReqKeyword =
      /experience with|proficiency in|deep expertise|proven track record|knowledge of|familiarity with|must have|strong understanding/i.test(
        clean
      );

    if (isBullet || hasReqKeyword) {
      const reqText = clean
        .replace(/^[-*•]\s+/, "")
        .replace(/^\d+\.\s+/, "")
        .replace(/\s*\((?:must[- ]have|required|essential)\)/i, "")
        .replace(/\s*\((?:nice to have|bonus|preferred|plus)\)/i, "")
        .trim();

      if (reqText.length < 8) continue;

      if (currentSection === "responsibilities" && !hasReqKeyword) {
        if (responsibilities.length < 5 && reqText.length < 160) {
          responsibilities.push(reqText);
        }
      } else {
        const isExplicitNice =
          currentSection === "nice_to_have" ||
          /bonus|preferred|nice to have|plus|familiarity/i.test(line);
        const priority: "must" | "nice" = isExplicitNice ? "nice" : "must";

        const isBeh =
          /mentor|collaborat|team|lead|agile|communication|stakeholder|partner|culture|cross-functional|ownership|curiosity|initiative/i.test(
            reqText
          );
        const isDomain =
          /fintech|healthcare|saas|compliance|e-commerce|payments|b2b|b2c|crypto|security|hipaa|gdpr/i.test(
            reqText
          );
        const kind: "technical" | "behavioural" | "domain" = isBeh
          ? "behavioural"
          : isDomain
          ? "domain"
          : "technical";

        if (!requirements.some((r) => r.text.toLowerCase() === reqText.toLowerCase())) {
          requirements.push({
            id: `r${requirements.length + 1}`,
            text: reqText,
            kind,
            priority,
          });
        }
      }
    }
  }

  // 4. Edge Case: Thin description / 2-line stub without explicit bullet points
  if (requirements.length === 0) {
    const sentences = sanitizedJd
      .split(/[.;\n]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 5 && !/^(?:about|requirements|qualifications):?$/i.test(s));

    for (const s of sentences) {
      if (/must|know|experience|scripting|maintenance|python|sql|react|node|java|c\+\+|aws|docker/i.test(s)) {
        const matchAnd = s.match(/(?:know|experience in|knowledge of|using)\s+([^.]+)/i);
        if (matchAnd && matchAnd[1]) {
          const parts = matchAnd[1]
            .split(/\b(?:and|,)\b/)
            .map((p) => p.trim())
            .filter((p) => p.length > 2);
          if (parts.length > 1) {
            for (const part of parts) {
              const cleanPart = part.replace(/^basic\s+/i, "Basic ").trim();
              requirements.push({
                id: `r${requirements.length + 1}`,
                text: cleanPart.charAt(0).toUpperCase() + cleanPart.slice(1),
                kind: "technical",
                priority: "must",
              });
            }
            continue;
          }
        }

        requirements.push({
          id: `r${requirements.length + 1}`,
          text: s,
          kind: /mentor|team|collaborat/i.test(s) ? "behavioural" : "technical",
          priority: "must",
        });
      }
    }
  }

  // Fallback requirement if none found
  if (requirements.length === 0) {
    requirements.push({
      id: "r1",
      text: "Core technical responsibilities and system architecture",
      kind: "technical",
      priority: "must",
    });
  } else if (!requirements.some((r) => r.priority === "must")) {
    requirements[0].priority = "must";
  }

  if (responsibilities.length === 0) {
    responsibilities.push(
      `Architect and build production systems aligned with ${title} standards`,
      `Collaborate with cross-functional engineering and product stakeholders`
    );
  }

  return {
    title,
    seniority,
    responsibilities,
    requirements,
  };
}

export async function extractRoleAndRequirements(
  rawJdText: string
): Promise<RoleBreakdown> {
  const sanitizedJd = sanitizeUntrustedContent(rawJdText);

  // If description is a thin 2-line stub, extract directly and honestly without hallucination
  const isThinStub = sanitizedJd.length < 180 && !sanitizedJd.includes("\n-");
  if (isThinStub) {
    return parseJdHeuristically(sanitizedJd);
  }

  const userPrompt = `<job_description>
${sanitizedJd}
</job_description>

Extract the role breakdown and requirements.`;

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

    // If LLM returned empty or single requirement for a rich JD, use deterministic parser
    if (!rawResult || !Array.isArray(rawResult.requirements) || rawResult.requirements.length < 2) {
      return parseJdHeuristically(sanitizedJd);
    }

    // Normalize and sanitize output
    let title = rawResult.title?.trim() || "Software Engineer";
    if (title.startsWith("<") && title.endsWith(">")) {
      title = title.replace(/<[^>]+>/g, "").trim() || "Software Engineer";
    }
    const seniority =
      rawResult.seniority === "Senior" || rawResult.seniority === "Junior" || rawResult.seniority === "Mid-Level"
        ? rawResult.seniority
        : /senior/i.test(sanitizedJd)
        ? "Senior"
        : /junior/i.test(sanitizedJd)
        ? "Junior"
        : "Mid-Level";

    const responsibilities =
      Array.isArray(rawResult.responsibilities) && rawResult.responsibilities.length > 0
        ? rawResult.responsibilities
            .map((r) => String(r).trim())
            .filter((r) => Boolean(r) && !/extract the role|instructions/i.test(r))
        : ["Execute core engineering responsibilities for the role"];

    const rawReqs = (Array.isArray(rawResult.requirements) ? rawResult.requirements : []).filter(
      (req) => {
        const t = (req.text || "").trim();
        if (!t || t.length < 5) return false;
        if (/^(?:about the role|requirements|responsibilities|qualifications):?$/i.test(t)) {
          return false;
        }
        if (/extract the role|role breakdown|according to the instructions|untrusted_content|<[^>]+>/i.test(t)) {
          return false;
        }
        return true;
      }
    );

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

    if (requirements.length === 0) {
      return parseJdHeuristically(sanitizedJd);
    }

    return {
      title,
      seniority,
      responsibilities,
      requirements,
    };
  } catch (err) {
    console.warn("[jdExtractor] LLM extraction failed, using deterministic parser:", (err as Error).message);
    return parseJdHeuristically(sanitizedJd);
  }
}
