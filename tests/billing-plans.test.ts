import { describe, expect, it } from "vitest";
import { BILLING_PLANS, getBillingPlan, isBillingPlanConfigured } from "@/lib/billing-plans";

describe("billing plan catalog", () => {
  it("provides athlete, coach, and club plan definitions without embedding prices", () => {
    expect(BILLING_PLANS.map((plan) => plan.key)).toEqual(["athlete-monthly", "athlete-annual", "coach-monthly", "club-monthly"]);
    expect(getBillingPlan("club-monthly")?.seats).toBe(100);
    expect(getBillingPlan("unknown")).toBeNull();
  });

  it("fails closed for plan display until its dedicated server-side price is configured", () => {
    expect(isBillingPlanConfigured("coach-monthly", {})).toBe(false);
    expect(isBillingPlanConfigured("coach-monthly", { STRIPE_PRICE_COACH_MONTHLY: "price_coach" })).toBe(true);
    expect(isBillingPlanConfigured("unknown", { STRIPE_PRICE_MONTHLY: "price_monthly" })).toBe(false);
  });
});
