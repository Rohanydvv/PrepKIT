import { URL } from "url";
import net from "net";

/**
 * SSRF Guard (Section 11)
 *
 * Validates external URLs before fetching:
 * - Rejects non-HTTP/HTTPS protocols (e.g., file://, ftp://, gopher://).
 * - In production (or when ALLOW_LOCAL_URLS != 'true'), rejects loopback (127.0.0.1, localhost)
 *   and private IP ranges (10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 169.254.169.254).
 * - When ALLOW_LOCAL_URLS is enabled (evaluation and development), permits local test servers.
 */
export function isSafeUrl(urlString: string): { safe: boolean; reason?: string; url?: URL } {
  try {
    const parsed = new URL(urlString);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();
    const allowLocal =
      process.env.ALLOW_LOCAL_URLS === "true" ||
      process.env.NODE_ENV === "test" ||
      process.env.NODE_ENV === "development";

    // If local URLs are permitted for evaluation or testing, allow them
    if (allowLocal) {
      return { safe: true, url: parsed };
    }

    // Otherwise check for loopback and private IPs
    if (
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local")
    ) {
      return { safe: false, reason: "Access to loopback addresses is forbidden in production." };
    }

    // If hostname is an IP, check private ranges
    if (net.isIP(hostname)) {
      if (isPrivateIP(hostname)) {
        return { safe: false, reason: "Access to private IP space is forbidden." };
      }
    }

    return { safe: true, url: parsed };
  } catch {
    return { safe: false, reason: "Malformed URL" };
  }
}

function isPrivateIP(ip: string): boolean {
  // IPv4 private ranges
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true;
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
    if (parts[0] === 192 && parts[1] === 168) return true;
    if (parts[0] === 169 && parts[1] === 254) return true; // Link-local / AWS metadata
    if (parts[0] === 127) return true; // Loopback
    if (parts[0] === 0) return true;
  }
  return false;
}
