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
   - Do NOT copy raw JD text or section headings into the question prompt.
   - Questions must be natural, realistic interview prompts.
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

/**
 * Deterministic question generator that produces natural, high-yield questions
 * mapped precisely to requirements without raw JD text or section headings.
 */
export function generateDeterministicQuestions(
  requirements: Requirement[],
  companySummary?: string,
  existingCount: number = 0
): Question[] {
  const questions: Question[] = [];
  let qNum = existingCount + 1;
  const usedPrompts = new Set<string>();

  const pushQuestion = (
    req: Requirement,
    category: Question["category"],
    prompt: string,
    altPrompt: string,
    answerOutline: string,
    altOutline: string,
    difficulty: 1 | 2 | 3
  ) => {
    const finalPrompt = usedPrompts.has(prompt) ? altPrompt : prompt;
    const finalOutline = usedPrompts.has(prompt) ? altOutline : answerOutline;
    usedPrompts.add(finalPrompt);

    questions.push({
      id: `q${qNum++}`,
      requirement_ids: [req.id],
      category,
      prompt: finalPrompt,
      answer_outline: finalOutline,
      difficulty,
    });
  };

  for (const req of requirements) {
    const text = req.text.toLowerCase();

    // 1. Mentoring, Leadership & Behavioural
    if (req.kind === "behavioural" || /mentor|lead|leadership|culture|team|collaborat|agile|stakeholder|cross-functional/i.test(text)) {
      pushQuestion(
        req,
        "behavioural",
        "Describe a situation where you had to lead a critical technical decision or mentor an engineer through a complex architectural challenge. How did you handle trade-offs and build team consensus?",
        "Tell me about a time you identified an operational or architectural anti-pattern across the team. How did you initiate the change and ensure sustainable adoption?",
        "Structure with STAR: Highlight initial disagreement, evaluation criteria/RFC, proactive guidance, and measurable positive delivery outcome.",
        "Use STAR: Explain the technical gap identified, collaborative workshops/RFCs held, rollout process, and impact on team velocity and quality.",
        2
      );
      continue;
    }

    // 2. REST, gRPC & API Design
    if (/rest|grpc|graphql|api design|endpoints|rpc/i.test(text)) {
      pushQuestion(
        req,
        "technical",
        "When designing high-throughput inter-service communication, how do you decide between REST/JSON and gRPC/Protobuf? How do you ensure backward compatibility, rate-limiting, and graceful error handling?",
        "How do you design and version mission-critical public and internal APIs to avoid breaking client integrations while migrating database schemas and payloads?",
        "Compare binary Protobuf serialization and HTTP/2 multiplexing with REST simplicity. Address semantic versioning, client SDKs, deadline propagation, and circuit breaking.",
        "Discuss URI versioning vs header versioning, contract testing, deprecation windows, idempotency keys, and zero-downtime rolling updates.",
        3
      );
      continue;
    }

    // 3. Kafka / Event processing / Message streaming
    if (/kafka|event processing|pub[/-]?sub|queue|streaming|event-driven|kinesis|rabbitmq/i.test(text)) {
      pushQuestion(
        req,
        "system-design",
        "Describe how you design a production-grade event-driven pipeline using Kafka or similar message streaming systems. How do you handle partition rebalancing, consumer lag, and out-of-order event delivery?",
        "How do you ensure end-to-end exactly-once or idempotent event processing when multiple microservices consume from the same partitioned streaming topic?",
        "Cover partition keys for ordering guarantees, idempotent consumers, dead-letter queues, backpressure handling, and end-to-end monitoring metrics.",
        "Explain transactional producers, idempotent consumer deduplication, outbox patterns, consumer commit offsets, and lag alerting.",
        3
      );
      continue;
    }

    // 4. Redis / Caching & In-Memory Stores
    if (/redis|memcached|caching|cache invalidation/i.test(text)) {
      pushQuestion(
        req,
        "technical",
        "How do you design a distributed caching tier with Redis to prevent cache stampedes (thundering herd), cache penetration, and stale data reads under heavy concurrent traffic?",
        "What strategies do you use for distributed cache invalidation and cache consistency across microservices?",
        "Discuss cache-aside vs write-through, probabilistic early expiration (XFetch), mutex locking for cache misses, bloom filters for non-existent keys, and Redis eviction policies.",
        "Cover CDC (Change Data Capture) invalidation with Debezium/Kafka, TTL jitter, dual-write challenges, and eventual consistency guarantees.",
        2
      );
      continue;
    }

    // 5. Node.js & TypeScript
    if (/node\.js|typescript|javascript|express|nest/i.test(text)) {
      pushQuestion(
        req,
        "technical",
        "In a high-concurrency Node.js and TypeScript environment, how do you diagnose event-loop lag, manage memory leaks, and structure asynchronous workflows safely?",
        "How do you leverage TypeScript's advanced type system (conditional types, mapped types, template literal types) to build type-safe API clients and data validation layers?",
        "Cover event loop phases (timers, poll, check), worker threads for CPU-bound tasks, stream backpressure, heap memory profiling, and TypeScript strict typing practices.",
        "Explain generative utility types, branded primitive types, runtime Zod/TypeBox validation, compile-time exhaustive checks, and eliminating 'any'.",
        2
      );
      continue;
    }

    // 6. React / Frontend / Web Vitals
    if (/react|frontend|next\.js|accessibility|a11y|css|web vitals|state management/i.test(text)) {
      pushQuestion(
        req,
        "technical",
        "How do you architect large-scale React applications to maintain sub-second Core Web Vitals (LCP, INP, CLS) and prevent unnecessary re-render cascades?",
        "How do you evaluate and structure global vs local state management in modern React (Server Components, TanStack Query, Zustand/Jotai) to minimize client bundle overhead?",
        "Detail reconciliation and fiber work loop, memoization boundaries, virtualization of heavy DOM trees, code splitting, and accessible component hierarchies.",
        "Compare server-side data fetching with client caching, optimistic updates, atomic state selectors, and streaming SSR performance.",
        2
      );
      continue;
    }

    // 7. DevOps / Kubernetes / Terraform / CI/CD
    if (/kubernetes|terraform|docker|ci\/cd|cloud|aws|gcp|devops|infrastructure/i.test(text)) {
      pushQuestion(
        req,
        "technical",
        "Walk through how you design automated deployment pipelines and infrastructure as code to guarantee zero-downtime releases and rapid rollback capabilities.",
        "How do you configure Kubernetes pod autoscaling, resource limits, and health probes to ensure cluster resilience under sudden traffic surges?",
        "Discuss declarative infrastructure with Terraform, Kubernetes rolling updates vs canary releases, health probes, and automated smoke testing.",
        "Cover HPA metrics, requests vs limits, OOMKill prevention, graceful pod shutdown (SIGTERM), and ingress traffic drain.",
        2
      );
      continue;
    }

    // 8. Databases (PostgreSQL, ClickHouse, SQL, NoSQL)
    if (/database|postgresql|clickhouse|mysql|mongodb|sql|columnar|relational/i.test(text)) {
      pushQuestion(
        req,
        "technical",
        "When architecting data persistence for high-volume workloads, what criteria guide your choice between relational databases (like PostgreSQL) and columnar stores (like ClickHouse)? What indexing and sharding strategies do you use?",
        "Explain transaction isolation levels (Read Committed vs Repeatable Read vs Serializable) and how you mitigate write skew and deadlock conditions in relational databases.",
        "Compare row-oriented vs columnar storage engines, write amplification, indexing strategies, compression ratios, and partitioning by time/tenant.",
        "Analyze MVCC implementation, lock modes (row-level vs table-level), optimistic locking with version columns, and query plan profiling with EXPLAIN ANALYZE.",
        3
      );
      continue;
    }

    // 9. Distributed systems & Architecture
    if (/distributed systems|architecture|scalab|high-throughput|microservices|distributed/i.test(text)) {
      pushQuestion(
        req,
        "system-design",
        "When architecting a distributed system expected to scale horizontally under heavy traffic surges, what strategies do you employ for state management, cache consistency, and failover?",
        "How do you design a distributed transaction workflow across microservices using the Saga pattern or two-phase commit, and how do you handle compensating actions upon failure?",
        "Analyze CAP/PACELC trade-offs, cache-aside vs write-through patterns, distributed locking/idempotency keys, circuit breakers, and graceful degradation.",
        "Compare choreography vs orchestration in Sagas, outbox pattern, idempotent message consumers, dead-letter queues, and reconciliation jobs.",
        3
      );
      continue;
    }

    // 10. Python & Scripting
    if (/python|scripting|automation/i.test(text)) {
      pushQuestion(
        req,
        "technical",
        "How do you structure production Python applications for robustness, type safety, and efficient resource utilization when processing batch data or APIs?",
        "How do you handle asynchronous I/O and CPU concurrency in Python given the Global Interpreter Lock (GIL)?",
        "Address typing annotations, connection pooling, asyncio concurrency vs multiprocessing, exception boundaries, and unit test suites.",
        "Compare asyncio event loop, thread pools for I/O, process pools for CPU tasks, uvloop, and sub-interpreters.",
        2
      );
      continue;
    }

    // Default targeted question for domain/technical requirement
    pushQuestion(
      req,
      "technical",
      `Can you walk through your practical engineering experience with ${req.text}? What architectural trade-offs and edge cases did you encounter in production?`,
      `In a mission-critical production environment, how do you measure, benchmark, and optimize ${req.text}?`,
      "Explain core principles, real production application, trade-offs evaluated, and measurable outcomes.",
      "Detail monitoring telemetry (SLIs/SLOs), debugging methodologies, performance profiling, and fault isolation.",
      2
    );
  }

  // Add 1 company fit question if this is initial generation and we have requirements
  if (existingCount === 0 && requirements.length > 0) {
    questions.push({
      id: `q${qNum++}`,
      requirement_ids: [requirements[0].id],
      category: "company-fit",
      prompt: "How do your technical strengths, architectural principles, and engineering values align with our product mission and high-velocity shipping culture?",
      answer_outline: "Demonstrate engineering empathy, customer impact focus, ownership mindset, and alignment with modern software engineering practices.",
      difficulty: 1,
    });
  }

  return questions;
}

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

