import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    user: { update: vi.fn() },
    consentLog: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    benchmarkSnapshot: { deleteMany: vi.fn() },
    benchmarkAggregate: { deleteMany: vi.fn() },
    benchmarkRebuildJob: { upsert: vi.fn() },
  };
  return {
    tx,
    session: { user: { id: "athlete-1", role: "ATHLETE" } },
    prisma: {
      user: { findUnique: vi.fn() },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { PATCH } = await import("@/app/api/profile/route");

const payload = {
  name: "Test Athlete",
  age: 20,
  primarySport: "baseball",
  performanceGoal: "Increase verified pitch velocity by 2 mph.",
  position: "P",
  team: "Test FC",
  competitionLevel: "academy",
  gender: "female",
  shareInBenchmarks: false,
  anonymizeForBenchmark: true,
};

describe("profile benchmark privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.user.update.mockResolvedValue({
      id: "athlete-1",
      email: "athlete@example.test",
      passwordHash: "must-never-leave-the-server",
      ...payload,
    });
    mocks.prisma.user.findUnique.mockResolvedValue({
      age: 20,
      primarySport: "baseball",
      performanceGoal: "Increase verified pitch velocity by 2 mph.",
      position: "P",
      competitionLevel: "academy",
      gender: "female",
      parentConsentVerified: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
      submissions: [{
        drillType: "soccer-sprint-20m",
        drillDefinitionId: "drill-1",
        drillDefinition: { metricPrimaryKey: "sprintTime" },
      }],
    });
  });

  it("atomically removes affected cohort state when an athlete opts out", async () => {
    const response = await PATCH(new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      user: expect.not.objectContaining({ passwordHash: expect.anything() }),
    });
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.benchmarkSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { cohortKey: { in: ["soccer-sprint-20m|20-21|P|academy|female"] } },
    });
    expect(mocks.tx.benchmarkAggregate.deleteMany).toHaveBeenCalledWith({
      where: {
        OR: [{
          cohortKey: "soccer-sprint-20m|20-21|P|academy|female",
          drillDefinitionId: "drill-1",
          metricName: "sprintTime",
        }],
      },
    });
    expect(mocks.tx.benchmarkRebuildJob.upsert).toHaveBeenCalledTimes(1);
    expect(mocks.tx.consentLog.create).toHaveBeenCalledOnce();
    expect(mocks.tx.user.update).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        primarySport: "baseball",
        performanceGoal: "Increase verified pitch velocity by 2 mph.",
      }),
    }));
  });

  it("rebuilds both old and new cohorts after a demographic move", async () => {
    const response = await PATCH(new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...payload, age: 22, shareInBenchmarks: true }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.tx.benchmarkSnapshot.deleteMany).toHaveBeenCalledWith({
      where: {
        cohortKey: {
          in: [
            "soccer-sprint-20m|20-21|P|academy|female",
            "soccer-sprint-20m|22-23|P|academy|female",
          ],
        },
      },
    });
    expect(mocks.tx.benchmarkRebuildJob.upsert).toHaveBeenCalledTimes(2);
  });

  it("writes a minimal security audit record in the same transaction as every profile update", async () => {
    const response = await PATCH(new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(200);
    expect(mocks.tx.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Profile updated",
        metadata: {
          action: "PROFILE_UPDATED",
          actorUserId: "athlete-1",
        },
      },
    });
  });

  it("fails closed when the profile security audit cannot be written", async () => {
    mocks.tx.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await PATCH(new Request("http://localhost/api/profile", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Profile could not be updated safely." });
  });
});
