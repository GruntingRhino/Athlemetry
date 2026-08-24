import Stripe from "stripe";

import { prisma } from "@/lib/prisma";

export type BillingPlanCode = "monthly" | "annual";

let stripeClient: Stripe | null = null;

export function getStripeClient() {
  const secretKey = process.env.STRIPE_SECRET_KEY?.trim();
  if (!secretKey) throw new Error("Stripe billing is not configured.");
  stripeClient ??= new Stripe(secretKey, { maxNetworkRetries: 2 });
  return stripeClient;
}

export function resolveBillingPrice(planCode: string) {
  const envKey = {
    monthly: "STRIPE_PRICE_MONTHLY",
    annual: "STRIPE_PRICE_ANNUAL",
    "coach-monthly": "STRIPE_PRICE_COACH_MONTHLY",
    "club-monthly": "STRIPE_PRICE_CLUB_MONTHLY",
  }[planCode];
  if (!envKey) throw new Error("Unsupported billing plan.");
  const priceId = process.env[envKey]?.trim();
  if (!priceId) throw new Error(`Billing plan ${planCode} is not configured.`);
  return priceId;
}

export function hasPaidEntitlement(
  subscription: {
    status: string;
    currentPeriodEnd: Date | null;
    graceUntil?: Date | null;
  } | null | undefined,
  now = new Date(),
) {
  if (!subscription?.currentPeriodEnd) return false;
  if (subscription.status === "active" || subscription.status === "trialing") {
    return subscription.currentPeriodEnd.getTime() > now.getTime();
  }
  if (subscription.status === "past_due") {
    const entitlementEnd = subscription.graceUntil ?? subscription.currentPeriodEnd;
    return entitlementEnd.getTime() > now.getTime();
  }
  return false;
}

export function getBillingRecoveryState(subscription: {
  status: string;
  graceUntil: Date | null;
  cancelAtPeriodEnd: boolean;
} | null | undefined) {
  if (!subscription) return null;
  if (subscription.status === "past_due") {
    return {
      title: "Payment needs attention",
      description: subscription.graceUntil
        ? `Update the payment method in Stripe to avoid losing access after ${subscription.graceUntil.toISOString().slice(0, 10)}.`
        : "Update the payment method in Stripe to restore membership access.",
      portalLabel: "Resolve payment in Stripe",
    };
  }
  if (subscription.status === "active" && subscription.cancelAtPeriodEnd) {
    return {
      title: "Cancellation scheduled",
      description: "Your membership remains active through the current billing period. Use Stripe to resume or manage the cancellation.",
      portalLabel: "Manage cancellation in Stripe",
    };
  }
  if (["canceled", "unpaid", "incomplete", "incomplete_expired"].includes(subscription.status)) {
    return {
      title: "Membership inactive",
      description: "Start a new plan to restore paid access. If a recent payment needs review, manage it in Stripe first.",
      portalLabel: "Review billing in Stripe",
    };
  }
  return null;
}

export function canStartNewCheckout(subscription: { status: string } | null | undefined) {
  return !subscription || !["active", "trialing", "past_due"].includes(subscription.status);
}

export function shouldApplySubscriptionEvent(params: {
  storedSubscriptionId: string | null;
  storedOccurredAt: Date | null;
  incomingSubscriptionId: string;
  incomingOccurredAt: Date;
}) {
  if (!params.storedOccurredAt) return true;
  const delta = params.incomingOccurredAt.getTime() - params.storedOccurredAt.getTime();
  if (delta > 0) return true;
  if (delta < 0) return false;
  return params.storedSubscriptionId !== params.incomingSubscriptionId;
}

export function billingReturnUrl(pathname: string) {
  const base = process.env.NEXTAUTH_URL?.trim();
  if (!base) throw new Error("NEXTAUTH_URL is required for billing redirects.");
  return new URL(pathname, base).toString();
}

export function shouldEnforceBilling(
  environment: Record<string, string | undefined> = process.env,
) {
  return environment.NODE_ENV === "production"
    || environment.BILLING_ENFORCEMENT_ENABLED === "true";
}

export async function canUsePaidFeatures(userId: string, role?: string) {
  if (role === "ADMIN") return true;
  if (!shouldEnforceBilling()) return true;
  const account = await prisma.billingAccount.findUnique({
    where: { userId },
    include: { subscription: true },
  });
  return hasPaidEntitlement(account?.subscription);
}
