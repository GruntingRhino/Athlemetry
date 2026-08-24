import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: vi.fn(),
  limit: vi.fn(),
  prisma: {
    billingAccount: { findUnique: vi.fn() },
    refundRequest: { findFirst: vi.fn(), create: vi.fn() },
    systemLog: { create: vi.fn() },
    $transaction: vi.fn(),
  },
}));
vi.mock("next-auth", () => ({ getServerSession: mocks.session }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/distributed-rate-limit", () => ({ checkDatabaseRateLimit: mocks.limit, rateLimitSource: () => "source" }));
vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { POST } = await import("@/app/api/billing/refund-requests/route");

describe("refund request API", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.prisma.$transaction.mockImplementation((callback) => callback(mocks.prisma)); });
  it("requires authentication", async () => {
    mocks.session.mockResolvedValue(null);
    expect((await POST(new Request("http://test/api/billing/refund-requests", { method: "POST", body: JSON.stringify({ reason: "Duplicate charge" }) }))).status).toBe(401);
  });
  it("records an owner request and audit event without initiating a provider refund", async () => {
    mocks.session.mockResolvedValue({ user: { id: "user-1" } });
    mocks.limit.mockResolvedValue({ allowed: true, retryAfterSeconds: 0 });
    mocks.prisma.billingAccount.findUnique.mockResolvedValue({ id: "account-1" });
    mocks.prisma.refundRequest.findFirst.mockResolvedValue(null);
    mocks.prisma.refundRequest.create.mockResolvedValue({ id: "refund-1" });
    mocks.prisma.systemLog.create.mockResolvedValue({ id: "log-1" });
    expect((await POST(new Request("http://test/api/billing/refund-requests", { method: "POST", body: JSON.stringify({ reason: "Duplicate charge" }) }))).status).toBe(201);
    expect(mocks.prisma.systemLog.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ message: "Refund request filed" }) }));
  });
});
