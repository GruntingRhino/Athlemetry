import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; role: string } } | null,
  submissionFindUnique: vi.fn(),
  keyMomentCreate: vi.fn(),
  systemLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

const { POST } = await import("@/app/api/admin/submissions/[id]/key-moments/route");

function request(body: unknown) {
  return new Request("http://localhost/api/admin/submissions/submission-1/key-moments", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/admin/submissions/[id]/key-moments", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    mocks.submissionFindUnique.mockResolvedValue({ processingStatus: "COMPLETED" });
    mocks.keyMomentCreate.mockResolvedValue({ id: "moment-1", frameIndex: 42, label: "Release" });
    mocks.systemLogCreate.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      drillSubmission: { findUnique: mocks.submissionFindUnique },
      submissionKeyMoment: { create: mocks.keyMomentCreate },
      systemLog: { create: mocks.systemLogCreate },
    }));
  });

  it("rejects non-administrators before a database transaction", async () => {
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };

    const response = await POST(request({ frameIndex: 42, label: "Release", note: "Ball leaves the hand." }), { params: Promise.resolve({ id: "submission-1" }) });

    expect(response.status).toBe(403);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects contact details before a database transaction", async () => {
    const response = await POST(request({ frameIndex: 42, label: "Email me", note: "contact@example.com" }), { params: Promise.resolve({ id: "submission-1" }) });

    expect(response.status).toBe(400);
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("creates a completed-submission moment and minimal audit record atomically", async () => {
    const response = await POST(request({ frameIndex: 42, label: "Release", note: "Ball leaves the hand." }), { params: Promise.resolve({ id: "submission-1" }) });

    expect(response.status).toBe(200);
    expect(mocks.submissionFindUnique).toHaveBeenCalledWith({ where: { id: "submission-1" }, select: { processingStatus: true } });
    expect(mocks.keyMomentCreate).toHaveBeenCalledWith({
      data: { submissionId: "submission-1", reviewerId: "admin-1", frameIndex: 42, label: "Release", note: "Ball leaves the hand." },
    });
    expect(mocks.systemLogCreate).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Submission key moment reviewed",
        metadata: {
          action: "SUBMISSION_KEY_MOMENT_REVIEWED",
          actorUserId: "admin-1",
          submissionId: "submission-1",
          keyMomentId: "moment-1",
        },
      },
    });
  });

  it("does not annotate a submission that is not completed", async () => {
    mocks.submissionFindUnique.mockResolvedValue({ processingStatus: "PROCESSING" });

    const response = await POST(request({ frameIndex: 42, label: "Release", note: "Ball leaves the hand." }), { params: Promise.resolve({ id: "submission-1" }) });

    expect(response.status).toBe(409);
    expect(mocks.keyMomentCreate).not.toHaveBeenCalled();
    expect(mocks.systemLogCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the key moment or audit transaction cannot commit", async () => {
    mocks.systemLogCreate.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(request({ frameIndex: 42, label: "Release", note: "Ball leaves the hand." }), { params: Promise.resolve({ id: "submission-1" }) });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Reviewed key moment could not be recorded safely." });
  });
});
