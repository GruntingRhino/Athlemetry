import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1", email: "athlete@example.com", role: "ATHLETE" } },
  compare: vi.fn(),
  retrieveSubscription: vi.fn(),
  cancelSubscription: vi.fn(),
  rateLimit: vi.fn(),
  prisma: {
    user: { findUnique: vi.fn(), update: vi.fn() },
    account: { deleteMany: vi.fn() },
    dataExportRequest: { deleteMany: vi.fn() },
    userReport: { deleteMany: vi.fn(), updateMany: vi.fn() },
    metricValidation: { updateMany: vi.fn() },
    manualOverride: { deleteMany: vi.fn() },
    retrainingJob: { updateMany: vi.fn() },
    drillSubmission: { deleteMany: vi.fn() },
    userNotification: { deleteMany: vi.fn() },
    billingAccount: { deleteMany: vi.fn() },
    session: { deleteMany: vi.fn() },
    consentLog: { create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    benchmarkAggregate: { deleteMany: vi.fn() },
    benchmarkRebuildJob: { upsert: vi.fn() },
    erasureTombstone: { upsert: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/billing", () => ({
  getStripeClient: () => ({
    subscriptions: {
      retrieve: mocks.retrieveSubscription,
      cancel: mocks.cancelSubscription,
    },
  }),
}));
vi.mock("@/lib/distributed-rate-limit", () => ({ checkDatabaseRateLimit: mocks.rateLimit }));

const { POST } = await import("@/app/api/privacy/delete/route");

describe("POST /api/privacy/delete", () => {
  beforeEach(() => {
    mocks.prisma.user.findUnique.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.compare.mockReset();
    mocks.retrieveSubscription.mockReset();
    mocks.cancelSubscription.mockReset();
    mocks.rateLimit.mockReset();
    mocks.rateLimit.mockResolvedValue({ allowed: true, remaining: 4, retryAfterSeconds: 0 });
  });

  it("requires a password confirmation before any database mutation", async () => {
    const response = await POST(new Request("http://localhost/api/privacy/delete", { method: "POST", body: "{}" }));
    expect(response.status).toBe(400);
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("rate limits destructive attempts before password verification", async () => {
    mocks.rateLimit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 120 });
    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "guess" }),
    }));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(mocks.prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it("rejects deletion of an already deleted account", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ deletedAt: new Date(), passwordHash: "hash" });
    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "secret" }),
    }));
    expect(response.status).toBe(409);
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("rejects deletion with wrong password", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({ deletedAt: null, passwordHash: "hash" });
    mocks.compare.mockResolvedValue(false);
    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ password: "wrong" }),
    }));
    expect(response.status).toBe(401);
    const body = await response.json();
    expect(body.error).toMatch(/password confirmation failed/i);
    expect(mocks.compare).toHaveBeenCalledWith("wrong", "hash");
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("removes or dissociates retained identity-bearing records before anonymizing the user", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
      billingAccount: null,
      submissions: [],
    });
    mocks.compare.mockResolvedValue(true);
    mocks.prisma.$transaction.mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.account.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mocks.prisma.dataExportRequest.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mocks.prisma.userReport.deleteMany).toHaveBeenCalledWith({ where: { reporterId: "user-1" } });
    expect(mocks.prisma.userReport.updateMany).toHaveBeenCalledWith({
      where: { reviewedById: "user-1" },
      data: { reviewedById: null },
    });
    expect(mocks.prisma.consentLog.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-1" } });
    expect(mocks.prisma.consentLog.updateMany).toHaveBeenCalledWith({
      where: { actorUserId: "user-1" },
      data: { actorUserId: null, notes: "Action retained after actor account deletion." },
    });
    expect(mocks.prisma.erasureTombstone.upsert).toHaveBeenCalledWith({
      where: { userId: "user-1" },
      create: { userId: "user-1" },
      update: { erasedAt: expect.any(Date) },
    });
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Account deletion finalized",
        metadata: { action: "ACCOUNT_DELETION_FINALIZED", actorUserId: "user-1" },
      },
    });
  });

  it("invalidates and schedules rebuilds for cohorts affected by account deletion", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
      billingAccount: null,
      age: 20,
      position: "MID",
      competitionLevel: "academy",
      gender: "female",
      submissions: [{
        id: "submission-1",
        storageProvider: "local",
        storageKey: null,
        drillType: "SOCCER_20M_SPRINT",
        drillDefinitionId: "drill-1",
        drillDefinition: { metricPrimaryKey: "sprintTime" },
      }],
    });
    mocks.compare.mockResolvedValue(true);
    mocks.prisma.$transaction.mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.benchmarkAggregate.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{
          cohortKey: "SOCCER_20M_SPRINT|20-21|MID|academy|female",
          drillDefinitionId: "drill-1",
          metricName: "sprintTime",
        }],
      },
    });
    expect(mocks.prisma.benchmarkRebuildJob.upsert).toHaveBeenCalledOnce();
  });

  it("treats an already-canceled provider subscription as idempotent deletion success", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
      billingAccount: { subscription: { stripeSubscriptionId: "sub_already_canceled", status: "active" } },
      submissions: [],
    });
    mocks.compare.mockResolvedValue(true);
    mocks.retrieveSubscription.mockResolvedValue({ status: "canceled" });
    mocks.prisma.$transaction.mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.retrieveSubscription).toHaveBeenCalledWith("sub_already_canceled");
    expect(mocks.cancelSubscription).not.toHaveBeenCalled();
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it("confirms an active provider subscription before cancellation", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
      billingAccount: { subscription: { stripeSubscriptionId: "sub_active", status: "active" } },
      submissions: [],
    });
    mocks.compare.mockResolvedValue(true);
    mocks.retrieveSubscription.mockResolvedValue({ status: "active" });
    mocks.cancelSubscription.mockResolvedValue({ status: "canceled" });
    mocks.prisma.$transaction.mockResolvedValue([]);

    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.cancelSubscription).toHaveBeenCalledWith("sub_active");
  });

  it("fails closed when the provider does not confirm cancellation", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
      billingAccount: { subscription: { stripeSubscriptionId: "sub_unconfirmed", status: "active" } },
      submissions: [],
    });
    mocks.compare.mockResolvedValue(true);
    mocks.retrieveSubscription.mockResolvedValue({ status: "active" });
    mocks.cancelSubscription.mockResolvedValue({ status: "active" });

    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    }));

    expect(response.status).toBe(502);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns a retryable response when atomic database finalization fails", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
      billingAccount: null,
      submissions: [],
    });
    mocks.compare.mockResolvedValue(true);
    mocks.prisma.$transaction.mockRejectedValue(new Error("synthetic finalization failure"));

    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      retryable: true,
    });
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("fails closed without clearing the session when the deletion audit cannot be persisted", async () => {
    mocks.prisma.user.findUnique.mockResolvedValue({
      deletedAt: null,
      passwordHash: "hash",
      billingAccount: null,
      submissions: [],
    });
    mocks.compare.mockResolvedValue(true);
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("synthetic audit failure"));
    mocks.prisma.$transaction.mockImplementation(async (operations: unknown[]) => Promise.all(operations));

    const response = await POST(new Request("http://localhost/api/privacy/delete", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ password: "correct" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ retryable: true });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledOnce();
  });
});
