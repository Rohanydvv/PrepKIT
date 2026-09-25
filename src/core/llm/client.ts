import { GoogleGenerativeAI } from "@google/generative-ai";
import axios from "axios";
import { globalRateLimiter } from "./rateLimiter.js";
import { evaluateCandidateAnswerOffline } from "./mockEvaluator.js";
import {
  generateDeterministicQuestions,
  parseRequirementsFromPrompt,
} from "../generation/deterministicQuestions.js";

export interface LLMMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LLMRequestOptions {
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

/**
 * Extracts and cleans JSON from an LLM response string.
 * Removes markdown formatting, code block fences, and trailing commas.
 */
export function extractJsonFromText(rawText: string): unknown {
  let cleaned = rawText.trim();

  // Strip markdown code fences e.g. ```json ... ``` or ``` ... ```
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  }

  // Find first { or [ and last } or ]
  const firstBrace = cleaned.indexOf("{");
  const firstBracket = cleaned.indexOf("[");

  let start = -1;
  let end = -1;

  if (firstBrace !== -1 && (firstBracket === -1 || firstBrace < firstBracket)) {
    start = firstBrace;
    end = cleaned.lastIndexOf("}");
  } else if (firstBracket !== -1) {
    start = firstBracket;
    end = cleaned.lastIndexOf("]");
  }

  if (start !== -1 && end !== -1 && end > start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  // Remove trailing commas before closing braces/brackets
  cleaned = cleaned.replace(/,\s*([}\]])/g, "$1");

  try {
    return JSON.parse(cleaned);
  } catch (err) {
    throw new Error(
      `Failed to parse JSON from model output: ${(err as Error).message}\nRaw content was:\n${cleaned.slice(0, 300)}...`
    );
  }
}

/**
 * Unified LLM Client supporting Google Gemini, Groq, OpenAI, and Offline Heuristic Mock mode.
 */
export class LLMClient {
  private provider: string;

  constructor() {
    this.provider = (process.env.LLM_PROVIDER || "gemini").toLowerCase();
  }

  /**
   * Determine active provider based on environment keys.
   */
  public getActiveProvider(): string {
    if (process.env.LLM_PROVIDER === "mock") return "mock";
    if (process.env.GEMINI_API_KEY) return "gemini";
    if (process.env.GROQ_API_KEY) return "groq";
    if (process.env.OPENAI_API_KEY) return "openai";
    return "mock"; // Default to mock if no keys are provided to ensure clean clone runs
  }

  async generateText(
    systemPrompt: string,
    userPrompt: string,
    options: LLMRequestOptions = {}
  ): Promise<string> {
    const provider = this.getActiveProvider();

    if (provider === "mock") {
      return this.mockGenerate(systemPrompt, userPrompt);
    }

    return globalRateLimiter.executeWithBackoff(async () => {
      switch (provider) {
        case "gemini":
          return await this.callGemini(systemPrompt, userPrompt, options);
        case "groq":
          return await this.callGroq(systemPrompt, userPrompt, options);
        case "openai":
          return await this.callOpenAI(systemPrompt, userPrompt, options);
        default:
          return this.mockGenerate(systemPrompt, userPrompt);
      }
    });
  }

  async generateJson<T>(
    systemPrompt: string,
    userPrompt: string,
    options: LLMRequestOptions = {}
  ): Promise<T> {
    const fullSystemPrompt = `${systemPrompt}\n\nIMPORTANT: You must return ONLY valid, raw JSON. Do not include explanatory text before or after the JSON block. Ensure field names and types match precisely.`;
    const responseText = await this.generateText(fullSystemPrompt, userPrompt, {
      ...options,
      jsonMode: true,
    });
    return extractJsonFromText(responseText) as T;
  }

  private async callGemini(
    systemPrompt: string,
    userPrompt: string,
    options: LLMRequestOptions
  ): Promise<string> {
    const rawKey = process.env.GEMINI_API_KEY || "";
    const apiKey = rawKey.trim().replace(/^["']|["']$/g, "");
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set in environment.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const modelName = process.env.GEMINI_MODEL || "gemini-2.0-flash";

    const model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: systemPrompt,
      generationConfig: {
        temperature: options.temperature ?? 0.3,
        maxOutputTokens: options.maxTokens ?? 4096,
        responseMimeType: options.jsonMode ? "application/json" : "text/plain",
      },
    });

    const result = await model.generateContent(userPrompt);
    const response = await result.response;
    return response.text();
  }

