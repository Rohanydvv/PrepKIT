import { describe, it, expect } from "vitest";
import { allocateSchedule } from "../src/core/scheduler/scheduler.js";
import { Question, Requirement } from "../src/core/types.js";

describe("Deterministic Schedule Allocator (Section 8)", () => {
  const sampleRequirements: Requirement[] = [
    { id: "r1", text: "Expert in Node.js and distributed systems", kind: "technical", priority: "must" },
    { id: "r2", text: "Mentoring junior engineers", kind: "behavioural", priority: "must" },
    { id: "r3", text: "Experience with Kafka message streams", kind: "technical", priority: "nice" },
    { id: "r4", text: "Fintech domain knowledge", kind: "domain", priority: "nice" },
  ];

  const sampleQuestions: Question[] = [
    {
      id: "q1",
      requirement_ids: ["r1"],
      category: "technical",
      prompt: "How does Node.js event loop handle asynchronous I/O?",
      answer_outline: "Explain libuv, phases (timers, poll, check), microtasks.",
      difficulty: 3,
    },
    {
      id: "q2",
      requirement_ids: ["r1"],
      category: "system-design",
      prompt: "Design a fault-tolerant message queue.",
      answer_outline: "Leader election, log replication, partition tolerance.",
      difficulty: 3,
    },
    {
      id: "q3",
      requirement_ids: ["r2"],
      category: "behavioural",
      prompt: "Describe how you onboarded an underperforming junior engineer.",
      answer_outline: "Pair programming, weekly 1-on-1s, incremental milestones.",
      difficulty: 2,
    },
    {
      id: "q4",
      requirement_ids: ["r3"],
      category: "technical",
      prompt: "What is Kafka consumer group rebalancing?",
      answer_outline: "Eager vs cooperative rebalancing protocol.",
      difficulty: 2,
    },
    {
      id: "q5",
      requirement_ids: ["r4"],
      category: "company-fit",
      prompt: "Why are you interested in our financial ledger platform?",
      answer_outline: "Alignment with double-entry accounting integrity.",
      difficulty: 1,
    },
  ];

  /**
   * Helper to verify all fundamental schedule invariants:
   * - Exact days matching requested days_available
   * - Sequential 1-indexed days
   * - Integer minutes (positive, no NaN)
   * - Global uniqueness: every scheduled question appears AT MOST ONCE
   * - Reference integrity: every scheduled question ID exists in input questions
   */
  function assertScheduleInvariants(
    schedule: ReturnType<typeof allocateSchedule>,
    expectedDays: number,
    validQuestions: Question[]
  ) {
    expect(schedule.days_available).toBe(expectedDays);
    expect(schedule.days.length).toBe(expectedDays);
    expect(schedule.days[0].day).toBe(1);
    expect(schedule.days[expectedDays - 1].day).toBe(expectedDays);

    const validIds = new Set(validQuestions.map((q) => q.id));
    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);

    // Global Uniqueness Invariant
    expect(new Set(allScheduledIds).size).toBe(allScheduledIds.length);

    schedule.days.forEach((day, index) => {
      expect(day.day).toBe(index + 1);
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
      expect(Number.isNaN(day.minutes)).toBe(false);
      expect(typeof day.focus).toBe("string");
      expect(day.focus.length).toBeGreaterThan(0);

      day.question_ids.forEach((id) => {
        expect(validIds.has(id)).toBe(true);
      });
    });
  }

  it("produces exactly the requested number of days (1, 2, 5, 30, 60) with integer minutes", () => {
    [1, 2, 5, 30, 60].forEach((targetDays) => {
      const schedule = allocateSchedule(sampleQuestions, sampleRequirements, targetDays);
      assertScheduleInvariants(schedule, targetDays, sampleQuestions);
    });
  });

  it("TEST 1: Standard multi-day schedule asserts every question ID occurs AT MOST ONCE", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 5);
    assertScheduleInvariants(schedule, 5, sampleQuestions);

    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);
    // Explicitly verify global uniqueness
    expect(new Set(allScheduledIds).size).toBe(allScheduledIds.length);

    // Track ID frequency across all days
    const idCounts = new Map<string, number>();
    for (const day of schedule.days) {
      for (const qId of day.question_ids) {
        idCounts.set(qId, (idCounts.get(qId) || 0) + 1);
      }
    }
    for (const [, count] of idCounts) {
      expect(count).toBe(1);
    }
  });

  it("TEST 2: Long timeline edge case (60 days) has exactly 60 days, zero duplicates, no fabricated IDs", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 60);
    expect(schedule.days.length).toBe(60);
    assertScheduleInvariants(schedule, 60, sampleQuestions);

    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);
    // Total scheduled questions must be <= available questions
    expect(allScheduledIds.length).toBeLessThanOrEqual(sampleQuestions.length);
    // Zero duplicate IDs
    expect(new Set(allScheduledIds).size).toBe(allScheduledIds.length);

    // Days without new questions must still have positive integer study/review minutes and meaningful focus
    const emptyDays = schedule.days.filter((d) => d.question_ids.length === 0);
    expect(emptyDays.length).toBe(60 - sampleQuestions.length);
    emptyDays.forEach((day) => {
      expect(day.minutes).toBeGreaterThanOrEqual(25);
      expect(day.focus).toMatch(/Review|Consolidation|Readiness|Retention|Preparation/i);
    });
  });

  it("TEST 3: Short timeline edge case (1-day crash course) has unique questions on Day 1", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 1);
    expect(schedule.days.length).toBe(1);
    assertScheduleInvariants(schedule, 1, sampleQuestions);

    const day1Ids = schedule.days[0].question_ids;
    expect(day1Ids.length).toBe(sampleQuestions.length);
    expect(new Set(day1Ids).size).toBe(day1Ids.length);
    expect(schedule.days[0].focus).toContain("Sprint");
  });

  it("TEST 4: Coverage and difficulty ordering ensures must-haves covered and harder material earlier", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 5);
    assertScheduleInvariants(schedule, 5, sampleQuestions);

    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);
    expect(new Set(allScheduledIds).size).toBe(allScheduledIds.length);

    // Collect all covered requirement IDs
    const scheduledReqIds = new Set<string>();
    schedule.days.forEach((day) => {
      day.question_ids.forEach((qId) => {
        const q = sampleQuestions.find((item) => item.id === qId);
        if (q) {
          q.requirement_ids.forEach((rId) => scheduledReqIds.add(rId));
        }
      });
    });

    // Ensure every must-have requirement appears in the schedule
    const mustReqIds = sampleRequirements
      .filter((r) => r.priority === "must")
      .map((r) => r.id);
    mustReqIds.forEach((mustId) => {
      expect(scheduledReqIds.has(mustId)).toBe(true);
    });

    // Day 1 should feature high difficulty items (difficulty 3)
    const day1QIds = schedule.days[0].question_ids;
    const day1Questions = sampleQuestions.filter((q) => day1QIds.includes(q.id));
    const day1AvgDifficulty =
      day1Questions.reduce((sum, q) => sum + q.difficulty, 0) / (day1Questions.length || 1);
    expect(day1AvgDifficulty).toBeGreaterThanOrEqual(2.5);
  });

  it("TEST 5: Determinism produces identical schedules for identical inputs", () => {
    const scheduleA = allocateSchedule(sampleQuestions, sampleRequirements, 5);
    const scheduleB = allocateSchedule(sampleQuestions, sampleRequirements, 5);

    expect(scheduleA).toEqual(scheduleB);

    const allScheduledIdsA = scheduleA.days.flatMap((d) => d.question_ids);
    const allScheduledIdsB = scheduleB.days.flatMap((d) => d.question_ids);
    expect(new Set(allScheduledIdsA).size).toBe(allScheduledIdsA.length);
    expect(new Set(allScheduledIdsB).size).toBe(allScheduledIdsB.length);
  });

  it("TEST 6: Reference integrity ensures every question_id exists in input questions", () => {
    [1, 3, 5, 10, 30].forEach((days) => {
      const schedule = allocateSchedule(sampleQuestions, sampleRequirements, days);
      assertScheduleInvariants(schedule, days, sampleQuestions);

      const validQuestionIds = new Set(sampleQuestions.map((q) => q.id));
      schedule.days.forEach((day) => {
        day.question_ids.forEach((qId) => {
          expect(validQuestionIds.has(qId)).toBe(true);
        });
      });
    });
  });

  it("handles empty questions edge case safely", () => {
    const schedule = allocateSchedule([], sampleRequirements, 3);
    expect(schedule.days.length).toBe(3);
    const allScheduledIds = schedule.days.flatMap((d) => d.question_ids);
    expect(allScheduledIds.length).toBe(0);
    expect(new Set(allScheduledIds).size).toBe(0);
    schedule.days.forEach((d) => {
      expect(d.minutes).toBe(25);
      expect(d.question_ids).toEqual([]);
    });
  });
});
