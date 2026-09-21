import { describe, it, expect } from "vitest";
import {
  validateInterviewKit,
  validateBatchCasesInput,
  validateBatchOutput,
} from "../src/core/validator/kitValidator.js";

describe("Schema & Structural Validation (Appendix A & B)", () => {
  const validKit = {
    source: {
      company: "Acme Corp",
      company_url: "https://acme.com",
      role: "Backend Engineer",
      location: "San Francisco, CA",
      jd_chars: 500,
      researched_at: "2026-09-01T09:12:44Z",
      pages_used: ["https://acme.com", "https://acme.com/careers"],
    },
    company_brief: {
      summary: "Acme builds enterprise logistics software.",
      what_they_do: "Global supply chain tracking and automated routing algorithms.",
      sources: ["https://acme.com"],
    },
    role: {
      title: "Backend Engineer",
      seniority: "Senior",
      responsibilities: ["Build distributed pipelines", "Design database schemas"],
      requirements: [
        { id: "r1", text: "5+ years with Go", kind: "technical", priority: "must" },
        { id: "r2", text: "Mentoring junior engineers", kind: "behavioural", priority: "must" },
      ],
    },
    questions: [
      {
        id: "q1",
        requirement_ids: ["r1"],
        category: "technical",
        prompt: "Explain channel semantics and goroutine leak prevention in Go.",
        answer_outline: "Discuss buffered vs unbuffered channels, select with context cancellation.",
        difficulty: 3,
      },
      {
        id: "q2",
        requirement_ids: ["r2"],
        category: "behavioural",
        prompt: "Tell me about a time you gave difficult constructive feedback.",
        answer_outline: "STAR approach emphasizing actionable clarity and empathy.",
        difficulty: 2,
      },
    ],
    flashcards: [
      {
        id: "f1",
        front: "What is Go's memory model regarding goroutine visibility?",
        back: "Channel communications establish happens-before relationships.",
        requirement_ids: ["r1"],
      },
    ],
    schedule: {
      days_available: 2,
      days: [
        { day: 1, focus: "Go Architecture & Concurrency", question_ids: ["q1"], minutes: 45 },
        { day: 2, focus: "Behavioural & Leadership Scenarios", question_ids: ["q2"], minutes: 30 },
      ],
    },
    coverage: {
      uncovered_requirement_ids: [],
      passes: 1,
    },
  };

  it("validates a strictly conforming Appendix A kit successfully", () => {
    const res = validateInterviewKit(validKit);
    expect(res.success).toBe(true);
    expect(res.data).toBeDefined();
  });

  it("rejects invalid question categories or difficulty outside 1..3", () => {
    const invalidKit = JSON.parse(JSON.stringify(validKit));
    invalidKit.questions[0].difficulty = 5; // Invalid difficulty

    const res = validateInterviewKit(invalidKit);
    expect(res.success).toBe(false);
    expect(res.errors?.some((e) => e.includes("difficulty"))).toBe(true);
  });

  it("rejects non-integer minutes in schedule", () => {
    const invalidKit = JSON.parse(JSON.stringify(validKit));
    invalidKit.schedule.days[0].minutes = 45.5; // Float not allowed

    const res = validateInterviewKit(invalidKit);
    expect(res.success).toBe(false);
  });

  it("rejects questions referencing non-existent requirement IDs", () => {
    const invalidKit = JSON.parse(JSON.stringify(validKit));
    invalidKit.questions[0].requirement_ids = ["r999"]; // Orphan ID

    const res = validateInterviewKit(invalidKit);
    expect(res.success).toBe(false);
    expect(res.errors?.some((e) => e.includes("non-existent requirement_id 'r999'"))).toBe(true);
  });

  it("rejects schedule days referencing non-existent question IDs", () => {
    const invalidKit = JSON.parse(JSON.stringify(validKit));
    invalidKit.schedule.days[0].question_ids = ["q999"]; // Orphan ID

    const res = validateInterviewKit(invalidKit);
    expect(res.success).toBe(false);
    expect(res.errors?.some((e) => e.includes("non-existent question_id 'q999'"))).toBe(true);
  });

  it("validates batch input cases correctly", () => {
    const validCases = [
      { id: "c1", jd: "Job description", company_url: "https://stripe.com", days: 5 },
    ];
    expect(validateBatchCasesInput(validCases).success).toBe(true);

    const invalidCases = [{ id: "c1", jd: "Job description" }]; // Missing company_url & days
    expect(validateBatchCasesInput(invalidCases).success).toBe(false);
  });

  it("validates batch output conforming to Appendix B", () => {
    const validBatchOutput = {
      version: "1.0",
      generated_at: new Date().toISOString(),
      kits: [
        { id: "c1", status: "ok", kit: validKit, error: null },
        { id: "c2", status: "failed", kit: null, error: { code: "TIMEOUT", message: "Timeout" } },
      ],
    };
    expect(validateBatchOutput(validBatchOutput).success).toBe(true);
  });
});
