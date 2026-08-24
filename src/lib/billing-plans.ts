export const BILLING_PLANS = [
  { key: "athlete-monthly", audience: "athlete", interval: "month", seats: 1, label: "Athlete monthly" },
  { key: "athlete-annual", audience: "athlete", interval: "year", seats: 1, label: "Athlete annual" },
  { key: "coach-monthly", audience: "coach", interval: "month", seats: 25, label: "Coach monthly" },
  { key: "club-monthly", audience: "club", interval: "month", seats: 100, label: "Club monthly" },
] as const;

export type BillingPlanKey = (typeof BILLING_PLANS)[number]["key"];

export function getBillingPlan(key: string) {
  return BILLING_PLANS.find((plan) => plan.key === key) ?? null;
}

export function isBillingPlanConfigured(key: string, environment: Record<string, string | undefined> = process.env) {
  const envKey = key === "athlete-monthly" ? "STRIPE_PRICE_MONTHLY"
    : key === "athlete-annual" ? "STRIPE_PRICE_ANNUAL"
      : key === "coach-monthly" ? "STRIPE_PRICE_COACH_MONTHLY"
        : key === "club-monthly" ? "STRIPE_PRICE_CLUB_MONTHLY" : null;
  return Boolean(envKey && environment[envKey]?.trim());
}

export function getVerifiedPlanEntitlement(priceId: string, environment: Record<string, string | undefined> = process.env) {
  const priceByPlan = {
    "athlete-monthly": environment.STRIPE_PRICE_MONTHLY,
    "athlete-annual": environment.STRIPE_PRICE_ANNUAL,
    "coach-monthly": environment.STRIPE_PRICE_COACH_MONTHLY,
    "club-monthly": environment.STRIPE_PRICE_CLUB_MONTHLY,
  } as const;
  const plan = BILLING_PLANS.find((candidate) => priceByPlan[candidate.key]?.trim() === priceId);
  return plan ? { planKey: plan.key, seatLimit: plan.seats } : null;
}
