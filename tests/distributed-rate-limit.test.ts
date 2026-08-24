import { describe, expect, it, vi } from "vitest";

import {
  checkDatabaseRateLimit,
  getDatabaseRateLimitStatus,
  rateLimitKey,
  rateLimitSource,
  resetDatabaseRateLimit,
} from "@/lib/distributed-rate-limit";

describe("distributed database rate limiting", () => {
  it("requires explicit trusted-proxy attestation in production", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.8" });
    expect(() => rateLimitSource(headers, { NODE_ENV: "production" })).toThrow(/trusted proxy/i);
    expect(rateLimitSource(headers, {
      NODE_ENV: "production",
      TRUST_PROXY_HEADERS: "true",
    })).toBe("203.0.113.8");
  });

  it("rejects malformed forwarded identities instead of creating attacker-selected keys", () => {
    expect(rateLimitSource(new Headers({ "x-forwarded-for": "not-an-ip" }), {})).toBe("unknown");
    expect(rateLimitSource(new Headers({ "x-forwarded-for": "198.51.100.4, 10.0.0.2" }), {}))
      .toBe("198.51.100.4");
  });

  it("hashes identifiers and requires production key material", () => {
    const key = rateLimitKey("register", "athlete@example.com", { NEXTAUTH_SECRET: "rate-limit-fixture-secret" });
    expect(key).toMatch(/^register:[a-f0-9]{64}$/);
    expect(key).not.toContain("athlete@example.com");
    expect(() => rateLimitKey("register", "athlete@example.com", { NODE_ENV: "production" }))
      .toThrow(/key material/i);
  });

  it("returns database-owned allowance and retry timing without sending the raw identifier to SQL", async () => {
    let statement: unknown;
    const client = {
      $queryRaw: vi.fn(async (query: unknown) => {
        statement = query;
        return [{ count: 4, windowStart: new Date("2026-07-27T16:00:00.000Z") }];
      }),
    };

    const result = await checkDatabaseRateLimit({
      namespace: "privacy-delete",
      identifier: "user-private-id",
      windowMs: 15 * 60_000,
      maxRequests: 3,
      now: new Date("2026-07-27T16:05:00.000Z"),
      environment: { NEXTAUTH_SECRET: "rate-limit-fixture-secret" },
      client,
    });

    expect(result).toEqual({ allowed: false, remaining: 0, retryAfterSeconds: 600 });
    expect(JSON.stringify(statement)).not.toContain("user-private-id");
  });

  it("resets a pseudonymized window after successful authentication", async () => {
    let statement: unknown;
    const client = {
      $executeRaw: vi.fn(async (query: unknown) => {
        statement = query;
        return 1;
      }),
    };
    await resetDatabaseRateLimit({
      namespace: "login-account-failure",
      identifier: "athlete@example.com",
      environment: { RATE_LIMIT_HMAC_SECRET: "rate-limit-fixture-secret" },
      client,
    });
    expect(client.$executeRaw).toHaveBeenCalledOnce();
    expect(JSON.stringify(statement)).not.toContain("athlete@example.com");
  });

  it("reads an active blocked window without incrementing it", async () => {
    const client = {
      $queryRaw: vi.fn(async () => [{ count: 10, windowStart: new Date("2026-07-27T12:00:00Z") }]),
    };
    await expect(getDatabaseRateLimitStatus({
      namespace: "login-account-failure",
      identifier: "athlete@example.com",
      windowMs: 900_000,
      maxRequests: 10,
      now: new Date("2026-07-27T12:05:00Z"),
      environment: { RATE_LIMIT_HMAC_SECRET: "rate-limit-fixture-secret" },
      client,
    })).resolves.toEqual({ blocked: true, retryAfterSeconds: 600 });
    expect(client.$queryRaw).toHaveBeenCalledOnce();
  });
});
