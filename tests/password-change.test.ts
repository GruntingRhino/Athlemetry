import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const user = {
    id: "athlete-1",
    email: "athlete@example.com",
    name: "Athlete",
    role: "ATHLETE",
    age: 18,
    position: "MID",
    competitionLevel: "academy",
    parentConsentVerified: true,
    passwordHash: "old-hash",
    deletedAt: null as Date | null,
  };

  return {
    session: { user: { id: user.id, role: user.role } } as { user: { id: string; role: string } } | null,
    user,
    findUnique: vi.fn(),
    updateMany: vi.fn(),
    createSystemLog: vi.fn(),
    transaction: vi.fn(),
    compare: vi.fn(),
    hash: vi.fn(),
    checkRateLimit: vi.fn(),
    getRateLimitStatus: vi.fn(),
    resetRateLimit: vi.fn(),
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@next-auth/prisma-adapter", () => ({ PrismaAdapter: () => ({}) }));
vi.mock("next-auth/providers/credentials", () => ({ default: (options: unknown) => options }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique, updateMany: mocks.updateMany },
    systemLog: { create: mocks.createSystemLog },
    $transaction: mocks.transaction,
  },
}));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: mocks.checkRateLimit,
  getDatabaseRateLimitStatus: mocks.getRateLimitStatus,
  rateLimitSource: () => "203.0.113.44",
  resetDatabaseRateLimit: mocks.resetRateLimit,
}));

const { POST } = await import("@/app/api/profile/password/route");
const { authorizeCredentials } = await vi.importActual<typeof import("@/lib/auth")>("@/lib/auth");

describe("POST /api/profile/password", () => {
  beforeEach(() => {
    mocks.session = { user: { id: mocks.user.id, role: mocks.user.role } };
    mocks.user.passwordHash = "old-hash";
    mocks.user.deletedAt = null;
    mocks.findUnique.mockReset();
    mocks.updateMany.mockReset();
    mocks.createSystemLog.mockReset();
    mocks.transaction.mockReset();
    mocks.compare.mockReset();
    mocks.hash.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.getRateLimitStatus.mockReset();
    mocks.resetRateLimit.mockReset();
    mocks.findUnique.mockResolvedValue(mocks.user);
    mocks.updateMany.mockImplementation(async ({ where, data }) => {
      if (where.id === mocks.user.id && where.passwordHash === mocks.user.passwordHash) {
        mocks.user.passwordHash = data.passwordHash;
        return { count: 1 };
      }
      return { count: 0 };
    });
    mocks.createSystemLog.mockResolvedValue({ id: "security-audit-1" });
    mocks.transaction.mockImplementation(async (callback: (tx: {
      user: { updateMany: typeof mocks.updateMany };
      systemLog: { create: typeof mocks.createSystemLog };
    }) => unknown) => callback({
      user: { updateMany: mocks.updateMany },
      systemLog: { create: mocks.createSystemLog },
    }));
    mocks.compare.mockImplementation(async (password, hash) => (
      (password === "current-password" && hash === "old-hash")
      || (password === "new-password" && hash === "new-hash")
    ));
    mocks.hash.mockResolvedValue("new-hash");
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, remaining: 19, retryAfterSeconds: 0 });
    mocks.getRateLimitStatus.mockResolvedValue({ blocked: false, retryAfterSeconds: 0 });
  });

  it("requires an authenticated session before password work", async () => {
    mocks.session = null;

    const response = await POST(new Request("http://localhost/api/profile/password", {
      method: "POST",
      body: JSON.stringify({ currentPassword: "current-password", newPassword: "new-password" }),
    }));

    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("rejects a new password outside the existing strength bounds before password work", async () => {
    const response = await POST(new Request("http://localhost/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "current-password", newPassword: "short" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).not.toHaveBeenCalled();
  });

  it("rate limits a blocked account before loading its password hash", async () => {
    mocks.getRateLimitStatus.mockResolvedValue({ blocked: true, retryAfterSeconds: 120 });

    const response = await POST(new Request("http://localhost/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "current-password", newPassword: "new-password" }),
    }));

    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.compare).toHaveBeenCalledTimes(1);
  });

  it("rejects an incorrect current password and records an account failure", async () => {
    mocks.compare.mockResolvedValue(false);

    const response = await POST(new Request("http://localhost/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "incorrect", newPassword: "new-password" }),
    }));

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Current password is incorrect." });
    expect(mocks.updateMany).not.toHaveBeenCalled();
    expect(mocks.checkRateLimit).toHaveBeenNthCalledWith(2, expect.objectContaining({
      namespace: "password-change-account-failure",
      identifier: "athlete-1",
    }));
  });

  it("updates the hash so only the new password can authorize credentials login", async () => {
    const response = await POST(new Request("http://localhost/api/profile/password", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ currentPassword: "current-password", newPassword: "new-password" }),
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.hash).toHaveBeenCalledWith("new-password", 12);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "athlete-1", passwordHash: "old-hash", deletedAt: null },
      data: { passwordHash: "new-hash" },
    });
    expect(mocks.resetRateLimit).toHaveBeenCalledWith({
      namespace: "password-change-account-failure",
      identifier: "athlete-1",
    });
    expect(mocks.createSystemLog).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Password changed",
        metadata: { action: "PASSWORD_CHANGED", actorUserId: "athlete-1" },
      },
    });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    await expect(authorizeCredentials(
      { email: mocks.user.email, password: "current-password" },
      { headers: { "x-forwarded-for": "203.0.113.44" } },
    )).resolves.toBeNull();
    await expect(authorizeCredentials(
      { email: mocks.user.email, password: "new-password" },
      { headers: { "x-forwarded-for": "203.0.113.44" } },
    )).resolves.toMatchObject({ id: "athlete-1", email: mocks.user.email });
  });
});
