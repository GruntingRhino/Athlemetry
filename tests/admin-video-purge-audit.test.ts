import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; role: string } } | null,
  purgeExpiredVideos: vi.fn(),
  systemLogCreate: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { systemLog: { create: mocks.systemLogCreate } } }));
vi.mock("@/lib/processing/queue", () => ({ purgeExpiredVideos: mocks.purgeExpiredVideos }));

const { POST } = await import("@/app/api/admin/storage/purge-expired/route");

describe("POST /api/admin/storage/purge-expired", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = null;
    mocks.systemLogCreate.mockResolvedValue({ id: "audit-1" });
    mocks.purgeExpiredVideos.mockResolvedValue({ purged: 3 });
  });

  it("rejects non-administrators before creating an audit record or purging video", async () => {
    mocks.session = { user: { id: "coach-1", role: "COACH" } };

    const response = await POST();

    expect(response.status).toBe(403);
    expect(mocks.systemLogCreate).not.toHaveBeenCalled();
    expect(mocks.purgeExpiredVideos).not.toHaveBeenCalled();
  });

  it("audits the administrator before purging a bounded batch of expired videos", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };

    const response = await POST();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true, purged: 3 });
    expect(mocks.systemLogCreate).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Expired video purge initiated",
        metadata: { action: "EXPIRED_VIDEO_PURGE_INITIATED", actorUserId: "admin-1" },
      },
    });
    expect(mocks.purgeExpiredVideos).toHaveBeenCalledWith(500);
    expect(mocks.systemLogCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.purgeExpiredVideos.mock.invocationCallOrder[0],
    );
  });

  it("fails closed without purging when the audit record cannot be written", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    mocks.systemLogCreate.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Expired video purge could not be initiated safely." });
    expect(mocks.purgeExpiredVideos).not.toHaveBeenCalled();
  });

  it("returns a controlled error when the purge cannot complete", async () => {
    mocks.session = { user: { id: "admin-1", role: "ADMIN" } };
    mocks.purgeExpiredVideos.mockRejectedValueOnce(new Error("storage unavailable"));

    const response = await POST();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Expired video purge could not be completed safely." });
  });
});
