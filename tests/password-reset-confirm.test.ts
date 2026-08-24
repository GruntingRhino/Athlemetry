import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  tokenFindUnique: vi.fn(),
  tokenDeleteMany: vi.fn(),
  userUpdateMany: vi.fn(),
  sessionDeleteMany: vi.fn(),
  systemLogCreate: vi.fn(),
  transaction: vi.fn(),
  hashToken: vi.fn(),
  hashPassword: vi.fn(),
  checkRateLimit: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    verificationToken: { findUnique: mocks.tokenFindUnique, deleteMany: mocks.tokenDeleteMany },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/verification-tokens", () => ({ hashVerificationToken: mocks.hashToken }));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hashPassword } }));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: mocks.checkRateLimit,
  rateLimitSource: () => "203.0.113.44",
}));

const { POST } = await import("@/app/api/auth/password-reset/confirm/route");

describe("POST /api/auth/password-reset/confirm", () => {
  beforeEach(() => {
    mocks.tokenFindUnique.mockReset();
    mocks.tokenDeleteMany.mockReset();
    mocks.userUpdateMany.mockReset();
    mocks.sessionDeleteMany.mockReset();
    mocks.systemLogCreate.mockReset();
    mocks.transaction.mockReset();
    mocks.hashToken.mockReset();
    mocks.hashPassword.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.hashToken.mockReturnValue("hashed-token");
    mocks.hashPassword.mockResolvedValue("new-password-hash");
    mocks.tokenFindUnique.mockResolvedValue({
      identifier: "password-reset:athlete@example.test",
      token: "hashed-token",
      expires: new Date(Date.now() + 60 * 60_000),
    });
    mocks.userUpdateMany.mockResolvedValue({ count: 1 });
    mocks.tokenDeleteMany.mockResolvedValue({ count: 1 });
    mocks.sessionDeleteMany.mockResolvedValue({ count: 0 });
    mocks.systemLogCreate.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      user: { updateMany: mocks.userUpdateMany },
      session: { deleteMany: mocks.sessionDeleteMany },
      verificationToken: { deleteMany: mocks.tokenDeleteMany },
      systemLog: { create: mocks.systemLogCreate },
    }));
  });

  it("consumes a valid hashed token atomically, resets the password, and revokes database sessions", async () => {
    const response = await POST(new Request("https://app.example.test/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token: "raw-reset-token-012345678901234567890123", newPassword: "new-password" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.hashToken).toHaveBeenCalledWith("raw-reset-token-012345678901234567890123");
    expect(mocks.userUpdateMany).toHaveBeenCalledWith({
      where: { email: "athlete@example.test", deletedAt: null },
      data: { passwordHash: "new-password-hash" },
    });
    expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { user: { email: "athlete@example.test" } } });
    expect(mocks.tokenDeleteMany).toHaveBeenCalledWith({ where: { identifier: "password-reset:athlete@example.test" } });
    expect(mocks.systemLogCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ category: "SECURITY_AUDIT", metadata: expect.objectContaining({ action: "PASSWORD_RESET" }) }),
    }));
  });

  it("rejects expired or malformed password-reset tokens without changing an account", async () => {
    mocks.tokenFindUnique.mockResolvedValue({
      identifier: "email-verification:athlete@example.test",
      token: "hashed-token",
      expires: new Date("2020-01-01T00:00:00.000Z"),
    });

    const response = await POST(new Request("https://app.example.test/api/auth/password-reset/confirm", {
      method: "POST",
      body: JSON.stringify({ token: "raw-reset-token-012345678901234567890123", newPassword: "new-password" }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.userUpdateMany).not.toHaveBeenCalled();
    expect(mocks.tokenDeleteMany).not.toHaveBeenCalled();
  });
});
