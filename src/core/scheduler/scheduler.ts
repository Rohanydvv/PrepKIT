import { Question, Requirement, Schedule, ScheduleDay } from "../types.js";

/**
 * Deterministic Arithmetic Schedule Allocator
 *
 * Implements Section 8 of the Trao brief:
 * - Pure arithmetic and allocation (not handed to an LLM).
 * - Exact days: number of days in schedule === days_available (supports 1 to 60 days).
 * - Every must-have requirement appears somewhere in the schedule.
 * - Harder (difficulty 3 > 2 > 1) and higher-priority (must > nice) material lands earlier.
 * - Integer minutes per day, no floats (realistic 20–90 min study blocks).
 * - Every question_id in schedule refers to an existing question in questions.
 * - Progressive multi-phase tracks scaling dynamically from 1-day sprints to 60-day mastery tracks.
 * - Spaced repetition without repetitive identical single-question days.
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

  // If there are no questions (edge case), return stub days
  if (questions.length === 0) {
    const emptyDays: ScheduleDay[] = [];
    for (let d = 1; d <= daysAvailable; d++) {
      emptyDays.push({
        day: d,
        focus: d === 1 ? "Overview and Preparation" : `Day ${d} Review`,
        question_ids: [],
        minutes: 30,
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

  // Sorted list of all questions (hardest and highest priority first)
  const sortedQuestions = [...questions].sort(
    (a, b) => getQuestionScore(b) - getQuestionScore(a)
  );

  // Categorize questions
  const sysDesignQs = sortedQuestions.filter((q) => q.category === "system-design");
  const techQs = sortedQuestions.filter((q) => q.category === "technical");
  const behQs = sortedQuestions.filter((q) => q.category === "behavioural");
  const fitQs = sortedQuestions.filter((q) => q.category === "company-fit");

  const dayBuckets: Question[][] = Array.from({ length: daysAvailable }, () => []);

  // --- CASE 1: 1-Day Schedule ---
  if (daysAvailable === 1) {
    // Pack high-yield sprint: top system design/hard tech + core tech + behavioural + company fit
    const chosen: Question[] = [];
    if (sysDesignQs.length > 0) chosen.push(sysDesignQs[0]);
    if (techQs.length > 0) chosen.push(techQs[0]);
    if (behQs.length > 0) chosen.push(behQs[0]);
    if (fitQs.length > 0) chosen.push(fitQs[0]);

    // Fill up to 6 questions prioritizing must-haves
    for (const q of sortedQuestions) {
      if (chosen.length >= 6) break;
      if (!chosen.some((c) => c.id === q.id)) {
        chosen.push(q);
      }
    }

    dayBuckets[0] = chosen.length > 0 ? chosen : sortedQuestions.slice(0, 4);
  }
  // --- CASE 2: 2 to 4 Days (Short Sprint) ---
  else if (daysAvailable <= 4) {
    if (daysAvailable === 2) {
      dayBuckets[0] = [...sysDesignQs.slice(0, 2), ...techQs.slice(0, 2)];
      dayBuckets[1] = [...behQs.slice(0, 2), ...fitQs.slice(0, 1), ...techQs.slice(2, 4)];
    } else if (daysAvailable === 3) {
      dayBuckets[0] = [...techQs.slice(0, 3), ...fitQs.slice(0, 1)];
      dayBuckets[1] = [...sysDesignQs.slice(0, 3), ...techQs.slice(3, 4)];
      dayBuckets[2] = [...behQs.slice(0, 2), ...sysDesignQs.slice(0, 1)];
    } else {
      // 4 days
      dayBuckets[0] = [...fitQs.slice(0, 1), ...techQs.slice(0, 2)];
      dayBuckets[1] = [...techQs.slice(2, 4), ...sysDesignQs.slice(0, 1)];
      dayBuckets[2] = [...sysDesignQs.slice(1, 3)];
      dayBuckets[3] = [...behQs.slice(0, 2), ...techQs.slice(0, 1)];
    }
  }
  // --- CASE 3: 5 to 7 Days (Standard Progressive Track) ---
  else if (daysAvailable <= 7) {
    // Day 1: Company Context & Foundational Technical Skills
    dayBuckets[0] = [
      ...fitQs.slice(0, 1),
      ...(techQs.length > 0 ? techQs.slice(0, 2) : sortedQuestions.slice(0, 2)),
    ];
    // Day 2: Core Must-Have Technical Deep Dives
    const day2Pool = techQs.slice(2);
    dayBuckets[1] = day2Pool.length > 0
      ? day2Pool.slice(0, 3)
      : techQs.length > 1
      ? [techQs[1], ...(sysDesignQs.slice(0, 1))]
      : sortedQuestions.slice(1, 3);
    // Day 3: System Design & Scalability Trade-offs
    dayBuckets[2] = sysDesignQs.length > 0 ? sysDesignQs.slice(0, 3) : sortedQuestions.slice(0, 2);
    // Day 4: Behavioural & Leadership (STAR scenarios)
    dayBuckets[3] = behQs.length > 0 ? behQs.slice(0, 3) : sortedQuestions.slice(2, 4);
    // Day 5: Spaced Review of Highest-Yield Technical Items + Polish
    dayBuckets[4] = [
      ...(sysDesignQs.length > 0 ? [sysDesignQs[0]] : []),
      ...(techQs.length > 0 ? [techQs[0]] : []),
      ...(behQs.length > 0 ? [behQs[0]] : []),
    ];

    if (daysAvailable >= 6) {
      dayBuckets[5] = [...sortedQuestions.slice(1, 4)];
    }
    if (daysAvailable === 7) {
      dayBuckets[6] = [
        ...(fitQs.length > 0 ? [fitQs[0]] : []),
        ...(sortedQuestions.length > 0 ? [sortedQuestions[0]] : []),
      ];
    }
  }
  // --- CASE 4: 8 to 14 Days (Expanded 2-Week Mastery Track) ---
  else if (daysAvailable <= 14) {
    // Structured across 4 phases:
    // Days 1-3: Foundations & Core Technical Domains
    // Days 4-7: Advanced System Architecture & Complex Problem Solving
    // Days 8-10: Behavioural Scenarios, STAR Leadership & Culture Fit
    // Days 11-14: Spaced Repetition, Weak-Area Drills & Final Mock Readiness
    for (let d = 0; d < daysAvailable; d++) {
      if (d < 3) {
        const start = d * 2;
        dayBuckets[d] = techQs.slice(start, start + 2);
      } else if (d < 7) {
        const sysIdx = (d - 3) % Math.max(1, sysDesignQs.length);
        const techIdx = (d - 3) % Math.max(1, techQs.length);
        dayBuckets[d] = [
          ...(sysDesignQs.length > 0 ? [sysDesignQs[sysIdx]] : []),
          ...(techQs.length > 0 ? [techQs[techIdx]] : []),
        ];
      } else if (d < 10) {
        const behIdx = (d - 7) % Math.max(1, behQs.length);
        dayBuckets[d] = [
          ...(behQs.length > 0 ? [behQs[behIdx]] : []),
          ...(fitQs.length > 0 ? [fitQs[0]] : []),
        ];
      } else {
        const reviewIdx = (d - 10) % Math.max(1, sortedQuestions.length);
        dayBuckets[d] = [sortedQuestions[reviewIdx]];
      }
    }
  }
  // --- CASE 5: 15 to 60 Days (Comprehensive Long-Horizon Track) ---
  else {
    // Ebbinghaus Spaced Repetition Schedule:
    // Multi-week blocks:
    // Block 1 (First 25% of days): Systematic First Pass of all topics
    // Block 2 (25% to 50% of days): Deep Dives into Architecture & Edge Cases
    // Block 3 (50% to 75% of days): Spaced Review & Behavioural Integration
    // Block 4 (75% to 100% of days): Mock Interview Sim & Peak Readiness
    const total = sortedQuestions.length;
    for (let d = 0; d < daysAvailable; d++) {
      const dayProgress = d / daysAvailable;

      if (dayProgress < 0.25) {
        const qIdx = d % total;
        dayBuckets[d] = [sortedQuestions[qIdx]];
      } else if (dayProgress < 0.5) {
        const pool = [...sysDesignQs, ...techQs];
        const pIdx = (d - Math.floor(daysAvailable * 0.25)) % Math.max(1, pool.length);
        dayBuckets[d] = pool.length > 0 ? [pool[pIdx]] : [sortedQuestions[d % total]];
      } else if (dayProgress < 0.75) {
        const pool = [...behQs, ...sortedQuestions];
        const pIdx = (d - Math.floor(daysAvailable * 0.5)) % Math.max(1, pool.length);
        dayBuckets[d] = pool.length > 0 ? [pool[pIdx]] : [sortedQuestions[d % total]];
      } else {
        const topQuestions = sortedQuestions.slice(0, Math.min(5, total));
        const pIdx = d % Math.max(1, topQuestions.length);
        dayBuckets[d] = [topQuestions[pIdx]];
      }
    }
  }

  // Post-processing & Sanity:
  // 1. Ensure no bucket is empty (assign at least 1 question)
  for (let d = 0; d < daysAvailable; d++) {
    if (dayBuckets[d].length === 0) {
      const fallbackIdx = d % sortedQuestions.length;
      dayBuckets[d].push(sortedQuestions[fallbackIdx]);
    }
  }

  // 2. Anti-adjacent duplicate prevention: avoid consecutive days having the same single question
  if (sortedQuestions.length > 1) {
    for (let d = 1; d < daysAvailable; d++) {
      if (
        dayBuckets[d].length === 1 &&
        dayBuckets[d - 1].length === 1 &&
        dayBuckets[d][0].id === dayBuckets[d - 1][0].id
      ) {
        const altQ = sortedQuestions.find((q) => q.id !== dayBuckets[d][0].id);
        if (altQ) {
          dayBuckets[d] = [altQ];
        }
      }
    }
  }

  // 3. Ensure every must-have requirement is represented somewhere in the schedule
  const scheduledQuestionIds = new Set<string>();
  dayBuckets.forEach((bucket) => bucket.forEach((q) => scheduledQuestionIds.add(q.id)));

  const scheduledReqIds = new Set<string>();
  scheduledQuestionIds.forEach((qId) => {
    const q = questions.find((item) => item.id === qId);
    if (q) q.requirement_ids.forEach((rId) => scheduledReqIds.add(rId));
  });

  for (const mustId of mustReqIds) {
    if (!scheduledReqIds.has(mustId)) {
      const matchingQ = questions.find((q) => q.requirement_ids.includes(mustId));
      if (matchingQ) {
        dayBuckets[0].unshift(matchingQ);
        scheduledReqIds.add(mustId);
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
