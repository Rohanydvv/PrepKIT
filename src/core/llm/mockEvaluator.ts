/**
 * Deterministic offline heuristic evaluator for candidate mock interview answers.
 * Used when no external LLM API key is configured.
 * Evaluates candidate responses across four distinct rubric dimensions (0-25 pts each):
 * 1. Technical Depth
 * 2. STAR Structure
 * 3. Company & Question Alignment
 * 4. Delivery & Clarity
 */

export interface RubricScores {
  depth: number;
  structure: number;
  alignment: number;
  clarity: number;
}

export interface MockInterviewEvaluationResult {
  score: number;
  rubricScores: RubricScores;
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

export interface EvaluatorInput {
  category: string;
  questionPrompt: string;
  answerOutline: string;
  candidateAnswer: string;
}

/**
 * Parses user prompt string passed to the LLM client.
 */
export function parseEvaluatorPrompt(prompt: string): EvaluatorInput {
  const categoryMatch = prompt.match(/Question Category:\s*([^\n\r]+)/i);
  const questionMatch = prompt.match(/Question:\s*([^\n\r]+)/i);
  const outlineMatch = prompt.match(
    /Expected Key Points:\s*([\s\S]*?)(?=\n+Candidate Answer:|$)/i
  );

  let candidateAnswer = "";
  const answerIdx = prompt.indexOf("Candidate Answer:");
  if (answerIdx !== -1) {
    let after = prompt.substring(answerIdx + "Candidate Answer:".length).trim();
    if (after.startsWith('"')) {
      after = after.substring(1);
      const lastQuote = after.lastIndexOf('"');
      if (lastQuote !== -1) {
        after = after.substring(0, lastQuote);
      }
    }
    const evalIdx = after.lastIndexOf("Evaluate this answer");
    if (evalIdx !== -1) {
      after = after.substring(0, evalIdx).trim();
      if (after.endsWith('"')) after = after.slice(0, -1).trim();
    }
    candidateAnswer = after.trim();
  }

  return {
    category: categoryMatch ? categoryMatch[1].trim().toLowerCase() : "technical",
    questionPrompt: questionMatch ? questionMatch[1].trim() : "",
    answerOutline: outlineMatch ? outlineMatch[1].trim() : "",
    candidateAnswer,
  };
}

const COMMON_STOP_WORDS = new Set([
  "the", "and", "that", "have", "for", "not", "with", "you", "this", "but",
  "his", "from", "they", "say", "her", "she", "will", "one", "all", "would",
  "there", "their", "what", "out", "about", "who", "get", "which", "when",
  "make", "can", "like", "time", "just", "him", "know", "take", "people",
  "into", "year", "your", "good", "some", "could", "them", "see", "other",
  "than", "then", "now", "look", "only", "come", "its", "over", "think",
  "also", "back", "after", "use", "two", "how", "our", "work", "first",
  "well", "way", "even", "new", "want", "because", "any", "these", "give",
  "day", "most", "us", "are", "was", "were", "been", "has", "had", "does",
  "did", "doing"
]);

function extractKeywords(text: string): string[] {
  const matches: string[] = text.toLowerCase().match(/\b[a-z0-9_-]{3,}\b/g) || [];
  return Array.from(new Set(matches.filter((w) => !COMMON_STOP_WORDS.has(w))));
}

/**
 * Generates an exemplary model answer tailored to the question prompt and expected key points.
 */
function generateModelAnswer(
  category: string,
  questionPrompt: string,
  answerOutline: string
): string {
  const qClean = questionPrompt.trim();
  const outlineClean = answerOutline.trim() || "architectural design and trade-offs";

  if (category === "behavioural") {
    return (
      `Situation: In my previous project, we faced a high-stakes challenge regarding: "${qClean}". ` +
      `Stakeholders had competing priorities and delivery was at risk.\n\n` +
      `Task: As lead engineer, my responsibility was to address this by focusing on: ${outlineClean}.\n\n` +
      `Action: I organized a technical alignment session, established explicit trade-off criteria with data-backed benchmarks, and executed an incremental implementation plan.\n\n` +
      `Result: We successfully resolved the conflict, delivered on schedule with zero production regression, and established this workflow as a team standard.`
    );
  }

  return (
    `1. High-Level Architecture & Core Strategy:\n` +
    `To address "${qClean}", the recommended approach partitions responsibilities around: ${outlineClean}.\n\n` +
    `2. Technical Implementation Details:\n` +
    `Implement decoupled processing with asynchronous message ingestion, distributed caching with explicit TTL and eviction policies, and robust idempotency keys for consistency.\n\n` +
    `3. Trade-offs & Failure Modes:\n` +
    `Evaluate trade-offs such as eventual consistency versus latency overhead. Mitigate failure modes through circuit breakers, exponential backoff with jitter, and dead-letter queues.`
  );
}

/**
 * Offline heuristic evaluation engine for candidate answers.
 */
export function evaluateCandidateAnswerOffline(
  promptOrInput: string | EvaluatorInput
): MockInterviewEvaluationResult {
  const input: EvaluatorInput =
    typeof promptOrInput === "string" ? parseEvaluatorPrompt(promptOrInput) : promptOrInput;

  const { category, questionPrompt, answerOutline, candidateAnswer } = input;
  const answer = (candidateAnswer || "").trim();

  // ---------------------------------------------------------------------------
  // Tier A: Non-answers, extreme brevity, or explicit admission of ignorance
  // ---------------------------------------------------------------------------
  const isIgnorance =
    /\b(i don'?t know|no idea|pass|not sure|dunno|can'?t answer|no comment|idk|nothing)\b/i.test(
      answer
    ) && answer.split(/\s+/).length <= 8;

  const words: string[] = answer.toLowerCase().match(/\b[a-z0-9_-]+\b/g) || [];
  const wordCount = words.length;

  if (wordCount < 4 || isIgnorance) {
    const depth = 2;
    const structure = 2;
    const alignment = 2;
    const clarity = Math.min(5, Math.max(1, wordCount * 2));
    const score = depth + structure + alignment + clarity;

    return {
      score,
      rubricScores: { depth, structure, alignment, clarity },
      strengths: [
        "Transparently acknowledged knowledge boundary rather than inventing incorrect facts.",
      ],
      improvements: [
        "Attempt to answer by breaking down the question into first principles or adjacent concepts you know.",
        `Review the core concepts expected for this question: ${answerOutline || "foundational software engineering principles"}.`,
        "Structure an educated hypothesis explaining how you would research or test the solution in production.",
      ],
      modelAnswer: generateModelAnswer(category, questionPrompt, answerOutline),
    };
  }

  // ---------------------------------------------------------------------------
  // Rubric 1: Technical Depth (0 - 25)
  // ---------------------------------------------------------------------------
  let depth = 4;
  if (wordCount >= 15) depth = 8;
  if (wordCount >= 40) depth = 12;
  if (wordCount >= 80) depth = 15;
  if (wordCount >= 140) depth = 18;
  if (wordCount >= 220) depth = 20;

  // Technical keyword detection
  const techKeywords: string[] =
    answer.match(
      /\b(api|rest|graphql|grpc|database|sql|nosql|postgres|mysql|redis|mongodb|kafka|rabbitmq|queue|cache|caching|latency|throughput|concurrency|multithread|async|promise|microservices|monolith|docker|kubernetes|aws|cloud|ci\/cd|pipeline|index|partition|sharding|replica|replication|acid|cap|distributed|load balancer|proxy|nginx|failover|circuit breaker|idempotent|idempotency|rate limit|security|auth|jwt|oauth|encryption|tls|ssl|monitoring|metrics|grafana|prometheus|profiling|memory|cpu|gc|algorithm|complexity|state|cluster|sentinel|ttl|lru)\b/gi
    ) || [];
  const uniqueTechCount = new Set(techKeywords.map((k) => k.toLowerCase())).size;

  if (uniqueTechCount >= 6) depth += 4;
  else if (uniqueTechCount >= 4) depth += 3;
  else if (uniqueTechCount >= 2) depth += 2;
  else if (uniqueTechCount >= 1) depth += 1;

  // Architectural trade-offs & nuance
  const hasTradeoffs =
    /\b(trade-off|tradeoff|trade-offs|tradeoffs|versus|vs|whereas|however|downside|advantage|drawback|compromise|mitigate|mitigation|bottleneck|alternatively|in contrast|overhead|decouple|failover)\b/i.test(
      answer
    );
  if (hasTradeoffs) depth += 2;

  // Quantified metrics & concrete scale
  const hasMetrics =
    /\b\d+(\.\d+)?\s*(ms|s|seconds|minutes|%|percent|rps|qps|k|million|gb|mb|tb|ops|queries|users|req\/s)\b/i.test(
      answer
    ) || /\b(p95|p99|sla|slo|sli)\b/i.test(answer) || /\b\d+%\b/.test(answer);
  if (hasMetrics) depth += 2;

  depth = Math.min(25, Math.max(0, depth));

  // ---------------------------------------------------------------------------
  // Rubric 2: Structure & Method (0 - 25)
  // ---------------------------------------------------------------------------
  let structure = 5;
  if (wordCount >= 20) structure = 9;
  if (wordCount >= 50) structure = 13;
  if (wordCount >= 100) structure = 16;
  if (wordCount >= 160) structure = 18;

  // Structural markers (lists, paragraphs, numbered points)
  const hasFormatting = /(?:^|\n)\s*(?:\d+[\.\)]|[-*•])\s+/m.test(answer);
  if (hasFormatting) structure += 3;

