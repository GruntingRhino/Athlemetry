import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const transaction = {
    retrainingJob: { create: vi.fn() },
    systemLog: { create: vi.fn() },
  };
  return {
    session: null as { user: { id: string; role: string } } | null,
    transaction,
    prisma: { $transaction: vi.fn() },
  };
});

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/admin/model/retrain/route");

describe("POST /api/admin/model/retrain", () => {
  beforeEach(() => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    mocks.prisma.$transaction.mockReset().mockImplementation(async (callback) => callback(mocks.transaction));
    mocks.transaction.retrainingJob.create.mockReset().mockResolvedValue({ id: "retrain-1", status: "QUEUED" });
    mocks.transaction.systemLog.create.mockReset().mockResolvedValue({ id: "audit-1" });
  });

  it("atomically queues a retraining job with a minimal security audit record", async () => {
    const response = await POST(new Request("http://localhost/api/admin/model/retrain", {
      method: "POST",
      body: JSON.stringify({ notes: "Refresh approved training corpus." }),
    }));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, job: { id: "retrain-1", status: "QUEUED" } });
    expect(mocks.transaction.retrainingJob.create).toHaveBeenCalledWith({
      data: {
        requestedBy: "admin-1",
        status: "QUEUED",
        notes: "Refresh approved training corpus.",
      },
    });
    expect(mocks.transaction.systemLog.create).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Model retraining requested",
        metadata: {
          action: "MODEL_RETRAINING_REQUESTED",
          actorUserId: "admin-1",
          retrainingJobId: "retrain-1",
        },
      },
    });
  });

  it("rejects invalid requests and non-administrators before persisting a job", async () => {
    const invalidResponse = await POST(new Request("http://localhost/api/admin/model/retrain", {
      method: "POST",
      body: JSON.stringify({ notes: "x" }),
    }));
    expect(invalidResponse.status).toBe(400);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();

    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    const forbiddenResponse = await POST(new Request("http://localhost/api/admin/model/retrain", { method: "POST" }));
    expect(forbiddenResponse.status).toBe(403);
    expect(mocks.prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails closed when the audit record cannot be persisted", async () => {
    mocks.transaction.systemLog.create.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/admin/model/retrain", { method: "POST" }));

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Retraining request could not be recorded safely." });
  });
});
