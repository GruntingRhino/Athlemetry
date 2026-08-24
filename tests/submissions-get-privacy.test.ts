import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn() },
    drillSubmission: { findMany: vi.fn() },
  },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "athlete-1", role: "ATHLETE" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/logging", () => ({ writeSystemLog: vi.fn() }));
vi.mock("@/lib/processing/queue", () => ({ runProcessingBatch: vi.fn() }));
vi.mock("@/lib/storage", () => ({
  computeVideoHash: vi.fn(),
  getDuplicateUploadWindowHours: vi.fn(),
  storeVideo: vi.fn(),
}));

const { GET } = await import("@/app/api/submissions/route");

describe("customer submission listing privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({ deletedAt: null });
    mocks.prisma.drillSubmission.findMany.mockResolvedValue([{
      id: "submission-1",
      athleteId: "athlete-1",
      storageProvider: "s3",
      storageKey: "private/users/athlete-1/video.mp4",
      videoHash: "secret-content-hash",
      fileUrl: "https://internal.example.test/video",
      metadata: { visionAnalysis: { raw: "research-only" }, captureAssessment: { status: "UNVERIFIED" } },
      drillDefinition: {
        id: "drill-1",
        slug: "sprint-20m",
        metricPrimaryKey: "sprintTime",
        metricValidations: [],
      },
      metricResult: { sprintTime: 3.1, metricVersion: "research-v1" },
      benchmarkSnapshots: { percentile: 99 },
    }]);
  });

  it("withholds unreleased metrics and internal storage identifiers", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.submissions[0].metricResult).toBeNull();
    expect(body.submissions[0].benchmarkSnapshots).toBeNull();
    expect(body.submissions[0].metadata).not.toHaveProperty("visionAnalysis");
    expect(body.submissions[0]).not.toHaveProperty("storageKey");
    expect(body.submissions[0]).not.toHaveProperty("videoHash");
    expect(body.submissions[0]).not.toHaveProperty("fileUrl");
  });
});
