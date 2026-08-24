import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-1", role: "ATHLETE" } } as { user: { id: string; role: string } } | null,
  canUsePaidFeatures: vi.fn(),
  purgeStoredVideo: vi.fn(),
  storeVideo: vi.fn(),
  verifyPresignedVideoUpload: vi.fn(),
  verifyUploadClaim: vi.fn(),
  writeSystemLog: vi.fn(),
  consumeMonthlySubmissionQuota: vi.fn(),
  SubmissionQuotaExceededError: class SubmissionQuotaExceededError extends Error {},
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    drillDefinition: { findUnique: vi.fn(), findFirst: vi.fn() },
    drillSubmission: { create: vi.fn(), findFirst: vi.fn() },
    processingLog: { create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/billing", () => ({ canUsePaidFeatures: mocks.canUsePaidFeatures }));
vi.mock("@/lib/customer-metrics", () => ({ filterCustomerMetricResult: vi.fn(), isMetricReleased: vi.fn(), sanitizeCustomerMetadata: vi.fn() }));
vi.mock("@/lib/logging", () => ({ writeSystemLog: mocks.writeSystemLog }));
vi.mock("@/lib/processing/queue", () => ({ runProcessingBatch: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  computeVideoHash: vi.fn(() => "a".repeat(64)),
  getDuplicateUploadWindowHours: vi.fn(() => 24),
  getInitialExpiryDate: vi.fn(() => new Date("2026-08-01T00:00:00.000Z")),
  purgeStoredVideo: mocks.purgeStoredVideo,
  storeVideo: mocks.storeVideo,
  verifyPresignedVideoUpload: mocks.verifyPresignedVideoUpload,
}));
vi.mock("@/lib/upload-claims", () => ({ verifyUploadClaim: mocks.verifyUploadClaim }));
vi.mock("@/lib/submission-usage", () => ({
  consumeMonthlySubmissionQuota: mocks.consumeMonthlySubmissionQuota,
  SubmissionQuotaExceededError: mocks.SubmissionQuotaExceededError,
}));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST: createDirectSubmission } = await import("@/app/api/submissions/route");
const { POST: createCloudSubmission } = await import("@/app/api/submissions/cloud/route");

const drill = { id: "drill-1", slug: "sprint-20m", sport: "TRACK_FIELD", isActive: true };
const user = { id: "athlete-1", role: "ATHLETE", age: 20, deletedAt: null };

function directRequest() {
  const formData = new FormData();
  formData.set("video", new Blob(["test video"], { type: "video/mp4" }), "sprint.mp4");
  formData.set("drillDefinitionId", drill.id);
  formData.set("recordingDate", "2026-07-30");
  formData.set("location", "track");
  formData.set("drillType", drill.slug);
  formData.set("frameRate", "60");
  return new Request("http://localhost/api/submissions", { method: "POST", body: formData });
}

function cloudRequest() {
  return new Request("http://localhost/api/submissions/cloud", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      storageKey: "2026-07-30/550e8400-e29b-41d4-a716-446655440000.mp4",
      fileName: "sprint.mp4",
      fileSize: 1234,
      mimeType: "video/mp4",
      videoHash: "a".repeat(64),
      uploadClaim: "valid-claim",
      metadata: {
        drillDefinitionId: drill.id,
        recordingDate: "2026-07-30",
        location: "track",
        drillType: drill.slug,
        frameRate: 60,
      },
    }),
  });
}

describe("submission creation security audit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.canUsePaidFeatures.mockResolvedValue(true);
    mocks.prisma.user.findUnique.mockResolvedValue(user);
    mocks.prisma.user.findFirst.mockResolvedValue(user);
    mocks.prisma.drillDefinition.findUnique.mockResolvedValue(drill);
    mocks.prisma.drillDefinition.findFirst.mockResolvedValue(drill);
    mocks.prisma.drillSubmission.findFirst.mockResolvedValue(null);
    mocks.prisma.drillSubmission.create.mockResolvedValue({ id: "submission-1" });
    mocks.prisma.processingLog.create.mockResolvedValue({});
    mocks.prisma.systemLog.create.mockResolvedValue({});
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
    mocks.storeVideo.mockResolvedValue({
      fileName: "sprint.mp4",
      fileSize: 10,
      mimeType: "video/mp4",
      storageProvider: "local",
      storageKey: "2026-07-30/submission-1.mp4",
      videoHash: "a".repeat(64),
      videoExpiresAt: new Date("2026-08-01T00:00:00.000Z"),
      compressionStatus: "NOT_REQUIRED",
    });
    mocks.purgeStoredVideo.mockResolvedValue({ ok: true });
    mocks.verifyUploadClaim.mockReturnValue(true);
    mocks.verifyPresignedVideoUpload.mockResolvedValue(true);
    mocks.consumeMonthlySubmissionQuota.mockResolvedValue({ used: 1, limit: 20 });
  });

  it("atomically audits a direct upload before returning its submission id", async () => {
    const response = await createDirectSubmission(directRequest());

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission created",
        metadata: {
          action: "SUBMISSION_CREATED",
          actorUserId: "athlete-1",
          submissionId: "submission-1",
        },
      },
    });
  });

  it("atomically audits a finalized direct cloud upload before returning its submission id", async () => {
    const response = await createCloudSubmission(cloudRequest());

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission created",
        metadata: {
          action: "SUBMISSION_CREATED",
          actorUserId: "athlete-1",
          submissionId: "submission-1",
        },
      },
    });
  });

  it("claims the paid member's monthly upload allowance in the direct submission transaction", async () => {
    const response = await createDirectSubmission(directRequest());

    expect(response.status).toBe(200);
    expect(mocks.consumeMonthlySubmissionQuota).toHaveBeenCalledWith(mocks.prisma, {
      userId: "athlete-1",
      role: "ATHLETE",
    });
  });

  it("purges a direct upload and rejects it when the monthly allowance is exhausted", async () => {
    mocks.consumeMonthlySubmissionQuota.mockRejectedValue(new mocks.SubmissionQuotaExceededError());

    const response = await createDirectSubmission(directRequest());

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ error: "Monthly submission limit reached. Please try again next month." });
    expect(mocks.prisma.drillSubmission.create).not.toHaveBeenCalled();
    expect(mocks.purgeStoredVideo).toHaveBeenCalledWith({
      storageProvider: "local",
      storageKey: "2026-07-30/submission-1.mp4",
    });
  });

  it("fails closed and purges a direct upload when its audit cannot be committed", async () => {
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await createDirectSubmission(directRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Submission could not be recorded safely." });
    expect(mocks.purgeStoredVideo).toHaveBeenCalledWith({
      storageProvider: "local",
      storageKey: "2026-07-30/submission-1.mp4",
    });
  });

  it("fails closed and purges a cloud upload when its audit cannot be committed", async () => {
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await createCloudSubmission(cloudRequest());

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Submission could not be recorded safely." });
    expect(mocks.purgeStoredVideo).toHaveBeenCalledWith({
      storageProvider: "s3",
      storageKey: "2026-07-30/550e8400-e29b-41d4-a716-446655440000.mp4",
    });
  });
});
