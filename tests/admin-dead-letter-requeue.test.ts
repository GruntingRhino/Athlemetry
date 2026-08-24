import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; role: string } } | null,
  requeue: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/processing/queue-operations", () => ({ requeueDeadLetter: mocks.requeue }));

const { POST } = await import("@/app/api/admin/processing/dead-letter/[id]/requeue/route");

describe("POST /api/admin/processing/dead-letter/[id]/requeue", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.requeue.mockReset();
  });

  it("rejects non-administrators without mutating the queue", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };
    const response = await POST(new Request("http://localhost/api/admin/processing/dead-letter/submission-1/requeue", { method: "POST" }), {
      params: Promise.resolve({ id: "submission-1" }),
    });

    expect(response.status).toBe(403);
    expect(mocks.requeue).not.toHaveBeenCalled();
  });

  it("fails closed with a controlled response when the requeue transaction cannot commit", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    mocks.requeue.mockRejectedValue(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/admin/processing/dead-letter/submission-1/requeue", { method: "POST" }), {
      params: Promise.resolve({ id: "submission-1" }),
    });

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Dead-letter requeue could not be completed safely." });
  });
});