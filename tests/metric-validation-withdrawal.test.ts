import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    metricValidation: { upsert: vi.fn() },
    benchmarkSnapshot: { deleteMany: vi.fn() },
    benchmarkAggregate: { deleteMany: vi.fn() },
    coachingPlan: { updateMany: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    tx,
    prisma: {
      drillDefinition: { findUnique: vi.fn() },
      metricValidation: { findUnique: vi.fn(), upsert: vi.fn() },
      $transaction: vi.fn(),
    },
  };
});

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "admin-1", role: "ADMIN" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/admin/metric-validation/route");
const perClassObjectTracking = Object.fromEntries(
  ["ball", "bat", "hoop", "goal", "plate", "cone", "target"].map((name) => [name, {
    observations: 500, precision: 0.95, recall: 0.95, hota: 0.8,
  }]),
);

function capabilityEvidence() {
  return {
    schemaVersion: "athlemetry-capability-validation-v1",
    independentlyReviewed: true,
    objectTracking: { observations: 500, precision: 0.95, recall: 0.94, hota: 0.8, perClass: perClassObjectTracking },
    athleteReid: { observations: 500, uniqueAthletes: 50, idf1: 0.94, identitySwitchRate: 0.005, occlusionRecoveryRate: 0.93 },
    sportDrillRecognition: { clips: 300, accuracy: 0.97, falseConfirmationRate: 0.005 },
    repetitionSegmentation: { attempts: 300, precision: 0.94, recall: 0.93 },
    invalidAttemptDetection: { attempts: 300, invalidAttempts: 100, sensitivity: 0.93, specificity: 0.94 },
    planarCalibration: { captures: 100, p90ErrorMeters: 0.03, failureRate: 0.03 },
    videoNormalization: { clips: 100, deviceModels: 5, decodeFailureRate: 0.005 },
  };
}

describe("metric validation evidence replacement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.drillDefinition.findUnique.mockResolvedValue({
      id: "drill-1",
      slug: "sprint-20m",
      metricPrimaryKey: "sprintTime",
    });
    mocks.prisma.metricValidation.findUnique.mockResolvedValue({ status: "VALIDATED" });
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    mocks.tx.metricValidation.upsert.mockResolvedValue({ id: "validation-1", status: "COLLECTING" });
    mocks.tx.systemLog.create.mockResolvedValue({ id: "audit-1" });
  });

  it("atomically withdraws rankings and coaching plans when validated primary evidence is replaced", async () => {
    const response = await POST(new Request("http://localhost/api/admin/metric-validation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drillDefinitionId: "drill-1",
        metricName: "sprintTime",
        modelVersion: "vision-v1",
        sampleSize: 100,
        p90Error: 0.1,
        failureRate: 0.01,
        confidenceCalibrationError: 0.02,
        expertAgreement: 0.95,
        evidenceUri: "https://evidence.example.test/study.json",
        evidenceSha256: "a".repeat(64),
        reviewedBy: "Expert A, Expert B",
        capabilityEvidence: capabilityEvidence(),
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledOnce();
    expect(mocks.tx.benchmarkSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { submission: { drillDefinitionId: "drill-1" } },
    });
    expect(mocks.tx.benchmarkAggregate.deleteMany).toHaveBeenCalledWith({
      where: { drillDefinitionId: "drill-1", metricName: "sprintTime" },
    });
    expect(mocks.tx.coachingPlan.updateMany).toHaveBeenCalledWith({
      where: { drillDefinitionId: "drill-1", status: "ACTIVE" },
      data: { status: "WITHHELD" },
    });
    expect(mocks.tx.metricValidation.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ capabilityEvidence: capabilityEvidence() }),
      create: expect.objectContaining({ capabilityEvidence: capabilityEvidence() }),
    }));
    expect(mocks.tx.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Metric validation evidence submitted",
        metadata: {
          action: "METRIC_VALIDATION_SUBMITTED",
          actorUserId: "admin-1",
          validationId: "validation-1",
        },
      },
    });
  });

  it("fails closed when metric-validation submission audit writing fails", async () => {
    mocks.tx.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/admin/metric-validation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drillDefinitionId: "drill-1",
        metricName: "sprintTime",
        modelVersion: "vision-v1",
        sampleSize: 100,
        p90Error: 0.1,
        failureRate: 0.01,
        confidenceCalibrationError: 0.02,
        expertAgreement: 0.95,
        evidenceUri: "https://evidence.example.test/study.json",
        evidenceSha256: "a".repeat(64),
        reviewedBy: "Expert A, Expert B",
        capabilityEvidence: capabilityEvidence(),
      }),
    }));

    expect(response.status).toBe(503);
  });

  it("rejects metric evidence when professional capability evidence is missing", async () => {
    const response = await POST(new Request("http://localhost/api/admin/metric-validation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        drillDefinitionId: "drill-1",
        metricName: "sprintTime",
        modelVersion: "vision-v1",
        sampleSize: 100,
        p90Error: 0.1,
        failureRate: 0.01,
        confidenceCalibrationError: 0.02,
        expertAgreement: 0.95,
        evidenceUri: "https://evidence.example.test/study.json",
        evidenceSha256: "a".repeat(64),
        reviewedBy: "Expert A, Expert B",
      }),
    }));
    expect(response.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });
});
