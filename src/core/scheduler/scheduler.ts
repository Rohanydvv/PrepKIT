import { Question, Requirement, Schedule, ScheduleDay } from "../types.js";

/**
 * Deterministic Arithmetic Schedule Allocator
 *
 * Implements Section 8 of the Trao brief:
 * - Pure arithmetic and allocation (not handed to an LLM).
 * - Exact days: number of days in schedule === days_available.
 * - Every must-have requirement appears somewhere in the schedule.
 * - Harder (difficulty 3 > 2 > 1) and higher-priority (must > nice) material lands earlier.
 * - Integer minutes per day, no floats.
 * - Every question_id in schedule refers to an existing question.
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

  // Score each question for sorting:
  // - Covers must-have requirement: +1000
  // - Difficulty: difficulty * 100 (diff 3: 300, diff 2: 200, diff 1: 100)
  // - Category priority: system-design (40), technical (30), behavioural (20), company-fit (10)
  function getQuestionScore(q: Question): number {
    let score = 0;
    const hasMust = q.requirement_ids.some((id) => mustReqIds.has(id));
    if (hasMust) score += 1000;
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

  // Sort descending: highest priority and hardest first
  const sortedQuestions = [...questions].sort(
    (a, b) => getQuestionScore(b) - getQuestionScore(a)
  );

  // If there are no questions (e.g. edge case), produce stub days
  if (sortedQuestions.length === 0) {
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

  // Allocate questions across days:
  // We need exactly daysAvailable days.
  const days: ScheduleDay[] = [];
  const dayBuckets: Question[][] = Array.from({ length: daysAvailable }, () => []);

  // Strategy:
  // 1. If questions.length >= daysAvailable:
  //    Distribute questions across buckets such that earlier buckets get higher scored items.
  // 2. If questions.length < daysAvailable:
  //    Put questions on earlier days, and later days serve as reinforcement, mock drills,
  //    and spaced repetition review of the highest-yield questions.
  if (sortedQuestions.length >= daysAvailable) {
    // Normal distribution
    const baseCount = Math.floor(sortedQuestions.length / daysAvailable);
    const remainder = sortedQuestions.length % daysAvailable;

    let qIdx = 0;
    for (let d = 0; d < daysAvailable; d++) {
      const countForDay = baseCount + (d < remainder ? 1 : 0);
      for (let i = 0; i < countForDay && qIdx < sortedQuestions.length; i++) {
        dayBuckets[d].push(sortedQuestions[qIdx++]);
      }
    }
  } else {
    // Fewer questions than days (e.g. 5 questions for 14 days, or 60 days edge case)
    // First, place each question on its initial deep dive day
    for (let i = 0; i < sortedQuestions.length; i++) {
      dayBuckets[i].push(sortedQuestions[i]);
    }
    // For remaining days, allocate review cycles / spaced repetitions
    for (let d = sortedQuestions.length; d < daysAvailable; d++) {
      // Pick questions based on round-robin of hardest / must-have questions
      const pickIndex = (d - sortedQuestions.length) % sortedQuestions.length;
      dayBuckets[d].push(sortedQuestions[pickIndex]);
    }
  }

  // Ensure every must-have requirement appears somewhere in the schedule
  const scheduledQuestionIds = new Set<string>();
  dayBuckets.forEach((bucket) => {
    bucket.forEach((q) => scheduledQuestionIds.add(q.id));
  });

  const scheduledReqIds = new Set<string>();
  scheduledQuestionIds.forEach((qId) => {
    const q = questions.find((item) => item.id === qId);
    if (q) {
      q.requirement_ids.forEach((rId) => scheduledReqIds.add(rId));
    }
  });

  // Check if any must-have is missing from scheduled questions
  for (const mustId of mustReqIds) {
    if (!scheduledReqIds.has(mustId)) {
      // Find a question in original list covering this must-have
      const matchingQ = questions.find((q) => q.requirement_ids.includes(mustId));
      if (matchingQ) {
        // Add to Day 1
        if (!dayBuckets[0].some((q) => q.id === matchingQ.id)) {
          dayBuckets[0].unshift(matchingQ);
        }
      }
    }
  }

  // Generate human-friendly focus title and integer minutes for each day
  for (let d = 0; d < daysAvailable; d++) {
    const dayQuestions = dayBuckets[d];
    const dayNum = d + 1;

    // Calculate integer minutes:
    // Base 20 mins for warmup + 20 mins per diff 1, 30 mins per diff 2, 45 mins per diff 3
    let minutes = 0;
    if (dayQuestions.length === 0) {
      minutes = 30;
    } else {
      minutes = dayQuestions.reduce((sum, q) => {
        const timePerQ = q.difficulty === 3 ? 40 : q.difficulty === 2 ? 25 : 15;
        return sum + timePerQ;
      }, 15); // 15 mins base setup
    }

    // Ensure strictly integer minutes
    minutes = Math.max(20, Math.round(minutes));

    // Determine focus
    const focus = determineDayFocus(dayQuestions, dayNum, daysAvailable);

    days.push({
      day: dayNum,
      focus,
      question_ids: dayQuestions.map((q) => q.id),
      minutes,
    });
  }

  return {
    days_available: daysAvailable,
    days,
  };
}

function determineDayFocus(
  questions: Question[],
  dayNum: number,
  totalDays: number
): string {
  if (questions.length === 0) {
    return totalDays === 1 ? "Comprehensive Crash Prep" : `Day ${dayNum}: Deep Review & Synthesis`;
  }

  const categories = questions.map((q) => q.category);
  const techCount = categories.filter((c) => c === "technical").length;
  const sysCount = categories.filter((c) => c === "system-design").length;
  const behCount = categories.filter((c) => c === "behavioural").length;
  const fitCount = categories.filter((c) => c === "company-fit").length;

  if (totalDays === 1) {
    return "High-Yield Intensive Preparation: Core Must-Haves & Architecture";
  }

  if (dayNum === 1) {
    if (sysCount > 0 || techCount > 0) {
      return "Core Architecture & High-Priority Technical Foundations";
    }
    return "Foundational Role Competencies";
  }

  if (dayNum === totalDays) {
    return "Final Polish, Company Alignment & Mindset Preparation";
  }

  if (sysCount >= Math.max(techCount, behCount, fitCount)) {
    return "System Architecture, Scalability & Trade-offs";
  }
  if (techCount >= Math.max(sysCount, behCount, fitCount)) {
    return "Technical Deep-Dives, Problem Solving & Algorithms";
  }
  if (behCount >= Math.max(techCount, sysCount, fitCount)) {
    return "Behavioural Mastery, STAR Stories & Leadership Scenarios";
  }
  if (fitCount > 0) {
    return "Company Mission, Values & Culture Alignment";
  }

  return `Day ${dayNum}: Targeted Knowledge Drill`;
}
