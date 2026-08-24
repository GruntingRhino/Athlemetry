import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  prisma: { drillSubmission: { findMany: vi.fn() } },
}));

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(async () => ({ user: { id: "athlete-1", role: "ATHLETE" } })),
}));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/billing", () => ({ canUsePaidFeatures: vi.fn(async () => true) }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { GET } = await import("@/app/api/v1/submissions/route");

describe("v1 customer submission privacy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.drillSubmission.findMany.mockResolvedValue([{
      id: "submission-1",
      athleteId: "athlete-1",
      storageProvider: "s3",
      storageKey: "private/users/athlete-1/video.mp4",
      videoHash: "secret-content-hash",
      fileUrl: "https://internal.example.test/video",
      metadata: { visionAnalysis: { raw: "research-only" } },
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

  it("never returns internal storage identifiers", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data[0]).not.toHaveProperty("storageKey");
    expect(body.data[0]).not.toHaveProperty("videoHash");
    expect(body.data[0]).not.toHaveProperty("fileUrl");
    expect(body.data[0].metricResult).toBeNull();
    expect(body.data[0].benchmarkSnapshots).toBeNull();
  });
});
