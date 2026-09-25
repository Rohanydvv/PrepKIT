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
  "did", "doing", "i'd", "we'd", "would", "should", "could"
]);

function extractKeywords(text: string): string[] {
  const matches: string[] = text.toLowerCase().match(/\b[a-z0-9_-]{3,}\b/g) || [];
  return Array.from(new Set(matches.filter((w) => !COMMON_STOP_WORDS.has(w))));
}

/**
 * Known technical concepts across distributed systems, backend, frontend, and engineering.
 */
const TECHNICAL_TERMS_REGEX =
  /\b(api|apis|rest|graphql|grpc|database|databases|sql|nosql|postgres|postgresql|mysql|redis|memcached|mongodb|dynamodb|kafka|rabbitmq|queue|queues|cache|caching|cache-aside|write-through|write-back|write-behind|invalidation|stampede|latency|throughput|concurrency|multithread|async|synchronous|asynchronous|microservices|monolith|docker|kubernetes|k8s|aws|cloud|ci\/cd|pipeline|index|indexes|indexing|partition|partitioning|sharding|replica|replicas|replication|read replica|acid|cap|pacelc|distributed|stateless|stateful|shared state|session state|load balancer|load balancing|proxy|reverse proxy|nginx|envoy|failover|circuit breaker|circuit breakers|health check|health checks|idempotent|idempotency|rate limit|rate limiting|retry|retries|backoff|exponential backoff|jitter|bulkhead|redundancy|active-active|active-passive|security|auth|jwt|oauth|encryption|tls|ssl|monitoring|metrics|telemetry|tracing|grafana|prometheus|profiling|memory|cpu|gc|garbage collection|algorithm|complexity|state|cluster|sentinel|ttl|lru|eviction|consistent hashing|event-driven|pub\/sub|dead-letter|websocket|http|https|dns|cdn|autoscaling|horizontal scaling|vertical scaling|sla|slo|sli|p95|p99|high availability|disaster recovery|graceful degradation|b-tree|lock|locks|mutex|distributed lock|consensus|raft|paxos)\b/gi;

/**
 * Checks for repetition, filler words, nonsense, or non-answers.
 */
