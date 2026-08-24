import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const tx = {
    billingWebhookEvent: { create: vi.fn(), createMany: vi.fn() },
    billingAccount: { findUnique: vi.fn() },
    billingSubscription: { upsert: vi.fn() },
    billingSubscriptionEvent: { create: vi.fn() },
  };
  return {
    tx,
    prisma: { $transaction: vi.fn() },
  };
});

vi.mock("@/lib/prisma", () => ({ prisma: mocks.prisma }));

const { processStripeEvent } = await import("@/lib/billing-webhook");

describe("Stripe webhook receipt idempotency", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.$transaction.mockImplementation(async (callback) => callback(mocks.tx));
    process.env.STRIPE_PRICE_MONTHLY = "price_monthly";
  });

  afterEach(() => {
    delete process.env.STRIPE_PRICE_MONTHLY;
  });

  it("uses a conflict-safe receipt insert so duplicate delivery does not abort PostgreSQL transactions", async () => {
    mocks.tx.billingWebhookEvent.createMany.mockResolvedValue({ count: 0 });

    const result = await processStripeEvent({
      id: "evt_duplicate",
      type: "customer.subscription.updated",
      created: 1_785_196_800,
      data: { object: {} },
    } as never);

    expect(result).toEqual({ processed: false, duplicate: true });
    expect(mocks.tx.billingWebhookEvent.createMany).toHaveBeenCalledWith({
      data: {
        providerEventId: "evt_duplicate",
        type: "customer.subscription.updated",
        occurredAt: new Date(1_785_196_800_000),
      },
      skipDuplicates: true,
    });
    expect(mocks.tx.billingWebhookEvent.create).not.toHaveBeenCalled();
    expect(mocks.tx.billingAccount.findUnique).not.toHaveBeenCalled();
    expect(mocks.tx.billingSubscription.upsert).not.toHaveBeenCalled();
  });

  it("persists a validated subscription lifecycle event before updating the current entitlement", async () => {
    mocks.tx.billingWebhookEvent.createMany.mockResolvedValue({ count: 1 });
    mocks.tx.billingAccount.findUnique.mockResolvedValue({
      id: "billing-1",
      stripeCustomerId: "cus_1",
      subscription: null,
    });
    mocks.tx.billingSubscriptionEvent.create.mockResolvedValue({ id: "lifecycle-1" });
    mocks.tx.billingSubscription.upsert.mockResolvedValue({ id: "subscription-1" });

    await processStripeEvent({
      id: "evt_trial_started",
      type: "customer.subscription.created",
      created: 1_785_196_800,
      data: {
        object: {
          id: "sub_1",
          customer: "cus_1",
          status: "trialing",
          cancel_at_period_end: false,
          metadata: { billingAccountId: "billing-1" },
          items: { data: [{ price: { id: "price_monthly" }, current_period_end: 1_785_456_000 }] },
        },
      },
    } as never);

    expect(mocks.tx.billingSubscriptionEvent.create).toHaveBeenCalledWith({
      data: {
        billingAccountId: "billing-1",
        providerEventId: "evt_trial_started",
        stripeSubscriptionId: "sub_1",
        type: "customer.subscription.created",
        status: "trialing",
        priceId: "price_monthly",
        occurredAt: new Date(1_785_196_800_000),
      },
    });
    expect(mocks.tx.billingSubscription.upsert).toHaveBeenCalledWith(expect.objectContaining({
      update: expect.objectContaining({ trialStartedAt: new Date(1_785_196_800_000), firstPaidAt: null }),
      create: expect.objectContaining({ trialStartedAt: new Date(1_785_196_800_000), firstPaidAt: null }),
    }));
  });
});
