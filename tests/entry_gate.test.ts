import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  api,
  getStoredToken,
  getStoredUser,
  hasStoredSession,
  setStoredSession,
  clearStoredSession,
  TOKEN_STORAGE_KEY,
  USER_STORAGE_KEY,
  SESSION_ACTIVE_KEY,
  ApiError,
} from "../src/lib/api.js";

// Mock localStorage for node test environment
class MockLocalStorage {
  private store: Record<string, string> = {};

  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }

  clear(): void {
    this.store = {};
  }
}

describe("PrepKIT Root Entry Gate & Session Persistence", () => {
  let mockStorage: MockLocalStorage;

  beforeEach(() => {
    mockStorage = new MockLocalStorage();
    (globalThis as any).window = globalThis;
    (globalThis as any).localStorage = mockStorage;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    mockStorage.clear();
    vi.restoreAllMocks();
  });

  describe("Session Storage Helpers", () => {
    it("FLOW 1: Fresh user has no stored session", () => {
      expect(hasStoredSession()).toBe(false);
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();
    });

    it("FLOW 2: Setting stored session persists token, user, and session active flag", () => {
      const user = { id: "usr_123", email: "candidate@company.com" };
      setStoredSession("jwt_token_abc", user);

      expect(hasStoredSession()).toBe(true);
      expect(getStoredToken()).toBe("jwt_token_abc");
      expect(getStoredUser()).toEqual(user);
    });

    it("FLOW 4: clearStoredSession removes all session artifacts upon logout", () => {
      setStoredSession("jwt_token_abc", { id: "usr_123", email: "candidate@company.com" });
      expect(hasStoredSession()).toBe(true);

      clearStoredSession();
      expect(hasStoredSession()).toBe(false);
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();
    });
  });

  describe("rawFetchJson Authorization header attachment", () => {
    it("attaches Authorization: Bearer <token> when session token is present in localStorage", async () => {
      setStoredSession("token_bearer_xyz", { id: "usr_456", email: "test@prepkit.io" });

      let capturedHeaders: Record<string, string> | undefined;
      globalThis.fetch = vi.fn().mockImplementation(async (_url, init) => {
        capturedHeaders = init?.headers;
        return new Response(JSON.stringify({ status: "ok" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      });

      await api.kits.list({ retry: false });

      expect(capturedHeaders).toBeDefined();
      expect(capturedHeaders!["Authorization"]).toBe("Bearer token_bearer_xyz");
    });
  });

  describe("Session Validation via api.auth.me()", () => {
    it("FLOW 2 & 3: Valid session returns user and updates cached user", async () => {
      setStoredSession("valid_token", { id: "usr_1", email: "old@prepkit.io" });

      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes("/api/auth/me")) {
          return new Response(
            JSON.stringify({ user: { id: "usr_1", email: "updated@prepkit.io" } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(null, { status: 404 });
      });

      const res = await api.auth.me({ retry: false });
      expect(res.user.email).toBe("updated@prepkit.io");
      expect(getStoredUser()?.email).toBe("updated@prepkit.io");
      expect(hasStoredSession()).toBe(true);
    });

    it("FLOW 5: Expired or invalid session (401) clears stored session", async () => {
      setStoredSession("expired_token", { id: "usr_1", email: "test@prepkit.io" });
      expect(hasStoredSession()).toBe(true);

      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes("/api/auth/me")) {
          return new Response(
            JSON.stringify({ error: "SESSION_EXPIRED", message: "Your session has expired." }),
            { status: 401, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(null, { status: 404 });
      });

      await expect(api.auth.me({ retry: false })).rejects.toThrow();
      expect(hasStoredSession()).toBe(false);
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();
    });

    it("FLOW 6: Cold start 502/503 does NOT clear stored session while server is waking", async () => {
      setStoredSession("valid_token", { id: "usr_1", email: "test@prepkit.io" });
      let attempts = 0;

      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes("/api/auth/me")) {
          attempts++;
          if (attempts < 3) {
            return new Response("Bad Gateway", { status: 502 });
          }
          return new Response(
            JSON.stringify({ user: { id: "usr_1", email: "test@prepkit.io" } }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(null, { status: 404 });
      });

      const res = await api.auth.me({
        retry: true,
        maxRetries: 3,
        retryDelays: [1, 1], // fast delays for test
      });

      expect(attempts).toBe(3);
      expect(res.user.email).toBe("test@prepkit.io");
      expect(hasStoredSession()).toBe(true);
    });
  });

  describe("Login and Logout Lifecycle", () => {
    it("FLOW 2: Successful login automatically persists session", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes("/api/auth/login")) {
          return new Response(
            JSON.stringify({
              user: { id: "usr_logged_in", email: "user@example.com" },
              token: "jwt_token_12345",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(null, { status: 404 });
      });

      await api.auth.login("user@example.com", "password123", { retry: false });
      expect(hasStoredSession()).toBe(true);
      expect(getStoredToken()).toBe("jwt_token_12345");
      expect(getStoredUser()?.email).toBe("user@example.com");
    });

    it("FLOW 4: Logout clears stored session even if backend call completes", async () => {
      setStoredSession("jwt_token_active", { id: "usr_1", email: "user@example.com" });

      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes("/api/auth/logout")) {
          return new Response(JSON.stringify({ message: "Logged out successfully" }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(null, { status: 404 });
      });

      await api.auth.logout({ retry: false });
      expect(hasStoredSession()).toBe(false);
      expect(getStoredToken()).toBeNull();
      expect(getStoredUser()).toBeNull();
    });

    it("FLOW 9: Demo login is explicit and stores demo session", async () => {
      globalThis.fetch = vi.fn().mockImplementation(async (url) => {
        if (String(url).includes("/api/auth/login")) {
          return new Response(
            JSON.stringify({
              user: { id: "usr_demo", email: "demo@prepkit.io" },
              token: "demo_jwt_token",
            }),
            { status: 200, headers: { "Content-Type": "application/json" } }
          );
        }
        return new Response(null, { status: 404 });
      });

      const res = await api.auth.demoLogin({ retry: false });
      expect(res.user.email).toBe("demo@prepkit.io");
      expect(hasStoredSession()).toBe(true);
      expect(getStoredToken()).toBe("demo_jwt_token");
    });
  });
});
