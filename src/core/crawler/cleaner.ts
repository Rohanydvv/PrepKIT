import * as cheerio from "cheerio";

export interface CleanedPage {
  title: string;
  text: string;
  charCount: number;
}

const MAX_PAGE_TEXT_CHARS = 12000; // Limit to protect context window and free tier TPM

/**
 * Cleans HTML content into concise, semantic text (Section 11).
 * Eliminates boilerplate navigation, scripts, styles, and protects against prompt injection.
 */
export function cleanHtml(html: string): CleanedPage {
  if (!html) {
    return { title: "", text: "", charCount: 0 };
  }

  const $ = cheerio.load(html);

  // Remove noise elements
  $(
    "script, style, svg, noscript, nav, footer, header, aside, form, iframe, object, embed"
  ).remove();
  $(
    "[role='navigation'], [role='banner'], [role='contentinfo'], .cookie-banner, #cookie-consent"
  ).remove();

  const title = $("title").first().text().trim() || "";

  // Collect text from headings, paragraphs, and lists
  const contentParts: string[] = [];

  $("h1, h2, h3, h4, p, li, article, section").each((_, el) => {
    const text = $(el).text().replace(/\s+/g, " ").trim();
    if (text.length > 20) {
      contentParts.push(text);
    }
  });

  // If specific semantic tags yielded little, fall back to body text
  let combinedText = contentParts.join("\n\n");
  if (combinedText.length < 100) {
    combinedText = $("body").text().replace(/\s+/g, " ").trim();
  }

  // Truncate cleanly
  if (combinedText.length > MAX_PAGE_TEXT_CHARS) {
    combinedText = combinedText.substring(0, MAX_PAGE_TEXT_CHARS) + "\n...[truncated]";
  }

  // Neutralize common prompt injection directives by escaping markdown delimiter triggers
  const sanitizedText = sanitizeUntrustedContent(combinedText);

  return {
    title,
    text: sanitizedText,
    charCount: sanitizedText.length,
  };
}

/**
 * Security: Neutralizes prompt injection patterns in untrusted scraped/pasted text (Section 11).
 */
export function sanitizeUntrustedContent(content: string): string {
  if (!content) return "";

  return content
    .replace(/<\/?system>/gi, "[system]")
    .replace(/<\/?prompt>/gi, "[prompt]")
    .replace(/<\/?instruction>/gi, "[instruction]")
    .replace(/<\|im_start\|>|<\|im_end\|>|<\|system\|>|<\|user\|>|<\|assistant\|>/gi, "[delimiter]")
    .replace(/(?:ignore|disregard|forget)\s+(?:all\s+)?(?:previous|prior|above)\s+(?:instructions|prompts|rules)/gi, "[neutralized directive]")
    .replace(/(?:you\s+are\s+now\s+(?:in\s+)?|act\s+as\s+|switch\s+to\s+)?(?:developer\s+mode|dan\s+mode|unrestricted\s+mode)/gi, "[neutralized directive]")
    .replace(/(?:system\s*prompt\s*:|new\s*instructions\s*:)/gi, "[neutralized header]:")
    .trim();
}
