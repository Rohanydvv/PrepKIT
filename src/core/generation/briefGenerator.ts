import { llmClient } from "../llm/client.js";
import { CompanyBrief } from "../types.js";
import { CrawledResult } from "../crawler/crawler.js";
import { PublicDiscussionResult } from "../crawler/publicDiscussion.js";

const SYSTEM_PROMPT = `YOU ARE AN OBJECTIVE CORPORATE INTELLIGENCE RESEARCHER.
[SYSTEM: SYNTHESIZE_COMPANY_BRIEF]

TASK:
Synthesize an accurate company brief based ONLY on the crawled website content and public discussion notes provided.

RULES:
1. TRUTHFULNESS:
   - If the crawled text is empty, unavailable, or unreachable, DO NOT fabricate company information.
   - Report honestly that details could not be retrieved.
2. OUTPUT FORMAT:
   Return valid JSON matching this exact structure:
   {
     "summary": "High-level overview of the company, mission, and current scale.",
     "what_they_do": "Concrete explanation of products, services, target audience, and engineering stack."
   }
`;

export async function generateCompanyBrief(
  crawledResult: CrawledResult,
  discussionResult: PublicDiscussionResult,
  companyName: string
): Promise<CompanyBrief> {
  const sources = [...crawledResult.pagesUsed];
  if (discussionResult.sources.length > 0) {
    sources.push(...discussionResult.sources);
  }

  // Handle unreachable or missing site honestly (Section 10)
  if (!crawledResult.isReachable || crawledResult.pagesUsed.length === 0) {
    return {
      summary: `Website retrieval was unavailable for ${companyName || "the specified company URL"}. No external pages could be analyzed.`,
      what_they_do: `Detailed business and platform information could not be verified from the crawler. Interview preparation is centered on role requirements and industry-standard practices.`,
      sources: [],
    };
  }

  // Assemble context from crawled pages
  const contextSections: string[] = [];
  if (crawledResult.homepage?.text) {
    contextSections.push(`### Homepage Overview\n${crawledResult.homepage.text.slice(0, 3000)}`);
  }
  if (crawledResult.aboutPage?.text) {
    contextSections.push(`### About Page Details\n${crawledResult.aboutPage.text.slice(0, 3000)}`);
  }
  if (crawledResult.hiringPage?.text) {
    contextSections.push(`### Careers/Hiring Overview\n${crawledResult.hiringPage.text.slice(0, 3000)}`);
  }
  if (discussionResult.found && discussionResult.summary) {
    contextSections.push(`### Public Discussion Insights\n${discussionResult.summary}`);
  }

  const userPrompt = `Company: ${companyName || "Target Company"}
URL: ${crawledResult.baseUrl}

<crawled_content>
${contextSections.join("\n\n")}
</crawled_content>

Synthesize the company brief based on the above retrieved data.`;

  try {
    const briefData = await llmClient.generateJson<{
      summary?: string;
      what_they_do?: string;
    }>(SYSTEM_PROMPT, userPrompt);

    return {
      summary:
        briefData.summary?.trim() ||
        `${companyName || "The company"} provides technology solutions based on retrieved site data.`,
      what_they_do:
        briefData.what_they_do?.trim() ||
        "Builds and maintains software infrastructure and customer platforms.",
      sources,
    };
  } catch (err) {
    console.error("[briefGenerator] Fallback brief generation on error:", err);
    return {
      summary: `${companyName || "The company"} operates the website at ${crawledResult.baseUrl}.`,
      what_they_do: "Develops digital products and services according to available site data.",
      sources,
    };
  }
}
