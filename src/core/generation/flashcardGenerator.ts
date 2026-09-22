import { llmClient } from "../llm/client.js";
import { Flashcard, Requirement } from "../types.js";

const FLASHCARD_SYSTEM_PROMPT = `YOU ARE A HIGH-YIELD TECHNICAL RETENTION & INTERVIEW DRILL SPECIALIST.
[SYSTEM: GENERATE_FLASHCARDS]

TASK:
Create focused, high-yield flashcards to help a candidate rapidly recall critical concepts, trade-offs, and mental models for the role requirements.

RULES:
1. SCHEMA:
   - "front": Clear, challenging concept question or quick-recall prompt (do NOT copy raw JD sentences).
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

export function generateDeterministicFlashcards(
  requirements: Requirement[],
  roleTitle: string
): Flashcard[] {
  const cards: Flashcard[] = [];
  let fNum = 1;
  const usedFronts = new Set<string>();

  const pushCard = (
    req: Requirement,
    front: string,
    altFront: string,
    back: string,
    altBack: string
  ) => {
    const finalFront = usedFronts.has(front) ? altFront : front;
    const finalBack = usedFronts.has(front) ? altBack : back;
    usedFronts.add(finalFront);

    cards.push({
      id: `f${fNum++}`,
      front: finalFront,
      back: finalBack,
      requirement_ids: [req.id],
    });
  };

  for (const req of requirements) {
    const text = req.text.toLowerCase();

    if (/rest|grpc|graphql|api design|endpoints|rpc/i.test(text)) {
      pushCard(
        req,
        "API Design: When should you prefer gRPC over REST/JSON in a microservices ecosystem?",
        "API Versioning: How do you introduce breaking schema changes without disrupting existing clients?",
        "gRPC uses HTTP/2 multiplexing, compact Protobuf binary serialization, and strongly-typed contracts, delivering 5-10x throughput with lower latency for internal inter-service RPCs.",
        "Use URI/header versioning, maintain backward-compatible field numbering in Protobuf or optional fields in JSON, and publish deprecation timelines."
      );
      continue;
    }

    if (/redis|memcached|caching|cache invalidation/i.test(text)) {
      pushCard(
        req,
        "Caching Strategies: How do you prevent cache stampedes (thundering herd) during key eviction?",
        "Cache Invalidation: What are the trade-offs of Cache-Aside vs Write-Through caching?",
        "Implement probabilistic early expiration (XFetch algorithm) or use distributed mutex locking so only a single background worker regenerates the cache while others read stale data.",
        "Cache-Aside is resilient to cache crashes and handles lazy loading, but risks stale reads. Write-Through guarantees cache consistency with the DB at the cost of higher write latency."
      );
      continue;
    }

    if (/kafka|event processing|pub[/-]?sub|queue|streaming/i.test(text)) {
      pushCard(
        req,
        "Kafka Core: How do partition keys impact consumer group parallelization and message ordering?",
        "Kafka Delivery Semantics: What is required to achieve end-to-end exactly-once processing (EOS)?",
        "Messages with identical keys land on the same partition, preserving strict per-key FIFO order. Total concurrent active consumers in a group is bounded by the partition count.",
        "Requires transactional producers, idempotent consumer deduplication via unique message IDs, and transactional commits of consumer offsets alongside DB writes."
      );
      continue;
    }

    if (/node\.js|typescript|javascript|backend/i.test(text)) {
      pushCard(
        req,
        "Node.js Performance: What happens when CPU-intensive computation runs on the main thread?",
        "TypeScript Strictness: How do unknown and any differ in type safety and assignment?",
        "The single-threaded event loop blocks, delaying all I/O polling, timers, and active connections. CPU-heavy work must be offloaded to worker threads or external worker queues.",
        "'any' turns off all type checking, allowing unsafe property access. 'unknown' requires explicit type narrowing (typeof, instanceof, user-defined type guards) before use."
      );
      continue;
    }

    if (/distributed systems|architecture|scalab|high-throughput|microservices/i.test(text)) {
      pushCard(
        req,
        "Distributed Systems: Explain the trade-off between at-least-once delivery and exactly-once processing.",
        "Microservices Architecture: What is the Database-per-Service pattern and how do you handle cross-service queries?",
        "At-least-once retries on network failures but risks duplicates. Achieving effectively-once processing requires downstream idempotent consumer operations or transactional state commits.",
        "Each service owns its private database to preserve loose coupling. Cross-service queries are handled via API composition, CQRS read replicas, or event-driven materialized views."
      );
      continue;
    }

    if (/database|postgresql|clickhouse|sql|columnar|relational/i.test(text)) {
      pushCard(
        req,
        "Databases: When should you choose a columnar database (ClickHouse) over an OLTP RDBMS (PostgreSQL)?",
        "Database Indexing: What is the difference between B-Tree and LSM-Tree storage engines?",
        "OLTP RDBMS excels at normalized transactions, row-level ACID updates, and foreign keys. Columnar OLAP excels at high-throughput append-only ingestion and aggregation queries over billions of rows.",
        "B-Trees optimize for random reads and in-place updates with predictable search latency. LSM-Trees optimize for high-throughput sequential writes by appending to memory buffers and flushing SSTables."
      );
      continue;
    }

    if (/react|frontend|state management|web vitals/i.test(text)) {
      pushCard(
        req,
        "React Optimization: How does React's Reconciliation differ from DOM mutation?",
        "Web Vitals: What causes high Cumulative Layout Shift (CLS) and how do you fix it?",
        "React builds and diffs an in-memory Virtual DOM tree using Fiber fibers. Only dirty nodes with changed props or state trigger physical, batched browser DOM updates.",
        "Unsized images, dynamically injected DOM nodes, or late-loading web fonts. Fix by reserving aspect-ratio boxes, font-display: optional, and preloading critical assets."
      );
      continue;
    }

    if (/mentor|lead|leadership|culture|team|collaborat/i.test(text) || req.kind === "behavioural") {
      pushCard(
        req,
        "STAR Behavioural Framework: What are the 4 essential components?",
        "Engineering Leadership: How do you manage technical disagreements during RFC design reviews?",
        "S (Situation: technical context), T (Task: your objective), A (Action: specific engineering initiatives you took), R (Result: measurable outcome and business impact).",
        "Anchor on objective evaluation criteria (latency, scalability, maintenance cost), build consensus through proof-of-concept benchmarks, and practice 'disagree and commit'."
      );
      continue;
    }

    if (/kubernetes|terraform|docker|ci\/cd|devops/i.test(text)) {
      pushCard(
        req,
        "Production Reliability: What is the difference between liveness and readiness probes?",
        "Infrastructure as Code: Why are immutable infrastructure and declarative Terraform states preferred?",
        "Liveness probe checks if the container process is alive (restarts if failed). Readiness probe checks if the pod can accept client traffic (removes from service endpoints if failed).",
        "Declarative IaC prevents configuration drift, enables version-controlled audits, and allows reproducible zero-downtime cluster rollouts and rollbacks."
      );
      continue;
    }

    // Default card for technical/domain requirement
    pushCard(
      req,
      `Core Principles: What are the primary production trade-offs of ${req.text}?`,
      `Production Diagnostics: How do you monitor and debug ${req.text} at scale?`,
      "Balance throughput, operational complexity, testability, failure isolation, and developer maintenance velocity.",
      "Instrument RED metrics (Rate, Errors, Duration), trace distributed requests with correlation IDs, and establish automated alert thresholds."
    );
  }

  return cards;
}

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

      const cleanFront = fc.front?.trim() || "";
      const cleanBack = fc.back?.trim() || "";

      if (cleanFront.length > 10 && cleanBack.length > 10 && !cleanFront.includes("About the Role:")) {
        flashcards.push({
          id: `f${flashcards.length + 1}`,
          front: cleanFront,
          back: cleanBack,
          requirement_ids: reqIds,
        });
      }
    });

    if (flashcards.length >= Math.min(requirements.length, 3)) {
      return flashcards;
    }
  } catch (err) {
    console.warn("[flashcardGenerator] LLM failed, using deterministic flashcards:", (err as Error).message);
  }

  return generateDeterministicFlashcards(requirements, roleTitle);
}
