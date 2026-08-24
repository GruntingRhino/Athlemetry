import { beforeEach, describe, expect, it, vi } from "vitest";

import { FixedWindowRateLimiter } from "@/lib/rate-limit";

describe("FixedWindowRateLimiter", () => {
  it("allows requests within the limit", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 3 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
    expect(limiter.check("a")).toEqual({ allowed: true, remaining: 0, retryAfterSeconds: 0 });
  });

  it("blocks requests that exceed the limit", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 2 });
    limiter.check("a");
    limiter.check("a");
    const result = limiter.check("a");
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfterSeconds).toBeGreaterThan(0);
  });

  it("retryAfterSeconds reflects the remaining time in the window", () => {
    let now = 100_000;
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      getTimestamp: () => now,
    });
    limiter.check("a");
    now = 100_010;
    const result = limiter.check("a");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterSeconds).toBe(60);
  });

  it("resets the window when the timer expires", () => {
    let now = 100_000;
    const limiter = new FixedWindowRateLimiter({
      windowMs: 60_000,
      maxRequests: 1,
      getTimestamp: () => now,
    });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    now += 60_000;
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("reset() clears state for a key", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    limiter.check("a");
    expect(limiter.check("a").allowed).toBe(false);
    limiter.reset("a");
    expect(limiter.check("a").allowed).toBe(true);
  });

  it("tracks separate keys independently", () => {
    const limiter = new FixedWindowRateLimiter({ windowMs: 60_000, maxRequests: 1 });
    expect(limiter.check("a").allowed).toBe(true);
    expect(limiter.check("b").allowed).toBe(true);
    expect(limiter.check("a").allowed).toBe(false);
    expect(limiter.check("b").allowed).toBe(false);
  });
});

const routeMocks = vi.hoisted(() => ({
  rateLimiterCheck: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), create: vi.fn() },
    consentLog: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  bcryptHash: vi.fn(async () => "hashed"),
}));

vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: routeMocks.rateLimiterCheck,
  rateLimitSource: (headers: Headers) => headers.get("x-forwarded-for") ?? "unknown",
}));

vi.mock("@/lib/prisma", () => ({ prisma: routeMocks.prisma }));
vi.mock("bcryptjs", () => ({ default: { hash: routeMocks.bcryptHash } }));

const { POST } = await import("@/app/api/auth/register/route");

describe("POST /api/auth/register — rate limiting", () => {
  beforeEach(() => {
    routeMocks.rateLimiterCheck.mockReset();
    routeMocks.prisma.user.findUnique.mockReset();
    routeMocks.prisma.user.create.mockReset();
    routeMocks.prisma.consentLog.create.mockReset();
    routeMocks.prisma.systemLog.create.mockReset();
    routeMocks.prisma.$transaction.mockReset();
    routeMocks.prisma.$transaction.mockImplementation(async (callback) => callback(routeMocks.prisma));
    routeMocks.bcryptHash.mockClear();
  });

  it("returns 429 with Retry-After when rate limited", async () => {
    routeMocks.rateLimiterCheck.mockResolvedValue({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 42,
    });

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "secret123",
          role: "ATHLETE",
          name: "Test",
          age: 18,
          primarySport: "soccer",
          position: "MID",
          competitionLevel: "academy",
          gender: "female",
          shareInBenchmarks: true,
          anonymizeForBenchmark: true,
        }),
      }),
    );

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("42");
    expect((await response.json()).error).toMatch(/too many requests/i);
    expect(routeMocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("passes through when rate limit is not exceeded", async () => {
    routeMocks.rateLimiterCheck.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
    routeMocks.prisma.user.findUnique.mockResolvedValue(null);
    routeMocks.prisma.user.create.mockResolvedValue({
      id: "u1",
      email: "test@example.com",
      role: "ATHLETE",
      parentConsentVerified: true,
    });
    routeMocks.bcryptHash.mockResolvedValue("hashed");

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: "test@example.com",
          password: "secret123",
          role: "ATHLETE",
          name: "Test",
          age: 18,
          primarySport: "soccer",
          position: "MID",
          competitionLevel: "academy",
          gender: "female",
          shareInBenchmarks: true,
          anonymizeForBenchmark: true,
        }),
      }),
    );

    expect(response.status).toBe(200);
    expect(routeMocks.prisma.user.create).toHaveBeenCalledTimes(1);
  });

  it("uses x-forwarded-for header as client identifier", async () => {
    routeMocks.rateLimiterCheck.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
    routeMocks.prisma.user.findUnique.mockResolvedValue(null);
    routeMocks.prisma.user.create.mockResolvedValue({
      id: "u2",
      email: "ip@example.com",
      role: "ATHLETE",
      parentConsentVerified: true,
    });
    routeMocks.bcryptHash.mockResolvedValue("hashed");

    await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": "203.0.113.42" },
        body: JSON.stringify({
          email: "ip@example.com",
          password: "secret123",
          role: "ATHLETE",
          name: "IP",
          age: 20,
          position: "FWD",
          competitionLevel: "elite",
          gender: "male",
          shareInBenchmarks: true,
          anonymizeForBenchmark: true,
        }),
      }),
    );

    expect(routeMocks.rateLimiterCheck).toHaveBeenCalledWith(expect.objectContaining({
      namespace: "register",
      identifier: "203.0.113.42",
    }));
  });
});