Generate a comprehensive bank of interview questions testing these requirements across technical, behavioural, system-design, and company-fit categories. Ensure every requirement ID is targeted.
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
      // Validate that prompt is not an empty or broken JD fragment
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

    // If LLM returned too few questions for the requirements, augment with deterministic generator
    if (questions.length < requirements.length) {
      return generateDeterministicQuestions(requirements, companySummary, 0);
    }

    return questions;
  } catch (err) {
    console.warn("[questionGenerator] LLM generation failed, using deterministic question engine:", (err as Error).message);
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

    // Ensure every single uncovered requirement is covered
    const coveredInGaps = new Set(newQuestions.flatMap((q) => q.requirement_ids));
    const stillMissing = uncoveredRequirements.filter((r) => !coveredInGaps.has(r.id));
    if (stillMissing.length > 0) {
      const fallbackQuestions = generateDeterministicQuestions(
        stillMissing,
        companySummary,
        existingCount + newQuestions.length
      );
      newQuestions.push(...fallbackQuestions);
    }

    if (newQuestions.length === 0) {
      return generateDeterministicQuestions(uncoveredRequirements, companySummary, existingCount);
    }

    return newQuestions;
  } catch (err) {
    console.warn("[questionGenerator] LLM gap generation failed, using deterministic gap engine:", (err as Error).message);
    return generateDeterministicQuestions(uncoveredRequirements, companySummary, existingCount);
  }
}
