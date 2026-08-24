import { afterEach, describe, expect, it } from "vitest";

import {
  canStartNewCheckout,
  getBillingRecoveryState,
  hasPaidEntitlement,
  resolveBillingPrice,
  shouldApplySubscriptionEvent,
  shouldEnforceBilling,
} from "@/lib/billing";

afterEach(() => {
  delete process.env.STRIPE_PRICE_MONTHLY;
  delete process.env.STRIPE_PRICE_ANNUAL;
});

describe("billing entitlement policy", () => {
  const now = new Date("2026-07-26T12:00:00Z");

  it("resolves only server-approved plan codes", () => {
    process.env.STRIPE_PRICE_MONTHLY = "price_monthly";
    process.env.STRIPE_PRICE_ANNUAL = "price_annual";
    expect(resolveBillingPrice("monthly")).toBe("price_monthly");
    expect(resolveBillingPrice("annual")).toBe("price_annual");
    expect(() => resolveBillingPrice("price_attacker_controlled")).toThrow(/plan/i);
  });

  it("fails closed when production billing enforcement is not explicitly configured", () => {
    expect(shouldEnforceBilling({ NODE_ENV: "production" })).toBe(true);
    expect(shouldEnforceBilling({ NODE_ENV: "production", BILLING_ENFORCEMENT_ENABLED: "false" })).toBe(true);
    expect(shouldEnforceBilling({ NODE_ENV: "development" })).toBe(false);
    expect(shouldEnforceBilling({ NODE_ENV: "development", BILLING_ENFORCEMENT_ENABLED: "true" })).toBe(true);
  });

  it("grants access for active subscriptions and bounded past-due grace only", () => {
    const future = new Date("2026-08-26T12:00:00Z");
    expect(hasPaidEntitlement({ status: "active", currentPeriodEnd: future }, now)).toBe(true);
    expect(hasPaidEntitlement({ status: "trialing", currentPeriodEnd: future }, now)).toBe(true);
    expect(hasPaidEntitlement({ status: "past_due", currentPeriodEnd: future }, now)).toBe(true);
    expect(hasPaidEntitlement({ status: "canceled", currentPeriodEnd: future }, now)).toBe(false);
    expect(hasPaidEntitlement({ status: "active", currentPeriodEnd: new Date("2026-07-25T12:00:00Z") }, now)).toBe(false);
  });

  it("gives past-due customers a Stripe recovery path without offering a conflicting checkout", () => {
    const recovery = getBillingRecoveryState({
      status: "past_due",
      graceUntil: new Date("2026-08-02T12:00:00Z"),
      cancelAtPeriodEnd: false,
    });

    expect(recovery).toEqual({
      title: "Payment needs attention",
      description: "Update the payment method in Stripe to avoid losing access after 2026-08-02.",
      portalLabel: "Resolve payment in Stripe",
    });
    expect(canStartNewCheckout({ status: "past_due" })).toBe(false);
    expect(canStartNewCheckout({ status: "canceled" })).toBe(true);
  });

  it("makes scheduled cancellation and inactive subscription states explicit", () => {
    expect(getBillingRecoveryState({ status: "active", graceUntil: null, cancelAtPeriodEnd: true })?.title).toBe("Cancellation scheduled");
    expect(getBillingRecoveryState({ status: "canceled", graceUntil: null, cancelAtPeriodEnd: false })?.title).toBe("Membership inactive");
    expect(getBillingRecoveryState({ status: "active", graceUntil: null, cancelAtPeriodEnd: false })).toBeNull();
  });

  it("rejects stale or unrelated subscription events", () => {
    expect(shouldApplySubscriptionEvent({
      storedSubscriptionId: "sub_1",
      storedOccurredAt: new Date("2026-07-26T12:00:00Z"),
      incomingSubscriptionId: "sub_1",
      incomingOccurredAt: new Date("2026-07-26T11:59:59Z"),
    })).toBe(false);
    expect(shouldApplySubscriptionEvent({
      storedSubscriptionId: "sub_1",
      storedOccurredAt: new Date("2026-07-26T12:00:00Z"),
      incomingSubscriptionId: "sub_2",
      incomingOccurredAt: new Date("2026-07-26T12:00:01Z"),
    })).toBe(true);
  });
});