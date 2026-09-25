import { Question, Requirement } from "../types.js";

/**
 * Deterministically deduplicates questions by normalized prompt text,
 * preserving only the first occurrence and re-indexing IDs cleanly.
 */
export function deduplicateQuestions(
  questions: Question[],
  startIndex: number = 0
): Question[] {
  const seenPrompts = new Set<string>();
  const deduplicated: Question[] = [];

  for (const q of questions) {
    const normalized = q.prompt
      .toLowerCase()
      .replace(/[^\w\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();

    if (normalized.length > 0 && !seenPrompts.has(normalized)) {
      seenPrompts.add(normalized);
      deduplicated.push(q);
    }
  }

  return deduplicated.map((q, idx) => ({
    ...q,
    id: `q${startIndex + idx + 1}`,
  }));
}

/**
 * Extracts structured requirements from LLM prompt text
 * formatted with "[r1] (MUST - technical): ..." or "Requirement ID: r1 (must technical): ...".
 */
export function parseRequirementsFromPrompt(prompt: string): Requirement[] {
  const reqs: Requirement[] = [];
  const lines = prompt.split("\n");

  for (const line of lines) {
    const trimmed = line.trim();

    // Pattern 1: [r1] (MUST - technical): 5+ years experience...
    const m1 = trimmed.match(/^\[(r\d+)\]\s*\((MUST|NICE)\s*-\s*([a-z-]+)\):\s*(.+)$/i);
    if (m1) {
      const id = m1[1].toLowerCase();
      const priority = m1[2].toLowerCase() === "must" ? "must" : "nice";
      const kindRaw = m1[3].toLowerCase();
      const kind: Requirement["kind"] =
        kindRaw === "behavioural" || kindRaw === "domain" ? kindRaw : "technical";
      const text = m1[4].trim();
      reqs.push({ id, text, kind, priority });
      continue;
    }

    // Pattern 2: Requirement ID: r1 (must technical): 5+ years experience...
    const m2 = trimmed.match(/^Requirement ID:\s*(r\d+)\s*\((must|nice)\s+([a-z-]+)\):\s*(.+)$/i);
    if (m2) {
      const id = m2[1].toLowerCase();
      const priority = m2[2].toLowerCase() === "must" ? "must" : "nice";
      const kindRaw = m2[3].toLowerCase();
      const kind: Requirement["kind"] =
        kindRaw === "behavioural" || kindRaw === "domain" ? kindRaw : "technical";
      const text = m2[4].trim();
      reqs.push({ id, text, kind, priority });
      continue;
    }
  }

  // Fallback: search for numbered or bulleted lines if structured headers were not present
  if (reqs.length === 0) {
    let count = 1;
    for (const line of lines) {
      const trimmed = line.trim();
      if (/^[-*•]\s+/.test(trimmed) || /^\d+\.\s+/.test(trimmed)) {
        const text = trimmed.replace(/^[-*•\d.]+\s*/, "").trim();
        if (
          text.length > 10 &&
          !/^(?:about|requirements|qualifications|responsibilities|the role)/i.test(text)
        ) {
          reqs.push({
            id: `r${count}`,
            text,
            kind: /mentor|lead|culture|team|collaborat/i.test(text)
              ? "behavioural"
              : /fintech|healthcare|compliance|domain/i.test(text)
              ? "domain"
              : "technical",
            priority: count <= 2 ? "must" : "nice",
          });
          count++;
        }
      }
    }
  }

  return reqs;
}

interface QuestionTemplate {
  category: Question["category"];
  prompt: string;
  answer_outline: string;
  difficulty: 1 | 2 | 3;
}

/**
 * Returns tailored question templates for a given requirement.
 * Generates 2 distinct questions for must-have requirements (e.g. core + edge case / architecture)
 * and 1-2 targeted questions for nice-to-have requirements.
 */
function getTemplatesForRequirement(req: Requirement): QuestionTemplate[] {
  const text = req.text.toLowerCase();
  const templates: QuestionTemplate[] = [];

  // 1. Mentoring, Leadership & Behavioural
  if (
    req.kind === "behavioural" ||
    /mentor|lead|leadership|culture|team|collaborat|agile|stakeholder|cross-functional/i.test(text)
  ) {
    templates.push({
      category: "behavioural",
      prompt:
        "Describe a situation where you had to lead a critical technical decision or mentor an engineer through a complex architectural challenge. How did you handle trade-offs and build team consensus?",
      answer_outline:
        "Structure with STAR: Highlight initial technical divergence, evaluation criteria/RFC, proactive guidance, and measurable positive delivery outcome.",
      difficulty: 2,
    });

    if (req.priority === "must") {
      templates.push({
        category: "behavioural",
        prompt:
          "Tell me about a time you experienced significant friction or disagreement over engineering priorities or technical direction. How did you facilitate alignment without compromising delivery quality?",
        answer_outline:
          "Use STAR: Detail the context and conflict, data-driven objective criteria evaluated, diplomatic communication with stakeholders, and final collaborative resolution.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // 2. Kafka / Event Processing / Message Streaming
  if (/kafka|event processing|pub[/-]?sub|queue|streaming|event-driven|kinesis|rabbitmq/i.test(text)) {
    templates.push({
      category: "system-design",
      prompt:
        "Describe how you design a production-grade event-driven pipeline using Kafka or message streaming. How do you handle partition rebalancing, consumer lag, and out-of-order event delivery?",
      answer_outline:
        "Cover partition keys for ordering guarantees, idempotent consumers, dead-letter queues, backpressure handling, and end-to-end monitoring metrics.",
      difficulty: 3,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "How do you ensure end-to-end exactly-once or idempotent event processing when multiple microservices consume from the same partitioned streaming topic?",
        answer_outline:
          "Explain transactional producers, idempotent consumer deduplication, outbox patterns, consumer commit offsets, and lag alerting.",
        difficulty: 3,
      });
    }
    return templates;
  }

  // 3. REST, gRPC & API Design
  if (/rest|grpc|graphql|api design|endpoints|rpc/i.test(text)) {
    templates.push({
      category: "technical",
      prompt:
        "When designing high-throughput inter-service communication, how do you decide between REST/JSON and gRPC/Protobuf? How do you ensure backward compatibility, rate-limiting, and graceful error handling?",
      answer_outline:
        "Compare binary Protobuf serialization and HTTP/2 multiplexing with REST simplicity. Address semantic versioning, client SDKs, deadline propagation, and circuit breaking.",
      difficulty: 3,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "How do you design and version mission-critical public and internal APIs to avoid breaking client integrations while migrating database schemas and payloads?",
        answer_outline:
          "Discuss URI versioning vs header versioning, contract testing, deprecation windows, idempotency keys, and zero-downtime rolling updates.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // 4. Redis / Caching & In-Memory Stores
  if (/redis|memcached|caching|cache invalidation/i.test(text)) {
    templates.push({
      category: "technical",
      prompt:
        "How do you design a distributed caching tier with Redis to prevent cache stampedes (thundering herd), cache penetration, and stale data reads under heavy concurrent traffic?",
      answer_outline:
        "Discuss cache-aside vs write-through, probabilistic early expiration (XFetch), mutex locking for cache misses, bloom filters for non-existent keys, and Redis eviction policies.",
      difficulty: 2,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "What strategies do you use for distributed cache invalidation and cache consistency across microservices?",
        answer_outline:
          "Cover CDC (Change Data Capture) invalidation with Debezium/Kafka, TTL jitter, dual-write challenges, and eventual consistency guarantees.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // 5. Node.js & TypeScript
  if (/node\.js|typescript|javascript|express|nest/i.test(text)) {
    templates.push({
      category: "technical",
      prompt:
        "In a high-concurrency Node.js and TypeScript environment, how do you diagnose event-loop lag, manage memory leaks, and structure asynchronous workflows safely?",
      answer_outline:
        "Cover event loop phases (timers, poll, check), worker threads for CPU-bound tasks, stream backpressure, heap memory profiling, and TypeScript strict typing practices.",
      difficulty: 2,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "How do you leverage TypeScript's advanced type system (conditional types, mapped types, template literal types) to build type-safe API clients and data validation layers?",
        answer_outline:
          "Explain generative utility types, branded primitive types, runtime Zod/TypeBox validation, compile-time exhaustive checks, and eliminating 'any'.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // 6. React / Frontend / Web Vitals
  if (/react|frontend|next\.js|accessibility|a11y|css|web vitals|state management/i.test(text)) {
    templates.push({
      category: "technical",
      prompt:
        "How do you architect large-scale React applications to maintain sub-second Core Web Vitals (LCP, INP, CLS) and prevent unnecessary re-render cascades?",
      answer_outline:
        "Detail reconciliation and fiber work loop, memoization boundaries, virtualization of heavy DOM trees, code splitting, and accessible component hierarchies.",
      difficulty: 2,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "How do you evaluate and structure global vs local state management in modern React (Server Components, TanStack Query, Zustand/Jotai) to minimize client bundle overhead?",
        answer_outline:
          "Compare server-side data fetching with client caching, optimistic updates, atomic state selectors, and streaming SSR performance.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // 7. DevOps / Kubernetes / Terraform / CI/CD
  if (/kubernetes|terraform|docker|ci\/cd|cloud|aws|gcp|devops|infrastructure/i.test(text)) {
    templates.push({
      category: "technical",
      prompt:
        "Walk through how you design automated deployment pipelines and infrastructure as code to guarantee zero-downtime releases and rapid rollback capabilities.",
      answer_outline:
        "Discuss declarative infrastructure with Terraform, Kubernetes rolling updates vs canary releases, health probes, and automated smoke testing.",
      difficulty: 2,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "How do you configure Kubernetes pod autoscaling, resource limits, and health probes to ensure cluster resilience under sudden traffic surges?",
        answer_outline:
          "Cover HPA metrics, requests vs limits, OOMKill prevention, graceful pod shutdown (SIGTERM), and ingress traffic drain.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // 8. Databases (PostgreSQL, ClickHouse, SQL, NoSQL)
  if (/database|postgresql|clickhouse|mysql|mongodb|sql|columnar|relational/i.test(text)) {
    templates.push({
      category: "technical",
      prompt:
        "When architecting data persistence for high-volume workloads, what criteria guide your choice between relational databases and columnar or specialized stores? What indexing and sharding strategies do you use?",
      answer_outline:
        "Compare row-oriented vs columnar storage engines, write amplification, indexing strategies, compression ratios, and partitioning by time/tenant.",
      difficulty: 3,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "Explain transaction isolation levels (Read Committed vs Repeatable Read vs Serializable) and how you mitigate write skew and deadlock conditions in relational databases.",
        answer_outline:
          "Analyze MVCC implementation, lock modes (row-level vs table-level), optimistic locking with version columns, and query plan profiling with EXPLAIN ANALYZE.",
        difficulty: 3,
      });
    }
    return templates;
  }

  // 9. Distributed Systems & Architecture
  if (
    /distributed systems|architecture|scalab|high-throughput|microservices|distributed/i.test(text)
  ) {
    templates.push({
      category: "system-design",
      prompt:
        "When architecting a distributed system expected to scale horizontally under heavy traffic surges, what strategies do you employ for state management, cache consistency, and failover?",
      answer_outline:
        "Analyze CAP/PACELC trade-offs, cache-aside vs write-through patterns, distributed locking/idempotency keys, circuit breakers, and graceful degradation.",
      difficulty: 3,
    });

    if (req.priority === "must") {
      templates.push({
        category: "system-design",
        prompt:
          "How do you design a distributed transaction workflow across microservices using the Saga pattern or two-phase commit, and how do you handle compensating actions upon failure?",
        answer_outline:
          "Compare choreography vs orchestration in Sagas, outbox pattern, idempotent message consumers, dead-letter queues, and reconciliation jobs.",
        difficulty: 3,
      });
    }
    return templates;
  }

  // 10. Python & Scripting
  if (/python|scripting|automation/i.test(text)) {
    templates.push({
      category: "technical",
      prompt:
        "How do you structure production Python applications for robustness, type safety, and efficient resource utilization when processing batch data or APIs?",
      answer_outline:
        "Address typing annotations, connection pooling, asyncio concurrency vs multiprocessing, exception boundaries, and unit test suites.",
      difficulty: 2,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt:
          "How do you handle asynchronous I/O and CPU concurrency in Python given the Global Interpreter Lock (GIL)?",
        answer_outline:
          "Compare asyncio event loop, thread pools for I/O, process pools for CPU tasks, uvloop, and sub-interpreters.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // 11. Domain-Specific (Fintech, Healthcare, Compliance, SaaS, Security)
  if (req.kind === "domain" || /fintech|healthcare|compliance|security|e-commerce|payments|saas/i.test(text)) {
    templates.push({
      category: "technical",
      prompt: `In the context of ${req.text}, how do you ensure regulatory compliance, data security, and auditability in backend service architecture?`,
      answer_outline:
        "Explain domain constraints, data encryption at rest and in transit, immutable audit logs, access control boundaries, and risk mitigation.",
      difficulty: 2,
    });

    if (req.priority === "must") {
      templates.push({
        category: "technical",
        prompt: `Can you describe a complex business workflow or edge case you navigated while working with ${req.text}? What architectural trade-offs proved most critical?`,
        answer_outline:
          "Describe the specific domain challenge, technical architecture selected, edge cases resolved, and positive business impact delivered.",
        difficulty: 2,
      });
    }
    return templates;
  }

  // Default targeted questions for general technical requirements
  templates.push({
    category: "technical",
    prompt: `Can you walk through your practical engineering experience with ${req.text}? What architectural trade-offs and edge cases did you encounter in production?`,
    answer_outline:
      "Explain core principles, real production application, trade-offs evaluated, and measurable delivery outcomes.",
    difficulty: 2,
  });

  if (req.priority === "must") {
    templates.push({
      category: "technical",
      prompt: `In a mission-critical production environment, how do you measure, benchmark, and optimize ${req.text} to ensure high reliability and low latency?`,
      answer_outline:
        "Detail monitoring telemetry (SLIs/SLOs), debugging methodologies, performance profiling, and fault isolation.",
      difficulty: 2,
    });
  }

  return templates;
}

/**
 * Deterministically generates high-caliber, requirement-grounded interview questions.
 * Produces multiple substantive questions per requirement (2 for must-haves, 1-2 for nice-to-haves),
 * plus architectural and company-fit questions, ensuring a rich question bank without tiny stubs.
 */
export function generateDeterministicQuestions(
  requirements: Requirement[],
  companySummary?: string,
  existingCount: number = 0
): Question[] {
  if (requirements.length === 0) return [];

  const rawQuestions: Question[] = [];
  let qNum = existingCount + 1;
  const seenPrompts = new Set<string>();

  for (const req of requirements) {
    const templates = getTemplatesForRequirement(req);

    for (const t of templates) {
      if (!seenPrompts.has(t.prompt)) {
        seenPrompts.add(t.prompt);
        rawQuestions.push({
          id: `q${qNum++}`,
          requirement_ids: [req.id],
          category: t.category,
          prompt: t.prompt,
          answer_outline: t.answer_outline,
          difficulty: t.difficulty,
        });
      }
    }
  }

  // In initial generation (existingCount === 0), add holistic system-design & company-fit questions
  if (existingCount === 0) {
    // 1. System Design question if not already present
    const hasSysDesign = rawQuestions.some((q) => q.category === "system-design");
    const primaryTechReq = requirements.find((r) => r.kind === "technical") || requirements[0];

    if (!hasSysDesign && primaryTechReq) {
      rawQuestions.push({
        id: `q${qNum++}`,
        requirement_ids: [primaryTechReq.id],
        category: "system-design",
        prompt:
          "How would you architect a distributed, fault-tolerant service handling sudden 10x traffic spikes while maintaining strict data consistency and low latency?",
        answer_outline:
          "Propose rate-limiting, message queues for asynchronous ingestion, horizontal autoscaling, database read replicas, and circuit breakers.",
        difficulty: 3,
      });
    }

    // 2. Company Fit & Engineering Culture question
    const primaryReq = requirements[0];
    if (primaryReq) {
      rawQuestions.push({
        id: `q${qNum++}`,
        requirement_ids: [primaryReq.id],
        category: "company-fit",
        prompt:
          "How do your technical strengths, architectural principles, and engineering values align with our product mission and high-velocity shipping culture?",
        answer_outline:
          "Demonstrate engineering empathy, customer impact focus, ownership mindset, and alignment with modern software engineering practices.",
        difficulty: 1,
      });
    }
  }

  return deduplicateQuestions(rawQuestions, existingCount);
}
