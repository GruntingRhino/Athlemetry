import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    benchmarkSnapshot: { deleteMany: vi.fn(), createMany: vi.fn() },
    benchmarkAggregate: { upsert: vi.fn() },
  };
  return {
    tx,
    prisma: {
      drillSubmission: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
      benchmarkSnapshot: { deleteMany: vi.fn(), upsert: vi.fn() },
      benchmarkAggregate: { deleteMany: vi.fn(), upsert: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/customer-metrics", () => ({ isPrimaryMetricReleased: vi.fn(async () => true) }));
vi.mock("@/lib/capture-adherence", () => ({
  CAPTURE_ASSESSMENT_SOURCE: "capture-test",
  isCaptureVerified: vi.fn(() => true),
}));
vi.mock("@/lib/performance-verification", () => ({
  PERFORMANCE_ASSESSMENT_SOURCE: "performance-test",
  buildPerformanceAssessment: vi.fn(),
  isPerformanceAssessmentVerified: vi.fn(() => true),
}));

const { recalculateBenchmarksForSubmission } = await import("@/lib/benchmarking");

describe("cohort benchmark persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      id: "submission-0",
      athleteId: "athlete-0",
      drillDefinitionId: "drill-1",
      drillType: "SOCCER_20M_SPRINT",
      metadata: {},
      athlete: {
        id: "athlete-0",
        age: 20,
        position: "MID",
        competitionLevel: "academy",
        gender: "female",
        anonymizeForBenchmark: true,
        shareInBenchmarks: true,
      },
      drillDefinition: {
        id: "drill-1",
        slug: "sprint-20m",
        metricPrimaryKey: "sprintTime",
        lowerIsBetter: true,
      },
      metricResult: { sprintTime: 1, metricVersion: "v1", reliabilityScore: 90 },
    });
    mocks.prisma.drillSubmission.findMany.mockResolvedValue(Array.from({ length: 20 }, (_, index) => ({
      id: `submission-${index}`,
      athleteId: `athlete-${index}`,
      athlete: { id: `athlete-${index}`, anonymizeForBenchmark: true },
      metricResult: { sprintTime: index + 1 },
    })));
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.benchmarkSnapshot.deleteMany.mockResolvedValue({ count: 0 });
    mocks.tx.benchmarkSnapshot.createMany.mockResolvedValue({ count: 20 });
    mocks.tx.benchmarkAggregate.upsert.mockResolvedValue({});
  });

  it("replaces every eligible cohort snapshot in one transaction", async () => {
    await recalculateBenchmarksForSubmission("submission-0");

    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.benchmarkSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { cohortKey: "SOCCER_20M_SPRINT|20-21|MID|academy|female" },
    });
    expect(mocks.tx.benchmarkSnapshot.createMany).toHaveBeenCalledOnce();
    const rows = mocks.tx.benchmarkSnapshot.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(20);
    expect(rows.map((row: { submissionId: string }) => row.submissionId)).toContain("submission-19");
    expect(mocks.tx.benchmarkAggregate.upsert).toHaveBeenCalledOnce();
    expect(mocks.prisma.benchmarkSnapshot.upsert).not.toHaveBeenCalled();
  });
});
