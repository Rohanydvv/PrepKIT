import { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  maxRequests: number | ((req: Request) => number);
  windowMs: number;
  message?: string;
  keyGenerator?: (req: Request) => string;
}

function cleanIp(ip: string): string {
  let cleaned = ip.trim();
  // Strip IPv6-mapped IPv4 prefix: ::ffff:192.0.2.1 -> 192.0.2.1
  if (cleaned.startsWith("::ffff:")) {
    cleaned = cleaned.substring(7);
  }
  // Strip port if present in IPv4 (e.g. 192.0.2.1:12345)
  if (/^\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}:\d+$/.test(cleaned)) {
    cleaned = cleaned.split(":")[0];
  }
  return cleaned;
}

/**
 * Extracts the real client IP address across direct connections, Render, Cloudflare, and reverse proxies.
 * Prioritizes leftmost entry in X-Forwarded-For to prevent proxy IP collapsing (e.g. Next.js rewrites on Render).
 */
export function getClientIp(req: Request): string {
  // 1. Standard X-Forwarded-For: Leftmost entry is the originating client IP.
  // In reverse-proxy setups (such as Next.js rewrites on Render -> backend on Render),
  // Next.js forwards the true client IP in X-Forwarded-For, while Cloudflare's CF-Connecting-IP
  // on the backend will only point to the frontend proxy server (causing all users to share one IP).
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) {
    const rawList = Array.isArray(forwarded) ? forwarded.join(",") : forwarded;
    const firstIp = rawList.split(",")[0]?.trim();
    if (firstIp && firstIp !== "unknown") {
      return cleanIp(firstIp);
    }
  }

  // 2. If Cloudflare connecting IP is present and valid
  const cfIp = req.headers["cf-connecting-ip"];
  if (cfIp && typeof cfIp === "string" && cfIp.trim() && cfIp.trim() !== "unknown") {
    return cleanIp(cfIp.trim());
  }

  // 3. X-Real-IP
  const realIp = req.headers["x-real-ip"];
  if (realIp && typeof realIp === "string" && realIp.trim() && realIp.trim() !== "unknown") {
    return cleanIp(realIp.trim());
  }

  // 4. Express req.ip (when trust proxy is enabled)
  if (req.ip && req.ip !== "unknown") {
    return cleanIp(req.ip);
  }

  // 5. Socket remote address fallback
  return cleanIp(req.socket?.remoteAddress || "127.0.0.1");
}

/**
 * Lightweight, zero-dependency in-memory sliding window rate limiter.
 * Automatically respects proxy headers and isolates rate limits per client IP and endpoint.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { maxRequests, windowMs, message, keyGenerator } = options;
  const store = new Map<string, RateLimitRecord>();

  // Cleanup expired entries periodically to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, Math.min(windowMs, 5 * 60 * 1000));
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, skip rate limiting unless explicitly tested
    if (process.env.NODE_ENV === "test" && !req.headers["x-test-rate-limit"]) {
      return next();
    }

    const clientIp = getClientIp(req);
    const key = keyGenerator ? keyGenerator(req) : clientIp;

    const now = Date.now();
    const record = store.get(key);

    if (!record || now > record.resetTime) {
      store.set(key, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    const limit = typeof maxRequests === "function" ? maxRequests(req) : maxRequests;
    if (record.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds);
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.setHeader("Pragma", "no-cache");
      res.setHeader("Expires", "0");
      res.status(429).json({
        error: "TOO_MANY_REQUESTS",
        message:
          message ||
          "Too many attempts. Please wait a moment and try again.",
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    record.count += 1;
    return next();
  };
}
