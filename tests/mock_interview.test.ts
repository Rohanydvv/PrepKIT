import { describe, it, expect } from "vitest";
import { evaluateCandidateAnswer } from "../src/server/mockInterview.js";
import { evaluateCandidateAnswerOffline } from "../src/core/llm/mockEvaluator.js";

describe("AI Mock Interview Coach Evaluator", () => {
  const sampleQuestion = {
    prompt:
      "Explain how you manage state and handle performance bottlenecks in high-throughput applications.",
    category: "technical",
    outline:
      "Discuss architectural separation, profiling tools, caching strategies, and memory management.",
  };

  const answerPoor = "I don't know.";

  const answerShort =
    "We use Redis for caching and TTL to evict stale keys.";

  const answerDetailed =
    "In high-throughput applications, state should be decoupled from compute nodes using distributed caching like Redis Cluster. We use cache-aside patterns with strict TTLs, and profile bottlenecks using pprof and Grafana. Key trade-offs involve eventual consistency versus latency.";

  const answerSTAR =
    "In my previous role at Stripe, we managed high-throughput state bottlenecks by implementing strict architectural separation between stateless compute and stateful storage. First, for caching strategies, we deployed Redis Cluster with cache-aside and proactive TTL refresh. Second, to diagnose bottlenecks, we leveraged continuous profiling tools including pprof and Grafana dashboards tracking p99 latencies. Third, we optimized memory management by tuning Go GC thresholds and reusing memory buffers. Finally, we mitigated cache stampedes using distributed locks with exponential backoff. As a result, we reduced p99 latency by 85% down to 22ms and supported 50k RPS with zero downtime.";

  it("evaluates a very poor answer (Tier A) with low scores and constructive guidance", async () => {
    const res = await evaluateCandidateAnswer(
      sampleQuestion.prompt,
      sampleQuestion.category,
      sampleQuestion.outline,
      answerPoor
    );

    expect(res.score).toBeLessThanOrEqual(25);
    expect(res.rubricScores.depth).toBeLessThanOrEqual(5);
    expect(res.rubricScores.structure).toBeLessThanOrEqual(5);
    expect(res.rubricScores.alignment).toBeLessThanOrEqual(5);
    expect(res.rubricScores.clarity).toBeLessThanOrEqual(10);
    expect(res.score).toBe(
      res.rubricScores.depth +
        res.rubricScores.structure +
        res.rubricScores.alignment +
        res.rubricScores.clarity
    );
    expect(res.strengths.length).toBeGreaterThan(0);
    expect(res.improvements.length).toBeGreaterThan(0);
    expect(res.modelAnswer).toBeTruthy();
  });

  it("evaluates a short but relevant answer (Tier B) with moderate scores", async () => {
    const res = await evaluateCandidateAnswer(
      sampleQuestion.prompt,
      sampleQuestion.category,
      sampleQuestion.outline,
      answerShort
    );

    expect(res.score).toBeGreaterThan(15);
    expect(res.score).toBeLessThan(50);
    expect(res.rubricScores.depth).toBeGreaterThanOrEqual(4);
    expect(res.rubricScores.clarity).toBeGreaterThanOrEqual(8);
    expect(res.score).toBe(
      res.rubricScores.depth +
        res.rubricScores.structure +
        res.rubricScores.alignment +
        res.rubricScores.clarity
    );
  });

  it("evaluates a detailed technical answer (Tier C) with solid technical depth", async () => {
    const res = await evaluateCandidateAnswer(
      sampleQuestion.prompt,
      sampleQuestion.category,
      sampleQuestion.outline,
      answerDetailed
    );

    expect(res.score).toBeGreaterThanOrEqual(50);
    expect(res.rubricScores.depth).toBeGreaterThanOrEqual(12);
    expect(res.rubricScores.alignment).toBeGreaterThanOrEqual(12);
    expect(res.score).toBe(
      res.rubricScores.depth +
        res.rubricScores.structure +
        res.rubricScores.alignment +
        res.rubricScores.clarity
    );
  });

  it("evaluates a strong structured STAR answer (Tier D) with high scores across all rubrics", async () => {
    const res = await evaluateCandidateAnswer(
      sampleQuestion.prompt,
      sampleQuestion.category,
      sampleQuestion.outline,
      answerSTAR
    );

    expect(res.score).toBeGreaterThanOrEqual(75);
    expect(res.rubricScores.depth).toBeGreaterThanOrEqual(18);
    expect(res.rubricScores.structure).toBeGreaterThanOrEqual(16);
    expect(res.rubricScores.alignment).toBeGreaterThanOrEqual(16);
    expect(res.rubricScores.clarity).toBeGreaterThanOrEqual(20);
    expect(res.score).toBe(
      res.rubricScores.depth +
        res.rubricScores.structure +
        res.rubricScores.alignment +
        res.rubricScores.clarity
    );
    expect(res.strengths.some((s) => s.includes("metrics") || s.includes("depth") || s.includes("quantified"))).toBe(true);
  });

  it("strictly produces different rubric scores for radically different answers", async () => {
    const resPoor = await evaluateCandidateAnswer(
      sampleQuestion.prompt,
      sampleQuestion.category,
      sampleQuestion.outline,
      answerPoor
    );

    const resSTAR = await evaluateCandidateAnswer(
      sampleQuestion.prompt,
      sampleQuestion.category,
      sampleQuestion.outline,
      answerSTAR
    );

    expect(resPoor.score).not.toBe(resSTAR.score);
    expect(resPoor.rubricScores.depth).not.toBe(resSTAR.rubricScores.depth);
    expect(resPoor.rubricScores.structure).not.toBe(resSTAR.rubricScores.structure);
    expect(resPoor.rubricScores.alignment).not.toBe(resSTAR.rubricScores.alignment);
    expect(resPoor.rubricScores.clarity).not.toBe(resSTAR.rubricScores.clarity);
    expect(resSTAR.score).toBeGreaterThan(resPoor.score + 40);
  });

  it("guarantees valid score ranges and mathematical invariants", async () => {
    const answers = [answerPoor, answerShort, answerDetailed, answerSTAR];

    for (const ans of answers) {
      const res = await evaluateCandidateAnswer(
        sampleQuestion.prompt,
        sampleQuestion.category,
        sampleQuestion.outline,
        ans
      );

      // Check each rubric is within 0-25
      expect(res.rubricScores.depth).toBeGreaterThanOrEqual(0);
      expect(res.rubricScores.depth).toBeLessThanOrEqual(25);
      expect(res.rubricScores.structure).toBeGreaterThanOrEqual(0);
      expect(res.rubricScores.structure).toBeLessThanOrEqual(25);
      expect(res.rubricScores.alignment).toBeGreaterThanOrEqual(0);
      expect(res.rubricScores.alignment).toBeLessThanOrEqual(25);
      expect(res.rubricScores.clarity).toBeGreaterThanOrEqual(0);
      expect(res.rubricScores.clarity).toBeLessThanOrEqual(25);

      // Check overall is 0-100 and matches sum
      expect(res.score).toBeGreaterThanOrEqual(0);
      expect(res.score).toBeLessThanOrEqual(100);
      expect(res.score).toBe(
        res.rubricScores.depth +
          res.rubricScores.structure +
          res.rubricScores.alignment +
          res.rubricScores.clarity
      );

      // Check no NaN or null
      expect(Number.isNaN(res.score)).toBe(false);
      expect(Number.isNaN(res.rubricScores.depth)).toBe(false);
      expect(Number.isNaN(res.rubricScores.structure)).toBe(false);
      expect(Number.isNaN(res.rubricScores.alignment)).toBe(false);
      expect(Number.isNaN(res.rubricScores.clarity)).toBe(false);
    }
  });

  it("ensures question context directly affects alignment score", async () => {
    // Answer about caching
    const cachingAnswer =
      "We configure Redis with LRU cache eviction policy and cache-aside query patterns to minimize database read queries.";

    // Evaluated against Caching question
    const resRelevant = await evaluateCandidateAnswer(
      "How do you design a high-throughput caching tier?",
      "technical",
      "Redis LRU cache-aside eviction policies",
      cachingAnswer
    );

    // Evaluated against Unrelated CSS/Frontend question
    const resIrrelevant = await evaluateCandidateAnswer(
      "Explain CSS box model, margin collapse, and flexbox layout.",
      "technical",
      "CSS box sizing, content padding border margin, flex container",
      cachingAnswer
    );

    // Relevant question must receive higher alignment than irrelevant question
    expect(resRelevant.rubricScores.alignment).toBeGreaterThan(
      resIrrelevant.rubricScores.alignment
    );
  });

  it("handles behavioural questions with tailored STAR guidance and model answer", async () => {
    const res = await evaluateCandidateAnswer(
      "Tell me about a time you had a critical production outage.",
      "behavioural",
      "Situation: production down. Task: lead incident response. Action: rolled back canary, post-mortem. Result: 99.99% uptime restored.",
      "In my previous role, we had a major database failover outage. My task was to restore service and prevent data loss. I coordinated the on-call team, promoted the read-replica, and rolled back the problematic migration. As a result, we restored 99.99% availability within 14 minutes with zero data corruption."
    );

    expect(res.rubricScores.structure).toBeGreaterThanOrEqual(15);
    expect(res.modelAnswer).toContain("Situation:");
    expect(res.modelAnswer).toContain("Task:");
    expect(res.modelAnswer).toContain("Action:");
    expect(res.modelAnswer).toContain("Result:");
  });
});
