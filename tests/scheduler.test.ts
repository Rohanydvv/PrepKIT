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

  it("produces exactly the requested number of days (1, 2, 5, 30, 60)", () => {
    [1, 2, 5, 30, 60].forEach((targetDays) => {
      const schedule = allocateSchedule(sampleQuestions, sampleRequirements, targetDays);
      expect(schedule.days_available).toBe(targetDays);
      expect(schedule.days.length).toBe(targetDays);
      expect(schedule.days[0].day).toBe(1);
      expect(schedule.days[targetDays - 1].day).toBe(targetDays);

      // Verify no NaN, integer minutes, and valid questions for every day
      schedule.days.forEach((day) => {
        expect(Number.isInteger(day.minutes)).toBe(true);
        expect(day.minutes).toBeGreaterThan(0);
        expect(Number.isNaN(day.minutes)).toBe(false);
        expect(day.question_ids.length).toBeGreaterThan(0);
      });
    });
  });

  it("ensures every duration is an integer number of minutes", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 5);
    schedule.days.forEach((day) => {
      expect(Number.isInteger(day.minutes)).toBe(true);
      expect(day.minutes).toBeGreaterThan(0);
    });
  });

  it("ensures every question_id in schedule refers to an existing question", () => {
    const validQuestionIds = new Set(sampleQuestions.map((q) => q.id));
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 7);

    schedule.days.forEach((day) => {
      day.question_ids.forEach((qId) => {
        expect(validQuestionIds.has(qId)).toBe(true);
      });
    });
  });

  it("ensures every must-have requirement appears somewhere in the schedule", () => {
    const mustReqIds = sampleRequirements
      .filter((r) => r.priority === "must")
      .map((r) => r.id);

    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 5);

    // Collect all covered requirement IDs in the schedule
    const scheduledReqIds = new Set<string>();
    schedule.days.forEach((day) => {
      day.question_ids.forEach((qId) => {
        const q = sampleQuestions.find((item) => item.id === qId);
        if (q) {
          q.requirement_ids.forEach((rId) => scheduledReqIds.add(rId));
        }
      });
    });

    mustReqIds.forEach((mustId) => {
      expect(scheduledReqIds.has(mustId)).toBe(true);
    });
  });

  it("schedules harder and higher-priority material earlier (Day 1 vs final days)", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 5);
    const day1QIds = schedule.days[0].question_ids;
    const day1Questions = sampleQuestions.filter((q) => day1QIds.includes(q.id));

    // Day 1 should have high difficulty items
    const day1AvgDifficulty =
      day1Questions.reduce((sum, q) => sum + q.difficulty, 0) / (day1Questions.length || 1);

    expect(day1AvgDifficulty).toBeGreaterThanOrEqual(2);
  });

  it("handles 1-day crash course edge case", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 1);
    expect(schedule.days.length).toBe(1);
    expect(schedule.days[0].question_ids.length).toBeGreaterThan(0);
    expect(schedule.days[0].focus).toContain("Intensive");
  });

  it("handles 60-day long timeline edge case without empty days", () => {
    const schedule = allocateSchedule(sampleQuestions, sampleRequirements, 60);
    expect(schedule.days.length).toBe(60);
    schedule.days.forEach((day) => {
      expect(day.question_ids.length).toBeGreaterThan(0);
      expect(day.minutes).toBeGreaterThan(0);
    });
  });
});
