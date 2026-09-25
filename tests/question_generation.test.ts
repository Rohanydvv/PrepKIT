import { describe, it, expect } from "vitest";
import {
  generateDeterministicQuestions,
  deduplicateQuestions,
  parseRequirementsFromPrompt,
} from "../src/core/generation/deterministicQuestions.js";
import {
  generateInitialQuestionBank,
  generateQuestionsForGaps,
} from "../src/core/generation/questionGenerator.js";
import { runCoveragePassLoop, analyzeCoverage } from "../src/core/coverage/coverageChecker.js";
import { allocateSchedule } from "../src/core/scheduler/scheduler.js";
import { Question, Requirement } from "../src/core/types.js";

describe("Question Generation Pipeline & Quality Tests", () => {
  const sampleRequirements: Requirement[] = [
    {
      id: "r1",
      text: "Expert in Node.js and distributed systems",
      kind: "technical",
      priority: "must",
    },
    {
      id: "r2",
      text: "Mentoring junior engineers and technical leadership",
      kind: "behavioural",
      priority: "must",
    },
    {
      id: "r3",
      text: "Experience with Kafka message streams and event-driven pipelines",
      kind: "technical",
      priority: "must",
    },
    {
      id: "r4",
      text: "Fintech domain knowledge and compliance",
      kind: "domain",
      priority: "nice",
    },
    {
      id: "r5",
      text: "Hands-on experience with Redis caching and performance optimization",
      kind: "technical",
      priority: "nice",
    },
  ];

  it("TEST A: A JD containing several requirements produces more than the tiny fixed question set", async () => {
    const questions = await generateInitialQuestionBank(
      sampleRequirements,
      "Fintech infrastructure provider"
    );

    // Old behavior produced only 4 static questions
    // New behavior produces multiple questions per requirement (~8-12 questions)
    expect(questions.length).toBeGreaterThan(4);
    expect(questions.length).toBeGreaterThanOrEqual(sampleRequirements.length * 1.5);
  });

  it("TEST B: Every generated question references at least one valid requirement ID", async () => {
    const questions = await generateInitialQuestionBank(
      sampleRequirements,
      "Distributed systems firm"
    );
    const validReqIds = new Set(sampleRequirements.map((r) => r.id));

    expect(questions.length).toBeGreaterThan(0);
    questions.forEach((q) => {
      expect(Array.isArray(q.requirement_ids)).toBe(true);
      expect(q.requirement_ids.length).toBeGreaterThan(0);
      q.requirement_ids.forEach((id) => {
        expect(validReqIds.has(id)).toBe(true);
      });
    });
  });

  it("TEST C: Question IDs are globally unique and sequential", async () => {
    const questions = await generateInitialQuestionBank(
      sampleRequirements,
      "Fintech cloud platform"
    );

    const questionIds = questions.map((q) => q.id);
    expect(new Set(questionIds).size).toBe(questionIds.length);

    questionIds.forEach((id, index) => {
      expect(id).toBe(`q${index + 1}`);
    });
  });

  it("TEST D: Duplicate question prompts are rejected or removed deterministically", () => {
    const duplicateList: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "How does Node.js handle the event loop?",
        answer_outline: "Explain libuv.",
        difficulty: 2,
      },
      {
        id: "q2",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "how does node.js handle the event loop?", // Duplicate prompt with case difference
        answer_outline: "Different outline.",
        difficulty: 2,
      },
      {
        id: "q3",
        requirement_ids: ["r2"],
        category: "behavioural",
        prompt: "Describe how you mentored a junior engineer.",
        answer_outline: "Explain STAR.",
        difficulty: 2,
      },
      {
        id: "q4",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "  How does Node.js handle the event loop?  ", // Duplicate with whitespace
        answer_outline: "Whitespace outline.",
        difficulty: 2,
      },
    ];

    const deduplicated = deduplicateQuestions(duplicateList);
    expect(deduplicated.length).toBe(2);
    expect(deduplicated[0].prompt).toBe("How does Node.js handle the event loop?");
    expect(deduplicated[1].prompt).toBe("Describe how you mentored a junior engineer.");
    expect(deduplicated[0].id).toBe("q1");
    expect(deduplicated[1].id).toBe("q2");
  });

  it("TEST E: Must-have requirements receive comprehensive question coverage", async () => {
    const questions = await generateInitialQuestionBank(
      sampleRequirements,
      "Distributed payment system"
    );

    const mustReqIds = sampleRequirements
      .filter((r) => r.priority === "must")
      .map((r) => r.id);

    const coveredReqIds = new Set(questions.flatMap((q) => q.requirement_ids));

    mustReqIds.forEach((mustId) => {
      expect(coveredReqIds.has(mustId)).toBe(true);

      // Must-have requirements should ideally receive 2 questions testing different angles
      const questionsForReq = questions.filter((q) => q.requirement_ids.includes(mustId));
      expect(questionsForReq.length).toBeGreaterThanOrEqual(2);
    });
  });

  it("TEST F: Second-pass generation adds missing questions when coverage is incomplete", async () => {
    // Intentionally create initial question set that leaves r3 and r4 uncovered
    const initialPartialQuestions: Question[] = [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Node event loop internals.",
        answer_outline: "Outline 1.",
        difficulty: 2,
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "behavioural",
        prompt: "Mentoring engineers.",
        answer_outline: "Outline 2.",
        difficulty: 2,
      },
    ];

    const coverageCheck = analyzeCoverage(sampleRequirements, initialPartialQuestions);
    expect(coverageCheck.uncoveredIds).toContain("r3");
    expect(coverageCheck.uncoveredIds).toContain("r4");

    const passResult = await runCoveragePassLoop(
      initialPartialQuestions,
      sampleRequirements,
      async (missingReqs, currentCount) => {
        return await generateQuestionsForGaps(missingReqs, currentCount, "Tech firm");
      },
      2
    );

    const finalCoveredIds = new Set(passResult.questions.flatMap((q) => q.requirement_ids));
    sampleRequirements.forEach((req) => {
      expect(finalCoveredIds.has(req.id)).toBe(true);
    });
    expect(passResult.coverage.uncovered_requirement_ids.length).toBe(0);
    expect(passResult.questions.length).toBeGreaterThan(initialPartialQuestions.length);
  });

  it("TEST G: Scheduler never schedules the same question ID twice", () => {
    const questions = generateDeterministicQuestions(sampleRequirements, "Tech firm", 0);
    const schedule = allocateSchedule(questions, sampleRequirements, 20);

    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);
    expect(new Set(allScheduledIds).size).toBe(allScheduledIds.length);
  });

  it("TEST H: A 20-day schedule remains exactly 20 days with varied review themes", () => {
    const questions = generateDeterministicQuestions(sampleRequirements, "Tech firm", 0);
    const schedule = allocateSchedule(questions, sampleRequirements, 20);

    expect(schedule.days_available).toBe(20);
    expect(schedule.days.length).toBe(20);

    // Verify day indices
    schedule.days.forEach((day, index) => {
      expect(day.day).toBe(index + 1);
      expect(day.minutes).toBeGreaterThan(0);
      expect(Number.isInteger(day.minutes)).toBe(true);
    });

    // Invariant: Uniqueness across all 20 days
    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);
    expect(new Set(allScheduledIds).size).toBe(allScheduledIds.length);

    // Check varied review titles on empty days: no consecutive identical titles
    const emptyDays = schedule.days.filter((d) => d.question_ids.length === 0);
    if (emptyDays.length > 1) {
      for (let i = 0; i < emptyDays.length - 1; i++) {
        expect(emptyDays[i].focus).not.toBe(emptyDays[i + 1].focus);
        expect(emptyDays[i].focus).not.toContain("Independent Research & Review");
      }
    }
  });

  it("TEST I: A 60-day schedule remains exactly 60 days with global uniqueness", () => {
    const questions = generateDeterministicQuestions(sampleRequirements, "Tech firm", 0);
    const schedule = allocateSchedule(questions, sampleRequirements, 60);

    expect(schedule.days_available).toBe(60);
    expect(schedule.days.length).toBe(60);

    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);
    expect(new Set(allScheduledIds).size).toBe(allScheduledIds.length);

    // Later days have empty question lists without artificial duplication
    const emptyDays = schedule.days.filter((d) => d.question_ids.length === 0);
    expect(emptyDays.length).toBeGreaterThan(0);

    // Empty days have varied titles
    for (let i = 0; i < emptyDays.length - 1; i++) {
      expect(emptyDays[i].focus).not.toBe(emptyDays[i + 1].focus);
    }
  });

  it("TEST J: Prompt requirement parser correctly extracts requirements", () => {
    const userPrompt = `Role Requirements to Cover:
[r1] (MUST - technical): Deep expertise in Node.js and distributed systems
[r2] (MUST - behavioural): Mentoring engineers
[r3] (NICE - domain): Fintech ledger compliance`;

    const parsed = parseRequirementsFromPrompt(userPrompt);
    expect(parsed.length).toBe(3);
    expect(parsed[0].id).toBe("r1");
    expect(parsed[0].priority).toBe("must");
    expect(parsed[0].kind).toBe("technical");
    expect(parsed[1].id).toBe("r2");
    expect(parsed[1].kind).toBe("behavioural");
    expect(parsed[2].id).toBe("r3");
    expect(parsed[2].priority).toBe("nice");
    expect(parsed[2].kind).toBe("domain");
  });
});
