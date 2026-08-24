import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-1", role: "ATHLETE" } } as { user: { id: string; role: string } } | null,
  findUnique: vi.fn(),
  createSystemLog: vi.fn(),
  createPortal: vi.fn(),
  transaction: vi.fn(),
  billingReturnUrl: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/billing", () => ({
  billingReturnUrl: mocks.billingReturnUrl,
  getStripeClient: () => ({ billingPortal: { sessions: { create: mocks.createPortal } } }),
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: mocks.transaction,
  },
}));

const { POST } = await import("@/app/api/billing/portal/route");

describe("POST /api/billing/portal audit trail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.findUnique.mockResolvedValue({ stripeCustomerId: "cus_1" });
    mocks.createSystemLog.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      billingAccount: { findUnique: mocks.findUnique },
      systemLog: { create: mocks.createSystemLog },
    }));
    mocks.billingReturnUrl.mockImplementation((path: string) => `https://athlemetry.test${path}`);
    mocks.createPortal.mockResolvedValue({ url: "https://billing.stripe.test/session" });
  });

  it("records a minimal audit event before returning a hosted portal URL", async () => {
    const response = await POST();

    expect(response.status).toBe(200);
    expect(mocks.createSystemLog).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Stripe billing portal initiated",
        metadata: { action: "STRIPE_BILLING_PORTAL_INITIATED", actorUserId: "athlete-1" },
      },
    });
    expect(mocks.createPortal).toHaveBeenCalledWith({
      customer: "cus_1",
      return_url: "https://athlemetry.test/billing",
    });
    await expect(response.json()).resolves.toEqual({ url: "https://billing.stripe.test/session" });
  });

  it("does not call Stripe when audit persistence fails", async () => {
    mocks.createSystemLog.mockRejectedValue(new Error("synthetic audit failure"));

    const response = await POST();

    expect(response.status).toBe(503);
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });

  it("does not write an audit event when no customer association exists", async () => {
    mocks.findUnique.mockResolvedValue({ stripeCustomerId: null });

    const response = await POST();

    expect(response.status).toBe(404);
    expect(mocks.createSystemLog).not.toHaveBeenCalled();
    expect(mocks.createPortal).not.toHaveBeenCalled();
  });
});