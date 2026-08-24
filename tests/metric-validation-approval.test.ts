import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    metricValidation: { update: vi.fn() },
    benchmarkRebuildJob: { upsert: vi.fn() },
    coachingPlan: { updateMany: vi.fn() },
    systemLog: { create: vi.fn() },
    $queryRaw: vi.fn(),
  };
  return {
    tx,
    prisma: {
      metricValidation: { findUnique: vi.fn(), update: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "approver-admin", role: "ADMIN" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/admin/metric-validation/approve/route");
const perClassObjectTracking = Object.fromEntries(
  ["ball", "bat", "hoop", "goal", "plate", "cone", "target"].map((name) => [name, {
    observations: 500, precision: 0.95, recall: 0.95, hota: 0.8,
  }]),
);

describe("metric validation approval backfill", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.metricValidation.findUnique.mockResolvedValue({
      id: "validation-1",
      drillDefinitionId: "drill-1",
      metricName: "sprintTime",
      protocolVersion: "1.1.0",
      status: "COLLECTING",
      sampleSize: 100,
      p90Error: 0.1,
      failureRate: 0.01,
      confidenceCalibrationError: 0.02,
      expertAgreement: 0.95,
      evidenceUri: "https://evidence.example.test/study.json",
      evidenceSha256: "a".repeat(64),
      reviewedBy: "Expert A, Expert B",
      capabilityEvidence: {
        schemaVersion: "athlemetry-capability-validation-v1",
        independentlyReviewed: true,
        objectTracking: { observations: 500, precision: 0.95, recall: 0.94, hota: 0.8, perClass: perClassObjectTracking },
        athleteReid: { observations: 500, uniqueAthletes: 50, idf1: 0.94, identitySwitchRate: 0.005, occlusionRecoveryRate: 0.93 },
        sportDrillRecognition: { clips: 300, accuracy: 0.97, falseConfirmationRate: 0.005 },
        repetitionSegmentation: { attempts: 300, precision: 0.94, recall: 0.93 },
        invalidAttemptDetection: { attempts: 300, invalidAttempts: 100, sensitivity: 0.93, specificity: 0.94 },
        planarCalibration: { captures: 100, p90ErrorMeters: 0.03, failureRate: 0.03 },
        videoNormalization: { clips: 100, deviceModels: 5, decodeFailureRate: 0.005 },
      },
      submittedByUserId: "submitter-admin",
      drillDefinition: { id: "drill-1", slug: "sprint-20m", metricPrimaryKey: "sprintTime" },
    });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.metricValidation.update.mockResolvedValue({ id: "validation-1", status: "VALIDATED" });
    mocks.tx.$queryRaw.mockResolvedValue([
      { cohortKey: "SOCCER_20M_SPRINT|20-21|MID|academy|female", drillDefinitionId: "drill-1", metricName: "sprintTime" },
      { cohortKey: "SOCCER_20M_SPRINT|22-23|MID|academy|female", drillDefinitionId: "drill-1", metricName: "sprintTime" },
    ]);
  });

  it("atomically approves primary evidence and queues every historical cohort for rebuild", async () => {
    const response = await POST(new Request("http://localhost/api/admin/metric-validation/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ validationId: "validation-1" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.benchmarkRebuildJob.upsert).toHaveBeenCalledTimes(2);
    expect(mocks.tx.benchmarkRebuildJob.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: {
        cohortKey_drillDefinitionId_metricName: {
          cohortKey: "SOCCER_20M_SPRINT|20-21|MID|academy|female",
          drillDefinitionId: "drill-1",
          metricName: "sprintTime",
        },
      },
    }));
    expect(mocks.tx.coachingPlan.updateMany).toHaveBeenCalledWith({
      where: { drillDefinitionId: "drill-1", status: "WITHHELD" },
      data: { status: "ACTIVE" },
    });
    expect(mocks.tx.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Metric validation approved",
        metadata: {
          action: "METRIC_VALIDATION_APPROVED",
          actorUserId: "approver-admin",
          validationId: "validation-1",
        },
      },
    });
  });

  it("fails closed when the approval audit cannot be written", async () => {
    mocks.tx.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/admin/metric-validation/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ validationId: "validation-1" }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "Metric validation approval could not be recorded safely.",
    });
  });

  it("refuses approval when professional capability evidence is missing", async () => {
    const validation = await mocks.prisma.metricValidation.findUnique();
    mocks.prisma.metricValidation.findUnique.mockResolvedValue({ ...validation, capabilityEvidence: null });
    const response = await POST(new Request("http://localhost/api/admin/metric-validation/approve", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ validationId: "validation-1" }),
    }));
    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual(expect.objectContaining({
      reasons: expect.arrayContaining(["capability-evidence-missing"]),
    }));
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
