import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-1", role: "ATHLETE" } } as { user: { id: string; role: string } } | null,
  findFirst: vi.fn(),
  upsert: vi.fn(),
  update: vi.fn(),
  createSystemLog: vi.fn(),
  transaction: vi.fn(),
  resolveBillingPrice: vi.fn(),
  billingReturnUrl: vi.fn(),
  createCustomer: vi.fn(),
  createCheckout: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/billing", () => ({
  billingReturnUrl: mocks.billingReturnUrl,
  getStripeClient: () => ({
    customers: { create: mocks.createCustomer },
    checkout: { sessions: { create: mocks.createCheckout } },
  }),
  resolveBillingPrice: mocks.resolveBillingPrice,
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.findFirst },
    billingAccount: { upsert: mocks.upsert, update: mocks.update },
    systemLog: { create: mocks.createSystemLog },
    $transaction: mocks.transaction,
  },
}));

const { POST } = await import("@/app/api/billing/checkout/route");

describe("POST /api/billing/checkout audit trail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.findFirst.mockResolvedValue({ id: "athlete-1" });
    mocks.upsert.mockResolvedValue({ id: "billing-1", stripeCustomerId: "cus_1", subscription: null });
    mocks.createSystemLog.mockResolvedValue({ id: "audit-1" });
    mocks.transaction.mockImplementation(async (callback) => callback({
      billingAccount: { upsert: mocks.upsert },
      systemLog: { create: mocks.createSystemLog },
    }));
    mocks.resolveBillingPrice.mockReturnValue("price_monthly");
    mocks.billingReturnUrl.mockImplementation((path: string) => `https://athlemetry.test${path}`);
    mocks.createCheckout.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
  });

  it("records a minimal audit event before returning a hosted Checkout URL", async () => {
    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "monthly" }),
    }));

    expect(response.status).toBe(200);
    expect(mocks.createSystemLog).toHaveBeenCalledWith({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Stripe Checkout initiated",
        metadata: { action: "STRIPE_CHECKOUT_INITIATED", actorUserId: "athlete-1", planCode: "monthly" },
      },
    });
    expect(mocks.createCheckout).toHaveBeenCalledTimes(1);
    await expect(response.json()).resolves.toEqual({ url: "https://checkout.stripe.test/session" });
  });

  it("fails closed without contacting Stripe when the audit transaction cannot commit", async () => {
    mocks.createSystemLog.mockRejectedValue(new Error("synthetic audit failure"));

    const response = await POST(new Request("http://localhost/api/billing/checkout", {
      method: "POST",
      body: JSON.stringify({ plan: "monthly" }),
    }));

    expect(response.status).toBe(503);
    expect(mocks.createSystemLog).toHaveBeenCalledTimes(1);
    expect(mocks.createCustomer).not.toHaveBeenCalled();
    expect(mocks.createCheckout).not.toHaveBeenCalled();
  });
});