  private async callGroq(
    systemPrompt: string,
    userPrompt: string,
    options: LLMRequestOptions
  ): Promise<string> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) throw new Error("GROQ_API_KEY is not set.");

    const modelName = process.env.GROQ_MODEL || "llama-3.3-70b-versatile";

    const resp = await axios.post(
      "https://api.groq.com/openai/v1/chat/completions",
      {
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 3000,
        response_format: options.jsonMode ? { type: "json_object" } : undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return resp.data.choices[0].message.content;
  }

  private async callOpenAI(
    systemPrompt: string,
    userPrompt: string,
    options: LLMRequestOptions
  ): Promise<string> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error("OPENAI_API_KEY is not set.");

    const modelName = process.env.OPENAI_MODEL || "gpt-4o-mini";

    const resp = await axios.post(
      "https://api.openai.com/v1/chat/completions",
      {
        model: modelName,
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: options.temperature ?? 0.3,
        max_tokens: options.maxTokens ?? 3000,
        response_format: options.jsonMode ? { type: "json_object" } : undefined,
      },
      {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return resp.data.choices[0].message.content;
  }

  /**
   * Smart heuristic mock engine used when no external API key is provided.
   * Produces realistic, schema-compliant JSON based on the user's prompt content.
   */
  private mockGenerate(systemPrompt: string, userPrompt: string): string {
    const p = userPrompt.toLowerCase();

    // 1. Role & Requirement Extraction
    if (systemPrompt.includes("EXTRACT_ROLE_REQUIREMENTS")) {
      const isSenior = /senior|lead|principal|staff|architect/i.test(userPrompt);
      const isJunior = /junior|intern|associate/i.test(userPrompt);
      const seniority = isSenior ? "Senior" : isJunior ? "Junior" : "Mid-Level";

      // Detect title from first line that is not an XML tag
      const lines = userPrompt
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => Boolean(l) && !l.startsWith("<") && !l.endsWith(">"));
      let title = "Software Engineer";
      if (lines.length > 0 && lines[0].length < 60) {
        title = lines[0].replace(/^#+\s*/, "");
      }

      // Extract requirements from bullet points or keywords
      const reqLines: string[] = [];
      lines.forEach((line) => {
        if (/^[-*•]\s+/.test(line) || /require|must|experience|proficiency|strong/i.test(line)) {
          const clean = line.replace(/^[-*•]\s+/, "").trim();
          if (clean.length > 10 && clean.length < 150) {
            reqLines.push(clean);
          }
        }
      });

      // If very thin description (2-line stub), extract ONLY what is there without inventing
      const requirements: Array<{
        id: string;
        text: string;
        kind: "technical" | "behavioural" | "domain";
        priority: "must" | "nice";
      }> = [];

      if (reqLines.length === 0) {
        // Fallback for short stub
        lines.slice(0, 3).forEach((line, idx) => {
          if (line.length > 5) {
            requirements.push({
              id: `r${idx + 1}`,
              text: line,
              kind: /lead|mentor|culture|team/i.test(line)
                ? "behavioural"
                : "technical",
              priority: "must",
            });
          }
        });
      } else {
        reqLines.slice(0, 10).forEach((line, idx) => {
          const isNice = /bonus|preferred|nice to have|plus/i.test(line);
          const isBeh = /mentor|collaborat|team|lead|agile|communication/i.test(line);
          const isDomain = /fintech|healthcare|saas|e-commerce|compliance/i.test(line);

          requirements.push({
            id: `r${idx + 1}`,
            text: line,
            kind: isBeh ? "behavioural" : isDomain ? "domain" : "technical",
            priority: isNice ? "nice" : "must",
          });
        });
      }

      // Ensure at least one must-have requirement
      if (requirements.length > 0 && !requirements.some((r) => r.priority === "must")) {
        requirements[0].priority = "must";
      }

      return JSON.stringify({
        title,
        seniority,
        responsibilities: [
          `Build and architect core systems for the role`,
          `Collaborate with product and cross-functional engineering teams`,
        ],
        requirements,
      });
    }

    // 2. Company Brief Synthesis
    if (systemPrompt.includes("SYNTHESIZE_COMPANY_BRIEF")) {
      const hasCrawledText = userPrompt.includes("<crawled_content>");
      if (hasCrawledText) {
        return JSON.stringify({
          summary: "Modern technology company focused on digital platforms and engineering excellence.",
          what_they_do: "Develops software solutions, scalable backends, and user-facing digital applications.",
        });
      }
      return JSON.stringify({
        summary: "Company information was limited or site was unreachable during research.",
        what_they_do: "Specific operations could not be retrieved from site crawler. Prep is focused on role specifications.",
      });
    }

    // 3. Question Bank Generation
    if (systemPrompt.includes("GENERATE_QUESTIONS")) {
      const requirements = parseRequirementsFromPrompt(userPrompt);
      const questions = generateDeterministicQuestions(
        requirements,
        "Modern technology company",
        0
      );
      return JSON.stringify({ questions });
    }

    // 4. Gap Questions Generation (Second Pass)
    if (systemPrompt.includes("GENERATE_GAP_QUESTIONS")) {
      const requirements = parseRequirementsFromPrompt(userPrompt);
      const questions = generateDeterministicQuestions(
        requirements,
        "Modern technology company",
        0
      );
      return JSON.stringify({ questions });
    }

    // 5. Flashcard Generation
    if (systemPrompt.includes("GENERATE_FLASHCARDS")) {
      return JSON.stringify({
        flashcards: [
          {
            front: "What are the primary trade-offs of microservices vs monolithic architectures?",
            back: "Microservices offer independent scalability and deployment isolation at the cost of operational complexity, distributed tracing overhead, and network latency.",
            requirement_id: "r1",
          },
          {
            front: "Explain the STAR technique for behavioural questions.",
            back: "Situation (context), Task (objective), Action (specific steps YOU took), Result (measurable outcome and lessons learned).",
            requirement_id: "r2",
          },
        ],
      });
    }

    // 6. Mock Interview Evaluation (Offline Heuristic)
    if (systemPrompt.includes("EVALUATE_CANDIDATE_ANSWER")) {
      return JSON.stringify(evaluateCandidateAnswerOffline(userPrompt));
    }

    return "{}";
  }
}

export const llmClient = new LLMClient();
