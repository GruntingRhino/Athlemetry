import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  bcryptHash: vi.fn(async () => "hashed-password"),
  consoleWarn: vi.fn(),
  rateLimit: vi.fn(),
  prisma: {
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    consentLog: {
      create: vi.fn(),
    },
    systemLog: {
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/prisma", () => ({
  prisma: mocks.prisma,
}));
vi.mock("@/lib/distributed-rate-limit", () => ({
  checkDatabaseRateLimit: mocks.rateLimit,
  rateLimitSource: () => "unknown",
}));

vi.mock("bcryptjs", () => ({
  default: {
    hash: mocks.bcryptHash,
  },
}));

const { POST } = await import("@/app/api/auth/register/route");
const warnSpy = vi.spyOn(console, "warn").mockImplementation((...args) => {
  mocks.consoleWarn(...args);
});

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    mocks.bcryptHash.mockClear();
    mocks.consoleWarn.mockClear();
    warnSpy.mockClear();
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.user.findFirst.mockReset();
    mocks.prisma.user.create.mockReset();
    mocks.prisma.consentLog.create.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.rateLimit.mockReset();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 9, retryAfterSeconds: 0 });
  });

  it("fails registration atomically when consent logging fails", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: "user_123",
      name: "Athlete One",
      email: "athlete@example.com",
    });
    mocks.prisma.consentLog.create.mockRejectedValueOnce(new Error("consent log unavailable"));

    const response = await POST(
      new Request("http://localhost/api/auth/register", {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          name: "Athlete One",
          email: "athlete@example.com",
          password: "supersecurepassword",
          role: "ATHLETE",
          age: 18,
          primarySport: "soccer",
          position: "MID",
          team: "FC North",
          competitionLevel: "academy",
          gender: "female",
        }),
      }),
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Registration could not be completed.",
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.user.create).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.consentLog.create).toHaveBeenCalledTimes(1);
    expect(mocks.consoleWarn).not.toHaveBeenCalled();
  });

  it("records a minimal security audit with account creation and fails closed if it cannot be written", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: "user_123",
      email: "athlete@example.com",
      role: "ATHLETE",
      parentConsentVerified: true,
    });
    mocks.prisma.consentLog.create.mockResolvedValue({});

    const successfulResponse = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Athlete One",
        email: "athlete@example.com",
        password: "supersecurepassword",
        role: "ATHLETE",
        age: 18,
        primarySport: "soccer",
        position: "MID",
        competitionLevel: "academy",
      }),
    }));

    expect(successfulResponse.status).toBe(200);
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Account registered",
        metadata: { action: "ACCOUNT_REGISTERED", actorUserId: "user_123" },
      },
    });

    mocks.prisma.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));
    const failedResponse = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Athlete Two",
        email: "athlete-two@example.com",
        password: "supersecurepassword",
        role: "ATHLETE",
        age: 18,
        primarySport: "soccer",
        position: "MID",
        competitionLevel: "academy",
      }),
    }));

    expect(failedResponse.status).toBe(503);
    await expect(failedResponse.json()).resolves.toEqual({
      error: "Registration could not be completed.",
    });
  });

  it("does not duplicate a minor's parent email into consent-log notes", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.create.mockResolvedValue({
      id: "minor-123",
      email: "minor@example.com",
      role: "ATHLETE",
      parentConsentVerified: false,
    });
    mocks.prisma.consentLog.create.mockResolvedValue({});

    const response = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json", "x-real-ip": "192.0.2.10" },
      body: JSON.stringify({
        name: "Minor Athlete",
        email: "minor@example.com",
        password: "supersecurepassword",
        role: "ATHLETE",
        age: 14,
        primarySport: "baseball",
        performanceGoal: "Improve verified throwing velocity.",
        position: "P",
        competitionLevel: "academy",
        parentEmail: "parent-private@example.com",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.consentLog.create).toHaveBeenCalledTimes(3);
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        primarySport: "baseball",
        performanceGoal: "Improve verified throwing velocity.",
      }),
    }));
    for (const [call] of mocks.prisma.consentLog.create.mock.calls) {
      expect(call.data.notes).not.toContain("parent-private@example.com");
    }
  });

  it("records a valid referral without exposing the referrer in the response", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.findFirst.mockResolvedValue({ id: "referrer-123" });
    mocks.prisma.user.create.mockResolvedValue({
      id: "athlete-123",
      email: "athlete@example.com",
      role: "ATHLETE",
      parentConsentVerified: true,
    });
    mocks.prisma.consentLog.create.mockResolvedValue({});

    const response = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Athlete One",
        email: "athlete@example.com",
        password: "supersecurepassword",
        role: "ATHLETE",
        age: 18,
        primarySport: "soccer",
        position: "MID",
        competitionLevel: "academy",
        referralCode: "ab12cd34ef56gh78",
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.user.findFirst).toHaveBeenCalledWith({
      where: { referralCode: "AB12CD34EF56GH78", deletedAt: null },
      select: { id: true },
    });
    expect(mocks.prisma.user.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ referredByUserId: "referrer-123", referralCode: expect.stringMatching(/^[A-Z0-9]{16}$/) }),
    }));
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      ok: true,
      user: expect.not.objectContaining({ referredByUserId: expect.anything(), referralCode: expect.anything() }),
    }));
  });

  it("rejects unknown referral codes without creating an account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue(null);
    mocks.prisma.user.findFirst.mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Athlete One",
        email: "athlete@example.com",
        password: "supersecurepassword",
        role: "ATHLETE",
        age: 18,
        primarySport: "soccer",
        position: "MID",
        competitionLevel: "academy",
        referralCode: "A1B2C3D4E5F6G7H8",
      }),
    }));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid referral code." });
    expect(mocks.prisma.user.create).not.toHaveBeenCalled();
  });
});
