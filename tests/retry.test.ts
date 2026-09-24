import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isTransientError,
  ApiError,
  fetchJson,
  RetryState,
} from "../src/lib/api.js";

describe("Frontend Cold-Start Retry & Resilience Handling", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("isTransientError classification", () => {
    it("identifies server wake-up and proxy transient errors correctly", () => {
      expect(isTransientError(new ApiError("Bad Gateway", 502))).toBe(true);
      expect(isTransientError(new ApiError("Service Unavailable", 503))).toBe(true);
      expect(isTransientError(new ApiError("Gateway Timeout", 504))).toBe(true);
      expect(isTransientError(new ApiError("Request Timeout", 408))).toBe(true);
      expect(isTransientError(new ApiError("Network Error", 0))).toBe(true);

      // Raw object or TypeError
      expect(isTransientError(new TypeError("Failed to fetch"))).toBe(true);
      expect(isTransientError({ message: "Network connection refused" })).toBe(true);
      expect(isTransientError({ status: 502 })).toBe(true);
      expect(isTransientError({ status: 503 })).toBe(true);
      expect(isTransientError({ status: 504 })).toBe(true);
    });

    it("does NOT classify client or application errors as transient", () => {
      // 400 Bad Request
      expect(isTransientError(new ApiError("Validation failed", 400))).toBe(false);
      // 401 Unauthorized / Invalid credentials
      expect(isTransientError(new ApiError("Invalid email or password", 401))).toBe(false);
      // 403 Forbidden
      expect(isTransientError(new ApiError("Forbidden", 403))).toBe(false);
      // 404 Not Found
      expect(isTransientError(new ApiError("Kit not found", 404))).toBe(false);
      // 409 Conflict / Email already exists
      expect(isTransientError(new ApiError("An account with this email already exists", 409))).toBe(false);
      // 429 Too Many Requests
      expect(isTransientError(new ApiError("Too many attempts", 429))).toBe(false);

      expect(isTransientError({ status: 401, message: "Invalid credentials" })).toBe(false);
      expect(isTransientError({ status: 400, message: "Email is required" })).toBe(false);
    });
  });

  describe("fetchJson retry behavior", () => {
    it("does NOT retry 401 invalid credentials and throws immediately", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: "INVALID_CREDENTIALS", message: "Invalid email or password." }), {
          status: 401,
          headers: { "Content-Type": "application/json" },
        });
      });

      const onRetry = vi.fn();
      await expect(
        fetchJson("/api/auth/login", {
          method: "POST",
          retry: true,
          retryDelays: [5, 10],
          onRetry,
        })
      ).rejects.toThrow("Invalid email or password.");

      // Must be called exactly once; no retries
      expect(callCount).toBe(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it("does NOT retry 409 email exists and throws immediately", async () => {
      let callCount = 0;
      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response(JSON.stringify({ error: "EMAIL_EXISTS", message: "An account with this email already exists." }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      });

      const onRetry = vi.fn();
      await expect(
        fetchJson("/api/auth/signup", {
          method: "POST",
          retry: true,
          retryDelays: [5, 10],
          onRetry,
        })
      ).rejects.toThrow("An account with this email already exists.");

      expect(callCount).toBe(1);
      expect(onRetry).not.toHaveBeenCalled();
    });

    it("retries on 502/503 cold start, notifies onRetry, and resolves when server becomes ready", async () => {
      let callCount = 0;
      const retryEvents: RetryState[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          // Attempt 1: Render cold start returns 502 HTML
          return new Response("<html>502 Bad Gateway</html>", { status: 502 });
        }
        if (callCount === 2) {
          // Attempt 2: Render warming up returns 503
          return new Response("<html>503 Service Unavailable</html>", { status: 503 });
        }
        // Attempt 3: Backend wakes up successfully
        return new Response(JSON.stringify({ user: { id: "usr_123", email: "test@example.com" }, token: "jwt_abc" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const result = await fetchJson<{ user: { id: string; email: string }; token: string }>("/api/auth/login", {
        method: "POST",
        retry: true,
        maxRetries: 4,
        retryDelays: [10, 10, 10, 10], // fast test delays
        onRetry: (state) => {
          retryEvents.push({ ...state });
        },
      });

      expect(callCount).toBe(3);
      expect(result.user.email).toBe("test@example.com");
      expect(result.token).toBe("jwt_abc");

      // Verify retry progression notifications
      expect(retryEvents.length).toBeGreaterThanOrEqual(2);
      expect(retryEvents[0].attempt).toBe(1);
      expect(retryEvents[0].isRetrying).toBe(true);
      expect(retryEvents[0].message).toContain("Connecting to PrepKIT...");

      expect(retryEvents[1].attempt).toBe(2);
      expect(retryEvents[1].isRetrying).toBe(true);

      // Final event clears retry status
      const lastEvent = retryEvents[retryEvents.length - 1];
      expect(lastEvent.isRetrying).toBe(false);
    });

    it("exhausts bounded retries and throws clear honest error message when server remains unreachable", async () => {
      let callCount = 0;
      const retryEvents: RetryState[] = [];

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        return new Response("503 Backend Offline", { status: 503 });
      });

      let caughtError: any = null;
      try {
        await fetchJson("/api/auth/login", {
          method: "POST",
          retry: true,
          maxRetries: 3,
          retryDelays: [5, 5, 5],
          onRetry: (state) => {
            retryEvents.push({ ...state });
          },
        });
      } catch (err) {
        caughtError = err;
      }

      // Initial call + 3 retries = 4 total attempts
      expect(callCount).toBe(4);
      expect(caughtError).toBeInstanceOf(ApiError);
      expect(caughtError.status).toBe(503);
      expect(caughtError.message).toBe("We couldn't connect to the PrepKIT server. Please try again in a moment.");

      // Final event resets retry state
      const lastEvent = retryEvents[retryEvents.length - 1];
      expect(lastEvent.isRetrying).toBe(false);
    });

    it("retries on dropped network fetch failure (TypeError)", async () => {
      let callCount = 0;

      globalThis.fetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount === 1) {
          throw new TypeError("Failed to fetch");
        }
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      const result = await fetchJson<{ status: string }>("/api/health", {
        retry: true,
        maxRetries: 2,
        retryDelays: [5, 5],
      });

      expect(callCount).toBe(2);
      expect(result.status).toBe("ok");
    });
  });
});
