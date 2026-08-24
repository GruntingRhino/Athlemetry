import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUser: vi.fn(),
  compare: vi.fn(),
  checkRateLimit: vi.fn(),
  getRateLimitStatus: vi.fn(),
  resetRateLimit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: { user: { findUnique: mocks.findUser } } }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: mocks.checkRateLimit,
  getDatabaseRateLimitStatus: mocks.getRateLimitStatus,
  rateLimitSource: () => "203.0.113.44",
  resetDatabaseRateLimit: mocks.resetRateLimit,
}));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));

const { authorizeCredentials } = await import("@/lib/auth");

const request = { headers: { "x-forwarded-for": "203.0.113.44" } };
const user = {
  id: "user-login",
  email: "athlete@example.com",
  name: "Athlete",
  role: "ATHLETE",
  age: 18,
  position: "MID",
  competitionLevel: "academy",
  parentConsentVerified: true,
  passwordHash: "real-password-hash",
  deletedAt: null,
};

describe("distributed credential-login protection", () => {
  beforeEach(() => {
    mocks.findUser.mockReset();
    mocks.compare.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.getRateLimitStatus.mockReset();
    mocks.resetRateLimit.mockReset();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 49, retryAfterSeconds: 0 });
    mocks.getRateLimitStatus.mockResolvedValue({ blocked: false, retryAfterSeconds: 0 });
  });

  it("blocks an exhausted source before database and password work", async () => {
    mocks.checkRateLimit.mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    await expect(authorizeCredentials({ email: "athlete@example.com", password: "guess" }, request)).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("counts invalid account credentials in a shared failure window", async () => {
    mocks.findUser.mockResolvedValue(user);
    mocks.compare.mockResolvedValue(false);
    await expect(authorizeCredentials({ email: "ATHLETE@example.com", password: "wrong" }, request)).resolves.toBeNull();
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      namespace: "login-account-failure",
      identifier: "athlete@example.com",
      maxRequests: 10,
    }));
    expect(mocks.resetRateLimit).not.toHaveBeenCalled();
  });

  it("rejects even a correct password while the shared account window is blocked", async () => {
    mocks.getRateLimitStatus.mockResolvedValue({ blocked: true, retryAfterSeconds: 600 });
    mocks.compare.mockResolvedValue(true);
    await expect(authorizeCredentials({ email: "athlete@example.com", password: "correct" }, request)).resolves.toBeNull();
    expect(mocks.findUser).not.toHaveBeenCalled();
    expect(mocks.compare).toHaveBeenCalledTimes(1);
    expect(mocks.resetRateLimit).not.toHaveBeenCalled();
  });

  it("performs dummy password work for unknown accounts", async () => {
    mocks.findUser.mockResolvedValue(null);
    mocks.compare.mockResolvedValue(false);
    await authorizeCredentials({ email: "unknown@example.com", password: "wrong" }, request);
    expect(mocks.compare).toHaveBeenCalledTimes(1);
    expect(mocks.compare.mock.calls[0][1]).not.toBe("real-password-hash");
  });

  it("resets account failures after a valid login", async () => {
    mocks.findUser.mockResolvedValue(user);
    mocks.compare.mockResolvedValue(true);
    await expect(authorizeCredentials({ email: "athlete@example.com", password: "correct" }, request))
      .resolves.toMatchObject({ id: "user-login", email: "athlete@example.com" });
    expect(mocks.resetRateLimit).toHaveBeenCalledWith(expect.objectContaining({
      namespace: "login-account-failure",
      identifier: "athlete@example.com",
    }));
  });
});
