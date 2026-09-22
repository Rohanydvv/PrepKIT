import { Coverage, Question, Requirement } from "../types.js";

export interface CoverageAnalysis {
  uncoveredIds: string[];
  uncoveredMustHaves: Requirement[];
  uncoveredNiceToHaves: Requirement[];
  coveredCount: number;
  totalRequirements: number;
}

/**
 * Deterministic Coverage Gap Check
 *
 * Implements Section 3 & 4 of the Trao brief:
 * Evaluates which requirements currently have no questions mapped to them.
 * This is 100% deterministic code and must not be handed to the LLM.
 */
export function analyzeCoverage(
  requirements: Requirement[],
  questions: Question[]
): CoverageAnalysis {
  // Collect all requirement IDs referenced by questions
  const coveredReqIdSet = new Set<string>();
  questions.forEach((q) => {
    q.requirement_ids.forEach((id) => coveredReqIdSet.add(id));
  });

  const uncoveredMustHaves: Requirement[] = [];
  const uncoveredNiceToHaves: Requirement[] = [];
  const uncoveredIds: string[] = [];

  requirements.forEach((req) => {
    if (!coveredReqIdSet.has(req.id)) {
      uncoveredIds.push(req.id);
      if (req.priority === "must") {
        uncoveredMustHaves.push(req);
      } else {
        uncoveredNiceToHaves.push(req);
      }
    }
  });

  return {
    uncoveredIds,
    uncoveredMustHaves,
    uncoveredNiceToHaves,
    coveredCount: requirements.length - uncoveredIds.length,
    totalRequirements: requirements.length,
  };
}

/**
 * Executes the second pass loop if any gaps exist.
 *
 * Section 4:
 * "The coverage check exists to force a loop rather than a single shot. After the first draft,
 * the system compares the questions against the requirements, and any requirement with no question
 * against it comes back as a gap. It must then act on those gaps — generating the missing questions
 * — and check again."
 *
 * A kit that ships with uncovered must-have requirements fails the evaluation.
 */
export async function runCoveragePassLoop(
  initialQuestions: Question[],
  requirements: Requirement[],
  generateQuestionsForGaps: (
    missingRequirements: Requirement[],
    existingQuestionCount: number
  ) => Promise<Question[]>,
  maxPasses: number = 2
): Promise<{ questions: Question[]; coverage: Coverage }> {
  let currentQuestions = [...initialQuestions];
  let currentPass = 1;

  let analysis = analyzeCoverage(requirements, currentQuestions);

  // If there are uncovered must-haves (or any uncovered requirements) and passes remain
  while (
    (analysis.uncoveredMustHaves.length > 0 || analysis.uncoveredIds.length > 0) &&
    currentPass < maxPasses
  ) {
    currentPass++;

    // Target the missing requirements (prioritizing must-haves)
    const targets =
      analysis.uncoveredMustHaves.length > 0
        ? analysis.uncoveredMustHaves
        : analysis.uncoveredNiceToHaves;

    const gapQuestions = await generateQuestionsForGaps(
      targets,
      currentQuestions.length
    );

    // Merge in new gap questions
    currentQuestions = [...currentQuestions, ...gapQuestions];

    // Deterministically re-check coverage
    analysis = analyzeCoverage(requirements, currentQuestions);

    // If all must-haves are covered, we have satisfied the primary requirement
    if (analysis.uncoveredMustHaves.length === 0 && analysis.uncoveredIds.length === 0) {
      break;
    }
  }

  return {
    questions: currentQuestions,
    coverage: {
      uncovered_requirement_ids: analysis.uncoveredIds,
      passes: currentPass,
    },
  };
}