function analyzeTextContent(words: string[], rawAnswer: string) {
  const totalWords = words.length;

  // 1. Explicit refusal / admission of ignorance
  const isIgnorance =
    /\b(i don'?t know|no idea|pass|not sure|dunno|can'?t answer|no comment|idk|nothing|have no clue|unanswered)\b/i.test(
      rawAnswer
    ) && totalWords <= 12;

  if (totalWords === 0) {
    return { isFillerOrNonsense: true, isIgnorance: false, isTrivial: true, ttr: 0 };
  }

  // 2. Vocabulary Diversity (Type-Token Ratio)
  const uniqueWords = new Set(words);
  const ttr = uniqueWords.size / totalWords;

  // 3. Max Token Frequency Dominance
  const freq: Record<string, number> = {};
  let maxFreq = 0;
  for (const w of words) {
    freq[w] = (freq[w] || 0) + 1;
    if (freq[w] > maxFreq) maxFreq = freq[w];
  }
  const maxFreqRatio = maxFreq / totalWords;

  // 4. Repeated Filler Patterns
  const hasFillerPattern =
    /\b(blah(\s+blah)+|yes(\s+yes){2,}|no(\s+no){2,}|haha(\s+haha)+|lol(\s+lol)+|test(\s+test){2,}|word(\s+word)+)\b/i.test(
      rawAnswer
    );

  // 5. Extreme repetition or low diversity check
  const isRepetitive =
    (totalWords >= 8 && ttr < 0.28) ||
    (totalWords >= 6 && maxFreqRatio > 0.40) ||
    hasFillerPattern;

  // 6. Gibberish / keyboard smash (e.g., "asdfghjkl", "qwertyuiop")
  const isGibberish =
    /\b([bcdfghjklmnpqrstvwxyz]{6,}|asdf\w*|qwerty\w*|zxcv\w*)\b/i.test(rawAnswer) &&
    uniqueWords.size < 4;

  const isFillerOrNonsense = isRepetitive || isGibberish || totalWords < 4;

  return {
    isFillerOrNonsense,
    isIgnorance,
    isTrivial: totalWords < 4,
    ttr,
    maxFreqRatio,
  };
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

  const words: string[] = answer.toLowerCase().match(/\b[a-z0-9_-]+\b/g) || [];
  const wordCount = words.length;

  const { isFillerOrNonsense, isIgnorance, isTrivial } = analyzeTextContent(words, answer);

  // ---------------------------------------------------------------------------
  // Concept Extraction & Alignment Analysis
  // ---------------------------------------------------------------------------
  const rawTechKeywords = answer.match(TECHNICAL_TERMS_REGEX) || [];
  const uniqueTechTerms = Array.from(new Set(rawTechKeywords.map((k) => k.toLowerCase())));
  const uniqueTechCount = uniqueTechTerms.length;

  const expectedKeywords = extractKeywords(`${questionPrompt} ${answerOutline}`);
  const matchedKeywords: string[] = [];
  const missingKeywords: string[] = [];

  for (const kw of expectedKeywords) {
    if (words.includes(kw)) {
      matchedKeywords.push(kw);
    } else {
      missingKeywords.push(kw);
    }
  }

  const matchRatio =
    expectedKeywords.length > 0 ? matchedKeywords.length / expectedKeywords.length : 0.5;

  // Detect off-topic / completely irrelevant content (e.g., talks about cricket, movies, food)
  const isOffTopic =
    wordCount >= 10 &&
    uniqueTechCount === 0 &&
    matchedKeywords.length === 0 &&
    category !== "behavioural";

  // ---------------------------------------------------------------------------
  // QUALITY GATE: Nonsense, Extreme Filler, Ignorance, or Irrelevant
  // ---------------------------------------------------------------------------
  if (isTrivial || isIgnorance || isFillerOrNonsense || isOffTopic) {
    let depth = 0;
    let structure = 1;
    let alignment = 0;
    let clarity = 2;

    if (isIgnorance) {
      depth = 1;
      structure = 1;
      alignment = 1;
      clarity = 4;
      return {
        score: depth + structure + alignment + clarity, // 7
        rubricScores: { depth, structure, alignment, clarity },
        strengths: [
          "Transparently acknowledged knowledge boundary rather than guessing or fabricating details.",
        ],
        improvements: [
          "Formulate an attempt by breaking down the question into first principles or adjacent concepts you know.",
          `Review the expected foundational concepts: ${answerOutline || "system architecture and design principles"}.`,
          "Structure an educated hypothesis explaining how you would research or test the solution in production.",
        ],
        modelAnswer: generateModelAnswer(category, questionPrompt, answerOutline),
      };
    }

    if (isFillerOrNonsense || isTrivial) {
      depth = 0;
      structure = 1;
      alignment = 0;
      clarity = 2;
      return {
        score: depth + structure + alignment + clarity, // 3
        rubricScores: { depth, structure, alignment, clarity },
        strengths: [
          "Input was received, but lacked substantive technical content.",
        ],
        improvements: [
          "Replace repetitive or placeholder words with actual engineering strategies and solutions.",
          "Address the core problem statement directly with concrete mechanisms.",
          `Discuss key concepts relevant to this question: ${answerOutline || "architecture, tools, and trade-offs"}.`,
        ],
        modelAnswer: generateModelAnswer(category, questionPrompt, answerOutline),
      };
    }

    if (isOffTopic) {
      depth = 0;
      structure = 3;
      alignment = 0;
      clarity = 5;
      return {
        score: depth + structure + alignment + clarity, // 8
        rubricScores: { depth, structure, alignment, clarity },
        strengths: [
          "Delivered grammatically coherent sentences.",
        ],
        improvements: [
          "Directly address the specific technical interview question asked rather than unrelated topics.",
          `Incorporate the expected core concepts: ${answerOutline || "key domain mechanisms"}.`,
          "Focus answers strictly on software engineering, architecture, and professional experience.",
        ],
        modelAnswer: generateModelAnswer(category, questionPrompt, answerOutline),
      };
    }
  }

  // ---------------------------------------------------------------------------
  // Rubric 1: Technical Depth (0 - 25)
  // Driven primarily by technical concepts, trade-offs, and metrics — NEVER length alone
  // ---------------------------------------------------------------------------
  let depth = 0;

  // Base score strictly anchored on unique technical concept density
  if (uniqueTechCount >= 8) depth = 19;
  else if (uniqueTechCount >= 6) depth = 16;
  else if (uniqueTechCount >= 4) depth = 13;
  else if (uniqueTechCount >= 2) depth = 9;
  else if (uniqueTechCount >= 1) depth = 5;
  else depth = category === "behavioural" ? 4 : 1;

  // Architectural trade-offs & nuance (only awarded if technical concepts exist)
  const hasTradeoffs =
    /\b(trade-off|tradeoff|trade-offs|tradeoffs|versus|vs|whereas|however|downside|advantage|drawback|compromise|mitigate|mitigation|bottleneck|alternatively|in contrast|overhead|decouple|eventual consistency|strong consistency)\b/i.test(
      answer
    );
  if (hasTradeoffs && uniqueTechCount >= 1) depth += 2;

  // Quantified metrics & concrete scale (only awarded if technical concepts exist)
  const hasMetrics =
    /\b\d+(\.\d+)?\s*(ms|s|seconds|minutes|%|percent|rps|qps|k|million|gb|mb|tb|ops|queries|users|req\/s)\b/i.test(
      answer
    ) || /\b(p95|p99|sla|slo|sli)\b/i.test(answer) || /\b\d+%\b/.test(answer);
  if (hasMetrics && uniqueTechCount >= 1) depth += 2;

  // Substantive explanation bonus: rewarding answers that explain mechanisms rather than pure keyword dumps
  if (uniqueTechCount >= 3 && wordCount >= 35) depth += 2;

  depth = Math.min(25, Math.max(0, depth));

  // ---------------------------------------------------------------------------
  // Rubric 2: Structure & Method (0 - 25)
  // Evaluates logical decomposition and methodology — NOT raw word count
  // ---------------------------------------------------------------------------
  let structure = 4;

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

  if (category === "behavioural") {
    if (starCount >= 3) structure += 12;
    else if (starCount >= 2) structure += 7;
    else if (starCount >= 1) structure += 4;
  } else {
    // Technical questions: rewards structured decomposition (approach -> implementation -> trade-offs)
    if (starCount >= 2) structure += 4;
    if (uniqueTechCount >= 4 && hasConnectors) structure += 6;
    else if (uniqueTechCount >= 2) structure += 4;
    else if (wordCount >= 20) structure += 2;
  }

  structure = Math.min(25, Math.max(0, structure));

  // ---------------------------------------------------------------------------
  // Rubric 3: Company & Question Alignment (0 - 25)
  // Strictly based on semantic overlap with the prompt and expected key points
  // ---------------------------------------------------------------------------
  let alignment = 0;

  if (matchRatio >= 0.60) alignment = 22;
  else if (matchRatio >= 0.40) alignment = 18;
  else if (matchRatio >= 0.25) alignment = 14;
  else if (matchRatio >= 0.12) alignment = 10;
  else if (matchedKeywords.length >= 1) alignment = 6;
  else alignment = 2; // Very minimal overlap

  // Direct question prompt term reinforcement
  const promptKeywords = extractKeywords(questionPrompt);
  const hasDirectPromptWord = promptKeywords.some((pk) => words.includes(pk));
  if (hasDirectPromptWord) alignment += 2;

  // Category intent alignment
  if (category === "behavioural" && starCount >= 1) alignment += 1;
  if ((category === "technical" || category === "system-design") && uniqueTechCount >= 2) {
    alignment += 1;
  }

  alignment = Math.min(25, Math.max(0, alignment));

  // ---------------------------------------------------------------------------
  // Rubric 4: Delivery & Clarity (0 - 25)
  // Evaluates conciseness, readability, and vocabulary diversity — penalizes filler
  // ---------------------------------------------------------------------------
  let clarity = 10;

  // Reward concise, high-density answers (20 - 250 words that are on-topic)
  if (wordCount >= 20 && wordCount <= 60 && uniqueTechCount >= 3) {
    clarity = 18; // Crisp, direct, information-dense answer!
  } else if (wordCount > 60 && wordCount <= 280) {
    clarity = 20;
  } else if (wordCount > 280 && wordCount <= 450) {
    clarity = 18;
  } else if (wordCount > 450) {
    clarity = 15; // Penalty for overly verbose rambling
  } else if (wordCount < 20) {
    clarity = 12; // Brief
  }

  // Sentence structure and readability
  const sentences = answer.split(/[.!?]+/).filter((s) => s.trim().length > 3);
  const avgWordsPerSentence = sentences.length > 0 ? wordCount / sentences.length : wordCount;
  if (avgWordsPerSentence >= 10 && avgWordsPerSentence <= 26) {
    clarity += 2;
  } else if (avgWordsPerSentence > 45) {
    clarity -= 3; // Long run-on sentences
  }

  // Filler words deduction
  const fillerMatches: string[] =
    answer.match(/\b(like|um|uh|you know|basically|sort of|kind of|stuff like that)\b/gi) || [];
  if (fillerMatches.length >= 4) clarity -= 4;
  else if (fillerMatches.length >= 2) clarity -= 2;
  else if (fillerMatches.length === 0 && wordCount >= 20) clarity += 2;

  clarity = Math.min(25, Math.max(0, clarity));

  // Overall Score (exact sum of the 4 rubrics)
  const score = depth + structure + alignment + clarity;

  // ---------------------------------------------------------------------------
  // Dynamic Strengths & Improvements
  // ---------------------------------------------------------------------------
  const strengths: string[] = [];
  const improvements: string[] = [];

  // Strengths
  if (depth >= 16) {
    strengths.push(
      `Demonstrated strong technical depth citing key mechanisms: ${uniqueTechTerms.slice(0, 3).join(", ")}.`
    );
  } else if (uniqueTechCount >= 2) {
    strengths.push(
      `Referenced relevant technical concepts including: ${uniqueTechTerms.slice(0, 3).join(", ")}.`
    );
  }

  if (hasMetrics) {
    strengths.push(
      "Included quantified metrics and concrete numbers to demonstrate real-world impact."
    );
  }

  if (structure >= 16) {
    strengths.push(
      category === "behavioural"
        ? "Effectively followed the STAR framework to clearly connect actions with measurable outcomes."
        : "Structured the answer with clear organization and step-by-step logical progression."
    );
  }

  if (alignment >= 16) {
    strengths.push("Directly answered the core question and aligned closely with expected key points.");
  }

  if (clarity >= 18) {
    strengths.push("Maintained crisp, professional delivery without distracting filler words.");
  }

  if (strengths.length === 0) {
    strengths.push("Engaged with the interview prompt and provided a foundational response.");
  }

  // Improvements
  if (depth < 15) {
    improvements.push(
      "Deepen technical specifics by naming concrete technologies, algorithms, and failure recovery mechanisms."
    );
  }

  if (!hasMetrics && wordCount >= 30) {
    improvements.push(
      "Incorporate measurable outcomes or quantitative metrics (e.g. latency, throughput, scale, or percentage gains)."
    );
  }

  if (!hasTradeoffs && (category === "technical" || category === "system-design")) {
    improvements.push(
      "Highlight technical trade-offs and alternative architectures to demonstrate senior engineering perspective."
    );
  }

  if (structure < 15) {
    improvements.push(
      category === "behavioural"
        ? "Organize the story using Situation-Task-Action-Result (STAR) to make your personal contribution clear."
        : "Use structured headings or sequence connectors (First, Second, Finally) to guide the interviewer through your logic."
    );
  }

  if (alignment < 15 && missingKeywords.length > 0) {
    improvements.push(
      `Address expected key points more directly, particularly: ${missingKeywords
        .slice(0, 3)
        .join(", ")}.`
    );
  }

  if (wordCount < 40 && uniqueTechCount < 4) {
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
