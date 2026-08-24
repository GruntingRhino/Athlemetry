import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-1", role: "ATHLETE" } } as { user: { id: string; role: string } } | null,
  canUsePaidFeatures: vi.fn(),
  checkDatabaseRateLimit: vi.fn(),
  isMetricReleased: vi.fn(),
  hasReleasedMetricValue: vi.fn(),
  prisma: {
    drillSubmission: { findMany: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/billing", () => ({ canUsePaidFeatures: mocks.canUsePaidFeatures }));
vi.mock("@/lib/distributed-rate-limit", () => ({ checkDatabaseRateLimit: mocks.checkDatabaseRateLimit }));
vi.mock("@/lib/customer-metrics", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/lib/customer-metrics")>(),
  isMetricReleased: mocks.isMetricReleased,
  hasReleasedMetricValue: mocks.hasReleasedMetricValue,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { GET } = await import("@/app/api/reports/export/route");

describe("GET /api/reports/export", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.canUsePaidFeatures.mockResolvedValue(true);
    mocks.checkDatabaseRateLimit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.isMetricReleased.mockReturnValue(true);
    mocks.hasReleasedMetricValue.mockReturnValue(true);
    mocks.prisma.drillSubmission.findMany.mockResolvedValue([{
      id: "submission-1",
      recordingDate: new Date("2026-07-30T00:00:00.000Z"),
      location: "Training field",
      metadata: {
        captureAssessment: { source: "vision-core-protocol-assessment-v1", status: "VERIFIED" },
        performanceAssessment: {
          source: "athlemetry-performance-verification-v1",
          status: "VERIFIED",
          metricName: "sprintTime",
          metricVersion: "model-1",
          protocolVersion: "1.1.0",
          verifiedAt: "2026-07-30T00:00:00.000Z",
        },
      },
      metricResult: { metricVersion: "model-1", sprintTime: 3.4, reliabilityScore: 1 },
      benchmarkSnapshots: { percentile: 83 },
      drillDefinition: {
        name: "20 m sprint",
        slug: "sprint-20m",
        metricPrimaryKey: "sprintTime",
        metricValidations: [{ metricName: "sprintTime" }],
      },
    }]);
    mocks.prisma.systemLog.create.mockResolvedValue({ id: "audit-1" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("returns only released owner report values and records an export audit event", async () => {
    const response = await GET();

    expect(response.status).toBe(200);
    expect(mocks.prisma.drillSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { athleteId: "athlete-1", processingStatus: "COMPLETED" },
    }));
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Customer reports exported",
        metadata: { action: "CUSTOMER_REPORTS_EXPORTED", actorUserId: "athlete-1" },
      },
    });
    await expect(response.json()).resolves.toMatchObject({
      reports: [{
        submissionId: "submission-1",
        drill: "20 m sprint",
        metrics: [{ key: "sprintTime", value: 3.4, unit: "seconds" }],
      }],
    });
  });

  it("rejects unpaid users before querying reports", async () => {
    mocks.canUsePaidFeatures.mockResolvedValue(false);

    const response = await GET();

    expect(response.status).toBe(402);
    expect(mocks.prisma.drillSubmission.findMany).not.toHaveBeenCalled();
  });

  it("fails closed when the export audit cannot be persisted", async () => {
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await GET();

    expect(response.status).toBe(503);
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledTimes(1);
  });
});
