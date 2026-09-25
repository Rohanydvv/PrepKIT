import { llmClient } from "../core/llm/client.js";
import { evaluateCandidateAnswerOffline } from "../core/llm/mockEvaluator.js";

export interface MockInterviewEvaluation {
  score: number; // 0 to 100
  rubricScores: {
    depth: number; // 0 to 25
    structure: number; // 0 to 25
    alignment: number; // 0 to 25
    clarity: number; // 0 to 25
  };
  strengths: string[];
  improvements: string[];
  modelAnswer: string;
}

const EVALUATION_SYSTEM_PROMPT = `YOU ARE A PRINCIPAL TECH LEAD AND EXECUTIVE INTERVIEW COACH.
[SYSTEM: EVALUATE_CANDIDATE_ANSWER]

TASK:
Evaluate the candidate's spoken or written answer against the interview question and rubric outline.

4-POINT RUBRIC (25 points each, total 100):
1. Depth & Accuracy (0-25): Technical correctness, specific examples, absence of hand-waving.
2. Structure (0-25): STAR method (Situation, Task, Action, Result) for behavioural, or systematic decomposition for technical/system-design.
3. Role & Business Alignment (0-25): Focus on engineering impact, team dynamics, business value.
4. Clarity & Precision (0-25): Concise, professional communication without excessive filler.

OUTPUT FORMAT:
Return valid JSON:
{
  "score": 85,
  "rubricScores": {
    "depth": 22,
    "structure": 21,
    "alignment": 20,
    "clarity": 22
  },
  "strengths": ["Clear explanation of caching trade-offs", "Highlighted specific past metrics"],
  "improvements": ["Elaborate on how you handled distributed lock timeouts"],
  "modelAnswer": "Here is an exemplary STAR response demonstrating mastery..."
}
`;

export async function evaluateCandidateAnswer(
  questionPrompt: string,
  category: string,
  answerOutline: string,
  candidateAnswer: string
): Promise<MockInterviewEvaluation> {
  const userPrompt = `Question Category: ${category}
Question: ${questionPrompt}
Expected Key Points: ${answerOutline}

Candidate Answer:
"${candidateAnswer}"

Evaluate this answer and provide scores and coaching feedback.`;

  try {
    const res = await llmClient.generateJson<MockInterviewEvaluation>(
      EVALUATION_SYSTEM_PROMPT,
      userPrompt
    );

    const rawScores = res.rubricScores || ({} as any);
    const rubricScores = {
      depth: Math.min(25, Math.max(0, Math.round(Number(rawScores.depth)) || 0)),
      structure: Math.min(25, Math.max(0, Math.round(Number(rawScores.structure)) || 0)),
      alignment: Math.min(25, Math.max(0, Math.round(Number(rawScores.alignment)) || 0)),
      clarity: Math.min(25, Math.max(0, Math.round(Number(rawScores.clarity)) || 0)),
    };

    const score =
      rubricScores.depth + rubricScores.structure + rubricScores.alignment + rubricScores.clarity;

    return {
      score: Math.min(100, Math.max(0, score)),
      rubricScores,
      strengths:
        Array.isArray(res.strengths) && res.strengths.length > 0
          ? res.strengths
          : ["Engaged directly with the interview prompt."],
      improvements:
        Array.isArray(res.improvements) && res.improvements.length > 0
          ? res.improvements
          : ["Expand the response with more concrete implementation details."],
      modelAnswer:
        res.modelAnswer?.trim() ||
        `A high-scoring answer would structure key points around: ${answerOutline}`,
    };
  } catch (err) {
    console.warn(
      "[mockInterview] Online evaluation error or fallback, using genuine offline evaluator:",
      (err as Error).message
    );
    return evaluateCandidateAnswerOffline({
      category,
      questionPrompt,
      answerOutline,
      candidateAnswer,
    });
  }
}
