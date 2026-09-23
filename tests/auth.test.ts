import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "http";
import app from "../src/server/index.js";

let server: http.Server;
let baseUrl: string;

beforeAll(async () => {
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => {
      const address = server.address() as { port: number };
      baseUrl = `http://localhost:${address.port}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});

describe("Authentication & Persistence API Integration Tests", () => {
  const uniqueId = Date.now();
  const testEmail = `authtest_${uniqueId}@example.com`;
  const testPassword = "securePassword123";
  let authToken: string;

  it("GET /api/health returns database connectivity diagnostics", async () => {
    const res = await fetch(`${baseUrl}/api/health`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.status).toBe("ok");
    expect(data.database).toBeDefined();
    expect(typeof data.database.provider).toBe("string");
    expect(typeof data.database.connected).toBe("boolean");
    expect(typeof data.database.storage).toBe("string");
    expect(typeof data.database.hasMongoUri).toBe("boolean");
  });

  it("POST /api/auth/signup creates a new account and returns token and user", async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(testEmail.toLowerCase());
    expect(data.token).toBeDefined();
    authToken = data.token;
  });

  it("POST /api/auth/register creates a separate account identically", async () => {
    const regEmail = `regtest_${uniqueId}@example.com`;
    const res = await fetch(`${baseUrl}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: regEmail, password: testPassword }),
    });

    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.user).toBeDefined();
    expect(data.user.email).toBe(regEmail.toLowerCase());
    expect(data.token).toBeDefined();
  });

  it("POST /api/auth/signup rejects duplicate email with 409 Conflict", async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(409);
    const data = await res.json();
    expect(data.error).toBe("EMAIL_EXISTS");
    expect(data.message).toContain("already exists");
  });

  it("POST /api/auth/signup validates password minimum length", async () => {
    const res = await fetch(`${baseUrl}/api/auth/signup`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `shortpass_${uniqueId}@example.com`, password: "123" }),
    });

    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toBe("VALIDATION_ERROR");
    expect(data.message).toContain("at least 6 characters");
  });

  it("POST /api/auth/login authenticates with valid credentials", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: testPassword }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe(testEmail.toLowerCase());
    expect(data.token).toBeDefined();
  });

  it("POST /api/auth/login rejects incorrect password with 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: testEmail, password: "WrongPassword999!" }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("INVALID_CREDENTIALS");
  });

  it("POST /api/auth/login rejects non-existent email with 401", async () => {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: `nonexistent_${uniqueId}@example.com`, password: "anyPassword" }),
    });

    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("INVALID_CREDENTIALS");
  });

  it("GET /api/auth/me returns current authenticated user with Bearer token", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`, {
      headers: {
        Authorization: `Bearer ${authToken}`,
      },
    });

    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.user.email).toBe(testEmail.toLowerCase());
  });

  it("GET /api/auth/me returns 401 UNAUTHORIZED when no token is provided", async () => {
    const res = await fetch(`${baseUrl}/api/auth/me`);
    expect(res.status).toBe(401);
    const data = await res.json();
    expect(data.error).toBe("UNAUTHORIZED");
  });

  it("authRateLimiter correctly throttles and returns 429 with retry-after", async () => {
    const { createRateLimiter } = await import("../src/server/rateLimiter.js");
    const limiter = createRateLimiter({
      maxRequests: 2,
      windowMs: 60 * 1000,
      message: "Rate limit exceeded for testing.",
    });

    let statusCode: number | null = null;
    let jsonBody: any = null;
    let retryAfterHeader: string | number | null = null;

    const mockReq = {
      headers: { "x-test-rate-limit": "true" },
      ip: "192.168.1.100",
      socket: { remoteAddress: "192.168.1.100" },
    } as any;

    const mockRes = {
      status(code: number) {
        statusCode = code;
        return this;
      },
      json(body: any) {
        jsonBody = body;
        return this;
      },
      setHeader(name: string, val: any) {
        if (name === "Retry-After") retryAfterHeader = val;
      },
    } as any;

    let nextCount = 0;
    const next = () => {
      nextCount++;
    };

    // Request 1: allowed
    limiter(mockReq, mockRes, next);
    expect(nextCount).toBe(1);

    // Request 2: allowed
    limiter(mockReq, mockRes, next);
    expect(nextCount).toBe(2);

    // Request 3: blocked with 429
    limiter(mockReq, mockRes, next);
    expect(nextCount).toBe(2); // next not called
    expect(statusCode).toBe(429);
    expect(jsonBody.error).toBe("TOO_MANY_REQUESTS");
    expect(jsonBody.message).toBe("Rate limit exceeded for testing.");
    expect(retryAfterHeader).toBeDefined();
  });
});
