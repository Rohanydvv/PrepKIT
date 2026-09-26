import { InterviewKit, StoredKitRecord } from "@/core/types";

const API_BASE = "";

export class ApiError extends Error {
  status: number;
  data?: any;
  isTransient: boolean;

  constructor(message: string, status: number, data?: any, isTransient?: boolean) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.data = data;
    // Transient errors indicating server sleep, boot/cold-start, proxy buffering, or temporary timeout
    this.isTransient =
      typeof isTransient === "boolean"
        ? isTransient
        : status === 0 || status === 408 || status === 502 || status === 503 || status === 504;
  }
}

/**
 * Determines whether an error is transient and should trigger bounded automatic retry.
 * Returns true for network failures, 502, 503, 504, 408, and platform cold-start/hibernation rate limits.
 * Returns false for 400, 401, 403, 404, 409, and real application rate limits (TOO_MANY_REQUESTS).
 */
export function isTransientError(err: unknown): boolean {
  if (!err) return false;

  if (err instanceof ApiError) {
    return err.isTransient;
  }

  const anyErr = err as { status?: number; message?: string; isTransient?: boolean };
  if (typeof anyErr.isTransient === "boolean") {
    return anyErr.isTransient;
  }

  if (anyErr.status === 429) {
    return false;
  }

  if (
    anyErr.status === 0 ||
    anyErr.status === 408 ||
    anyErr.status === 502 ||
    anyErr.status === 503 ||
    anyErr.status === 504
  ) {
    return true;
  }

  const msg = (anyErr.message || "").toLowerCase();
  if (
    msg.includes("failed to fetch") ||
    msg.includes("network") ||
    msg.includes("connection") ||
    msg.includes("load failed") ||
    msg.includes("refused") ||
    msg.includes("econnrefused") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("timeout") ||
    msg.includes("waking up") ||
    msg.includes("temporarily unavailable") ||
    msg.includes("couldn't connect")
  ) {
    // Exclude explicit client errors (400, 401, 403, 404, 409, 422, 429)
    if (anyErr.status && anyErr.status >= 400 && anyErr.status < 500 && anyErr.status !== 408) {
      return false;
    }
    return true;
  }

  return false;
}

export interface RetryState {
  attempt: number;
  maxAttempts: number;
  delayMs: number;
  isRetrying: boolean;
  message: string;
}

export interface FetchJsonOptions extends RequestInit {
  retry?: boolean;
  maxRetries?: number;
  retryDelays?: number[];
  onRetry?: (state: RetryState) => void;
}

// Default bounded exponential backoff: ~2s, ~4s, ~8s, ~12s (total ~26s, matching Render wake cycle)
export const DEFAULT_RETRY_DELAYS = [2000, 4000, 8000, 12000];

export const TOKEN_STORAGE_KEY = "prepkit_token";
export const USER_STORAGE_KEY = "prepkit_user";
export const SESSION_ACTIVE_KEY = "prepkit_session_active";

export function getStoredToken(): string | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function getStoredUser(): { id: string; email: string } | null {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return null;
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasStoredSession(): boolean {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return false;
  try {
    return Boolean(
      localStorage.getItem(TOKEN_STORAGE_KEY) ||
      localStorage.getItem(SESSION_ACTIVE_KEY)
    );
  } catch {
    return false;
  }
}

export function setStoredSession(token: string, user: { id: string; email: string }) {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    if (user) localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(user));
    localStorage.setItem(SESSION_ACTIVE_KEY, "true");
  } catch {
    // Ignore quota or security restrictions
  }
}

export function clearStoredSession() {
  if (typeof window === "undefined" || typeof localStorage === "undefined") return;
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
    localStorage.removeItem(USER_STORAGE_KEY);
    localStorage.removeItem(SESSION_ACTIVE_KEY);
  } catch {
    // Ignore
  }
}

