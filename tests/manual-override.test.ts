import { beforeEach, describe, expect, it, vi } from "vitest";

import { invalidateManualOverrideEvidence } from "@/lib/manual-override";

const mocks = vi.hoisted(() => {
  const tx = {
    manualOverride: { create: vi.fn() },
    drillSubmission: { findUnique: vi.fn(), update: vi.fn() },
    metricResult: { upsert: vi.fn() },
    benchmarkSnapshot: { deleteMany: vi.fn() },
    coachingPlan: { updateMany: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    session: { user: { id: "admin-1", role: "ADMIN" } },
    tx,
    prisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx)),
    },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST: ManualOverridePost } = await import("@/app/api/admin/manual-override/route");

describe("manual metric override evidence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
  });

  it("preserves metadata but revokes capture and performance verification", () => {
    expect(invalidateManualOverrideEvidence({
      device: "iphone",
      performanceVerified: true,
      performanceAssessment: {
        source: "athlemetry-performance-verification-v1",
        status: "VERIFIED",
      },
      captureAssessment: {
        source: "vision-core-protocol-assessment-v1",
        status: "VERIFIED",
        reasons: [],
      },
    })).toEqual({
      device: "iphone",
      performanceVerified: false,
      captureAssessment: {
        source: "vision-core-protocol-assessment-v1",
        status: "UNVERIFIED",
        reasons: ["manual-metric-override-requires-reverification"],
      },
    });
  });

  it("atomically invalidates customer evidence, benchmarks, and coaching when a metric changes", async () => {
    mocks.tx.drillSubmission.findUnique.mockResolvedValue({
      id: "submission-1",
      metadata: {
        performanceVerified: true,
        captureAssessment: {
          source: "vision-core-protocol-assessment-v1",
          status: "VERIFIED",
        },
      },
    });

    const response = await ManualOverridePost(new Request("http://localhost/api/admin/manual-override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: "submission-1",
        action: "MANUAL_CORRECTION",
        notes: "Corrected after equipment review",
        sprintTime: 4.9,
      }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.tx.drillSubmission.update).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "submission-1" },
      data: expect.objectContaining({
        metadata: expect.objectContaining({
          performanceVerified: false,
          captureAssessment: expect.objectContaining({ status: "UNVERIFIED" }),
        }),
      }),
    }));
    expect(mocks.tx.benchmarkSnapshot.deleteMany).toHaveBeenCalledWith({
      where: { submissionId: "submission-1" },
    });
    expect(mocks.tx.coachingPlan.updateMany).toHaveBeenCalledWith({
      where: { sourceSubmissionId: "submission-1", status: "ACTIVE" },
      data: { status: "ARCHIVED" },
    });
    expect(mocks.tx.metricResult.upsert).toHaveBeenCalled();
    expect(mocks.tx.manualOverride.create).toHaveBeenCalled();
    expect(mocks.tx.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Manual override applied",
        metadata: {
          action: "MANUAL_OVERRIDE_APPLIED",
          actorUserId: "admin-1",
          submissionId: "submission-1",
        },
      },
    });
  });

  it("fails closed when the manual-override security audit cannot be persisted", async () => {
    mocks.tx.drillSubmission.findUnique.mockResolvedValue({ id: "submission-1", metadata: {} });
    mocks.tx.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await ManualOverridePost(new Request("http://localhost/api/admin/manual-override", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        submissionId: "submission-1",
        action: "MANUAL_CORRECTION",
        notes: "Corrected after equipment review",
        sprintTime: 4.9,
      }),
    }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Manual override could not be recorded safely." });
  });
});
