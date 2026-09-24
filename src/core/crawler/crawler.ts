import axios, { AxiosRequestConfig } from "axios";
import { URL } from "url";
import { isSafeUrl } from "./ssrf.js";
import { fetchRobotsPolicy, isPathAllowed } from "./robots.js";
import { extractAndRankLinks } from "./ranker.js";
import { cleanHtml, CleanedPage } from "./cleaner.js";

export interface CrawledResult {
  baseUrl: string;
  isReachable: boolean;
  pagesUsed: string[];
  homepage?: CleanedPage;
  hiringPage?: CleanedPage & { url: string };
  aboutPage?: CleanedPage & { url: string };
  error?: string;
  notes: string[];
}

const AXIOS_TIMEOUT = 6000;
const MAX_RETRIES = 2;

async function fetchWithRetry(url: string, retries = MAX_RETRIES): Promise<string | null> {
  const config: AxiosRequestConfig = {
    timeout: AXIOS_TIMEOUT,
    headers: {
      "User-Agent": "PrepKitBot/1.0 (+https://github.com/Rohanydvv/PrepKIT)",
      Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.8",
    },
    maxContentLength: 2 * 1024 * 1024, // 2MB max response
    validateStatus: (status) => status >= 200 && status < 300,
  };

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const resp = await axios.get(url, config);
      return String(resp.data);
    } catch (err: unknown) {
      if (attempt === retries) {
        return null;
      }
      // Exponential backoff with small delay
      await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  return null;
}

/**
 * Intelligent Multi-Page Web Crawler (Sections 2, 3, 10, 11)
 *
 * 1. Checks SSRF safety.
 * 2. Fetches company landing page with retry and timeout.
 * 3. Handles unreachable sites gracefully (returns isReachable: false without throwing).
 * 4. Obeys robots.txt.
 * 5. Uses heuristic link ranking to discover buried career/handbook/about pages.
 * 6. Follows relative links accurately without hostname assumptions.
 * 7. Extracts and cleans semantic text, sanitizing prompt injections.
 */
export async function crawlCompanySite(
  companyUrlInput: string,
  options?: { allowLocalhost?: boolean }
): Promise<CrawledResult> {
  const notes: string[] = [];
  const pagesUsed: string[] = [];

  const rawUrl = companyUrlInput.trim();
  if (!rawUrl) {
    return {
      baseUrl: "",
      isReachable: false,
      pagesUsed: [],
      error: "No company URL provided.",
      notes: ["Company URL was omitted."],
    };
  }

  // Ensure scheme
  let normalizedUrl = rawUrl;
  if (!/^https?:\/\//i.test(normalizedUrl)) {
    normalizedUrl = `https://${normalizedUrl}`;
  }

  // 1. SSRF Guard
  const safety = isSafeUrl(normalizedUrl, options);
  if (!safety.safe || !safety.url) {
    return {
      baseUrl: normalizedUrl,
      isReachable: false,
      pagesUsed: [],
      error: safety.reason || "URL failed security validation",
      notes: [`Security: ${safety.reason}`],
    };
  }

  const baseUrl = safety.url.href;

  // 2. Robots.txt policy
  const robotsPolicy = await fetchRobotsPolicy(baseUrl);

  // Check if root is allowed
  if (!isPathAllowed(safety.url.pathname || "/", robotsPolicy)) {
    notes.push("Root path disallowed by robots.txt; crawling limited.");
  }

  // 3. Fetch Homepage
  const homepageHtml = await fetchWithRetry(baseUrl);
  if (!homepageHtml) {
    notes.push(`Company URL ${baseUrl} was unreachable, timed out, or returned an error status.`);
    return {
      baseUrl,
      isReachable: false,
      pagesUsed: [],
      error: `Company site unreachable after ${MAX_RETRIES} retries.`,
      notes,
    };
  }

  pagesUsed.push(baseUrl);
  const homepageCleaned = cleanHtml(homepageHtml);
  notes.push(`Successfully retrieved homepage: ${homepageCleaned.title || "Untitled"}`);

  // 4. Rank internal links to find hiring and about pages
  const rankedLinks = extractAndRankLinks(homepageHtml, baseUrl);

  // Filter with robots.txt
  const allowedLinks = rankedLinks.filter((link) => {
    try {
      const u = new URL(link.url);
      return isPathAllowed(u.pathname, robotsPolicy);
    } catch {
      return false;
    }
  });

  // Pick top hiring candidate
  const hiringCandidate = allowedLinks.find((l) => l.type === "hiring");
  // Pick top about candidate
  const aboutCandidate = allowedLinks.find(
    (l) => l.type === "about" && (!hiringCandidate || l.url !== hiringCandidate.url)
  );

  let hiringPage: (CleanedPage & { url: string }) | undefined;
  let aboutPage: (CleanedPage & { url: string }) | undefined;

  // Fetch hiring page if discovered
  if (hiringCandidate) {
    const hiringHtml = await fetchWithRetry(hiringCandidate.url, 1);
    if (hiringHtml) {
      const cleaned = cleanHtml(hiringHtml);
      hiringPage = { ...cleaned, url: hiringCandidate.url };
      pagesUsed.push(hiringCandidate.url);
      notes.push(`Discovered and crawled hiring page at: ${hiringCandidate.url}`);
    } else {
      notes.push(`Discovered hiring link at ${hiringCandidate.url} but page retrieval failed.`);
    }
  } else {
    notes.push("No explicit hiring or career page discovered on the site.");
  }

  // Fetch about page if discovered
  if (aboutCandidate) {
    const aboutHtml = await fetchWithRetry(aboutCandidate.url, 1);
    if (aboutHtml) {
      const cleaned = cleanHtml(aboutHtml);
      aboutPage = { ...cleaned, url: aboutCandidate.url };
      pagesUsed.push(aboutCandidate.url);
      notes.push(`Discovered and crawled about page at: ${aboutCandidate.url}`);
    }
  }

  return {
    baseUrl,
    isReachable: true,
    pagesUsed,
    homepage: homepageCleaned,
    hiringPage,
    aboutPage,
    notes,
  };
}
