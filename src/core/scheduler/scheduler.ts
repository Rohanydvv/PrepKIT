import { Question, Requirement, Schedule, ScheduleDay } from "../types.js";

/**
 * Deterministic Arithmetic Schedule Allocator
 *
 * Implements Section 8 of the Trao brief:
 * - Pure arithmetic and allocation (not handed to an LLM).
 * - Exact days: number of days in schedule === days_available (supports 1 to 60 days).
 * - Global Uniqueness: Every question appears AT MOST ONCE across the entire schedule.
 * - Every must-have requirement appears somewhere in the schedule.
 * - Harder (difficulty 3 > 2 > 1) and higher-priority (must > nice) material lands earlier.
 * - Integer minutes per day, no floats (realistic 25–90 min study blocks).
 * - Every question_id in schedule refers to an existing question in questions.
 */
export function allocateSchedule(
  questions: Question[],
  requirements: Requirement[],
  daysAvailable: number
): Schedule {
  if (daysAvailable <= 0) {
    throw new Error("days_available must be a positive integer");
  }

  // Map requirements by ID for fast lookup
  const reqMap = new Map<string, Requirement>();
  requirements.forEach((r) => reqMap.set(r.id, r));

  const mustReqIds = new Set(
    requirements.filter((r) => r.priority === "must").map((r) => r.id)
  );

  // If there are no questions (edge case), return stub days with positive integer minutes
  if (questions.length === 0) {
    const emptyDays: ScheduleDay[] = [];
    for (let d = 1; d <= daysAvailable; d++) {
      emptyDays.push({
        day: d,
        focus: d === 1 ? "Overview and Preparation" : `Day ${d} Review`,
        question_ids: [],
        minutes: 25,
      });
    }
    return { days_available: daysAvailable, days: emptyDays };
  }

  // Scoring function: prioritize must-haves, then difficulty, then category
  function getQuestionScore(q: Question): number {
    let score = 0;
    const coversMust = q.requirement_ids.some((id) => mustReqIds.has(id));
    if (coversMust) score += 1000;
    score += q.difficulty * 100;
    switch (q.category) {
      case "system-design":
        score += 40;
        break;
      case "technical":
        score += 30;
        break;
      case "behavioural":
        score += 20;
        break;
      case "company-fit":
        score += 10;
        break;
    }
    return score;
  }

  // Sorted list of all questions (hardest and highest priority first, with stable ID tiebreaker)
  const sortedQuestions = [...questions].sort((a, b) => {
    const diff = getQuestionScore(b) - getQuestionScore(a);
    if (diff !== 0) return diff;
    return a.id.localeCompare(b.id);
  });

  // 1. Guarantee Must-Have Requirement Coverage First:
  // Identify questions that collectively cover all must-have requirements
  const mustCoverQuestions: Question[] = [];
  const coveredMustIds = new Set<string>();

  for (const q of sortedQuestions) {
    const newlyCovered = q.requirement_ids.filter(
      (rId) => mustReqIds.has(rId) && !coveredMustIds.has(rId)
    );
    if (newlyCovered.length > 0) {
      mustCoverQuestions.push(q);
      newlyCovered.forEach((id) => coveredMustIds.add(id));
    }
  }

  // 2. Assemble ordered queue of questions to schedule:
  // Must-have coverers land first, followed by all remaining sorted questions
  const mustCoverIds = new Set(mustCoverQuestions.map((q) => q.id));
  const remainingQuestions = sortedQuestions.filter((q) => !mustCoverIds.has(q.id));
  const orderedQuestions: Question[] = [...mustCoverQuestions, ...remainingQuestions];

  // 3. Deterministic Non-Overlapping Allocation across daysAvailable
  const dayBuckets: Question[][] = Array.from({ length: daysAvailable }, () => []);
  const assignedQuestionIds = new Set<string>();

  const totalQuestions = orderedQuestions.length;

  if (daysAvailable === 1) {
    // 1-Day Sprint: Assign all ordered questions (strictly unique)
    for (const q of orderedQuestions) {
      if (!assignedQuestionIds.has(q.id)) {
        dayBuckets[0].push(q);
        assignedQuestionIds.add(q.id);
      }
    }
  } else {
    // Multi-day schedule:
    // Determine how many questions each day should receive
    const countsPerDay = new Array<number>(daysAvailable).fill(0);

    if (totalQuestions <= daysAvailable) {
      // More days (or equal days) than questions:
      // Assign at most 1 question per day on the earliest days
      // Later days have 0 question IDs (no artificial duplication)
      for (let i = 0; i < totalQuestions; i++) {
        countsPerDay[i] = 1;
      }
    } else {
      // Fewer days than questions:
      // Distribute questions evenly across available days, with remainders on earlier days
      const base = Math.floor(totalQuestions / daysAvailable);
      const remainder = totalQuestions % daysAvailable;
      for (let d = 0; d < daysAvailable; d++) {
        countsPerDay[d] = base + (d < remainder ? 1 : 0);
      }
    }

    // Assign questions to buckets strictly according to countsPerDay
    let qIdx = 0;
    for (let d = 0; d < daysAvailable; d++) {
      const needed = countsPerDay[d];
      for (let c = 0; c < needed; c++) {
        if (qIdx < orderedQuestions.length) {
          const q = orderedQuestions[qIdx++];
          if (!assignedQuestionIds.has(q.id)) {
            dayBuckets[d].push(q);
            assignedQuestionIds.add(q.id);
          }
        }
      }
    }
  }

  // 4. Build ScheduleDay objects with integer minutes and dynamic contextual focus titles
  const days: ScheduleDay[] = [];
  for (let d = 0; d < daysAvailable; d++) {
    const dayNum = d + 1;
    const bucket = dayBuckets[d];

    // Compute integer minutes:
    // Base 15 mins + (diff 3: 40m, diff 2: 25m, diff 1: 15m)
    let minutes = bucket.reduce((sum, q) => {
      const qTime = q.difficulty === 3 ? 40 : q.difficulty === 2 ? 25 : 15;
      return sum + qTime;
    }, 15);
    minutes = Math.max(25, Math.min(90, Math.round(minutes)));

    const focus = determineDynamicFocus(bucket, dayNum, daysAvailable, reqMap);

    days.push({
      day: dayNum,
      focus,
      question_ids: bucket.map((q) => q.id),
      minutes,
    });
  }

  return { days_available: daysAvailable, days };
}

