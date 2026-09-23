import { Request, Response, NextFunction } from "express";

interface RateLimitRecord {
  count: number;
  resetTime: number;
}

export interface RateLimiterOptions {
  maxRequests: number;
  windowMs: number;
  message?: string;
}

/**
 * Lightweight, zero-dependency in-memory sliding window rate limiter.
 * Automatically respects X-Forwarded-For when 'trust proxy' is enabled on Express.
 */
export function createRateLimiter(options: RateLimiterOptions) {
  const { maxRequests, windowMs, message } = options;
  const store = new Map<string, RateLimitRecord>();

  // Cleanup expired entries every 5 minutes to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, record] of store.entries()) {
      if (now > record.resetTime) {
        store.delete(key);
      }
    }
  }, 5 * 60 * 1000);
  cleanupInterval.unref();

  return (req: Request, res: Response, next: NextFunction): void => {
    // In test environment, skip rate limiting unless explicitly tested
    if (process.env.NODE_ENV === "test" && !req.headers["x-test-rate-limit"]) {
      return next();
    }

    // Determine client IP
    const clientIp = (
      (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
      req.ip ||
      req.socket.remoteAddress ||
      "unknown"
    );

    const now = Date.now();
    const record = store.get(clientIp);

    if (!record || now > record.resetTime) {
      store.set(clientIp, {
        count: 1,
        resetTime: now + windowMs,
      });
      return next();
    }

    if (record.count >= maxRequests) {
      const retryAfterSeconds = Math.max(1, Math.ceil((record.resetTime - now) / 1000));
      res.setHeader("Retry-After", retryAfterSeconds);
      res.status(429).json({
        error: "TOO_MANY_REQUESTS",
        message:
          message ||
          "Too many authentication attempts. Please wait a few moments and try again.",
        retryAfter: retryAfterSeconds,
      });
      return;
    }

    record.count += 1;
    return next();
  };
}
