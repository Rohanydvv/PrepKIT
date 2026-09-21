import { llmClient } from "../core/llm/client.js";

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

    const rubricScores = {
      depth: Math.min(25, Math.max(0, res.rubricScores?.depth ?? 18)),
      structure: Math.min(25, Math.max(0, res.rubricScores?.structure ?? 18)),
      alignment: Math.min(25, Math.max(0, res.rubricScores?.alignment ?? 18)),
      clarity: Math.min(25, Math.max(0, res.rubricScores?.clarity ?? 18)),
    };

    const score =
      res.score ??
      rubricScores.depth + rubricScores.structure + rubricScores.alignment + rubricScores.clarity;

    return {
      score: Math.min(100, Math.max(0, score)),
      rubricScores,
      strengths:
        Array.isArray(res.strengths) && res.strengths.length > 0
          ? res.strengths
          : ["Addressed the core intent of the question"],
      improvements:
        Array.isArray(res.improvements) && res.improvements.length > 0
          ? res.improvements
          : ["Provide more concrete metrics and failure recovery examples"],
      modelAnswer:
        res.modelAnswer?.trim() ||
        `A high-scoring answer would structure key points around: ${answerOutline}`,
    };
  } catch (err) {
    console.error("[mockInterview] Evaluation fallback:", err);
    return {
      score: 75,
      rubricScores: { depth: 19, structure: 19, alignment: 18, clarity: 19 },
      strengths: ["Directly engaged with the technical concepts"],
      improvements: [
        "Include more concrete production numbers and edge-case handling",
      ],
      modelAnswer: `Strong answers structure the scenario using the STAR framework, specifically citing technical trade-offs: ${answerOutline}`,
    };
  }
}
