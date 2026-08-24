import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string } } | null,
  updateMany: vi.fn(),
  systemLogCreate: vi.fn(),
  transaction: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    userNotification: { updateMany: mocks.updateMany },
    systemLog: { create: mocks.systemLogCreate },
    $transaction: mocks.transaction,
  },
}));

const { POST } = await import("@/app/api/notifications/[id]/read/route");
const context = { params: Promise.resolve({ id: "notice-1" }) };

describe("POST /api/notifications/[id]/read", () => {
  beforeEach(() => {
    mocks.session = null;
    mocks.updateMany.mockReset();
    mocks.systemLogCreate.mockReset().mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockReset().mockImplementation(async (operation) => operation({
      userNotification: { updateMany: mocks.updateMany },
      systemLog: { create: mocks.systemLogCreate },
    }));
  });

  it("rejects anonymous mutation", async () => {
    const response = await POST(new Request("http://localhost/api/notifications/notice-1/read", { method: "POST" }), context);
    expect(response.status).toBe(401);
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("marks only a notification owned by the current user", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.updateMany.mockResolvedValue({ count: 1 });
    const response = await POST(new Request("http://localhost/api/notifications/notice-1/read", { method: "POST" }), context);
    expect(response.status).toBe(200);
    expect(mocks.updateMany).toHaveBeenCalledWith({
      where: { id: "notice-1", userId: "athlete-1", readAt: null },
      data: { readAt: expect.any(Date) },
    });
    expect(mocks.systemLogCreate).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Notification dismissed",
        metadata: { action: "NOTIFICATION_DISMISSED", actorUserId: "athlete-1", notificationId: "notice-1" },
      },
    });
  });

  it("does not record an audit event when no owned unread notification is changed", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.updateMany.mockResolvedValue({ count: 0 });

    const response = await POST(new Request("http://localhost/api/notifications/notice-1/read", { method: "POST" }), context);

    expect(response.status).toBe(404);
    expect(mocks.systemLogCreate).not.toHaveBeenCalled();
  });

  it("fails closed when the notification audit cannot be committed", async () => {
    mocks.session = { user: { id: "athlete-1" } };
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.systemLogCreate.mockRejectedValueOnce(new Error("audit unavailable"));

    const response = await POST(new Request("http://localhost/api/notifications/notice-1/read", { method: "POST" }), context);

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "Notification could not be dismissed safely." });
  });
});