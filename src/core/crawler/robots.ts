import axios from "axios";
import { URL } from "url";

export interface RobotsPolicy {
  disallowedPaths: string[];
  crawlDelay?: number;
}

/**
 * Basic Robots.txt parser respecting site crawling terms (Section 2 & 11)
 */
export async function fetchRobotsPolicy(baseUrl: string): Promise<RobotsPolicy> {
  try {
    const parsed = new URL(baseUrl);
    const robotsUrl = `${parsed.origin}/robots.txt`;

    const response = await axios.get(robotsUrl, {
      timeout: 3000,
      headers: {
        "User-Agent": "TraoInterviewPrepKitBot/1.0",
      },
      validateStatus: (status) => status === 200,
    });

    const lines = String(response.data).split("\n");
    const disallowedPaths: string[] = [];
    let isApplicableAgent = false;
    let crawlDelay: number | undefined;

    for (let rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith("#")) continue;

      const [directive, ...rest] = line.split(":");
      const value = rest.join(":").trim();

      if (directive.toLowerCase() === "user-agent") {
        isApplicableAgent = value === "*" || value.toLowerCase().includes("prepkit");
      } else if (isApplicableAgent) {
        if (directive.toLowerCase() === "disallow" && value) {
          disallowedPaths.push(value);
        } else if (directive.toLowerCase() === "crawl-delay") {
          const delay = parseInt(value, 10);
          if (!isNaN(delay)) crawlDelay = delay;
        }
      }
    }

    return { disallowedPaths, crawlDelay };
  } catch {
    // Missing robots.txt is completely normal and acceptable on the open web
    return { disallowedPaths: [] };
  }
}

export function isPathAllowed(pathname: string, policy: RobotsPolicy): boolean {
  for (const dis of policy.disallowedPaths) {
    if (dis === "/") return false;
    if (pathname.startsWith(dis)) return false;
  }
  return true;
}
