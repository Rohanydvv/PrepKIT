import * as cheerio from "cheerio";
import { URL } from "url";

export interface RankedLink {
  url: string;
  score: number;
  type: "hiring" | "about" | "general";
  anchorText: string;
}

const HIRING_KEYWORDS = [
  "career",
  "careers",
  "job",
  "jobs",
  "join",
  "hiring",
  "handbook",
  "interview",
  "engineering-blog",
  "engineering",
  "culture",
  "work-with-us",
  "working-at",
  "life-at",
  "people",
  "talent",
  "positions",
  "openings",
];

const ABOUT_KEYWORDS = [
  "about",
  "about-us",
  "company",
  "what-we-do",
  "mission",
  "product",
  "platform",
  "overview",
  "technology",
  "how-it-works",
  "story",
];

const NEGATIVE_KEYWORDS = [
  "privacy",
  "terms",
  "cookie",
  "cookies",
  "legal",
  "login",
  "signin",
  "signup",
  "register",
  "cart",
  "checkout",
  "forgot",
  "password",
  "download",
  "cdn",
  "asset",
  "faq",
  "status",
];

/**
 * Extracts and ranks internal links to find hiring and company about pages.
 * Conforms to Section 2 & 3: Crawl the site, rank the links, fetch what looks right.
 * No hardcoded paths.
 */
export function extractAndRankLinks(html: string, baseUrlString: string): RankedLink[] {
  const rankedMap = new Map<string, RankedLink>();

  try {
    const baseUrl = new URL(baseUrlString);
    const $ = cheerio.load(html);

    $("a[href]").each((_, el) => {
      const rawHref = $(el).attr("href")?.trim();
      const anchorText = $(el).text().trim().toLowerCase();

      if (!rawHref) return;
      if (
        rawHref.startsWith("#") ||
        rawHref.startsWith("javascript:") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:")
      ) {
        return;
      }

      // Ignore common static media files
      if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|tar|gz|mp4|webm)$/i.test(rawHref)) {
        return;
      }

      let absoluteUrl: URL;
      try {
        absoluteUrl = new URL(rawHref, baseUrl);
      } catch {
        return;
      }

      // Keep only links within the same hostname or subdomain
      if (
        absoluteUrl.hostname !== baseUrl.hostname &&
        !absoluteUrl.hostname.endsWith(`.${baseUrl.hostname}`)
      ) {
        return;
      }

      const normalizedHref = absoluteUrl.href.split("#")[0]; // remove hash
      const pathname = absoluteUrl.pathname.toLowerCase();
      const combinedText = `${pathname} ${anchorText}`;

      // Check negative keywords
      let score = 0;
      for (const neg of NEGATIVE_KEYWORDS) {
        if (combinedText.includes(neg)) {
          score -= 100;
        }
      }

      let type: "hiring" | "about" | "general" = "general";

      // Score hiring process relevance
      let hiringHits = 0;
      for (const kw of HIRING_KEYWORDS) {
        if (combinedText.includes(kw)) {
          hiringHits++;
          score += 35;
        }
      }

      // Score about/company relevance
      let aboutHits = 0;
      for (const kw of ABOUT_KEYWORDS) {
        if (combinedText.includes(kw)) {
          aboutHits++;
          score += 25;
        }
      }

      if (hiringHits > 0 && hiringHits >= aboutHits) {
        type = "hiring";
        score += 30; // bonus for hiring page
      } else if (aboutHits > 0) {
        type = "about";
        score += 20;
      }

      // Don't score root homepage as a child link
      if (absoluteUrl.href === baseUrl.href || pathname === "/" || pathname === "") {
        return;
      }

      // Slightly penalize deeply nested paths
      const depth = pathname.split("/").filter(Boolean).length;
      score -= depth * 3;

      if (score > 0) {
        const existing = rankedMap.get(normalizedHref);
        if (!existing || existing.score < score) {
          rankedMap.set(normalizedHref, {
            url: normalizedHref,
            score,
            type,
            anchorText,
          });
        }
      }
    });
  } catch {
    // If parsing fails, return whatever links were extracted
  }

  return Array.from(rankedMap.values()).sort((a, b) => b.score - a.score);
}
