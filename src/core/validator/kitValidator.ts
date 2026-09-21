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
  // 1. Every id must be unique
  // 2. Every question requirement_ids must reference a valid requirement
  // 3. Every schedule question_ids must reference an existing question
  const kit = result.data;
  const integrityErrors: string[] = [];

  const reqIdSet = new Set(kit.role.requirements.map((r) => r.id));
  const questionIdSet = new Set(kit.questions.map((q) => q.id));

  // Check question references
  kit.questions.forEach((q) => {
    q.requirement_ids.forEach((reqId) => {
      if (!reqIdSet.has(reqId)) {
        integrityErrors.push(
          `Question '${q.id}' references non-existent requirement_id '${reqId}'`
        );
      }
    });
  });

  // Check schedule references
  kit.schedule.days.forEach((day) => {
    day.question_ids.forEach((qId) => {
      if (!questionIdSet.has(qId)) {
        integrityErrors.push(
          `Schedule Day ${day.day} references non-existent question_id '${qId}'`
        );
      }
    });
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
