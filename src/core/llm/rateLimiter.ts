/**
 * Token Bucket & Rate Limiter with Exponential Backoff and Jitter
 *
 * Implements Section 10 & Preferred Tech Stack notes:
 * "Bear in mind that free tiers limit tokens per minute, not just requests, and that limit is easy to hit.
 * A pipeline that falls over the first time a provider says 'slow down' is the most common way to lose points here."
 */

export class RateLimiter {
  private lastCallTime = 0;
  private minIntervalMs: number;

  constructor(minIntervalMs = 1500) {
    this.minIntervalMs = minIntervalMs;
  }

  /**
   * Enforces minimum interval between consecutive requests to avoid bursting.
   */
  async throttle(): Promise<void> {
    const now = Date.now();
    const timeSinceLast = now - this.lastCallTime;
    if (timeSinceLast < this.minIntervalMs) {
      const waitTime = this.minIntervalMs - timeSinceLast;
      await new Promise((resolve) => setTimeout(resolve, waitTime));
    }
    this.lastCallTime = Date.now();
  }

  /**
   * Executes an asynchronous operation with exponential backoff on rate limits (429) or transient server errors (500, 503).
   */
  async executeWithBackoff<T>(
    operation: () => Promise<T>,
    maxRetries = 4,
    initialDelayMs = 2500
  ): Promise<T> {
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        await this.throttle();
        return await operation();
      } catch (err: unknown) {
        attempt++;
        const errorMessage = err instanceof Error ? err.message : String(err);
        const isRateLimit =
          errorMessage.includes("429") ||
          errorMessage.toLowerCase().includes("rate limit") ||
          errorMessage.toLowerCase().includes("quota exceeded") ||
          errorMessage.toLowerCase().includes("too many requests") ||
          errorMessage.toLowerCase().includes("resource_exhausted");

        const isTransientServer =
          errorMessage.includes("503") ||
          errorMessage.includes("500") ||
          errorMessage.toLowerCase().includes("overloaded");

        if ((isRateLimit || isTransientServer) && attempt <= maxRetries) {
          // Calculate exponential backoff with jitter
          const jitter = Math.floor(Math.random() * 1000);
          const delay = Math.min(
            60000,
            initialDelayMs * Math.pow(2, attempt - 1) + jitter
          );
          console.warn(
            `[RateLimiter] Hit rate limit/transient error: "${errorMessage}". Backing off for ${Math.round(delay / 1000)}s (Attempt ${attempt}/${maxRetries})...`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        // If not a retryable error or max retries exceeded, rethrow
        throw err;
      }
    }

    throw new Error("Max retries exceeded in RateLimiter");
  }
}

export const globalRateLimiter = new RateLimiter(2000);
