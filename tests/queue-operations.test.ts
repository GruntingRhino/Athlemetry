import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  updateMany: vi.fn(),
  processingLogCreate: vi.fn(),
  systemLogCreate: vi.fn(),
  transaction: vi.fn(),
  count: vi.fn(),
  findFirst: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
    drillSubmission: {
      count: mocks.count,
      findFirst: mocks.findFirst,
      findMany: mocks.findMany,
    },
  },
}));

const { getQueueOperationsSnapshot, requeueDeadLetter } = await import("@/lib/processing/queue-operations");

describe("dead-letter queue operations", () => {
  beforeEach(() => {
    mocks.updateMany.mockReset();
    mocks.processingLogCreate.mockReset();
    mocks.systemLogCreate.mockReset();
    mocks.count.mockReset();
    mocks.findFirst.mockReset();
    mocks.findMany.mockReset();
    mocks.transaction.mockReset().mockImplementation(async (callback) => callback({
      drillSubmission: { updateMany: mocks.updateMany },
      processingLog: { create: mocks.processingLogCreate },
      systemLog: { create: mocks.systemLogCreate },
    }));
  });

  it("reports actionable queue counts, oldest ready-job lag, and recent dead letters", async () => {
    mocks.count
      .mockResolvedValueOnce(7)
      .mockResolvedValueOnce(2)
      .mockResolvedValueOnce(3)
      .mockResolvedValueOnce(4);
    mocks.findFirst.mockResolvedValue({ queuedAt: new Date("2026-07-27T11:58:30.000Z") });
    const deadLetters = [{ id: "dead-1", lastError: "bad video" }];
    mocks.findMany.mockResolvedValue(deadLetters);

    await expect(getQueueOperationsSnapshot(new Date("2026-07-27T12:00:00.000Z"))).resolves.toEqual({
      queued: 7,
      retrying: 2,
      processing: 3,
      deadLettered: 4,
      oldestReadyLagSeconds: 90,
      deadLetters,
    });
    expect(mocks.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { deadLetteredAt: { not: null } },
      take: 25,
    }));
  });

  it("atomically resets only a dead-lettered submission and writes a minimal security audit record", async () => {
    mocks.updateMany.mockResolvedValue({ count: 1 });

    await expect(requeueDeadLetter("submission-1", "admin-1")).resolves.toEqual({ ok: true });
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "submission-1", deadLetteredAt: { not: null } },
      data: {
        processingStatus: "QUEUED",
        processingAttempts: 0,
        nextAttemptAt: null,
        deadLetteredAt: null,
        startedAt: null,
        completedAt: null,
        lastError: null,
        queuedAt: expect.any(Date),
      },
    });
    expect(mocks.processingLogCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ submissionId: "submission-1", status: "QUEUED", attempt: 0 }),
    });
    expect(mocks.systemLogCreate).toHaveBeenCalledWith({
      data: {
        level: "WARN",
        category: "SECURITY_AUDIT",
        message: "An administrator manually requeued a dead-lettered submission.",
        metadata: {
          action: "DEAD_LETTER_REQUEUED",
          actorUserId: "admin-1",
          submissionId: "submission-1",
        },
      },
    });
  });

  it("does not create misleading audit records when the submission is no longer dead-lettered", async () => {
    mocks.updateMany.mockResolvedValue({ count: 0 });

    await expect(requeueDeadLetter("submission-1", "admin-1")).resolves.toEqual({
      ok: false,
      reason: "Submission is not dead-lettered.",
    });
    expect(mocks.processingLogCreate).not.toHaveBeenCalled();
    expect(mocks.systemLogCreate).not.toHaveBeenCalled();
  });
});