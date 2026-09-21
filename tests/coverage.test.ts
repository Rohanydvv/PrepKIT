import { describe, it, expect } from "vitest";
import {
  analyzeCoverage,
  runCoveragePassLoop,
} from "../src/core/coverage/coverageChecker.js";
import { Question, Requirement } from "../src/core/types.js";

describe("Deterministic Coverage Checker & Second-Pass Loop (Section 3 & 4)", () => {
  const requirements: Requirement[] = [
    { id: "r1", text: "React and TypeScript", kind: "technical", priority: "must" },
    { id: "r2", text: "Distributed message queues", kind: "technical", priority: "must" },
    { id: "r3", text: "Mentoring junior engineers", kind: "behavioural", priority: "must" },
    { id: "r4", text: "Kubernetes knowledge", kind: "technical", priority: "nice" },
  ];

  it("accurately identifies uncovered requirements as gaps", () => {
    // Only r1 and r3 are covered
    const partialQuestions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "React concurrency question",
        answer_outline: "Outline",
        difficulty: 2,
      },
      {
        id: "q2",
        requirement_ids: ["r3"],
        category: "behavioural",
        prompt: "Mentoring question",
        answer_outline: "Outline",
        difficulty: 2,
      },
    ];

    const analysis = analyzeCoverage(requirements, partialQuestions);
    expect(analysis.uncoveredIds).toEqual(["r2", "r4"]);
    expect(analysis.uncoveredMustHaves.map((r) => r.id)).toEqual(["r2"]);
    expect(analysis.uncoveredNiceToHaves.map((r) => r.id)).toEqual(["r4"]);
    expect(analysis.coveredCount).toBe(2);
  });

  it("triggers second-pass loop to close must-have gaps and records passes", async () => {
    // Initially only r1 is covered
    const initialQuestions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "React question",
        answer_outline: "Outline",
        difficulty: 2,
      },
    ];

    // Mock targeted generator for second pass
    const generateGapsMock = async (
      missing: Requirement[],
      currentCount: number
    ): Promise<Question[]> => {
      return missing.map((req, idx) => ({
        id: `q${currentCount + idx + 1}`,
        requirement_ids: [req.id],
        category: req.kind === "behavioural" ? "behavioural" : "technical",
        prompt: `Targeted gap question for ${req.text}`,
        answer_outline: "Detailed answer outline",
        difficulty: 2,
      }));
    };

    const result = await runCoveragePassLoop(
      initialQuestions,
      requirements,
      generateGapsMock,
      2
    );

    // After second pass, all must-haves (r1, r2, r3) should be covered
    expect(result.coverage.passes).toBe(2);

    // Check all must-haves covered
    const coveredIds = new Set<string>();
    result.questions.forEach((q) => q.requirement_ids.forEach((id) => coveredIds.add(id)));

    expect(coveredIds.has("r1")).toBe(true);
    expect(coveredIds.has("r2")).toBe(true);
    expect(coveredIds.has("r3")).toBe(true);
  });

  it("does not run unnecessary extra passes if initial draft has 100% coverage", async () => {
    const fullyCoveredQuestions: Question[] = [
      { id: "q1", requirement_ids: ["r1"], category: "technical", prompt: "p1", answer_outline: "a1", difficulty: 2 },
      { id: "q2", requirement_ids: ["r2"], category: "technical", prompt: "p2", answer_outline: "a2", difficulty: 3 },
      { id: "q3", requirement_ids: ["r3"], category: "behavioural", prompt: "p3", answer_outline: "a3", difficulty: 1 },
      { id: "q4", requirement_ids: ["r4"], category: "technical", prompt: "p4", answer_outline: "a4", difficulty: 2 },
    ];

    let gapCalls = 0;
    const mockGen = async () => {
      gapCalls++;
      return [];
    };

    const result = await runCoveragePassLoop(fullyCoveredQuestions, requirements, mockGen, 3);
    expect(gapCalls).toBe(0);
    expect(result.coverage.passes).toBe(1);
    expect(result.coverage.uncovered_requirement_ids.length).toBe(0);
  });
});
