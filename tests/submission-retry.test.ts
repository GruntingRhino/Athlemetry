import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-1", role: "ATHLETE" } },
  prisma: {
    drillSubmission: { findUnique: vi.fn(), update: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
  processSubmission: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
vi.mock("@/lib/processing/queue", () => ({ processSubmission: mocks.processSubmission }));

const { POST } = await import("@/app/api/submissions/[id]/retry/route");
const params = { params: Promise.resolve({ id: "submission-1" }) };

describe("POST /api/submissions/[id]/retry", () => {
  beforeEach(() => {
    delete process.env.INLINE_PROCESSING_ENABLED;
    mocks.prisma.drillSubmission.findUnique.mockReset();
    mocks.prisma.drillSubmission.update.mockReset();
    mocks.prisma.systemLog.create.mockReset();
    mocks.prisma.$transaction.mockReset();
    mocks.processSubmission.mockReset();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.prisma));
  });

  it("rejects retries for completed submissions without mutating state", async () => {
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      athleteId: "athlete-1", processingStatus: "COMPLETED",
    });
    const response = await POST(new Request("http://localhost/api/submissions/submission-1/retry", { method: "POST" }), params);
    expect(response.status).toBe(409);
    expect(mocks.prisma.drillSubmission.update).not.toHaveBeenCalled();
    expect(mocks.processSubmission).not.toHaveBeenCalled();
  });

  it("requeues failed submissions owned by the athlete", async () => {
    process.env.INLINE_PROCESSING_ENABLED = "true";
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      athleteId: "athlete-1", processingStatus: "FAILED",
    });
    mocks.prisma.drillSubmission.update.mockResolvedValue({});
    mocks.processSubmission.mockResolvedValue({ ok: true });
    const response = await POST(new Request("http://localhost/api/submissions/submission-1/retry", { method: "POST" }), params);
    expect(response.status).toBe(200);
    expect(mocks.prisma.drillSubmission.update).toHaveBeenCalledTimes(1);
    expect(mocks.processSubmission).toHaveBeenCalledWith("submission-1");
  });

  it("leaves retry processing to the worker by default and resets dead-letter state", async () => {
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      athleteId: "athlete-1", processingStatus: "FAILED",
    });
    mocks.prisma.drillSubmission.update.mockResolvedValue({});
    const response = await POST(new Request("http://localhost/api/submissions/submission-1/retry", { method: "POST" }), params);
    expect(response.status).toBe(202);
    expect(mocks.processSubmission).not.toHaveBeenCalled();
    expect(mocks.prisma.drillSubmission.update).toHaveBeenCalledWith({
      where: { id: "submission-1" },
      data: expect.objectContaining({
        processingStatus: "QUEUED",
        processingAttempts: 0,
        nextAttemptAt: null,
        deadLetteredAt: null,
      }),
    });
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission retry requested",
        metadata: {
          action: "SUBMISSION_RETRY_REQUESTED",
          actorUserId: "athlete-1",
          submissionId: "submission-1",
        },
      },
    });
  });

  it("fails closed without requeueing inline work when the retry audit cannot be written", async () => {
    process.env.INLINE_PROCESSING_ENABLED = "true";
    mocks.prisma.drillSubmission.findUnique.mockResolvedValue({
      athleteId: "athlete-1", processingStatus: "FAILED",
    });
    mocks.prisma.systemLog.create.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/submissions/submission-1/retry", { method: "POST" }), params);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Retry could not be recorded safely." });
    expect(mocks.processSubmission).not.toHaveBeenCalled();
  });
});
