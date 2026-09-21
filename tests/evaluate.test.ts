import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { generateInterviewPrepKit } from "../src/core/pipeline.js";
import { validateInterviewKit } from "../src/core/validator/kitValidator.js";

describe("Evaluation Pipeline Integration (Section 9 & Appendix B)", () => {
  it("processes a realistic case and returns an Appendix A compliant kit", async () => {
    const sampleJd = `Staff Software Engineer
Responsibilities:
- Lead architecture of distributed data streaming pipelines
- Mentor senior engineers and set engineering best practices
Requirements:
- 8+ years experience with distributed systems (Must-have)
- Deep expertise in high-concurrency event-driven architecture (Must-have)
- Demonstrated team leadership and cross-functional communication (Must-have)
- Experience with Kubernetes is a plus (Nice-to-have)`;

    const kit = await generateInterviewPrepKit({
      jd: sampleJd,
      company_url: "https://stripe.com",
      days: 5,
    });

    // Check validation
    const validation = validateInterviewKit(kit);
    expect(validation.success).toBe(true);

    // Check Appendix A fields
    expect(kit.source.company).toBeDefined();
    expect(kit.source.company_url).toBeDefined();
    expect(kit.company_brief.summary).toBeDefined();
    expect(kit.company_brief.what_they_do).toBeDefined();
    expect(Array.isArray(kit.company_brief.sources)).toBe(true);

    // Check role and requirements
    expect(kit.role.title).toBeDefined();
    expect(kit.role.requirements.length).toBeGreaterThan(0);
    expect(kit.role.requirements[0].id).toMatch(/^r\d+$/);

    // Check questions
    expect(kit.questions.length).toBeGreaterThan(0);
    expect(kit.questions[0].id).toMatch(/^q\d+$/);
    expect(["technical", "behavioural", "system-design", "company-fit"]).toContain(
      kit.questions[0].category
    );
    expect([1, 2, 3]).toContain(kit.questions[0].difficulty);

    // Check flashcards
    expect(kit.flashcards.length).toBeGreaterThan(0);
    expect(kit.flashcards[0].id).toMatch(/^f\d+$/);

    // Check schedule
    expect(kit.schedule.days_available).toBe(5);
    expect(kit.schedule.days.length).toBe(5);
    kit.schedule.days.forEach((day) => {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.question_ids.length).toBeGreaterThan(0);
    });

    // Check coverage
    expect(kit.coverage.passes).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("handles a 2-line stub gracefully without inventing requirements", async () => {
    const stubJd = "Junior Web Developer. Must know HTML and CSS.";
    const kit = await generateInterviewPrepKit({
      jd: stubJd,
      company_url: "https://python.org",
      days: 1,
    });

    const validation = validateInterviewKit(kit);
    expect(validation.success).toBe(true);
    expect(kit.schedule.days.length).toBe(1);
    expect(kit.schedule.days_available).toBe(1);
    expect(kit.role.requirements.length).toBeLessThanOrEqual(3);
  }, 30000);

  it("handles an unreachable company website gracefully without failing the run", async () => {
    const sampleJd = "Backend Engineer with Go experience.";
    // Using a non-existent domain to trigger unreachable failure
    const kit = await generateInterviewPrepKit({
      jd: sampleJd,
      company_url: "https://non-existent-domain-12345-prepkit-test.org",
      days: 3,
    });

    const validation = validateInterviewKit(kit);
    expect(validation.success).toBe(true);
    expect(kit.company_brief.sources.length).toBe(0);
    expect(kit.company_brief.summary.toLowerCase()).toContain("unavailable");
  }, 30000);
});
