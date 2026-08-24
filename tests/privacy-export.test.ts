import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-export", email: "athlete@example.com", role: "ATHLETE" } },
  rateLimit: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn() },
    dataExportRequest: { create: vi.fn(), update: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/distributed-rate-limit", () => ({ checkDatabaseRateLimit: mocks.rateLimit }));

const { POST } = await import("@/app/api/privacy/export/route");

describe("POST /api/privacy/export", () => {
  beforeEach(() => {
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.dataExportRequest.create.mockReset();
    mocks.prisma.dataExportRequest.update.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.rateLimit.mockReset();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 2, retryAfterSeconds: 0 });
    mocks.prisma.dataExportRequest.create.mockResolvedValue({ id: "export-1" });
    mocks.prisma.dataExportRequest.update.mockResolvedValue({});
    mocks.prisma.systemLog.create.mockResolvedValue({ id: "export-audit-1" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("exports all user-linked product, consent, moderation, and provider identifiers without credential tokens", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-export",
      submissions: [],
      consentLogs: [{
        id: "consent-1",
        userId: "user-export",
        actorUserId: "user-export",
        consentType: "MODEL_TRAINING",
        granted: true,
        createdAt: new Date("2026-07-29T00:00:00.000Z"),
      }],
    });
    const response = await POST();

    expect(response.status).toBe(200);
    const selection = mocks.prisma.user.findUnique.mock.calls[0][0].select;
    for (const relation of [
      "accounts",
      "coachingPlans",
      "consentActions",
      "reportsFiled",
      "reportsReviewed",
      "validationSubmissions",
      "validationApprovals",
      "manualOverrides",
    ]) {
      expect(selection).toHaveProperty(relation);
    }
    expect(selection.accounts.select).toMatchObject({
      provider: true,
      providerAccountId: true,
    });
    expect(selection.accounts.select).not.toHaveProperty("access_token");
    expect(selection.accounts.select).not.toHaveProperty("refresh_token");
    expect(selection.accounts.select).not.toHaveProperty("id_token");
    expect(selection.billingAccount.select).toMatchObject({ stripeCustomerId: true });
    expect(selection.billingAccount.select.subscription.select).toMatchObject({
      stripeSubscriptionId: true,
      priceId: true,
    });
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Data export generated",
        metadata: {
          action: "DATA_EXPORT_GENERATED",
          actorUserId: "user-export",
          exportRequestId: "export-1",
        },
      },
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    const body = await response.json();
    expect(body.data.modelTrainingConsent).toEqual({
      granted: true,
      history: [expect.objectContaining({ consentType: "MODEL_TRAINING", granted: true })],
    });
  });

  it("rate limits repeated export generation before querying user data", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1800 });
    const response = await POST();
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1800");
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("fails closed without returning exported data when the audit write fails", async () => {
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    mocks.prisma.user.findUnique.mockResolvedValue({
      id: "user-export",
      submissions: [],
      consentLogs: [],
    });

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Export could not be recorded safely." });
  });
});
