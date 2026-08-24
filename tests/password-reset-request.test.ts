import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
  transaction: vi.fn(),
  checkRateLimit: vi.fn(),
  createToken: vi.fn(),
  hashToken: vi.fn(),
  expiry: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findUnique: mocks.findUnique },
    verificationToken: { deleteMany: mocks.deleteMany, create: mocks.create },
    $transaction: mocks.transaction,
  },
}));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: mocks.checkRateLimit,
  rateLimitSource: () => "203.0.113.44",
}));
vi.mock("@/lib/verification-tokens", () => ({
  createVerificationToken: mocks.createToken,
  hashVerificationToken: mocks.hashToken,
  verificationTokenExpiry: mocks.expiry,
}));

const { POST } = await import("@/app/api/auth/password-reset/request/route");

describe("POST /api/auth/password-reset/request", () => {
  const originalWebhookUrl = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
  const originalWebhookToken = process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN;
  const originalAppUrl = process.env.NEXTAUTH_URL;

  beforeEach(() => {
    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = "https://mailer.example.test/reset";
    process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN = "integration-secret";
    process.env.NEXTAUTH_URL = "https://app.example.test";
    mocks.findUnique.mockReset();
    mocks.deleteMany.mockReset();
    mocks.create.mockReset();
    mocks.transaction.mockReset();
    mocks.checkRateLimit.mockReset();
    mocks.createToken.mockReset();
    mocks.hashToken.mockReset();
    mocks.expiry.mockReset();
    mocks.checkRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.findUnique.mockResolvedValue(null);
    mocks.deleteMany.mockResolvedValue({ count: 0 });
    mocks.create.mockResolvedValue({ token: "hash" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      verificationToken: { deleteMany: mocks.deleteMany, create: mocks.create },
    }));
    mocks.createToken.mockReturnValue("raw-reset-token");
    mocks.hashToken.mockReturnValue("hashed-reset-token");
    mocks.expiry.mockReturnValue(new Date("2026-08-02T00:00:00.000Z"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 202 })));
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    if (originalWebhookUrl === undefined) delete process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL;
    else process.env.PASSWORD_RESET_EMAIL_WEBHOOK_URL = originalWebhookUrl;
    if (originalWebhookToken === undefined) delete process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN;
    else process.env.PASSWORD_RESET_EMAIL_WEBHOOK_BEARER_TOKEN = originalWebhookToken;
    if (originalAppUrl === undefined) delete process.env.NEXTAUTH_URL;
    else process.env.NEXTAUTH_URL = originalAppUrl;
  });

  it("returns the same accepted response for an unknown email without issuing or delivering a token", async () => {
    const response = await POST(new Request("https://app.example.test/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email: "unknown@example.test" }),
    }));

    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(mocks.deleteMany).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("stores only a hashed replacement token and delivers the raw token in a reset URL", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user-1", email: "athlete@example.test", deletedAt: null });

    const response = await POST(new Request("https://app.example.test/api/auth/password-reset/request", {
      method: "POST",
      body: JSON.stringify({ email: " Athlete@Example.Test " }),
    }));

    expect(response.status).toBe(202);
    expect(mocks.deleteMany).toHaveBeenCalledWith({ where: { identifier: "password-reset:athlete@example.test" } });
    expect(mocks.create).toHaveBeenCalledWith({ data: {
      identifier: "password-reset:athlete@example.test",
      token: "hashed-reset-token",
      expires: new Date("2026-08-02T00:00:00.000Z"),
    } });
    expect(fetch).toHaveBeenCalledWith("https://mailer.example.test/reset", expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer integration-secret" }),
      body: expect.stringContaining("raw-reset-token"),
    }));
  });
});