function determineDynamicFocus(
  bucket: Question[],
  dayNum: number,
  totalDays: number,
  reqMap: Map<string, Requirement>
): string {
  if (totalDays === 1) {
    return "High-Yield Intensive Sprint: Core Must-Haves & Architecture";
  }

  if (bucket.length === 0) {
    if (dayNum === totalDays) {
      return "Final Interview Readiness & Mental Rehearsal";
    }
    if (dayNum === totalDays - 1) {
      return "Mock Interview Preparation & Timed Outlining";
    }

    const reviewThemes = [
      "Flashcard Retention & Core Concept Reinforcement",
      "System Design Review & Architectural Trade-offs",
      "Behavioural Story Practice & STAR Competency Review",
      "Weak Area Review & Targeted Problem Solving",
      "Company & Role Research: Culture & Mission Preparation",
      "Technical Deep-Dive & Edge-Case Review",
      "API Design, Data Contracts & Schema Review",
      "Final Technical Review & Spaced Concept Consolidation",
    ];

    const themeIndex = (dayNum - 1) % reviewThemes.length;
    return `Day ${dayNum}: ${reviewThemes[themeIndex]}`;
  }

  const categories = bucket.map((q) => q.category);
  const hasSys = categories.includes("system-design");
  const hasTech = categories.includes("technical");
  const hasBeh = categories.includes("behavioural");
  const hasFit = categories.includes("company-fit");

  // Derive relevant topics from the questions in today's bucket
  const topics: string[] = [];
  bucket.forEach((q) => {
    q.requirement_ids.forEach((rId) => {
      const req = reqMap.get(rId);
      if (req) {
        if (/kafka|event/i.test(req.text)) topics.push("Event Streaming & Kafka");
        else if (/distributed/i.test(req.text)) topics.push("Distributed Architecture");
        else if (/database|postgresql|clickhouse/i.test(req.text)) topics.push("Databases & Storage");
        else if (/node|typescript/i.test(req.text)) topics.push("Node.js & TypeScript");
        else if (/react|frontend/i.test(req.text)) topics.push("Frontend & Performance");
        else if (/mentor|lead/i.test(req.text)) topics.push("Technical Leadership");
        else if (/kubernetes|terraform/i.test(req.text)) topics.push("Infrastructure & DevOps");
      }
    });
  });
  const uniqueTopic = topics.length > 0 ? topics[0] : "";

  if (dayNum === 1) {
    return uniqueTopic
      ? `Role Foundation & Technical Core: ${uniqueTopic}`
      : "Company Overview, Role Architecture & Foundations";
  }

  if (dayNum === totalDays) {
    return "Final Interview Polish, Weak-Area Review & Peak Readiness";
  }

  if (totalDays >= 14 && dayNum > Math.floor(totalDays * 0.6)) {
    return uniqueTopic
      ? `Spaced Repetition & Deep Recall: ${uniqueTopic}`
      : `Day ${dayNum}: Spaced Technical Review & High-Yield Drill`;
  }

  if (hasSys && hasTech) {
    return uniqueTopic
      ? `System Design & Technical Deep-Dive: ${uniqueTopic}`
      : "System Architecture, Scalability & Trade-offs";
  }
  if (hasSys) {
    return "Distributed Systems, High-Throughput & Fault Tolerance";
  }
  if (hasBeh && hasFit) {
    return "STAR Behavioural Scenarios & Company Culture Alignment";
  }
  if (hasBeh) {
    return "Engineering Leadership, Mentoring & Collaboration Mastery";
  }
  if (hasFit) {
    return "Company Mission, Product Architecture & Impact Fit";
  }
  if (hasTech) {
    return uniqueTopic
      ? `Technical Core Mastery: ${uniqueTopic}`
      : "Technical Implementation & Production Problem Solving";
  }

  return `Day ${dayNum}: Targeted Technical Drill & Practice`;
}
