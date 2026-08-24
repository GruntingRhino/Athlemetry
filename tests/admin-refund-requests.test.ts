import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  prisma: { refundRequest: { findUnique: vi.fn(), update: vi.fn() }, systemLog: { create: vi.fn() }, $transaction: vi.fn() },
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));
const { PATCH } = await import("@/app/api/admin/refund-requests/[id]/route");

describe("admin refund review API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma)); });
  it("rejects non-admin callers", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-1", role: "ATHLETE" } });
    expect((await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ status: "IN_REVIEW" }) }), { params: Promise.resolve({ id: "refund-1" }) })).status).toBe(403);
  });
  it("updates only an existing request and audits the admin transition", async () => {
    mocks.session.mockResolvedValue({ user: { id: "admin-1", role: "ADMIN" } });
    mocks.prisma.refundRequest.findUnique.mockResolvedValue({ id: "refund-1" });
    mocks.prisma.refundRequest.update.mockResolvedValue({ id: "refund-1", status: "IN_REVIEW" });
    expect((await PATCH(new Request("http://test", { method: "PATCH", body: JSON.stringify({ status: "IN_REVIEW" }) }), { params: Promise.resolve({ id: "refund-1" }) })).status).toBe(200);
    expect(mocks.prisma.systemLog.create).toHaveBeenCalled();
  });
});
