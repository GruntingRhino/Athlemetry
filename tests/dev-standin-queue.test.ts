import { beforeEach, describe, expect, it, vi } from "vitest";

import { buildStandInAnalysis, DEV_STANDIN_ENGINE, DEV_STANDIN_MODEL_VERSION, parseVlmOutput } from "@/lib/dev-standin";

const mocks = vi.hoisted(() => ({
  prisma: {
    drillSubmission: { findUnique: vi.fn(), updateMany: vi.fn(), update: vi.fn() },
    metricResult: { upsert: vi.fn() },
    processingLog: { create: vi.fn() },
    modelVersion: { findFirst: vi.fn() },
    systemLog: { create: vi.fn() },
  },
  runAnalysisEngine: vi.fn(),
  isPrimaryMetricReleased: vi.fn(),
  recalculateBenchmarksForSubmission: vi.fn(),
  upsertCoachingPlanForSubmission: vi.fn(),
  materializeStoredVideo: vi.fn(),
  verifyMaterializedVideoHash: vi.fn(),
  purgeStoredVideo: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/analysis-engine", () => ({ runAnalysisEngine: mocks.runAnalysisEngine, REAL_ENGINE: "athlemetry-vision-core" }));
vi.mock("@/lib/customer-metrics", () => ({ isPrimaryMetricReleased: mocks.isPrimaryMetricReleased }));
vi.mock("@/lib/benchmarking", () => ({ recalculateBenchmarksForSubmission: mocks.recalculateBenchmarksForSubmission }));
vi.mock("@/lib/coaching-plans", () => ({
  upsertCoachingPlanForSubmission: mocks.upsertCoachingPlanForSubmission,
  backfillCoachingPlans: vi.fn(),
}));
vi.mock("@/lib/engagement", () => ({ scheduleEngagementNotifications: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  materializeStoredVideo: mocks.materializeStoredVideo,
  verifyMaterializedVideoHash: mocks.verifyMaterializedVideoHash,
  purgeStoredVideo: mocks.purgeStoredVideo,
  getReviewExpiryDate: vi.fn(),
  getFailedDebugExpiryDate: vi.fn(),
}));

const { processSubmission } = await import("@/lib/processing/queue");

const vlm = parseVlmOutput(JSON.stringify({
  drillShown: true, confidence: 0.9, grade: 88, summary: "Looks fine.", observations: [], issues: [], recommendations: [],
}));
const standIn = buildStandInAnalysis({
  sport: "soccer", drill: "sprint-20m", vlm, model: "m",
  probe: { fps: 30, width: 1280, height: 720, durationSeconds: 4, frameCount: 120 },
});

describe("processSubmission with the dev stand-in engine", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      id: "sub-1", athleteId: "ath-1", drillDefinitionId: "drill-1", processingAttempts: 0,
      storageProvider: "local", storageKey: "a/b.mp4", videoHash: null, metadata: {},
      drillDefinition: { slug: "sprint-20m", sport: "soccer", metricPrimaryKey: "sprintTime" },
    });
    mocks.prisma.drillSubmission.updateMany.mockResolvedValue({ count: 1 });
    mocks.prisma.drillSubmission.update.mockResolvedValue({});
    mocks.prisma.metricResult.upsert.mockImplementation(async ({ create }) => ({ ...create }));
    mocks.prisma.processingLog.create.mockResolvedValue({});
    mocks.prisma.modelVersion.findFirst.mockResolvedValue({ version: "v1.0.0" });
    mocks.materializeStoredVideo.mockResolvedValue({ path: "/tmp/x.mp4", cleanup: vi.fn(async () => {}) });
    mocks.purgeStoredVideo.mockResolvedValue({ ok: true });
    mocks.isPrimaryMetricReleased.mockResolvedValue(true); // hostile: pretend a validation exists
    mocks.runAnalysisEngine.mockResolvedValue({
      engine: DEV_STANDIN_ENGINE, analysis: standIn.analysis, devStandIn: standIn.report,
    });
  });

  const completedMetadata = () => {
    const call = mocks.prisma.drillSubmission.update.mock.calls.find(([arg]) => arg.data.processingStatus === "COMPLETED");
    expect(call).toBeTruthy();
    return call![0].data.metadata;
  };

  it("persists under a model version no validation can match, with no performance metric", async () => {
    const result = await processSubmission("sub-1");
    expect(result.ok).toBe(true);
    const created = mocks.prisma.metricResult.upsert.mock.calls[0][0].create;
    expect(created.metricVersion).toBe(DEV_STANDIN_MODEL_VERSION);
    expect(created.sprintTime).toBeUndefined();
    expect(created.reliabilityScore).toBe(0);
  });

  it("never releases the primary metric, even if a validation record exists", async () => {
    await processSubmission("sub-1");
    expect(mocks.isPrimaryMetricReleased).not.toHaveBeenCalled();
    expect(completedMetadata().performanceAssessment.status).toBe("UNVERIFIED");
  });

  it("labels the submission with the engine and keeps the grade in the dev report only", async () => {
    await processSubmission("sub-1");
    const metadata = completedMetadata();
    expect(metadata.analysisEngine).toBe(DEV_STANDIN_ENGINE);
    expect(metadata.devStandIn).toMatchObject({ validated: false, grade: 88 });
    expect(metadata.captureAssessment.status).not.toBe("VERIFIED");
  });

  it("hands the coaching plan an unverified assessment and no primary metric value", async () => {
    await processSubmission("sub-1");
    const plan = mocks.upsertCoachingPlanForSubmission.mock.calls[0][0];
    expect(plan.primaryMetricValue).toBeUndefined();
    expect(plan.metadata.performanceAssessment.status).toBe("UNVERIFIED");
  });

  it("still marks the real engine's label for real analysis", async () => {
    mocks.runAnalysisEngine.mockResolvedValue({
      engine: "athlemetry-vision-core", analysis: standIn.analysis,
    });
    await processSubmission("sub-1");
    const metadata = completedMetadata();
    expect(metadata.analysisEngine).toBe("athlemetry-vision-core");
    expect(metadata.devStandIn).toBeUndefined();
    expect(mocks.isPrimaryMetricReleased).toHaveBeenCalled();
  });
});
