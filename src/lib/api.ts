import { InterviewKit, StoredKitRecord } from "@/core/types";

const API_BASE = "";

export async function fetchJson<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  const res = await fetch(`${API_BASE}${url}`, {
    ...options,
    headers,
    credentials: "include",
  });

  if (!res.ok) {
    let errMessage = "";
    try {
      const data = await res.json();
      if (data.message && typeof data.message === "string") {
        errMessage = data.message;
      } else if (data.error && typeof data.error === "string") {
        errMessage = data.error;
      }
    } catch {
      // Body was not JSON (e.g. proxy HTML response for 429, 502, 504)
    }

    if (!errMessage) {
      if (res.status === 429) {
        errMessage = "Too many attempts. Please wait a moment and try again.";
      } else if (res.status === 502 || res.status === 503 || res.status === 504) {
        errMessage = "Backend server is waking up or temporarily unavailable. Please try again in a moment.";
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

    throw new Error(errMessage);
  }

  return await res.json();
}

export const api = {
  auth: {
    async me() {
      return fetchJson<{ user: { id: string; email: string } }>("/api/auth/me");
    },
    async login(email: string, passwordPlain: string) {
      return fetchJson<{ user: { id: string; email: string }; token: string }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email, password: passwordPlain }),
      });
    },
    async register(email: string, passwordPlain: string) {
      return fetchJson<{ user: { id: string; email: string }; token: string }>("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ email, password: passwordPlain }),
      });
    },
    async signup(email: string, passwordPlain: string) {
      return fetchJson<{ user: { id: string; email: string }; token: string }>("/api/auth/signup", {
        method: "POST",
        body: JSON.stringify({ email, password: passwordPlain }),
      });
    },
    async logout() {
      return fetchJson<{ message: string }>("/api/auth/logout", {
        method: "POST",
      });
    },
    async demoLogin() {
      // Helper for instant demo access
      try {
        return await this.login("demo@prepkit.io", "prepkitdemo2026");
      } catch {
        return await this.signup("demo@prepkit.io", "prepkitdemo2026");
      }
    },
  },

  kits: {
    async list() {
      return fetchJson<{ kits: StoredKitRecord[] }>("/api/kits");
    },
    async get(id: string) {
      return fetchJson<{ record: StoredKitRecord }>(`/api/kits/${id}`);
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