async function rawFetchJson<T>(url: string, init: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string>) || {}),
  };

  // If token is stored in localStorage, include Authorization header
  if (typeof window !== "undefined") {
    const token = getStoredToken();
    if (token && !headers["Authorization"] && !headers["authorization"]) {
      headers["Authorization"] = `Bearer ${token}`;
    }
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${url}`, {
      cache: "no-store",
      ...init,
      headers: {
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
        ...headers,
      },
      credentials: "include",
    });
  } catch (netErr: any) {
    throw new ApiError(
      netErr?.message || "Failed to connect to server",
      0
    );
  }

  if (!res.ok) {
    let errMessage = "";
    let data: any = null;
    let isJson = false;
    try {
      data = await res.json();
      isJson = true;
      if (data.message && typeof data.message === "string") {
        errMessage = data.message;
      } else if (data.error && typeof data.error === "string") {
        errMessage = data.error;
      }
    } catch {
      // Body was not JSON (e.g. proxy HTML response for 429, 502, 503, 504)
    }

    const renderRouting = (res.headers.get("x-render-routing") || "").toLowerCase();
    const isHibernate = renderRouting.includes("hibernate");

    // Distinguish genuine backend application rate limits from edge proxy/hibernation rate limits
    const isAppRateLimit = res.status === 429 && isJson && data?.error === "TOO_MANY_REQUESTS";
    const isTransientPlatform429 = res.status === 429 && (!isAppRateLimit || isHibernate);

    if (!errMessage) {
      if (isAppRateLimit) {
        errMessage = "Too many attempts. Please wait a moment and try again.";
      } else if (isTransientPlatform429) {
        errMessage = "The PrepKIT server is waking up from sleep. This may take a few moments.";
      } else if (res.status === 502 || res.status === 503 || res.status === 504) {
        errMessage = "We couldn't connect to the PrepKIT server. Please try again in a moment.";
      } else if (res.status === 401) {
        errMessage = "Invalid email or password.";
      } else if (res.status === 404) {
        errMessage = "Requested resource not found.";
      } else if (res.status === 409) {
        errMessage = "An account with this email already exists. Please sign in instead.";
      } else {
        errMessage = `HTTP error ${res.status}`;
      }
    }

    const isTransient = res.status === 429 ? isTransientPlatform429 : undefined;
    throw new ApiError(errMessage, res.status, data, isTransient);
  }

  return await res.json();
}

export async function fetchJson<T>(url: string, options: FetchJsonOptions = {}): Promise<T> {
  const {
    retry = false,
    maxRetries = DEFAULT_RETRY_DELAYS.length,
    retryDelays = DEFAULT_RETRY_DELAYS,
    onRetry,
    ...fetchInit
  } = options;

  if (!retry) {
    return await rawFetchJson<T>(url, fetchInit);
  }

  let attempt = 0;

  while (true) {
    try {
      const result = await rawFetchJson<T>(url, fetchInit);
      if (attempt > 0 && onRetry) {
        onRetry({
          attempt: 0,
          maxAttempts: maxRetries,
          delayMs: 0,
          isRetrying: false,
          message: "",
        });
      }
      return result;
    } catch (err: any) {
      // Fast abort: Never retry non-transient client/validation/auth errors
      if (!isTransientError(err)) {
        if (attempt > 0 && onRetry) {
          onRetry({
            attempt: 0,
            maxAttempts: maxRetries,
            delayMs: 0,
            isRetrying: false,
            message: "",
          });
        }
        throw err;
      }

      if (attempt < maxRetries && isTransientError(err)) {
        attempt++;
        const delayMs = retryDelays[attempt - 1] ?? 10000;

        if (onRetry) {
          onRetry({
            attempt,
            maxAttempts: maxRetries,
            delayMs,
            isRetrying: true,
            message: "Connecting to PrepKIT...\nThe server is starting up. This may take a few moments.",
          });
        }

        await new Promise((resolve) => setTimeout(resolve, delayMs));
        continue;
      }

      if (attempt > 0 && onRetry) {
        onRetry({
          attempt: 0,
          maxAttempts: maxRetries,
          delayMs: 0,
          isRetrying: false,
          message: "",
        });
      }

      if (attempt >= maxRetries && isTransientError(err)) {
        throw new ApiError(
          "We couldn't connect to the PrepKIT server. Please try again in a moment.",
          err.status || 503,
          err.data
        );
      }

      throw err;
    }
  }
}

export const api = {
  auth: {
    async me(options?: FetchJsonOptions) {
      try {
        const res = await fetchJson<{ user: { id: string; email: string } }>("/api/auth/me", {
          retry: true,
          ...options,
        });
        if (res?.user && typeof window !== "undefined") {
          setStoredSession(getStoredToken() || "", res.user);
        }
        return res;
      } catch (err: any) {
        if (err?.status === 401) {
          clearStoredSession();
        }
        throw err;
      }
    },
    async login(email: string, passwordPlain: string, options?: FetchJsonOptions) {
      const res = await fetchJson<{ user: { id: string; email: string }; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: passwordPlain }),
        retry: true,
        ...options,
      });
      if (res?.token && res?.user) {
        setStoredSession(res.token, res.user);
      }
      return res;
    },
    async register(email: string, passwordPlain: string, options?: FetchJsonOptions) {
      const res = await fetchJson<{ user: { id: string; email: string }; token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password: passwordPlain }),
        retry: true,
        ...options,
      });
      if (res?.token && res?.user) {
        setStoredSession(res.token, res.user);
      }
      return res;
    },
    async signup(email: string, passwordPlain: string, options?: FetchJsonOptions) {
      const res = await fetchJson<{ user: { id: string; email: string }; token: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password: passwordPlain }),
        retry: true,
        ...options,
      });
      if (res?.token && res?.user) {
        setStoredSession(res.token, res.user);
      }
      return res;
    },
    async logout(options?: FetchJsonOptions) {
      try {
        return await fetchJson<{ message: string }>("/api/auth/logout", {
          method: "POST",
          ...options,
        });
      } finally {
        clearStoredSession();
      }
    },
    async demoLogin(options?: FetchJsonOptions) {
      try {
        return await this.login("demo@prepkit.io", "prepkitdemo2026", options);
      } catch (err: any) {
        // Only attempt signup if the demo user does not exist yet (401);
        // Never attempt signup on rate limits (429), validation errors, or server cold starts
        if (err?.status === 401) {
          return await this.signup("demo@prepkit.io", "prepkitdemo2026", options);
        }
        throw err;
      }
    },
  },

  kits: {
    async list(options?: FetchJsonOptions) {
      return fetchJson<{ kits: StoredKitRecord[] }>("/api/kits", {
        retry: true,
        ...options,
      });
    },
    async get(id: string, options?: FetchJsonOptions) {
      return fetchJson<{ record: StoredKitRecord }>(`/api/kits/${id}`, {
        retry: true,
        ...options,
      });
    },
    async generate(jd: string, company_url: string, days: number) {
      return fetchJson<{ record: StoredKitRecord }>("/api/kits/generate", {
        method: "POST",
        body: JSON.stringify({ jd, company_url, days }),
      });
    },
    async update(id: string, kit: InterviewKit, meta?: StoredKitRecord["meta"]) {
      return fetchJson<{ record: StoredKitRecord }>(`/api/kits/${id}`, {
        method: "PUT",
        body: JSON.stringify({ kit, meta }),
      });
    },
    async delete(id: string) {
      return fetchJson<{ message: string }>(`/api/kits/${id}`, {
        method: "DELETE",
      });
    },
    async regenerateSection(id: string, section: "company_brief" | "category" | "schedule", category?: string) {
      return fetchJson<{ record: StoredKitRecord }>(`/api/kits/${id}/regenerate-section`, {
        method: "POST",
        body: JSON.stringify({ section, category }),
      });
    },
  },

  practice: {
    async get(kitId: string) {
      return fetchJson<{
        flashcards: InterviewKit["flashcards"];
        session: { cards: Record<string, { confidence: number; reviewedAt: string; reviewCount: number }> };
        stats: { totalCards: number; reviewedCount: number; masteredCount: number; progressPercent: number };
      }>(`/api/kits/${kitId}/practice`);
    },
    async record(kitId: string, cardId: string, confidence: number) {
      return fetchJson<{ success: boolean }>(`/api/kits/${kitId}/practice/record`, {
        method: "POST",
        body: JSON.stringify({ cardId, confidence }),
      });
    },
  },

  mockInterview: {
    async evaluate(
      questionPrompt: string,
      category: string,
      answerOutline: string,
      candidateAnswer: string
    ) {
      return fetchJson<{
        evaluation: {
          score: number;
          rubricScores: { depth: number; structure: number; alignment: number; clarity: number };
          strengths: string[];
          improvements: string[];
          modelAnswer: string;
        };
      }>("/api/mock-interview/evaluate", {
        method: "POST",
        body: JSON.stringify({
          questionPrompt,
          category,
          answerOutline,
          candidateAnswer,
        }),
      });
    },
  },
};