  // Logical progression connectors
  const hasConnectors =
    /\b(first|firstly|second|secondly|next|then|finally|subsequently|furthermore|in addition|to begin with|specifically)\b/i.test(
      answer
    );
  if (hasConnectors) structure += 2;

  // STAR framework markers
  const hasSituation =
    /\b(in my previous|at my last|when i was|our team was|the project involved|we had a situation|faced with|in a project)\b/i.test(
      answer
    );
  const hasTask =
    /\b(my task was|the goal was|responsible for|needed to|the problem was|challenge was|objective was)\b/i.test(
      answer
    );
  const hasAction =
    /\b(i designed|i implemented|i led|i created|i resolved|i decided to|i proposed|i conducted|i investigated|my action was)\b/i.test(
      answer
    );
  const hasResult =
    /\b(as a result|the outcome was|resulted in|we achieved|improved by|reduced|successfully delivered|ultimately)\b/i.test(
      answer
    );

  const starCount = [hasSituation, hasTask, hasAction, hasResult].filter(Boolean).length;
  if (starCount >= 3) structure += 4;
  else if (starCount >= 2) structure += 2;

  structure = Math.min(25, Math.max(0, structure));

  // ---------------------------------------------------------------------------
  // Rubric 3: Company & Question Alignment (0 - 25)
  // ---------------------------------------------------------------------------
  const expectedKeywords = extractKeywords(`${questionPrompt} ${answerOutline}`);
  let matchedKeywordsCount = 0;
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of expectedKeywords) {
    if (words.includes(kw)) {
      matchedKeywordsCount++;
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  const matchRatio =
    expectedKeywords.length > 0 ? matchedKeywordsCount / expectedKeywords.length : 0.5;

  let alignment = 6;
  if (matchRatio >= 0.65) alignment = 23;
  else if (matchRatio >= 0.45) alignment = 19;
  else if (matchRatio >= 0.25) alignment = 15;
  else if (matchRatio >= 0.1) alignment = 11;
  else if (wordCount >= 30) alignment = 9;

  // Relevance check: check if prompt terms appear in answer
  const promptKeywords = extractKeywords(questionPrompt);
  const hasDirectPromptWord = promptKeywords.some((pk) => words.includes(pk));
  if (hasDirectPromptWord) alignment += 2;

  alignment = Math.min(25, Math.max(0, alignment));

  // ---------------------------------------------------------------------------
  // Rubric 4: Delivery & Clarity (0 - 25)
  // ---------------------------------------------------------------------------
  let clarity = 8;
  if (wordCount >= 20 && wordCount < 50) clarity = 13;
  else if (wordCount >= 50 && wordCount <= 280) clarity = 19;
  else if (wordCount > 280 && wordCount <= 450) clarity = 21;
  else if (wordCount > 450) clarity = 17; // Slight deduction for overly verbose answer

  // Average words per sentence
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  const avgWordsPerSentence = sentences.length > 0 ? wordCount / sentences.length : wordCount;
  if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 26) {
    clarity += 2;
  } else if (avgWordsPerSentence > 45) {
    clarity -= 2; // Run-on sentences
  }

  // Filler words deduction
  const fillerMatches: string[] =
    answer.match(/\b(like|um|uh|you know|basically|sort of|kind of|stuff like that)\b/gi) || [];
  if (fillerMatches.length >= 4) clarity -= 3;
  else if (fillerMatches.length >= 2) clarity -= 1;
  else if (fillerMatches.length === 0 && wordCount >= 30) clarity += 2;

  clarity = Math.min(25, Math.max(0, clarity));

  // Overall Score (exact sum of the 4 rubrics)
  const score = depth + structure + alignment + clarity;

  // ---------------------------------------------------------------------------
  // Dynamic Strengths & Improvements
  // ---------------------------------------------------------------------------
  const strengths: string[] = [];
  const improvements: string[] = [];

  // Strengths
  if (depth >= 18) {
    strengths.push(
      "Demonstrated strong technical depth with concrete implementation details and architectural trade-offs."
    );
  } else if (uniqueTechCount >= 2) {
    strengths.push(
      `Referenced relevant technical concepts including: ${Array.from(
        new Set(techKeywords.map((k) => k.toLowerCase()))
      )
        .slice(0, 3)
        .join(", ")}.`
    );
  }

  if (hasMetrics) {
    strengths.push(
      "Included quantified metrics and concrete numbers to demonstrate real-world impact."
    );
  }

  if (starCount >= 2 || hasFormatting) {
    strengths.push(
      category === "behavioural"
        ? "Effectively followed the STAR framework to clearly connect actions with measurable outcomes."
        : "Structured the answer with clear organization and step-by-step logical progression."
    );
  }

  if (alignment >= 18) {
    strengths.push("Directly answered the core question and aligned closely with expected key points.");
  }

  if (clarity >= 18) {
    strengths.push("Maintained crisp, professional delivery without distracting filler words.");
  }

  if (strengths.length === 0) {
    strengths.push(
      wordCount >= 25
        ? "Engaged with the interview prompt and provided a foundational starting point."
        : "Provided a concise initial response."
    );
  }

  // Improvements
  if (depth < 16) {
    improvements.push(
      "Deepen technical specifics by naming concrete technologies, algorithms, and failure recovery mechanisms."
    );
  }

  if (!hasMetrics && wordCount >= 25) {
    improvements.push(
      "Incorporate measurable outcomes or quantitative metrics (e.g. latency, throughput, scale, or percentage gains)."
    );
  }

  if (!hasTradeoffs && (category === "technical" || category === "system-design")) {
    improvements.push(
      "Highlight technical trade-offs and alternative architectures to demonstrate senior engineering perspective."
    );
  }

  if (structure < 16) {
    improvements.push(
      category === "behavioural"
        ? "Organize the story using Situation-Task-Action-Result (STAR) to make your personal contribution clear."
        : "Use structured headings or sequence connectors (First, Second, Finally) to guide the interviewer through your logic."
    );
  }

  if (alignment < 16 && missingKeywords.length > 0) {
    improvements.push(
      `Address expected key points more directly, particularly: ${missingKeywords
        .slice(0, 3)
        .join(", ")}.`
    );
  }

  if (wordCount < 40) {
    improvements.push(
      "Expand the response with more situational context and specific implementation steps."
    );
  }

  if (fillerMatches.length >= 2) {
    improvements.push(
      "Reduce conversational filler words (e.g., 'basically', 'like', 'sort of') to project greater confidence."
    );
  }

  if (improvements.length === 0) {
    improvements.push(
      "Consider discussing edge cases or how you would monitor this solution in production."
    );
  }

  return {
    score: Math.min(100, Math.max(0, score)),
    rubricScores: {
      depth,
      structure,
      alignment,
      clarity,
    },
    strengths: strengths.slice(0, 3),
    improvements: improvements.slice(0, 3),
    modelAnswer: generateModelAnswer(category, questionPrompt, answerOutline),
  };
}
