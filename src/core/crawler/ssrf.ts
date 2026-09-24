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
export interface SsrfOptions {
  allowLocalhost?: boolean;
}

export function isSafeUrl(
  urlString: string,
  options?: SsrfOptions
): { safe: boolean; reason?: string; url?: URL } {
  try {
    const parsed = new URL(urlString);

    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return { safe: false, reason: `Disallowed protocol: ${parsed.protocol}` };
    }

    const hostname = parsed.hostname.toLowerCase();

    // Link-local / AWS / cloud metadata is NEVER allowed under any circumstances
    if (hostname === "169.254.169.254" || hostname.startsWith("169.254.")) {
      return { safe: false, reason: "Access to cloud instance metadata service is strictly forbidden." };
    }

    const isLoopbackHost =
      hostname === "localhost" ||
      hostname === "127.0.0.1" ||
      hostname === "0.0.0.0" ||
      hostname === "::1" ||
      hostname.endsWith(".localhost") ||
      hostname.endsWith(".local");

    const allowLocal =
      options?.allowLocalhost === true ||
      process.env.ALLOW_LOCAL_URLS === "true" ||
      process.env.PREPKIT_ALLOW_LOCAL_FIXTURES === "true" ||
      process.env.NODE_ENV === "test" ||
      process.env.NODE_ENV === "development";

    // If local URLs are permitted for evaluation or testing, allow loopback
    if (allowLocal && isLoopbackHost) {
      return { safe: true, url: parsed };
    }

    // Otherwise check for loopback and private IPs
    if (isLoopbackHost) {
      return { safe: false, reason: "Access to loopback addresses is forbidden in production." };
    }

    // If hostname is an IP, check private ranges
    const ipVersion = net.isIP(hostname);
    if (ipVersion === 4) {
      if (isPrivateIPv4(hostname)) {
        return { safe: false, reason: "Access to private IPv4 space is forbidden." };
      }
    } else if (ipVersion === 6) {
      if (isPrivateIPv6(hostname)) {
        return { safe: false, reason: "Access to private/link-local IPv6 space is forbidden." };
      }
    }

    return { safe: true, url: parsed };
  } catch {
    return { safe: false, reason: "Malformed URL" };
  }
}

function isPrivateIPv4(ip: string): boolean {
  const parts = ip.split(".").map(Number);
  if (parts.length === 4) {
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (Link-local)
    if (parts[0] === 127) return true; // 127.0.0.0/8 (Loopback)
    if (parts[0] === 0) return true; // 0.0.0.0/8
  }
  return false;
}

function isPrivateIPv6(ip: string): boolean {
  const cleanIp = ip.toLowerCase();
  if (cleanIp === "::1" || cleanIp === "::") return true;
  // Unique local fc00::/7
  if (cleanIp.startsWith("fc") || cleanIp.startsWith("fd")) return true;
  // Link-local fe80::/10
  if (cleanIp.startsWith("fe80:") || cleanIp.startsWith("fe8") || cleanIp.startsWith("fe9") || cleanIp.startsWith("fea") || cleanIp.startsWith("feb")) return true;
  return false;
}
