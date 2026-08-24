import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    benchmarkRebuildJob: { upsert: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    recalculate: vi.fn(),
    tx,
    prisma: {
      drillSubmission: { findMany: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "admin-1", role: "ADMIN" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/benchmarking", () => ({ recalculateBenchmarksForSubmission: mocks.recalculate }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/benchmark/recalculate/route");

describe("admin benchmark recalculation scheduling", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.$queryRaw.mockResolvedValue([
      {
        cohortKey: "sprint-20m|20-21|MID|academy|female",
        drillDefinitionId: "drill-1",
        metricName: "sprintTime",
      },
      {
        cohortKey: "free-throw|20-21|GUARD|academy|female",
        drillDefinitionId: "drill-2",
        metricName: "shotAccuracy",
      },
    ]);
    mocks.tx.benchmarkRebuildJob.upsert.mockResolvedValue({});
    mocks.tx.systemLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("queues distinct cohorts with a minimal administrator audit instead of synchronously recalculating every submission", async () => {
    const response = await POST();
    const body = await response.json();

    expect(response.status).toBe(202);
    expect(body).toEqual({ ok: true, queued: 2 });
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.benchmarkRebuildJob.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.tx.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Benchmark rebuilds queued",
        metadata: {
          action: "BENCHMARK_REBUILDS_QUEUED",
          actorUserId: "admin-1",
          queued: 2,
        },
      },
    });
    expect(mocks.recalculate).not.toHaveBeenCalled();
    expect(mocks.prisma.drillSubmission.findMany).not.toHaveBeenCalled();
  });

  it("fails closed when the benchmark-rebuild audit cannot commit", async () => {
    mocks.tx.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Benchmark rebuild scheduling could not be recorded safely." });
  });
});
