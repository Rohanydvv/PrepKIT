import {
  BatchCaseInput,
  BatchCaseInputSchema,
  BatchOutput,
  BatchOutputSchema,
  InterviewKit,
  InterviewKitSchema,
} from "../types.js";

/**
 * Validates a generated kit strictly against Appendix A.
 * Throws a descriptive error or returns typed InterviewKit.
 */
export function validateInterviewKit(data: unknown): {
  success: boolean;
  data?: InterviewKit;
  errors?: string[];
} {
  const result = InterviewKitSchema.safeParse(data);
  if (!result.success) {
    const errorDetails = result.error.errors.map(
      (e) => `[${e.path.join(".")}] ${e.message}`
    );
    return {
      success: false,
      errors: errorDetails,
    };
  }

  // Cross-reference integrity checks:
  // 1. Every id must be unique (requirements, questions, flashcards)
  // 2. Every question requirement_ids must reference a valid requirement
  // 3. Every flashcard requirement_ids must reference a valid requirement
  // 4. Schedule days count must exactly equal days_available
  // 5. Schedule days must be sequential (1..N) with positive integer minutes
  // 6. Every schedule question_ids must reference an existing question
  // 7. Must-have requirements must be covered in the question bank
  const kit = result.data;
  const integrityErrors: string[] = [];

  // Check unique requirement IDs
  const reqIdSet = new Set<string>();
  kit.role.requirements.forEach((r) => {
    if (reqIdSet.has(r.id)) {
      integrityErrors.push(`Duplicate requirement ID: '${r.id}'`);
    }
    reqIdSet.add(r.id);
  });

  // Check unique question IDs
  const questionIdSet = new Set<string>();
  kit.questions.forEach((q) => {
    if (questionIdSet.has(q.id)) {
      integrityErrors.push(`Duplicate question ID: '${q.id}'`);
    }
    questionIdSet.add(q.id);
  });

  // Check unique flashcard IDs
  const flashcardIdSet = new Set<string>();
  kit.flashcards.forEach((fc) => {
    if (flashcardIdSet.has(fc.id)) {
      integrityErrors.push(`Duplicate flashcard ID: '${fc.id}'`);
    }
    flashcardIdSet.add(fc.id);
  });

  // Check question references
  const coveredReqIds = new Set<string>();
  kit.questions.forEach((q) => {
    q.requirement_ids.forEach((reqId) => {
      if (!reqIdSet.has(reqId)) {
        integrityErrors.push(
          `Question '${q.id}' references non-existent requirement_id '${reqId}'`
        );
      } else {
        coveredReqIds.add(reqId);
      }
    });
  });

  // Check flashcard references
  kit.flashcards.forEach((fc) => {
    fc.requirement_ids.forEach((reqId) => {
      if (!reqIdSet.has(reqId)) {
        integrityErrors.push(
          `Flashcard '${fc.id}' references non-existent requirement_id '${reqId}'`
        );
      }
    });
  });

  // Check schedule day count matches days_available
  if (kit.schedule.days.length !== kit.schedule.days_available) {
    integrityErrors.push(
      `Schedule days count (${kit.schedule.days.length}) does not match days_available (${kit.schedule.days_available})`
    );
  }

  // Check schedule day ordering, integer minutes, and references
  kit.schedule.days.forEach((day, idx) => {
    const expectedDay = idx + 1;
    if (day.day !== expectedDay) {
      integrityErrors.push(
        `Schedule day at index ${idx} has day number ${day.day}, expected ${expectedDay}`
      );
    }
    if (!Number.isInteger(day.minutes) || day.minutes <= 0) {
      integrityErrors.push(
        `Schedule Day ${day.day} minutes must be a positive integer, got ${day.minutes}`
      );
    }
    day.question_ids.forEach((qId) => {
      if (!questionIdSet.has(qId)) {
        integrityErrors.push(
          `Schedule Day ${day.day} references non-existent question_id '${qId}'`
        );
      }
    });
  });

  // Verify that must-have requirements have question coverage
  const mustReqs = kit.role.requirements.filter((r) => r.priority === "must");
  mustReqs.forEach((mReq) => {
    if (!coveredReqIds.has(mReq.id)) {
      integrityErrors.push(
        `Must-have requirement '${mReq.id}' ("${mReq.text.slice(0, 50)}") has no covering question in question bank`
      );
    }
  });

  if (integrityErrors.length > 0) {
    return {
      success: false,
      errors: integrityErrors,
    };
  }

  return {
    success: true,
    data: kit,
  };
}

/**
 * Validates batch cases input array against schema.
 */
export function validateBatchCasesInput(data: unknown): {
  success: boolean;
  data?: BatchCaseInput[];
  errors?: string[];
} {
  if (!Array.isArray(data)) {
    return { success: false, errors: ["Input must be a JSON array of cases"] };
  }

  const errors: string[] = [];
  const parsedCases: BatchCaseInput[] = [];

  data.forEach((item, idx) => {
    const res = BatchCaseInputSchema.safeParse(item);
    if (!res.success) {
      errors.push(
        `Case index ${idx}: ${res.error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", ")}`
      );
    } else {
      parsedCases.push(res.data);
    }
  });

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data: parsedCases };
}

/**
 * Validates batch output against Appendix B.
 */
export function validateBatchOutput(data: unknown): {
  success: boolean;
  data?: BatchOutput;
  errors?: string[];
} {
  const res = BatchOutputSchema.safeParse(data);
  if (!res.success) {
    return {
      success: false,
      errors: res.error.errors.map((e) => `[${e.path.join(".")}] ${e.message}`),
    };
  }
  return { success: true, data: res.data };
}
