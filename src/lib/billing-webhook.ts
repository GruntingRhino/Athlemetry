import type Stripe from "stripe";

import { shouldApplySubscriptionEvent } from "@/lib/billing";
import { deriveSubscriptionLifecycleTimestamps } from "@/lib/billing-lifecycle";
import { getVerifiedPlanEntitlement } from "@/lib/billing-plans";
import { prisma } from "@/lib/prisma";

function stripeResourceId(value: string | { id: string } | null) {
  return typeof value === "string" ? value : value?.id ?? null;
}

function approvedPriceIds() {
  return new Set(
    [process.env.STRIPE_PRICE_MONTHLY, process.env.STRIPE_PRICE_ANNUAL]
      .map((value) => value?.trim())
      .filter((value): value is string => Boolean(value)),
  );
}

export async function processStripeEvent(event: Stripe.Event) {
  const occurredAt = new Date(event.created * 1000);
  const subscriptionEvent = event.type.startsWith("customer.subscription.")
    ? event.data.object as Stripe.Subscription
    : null;
  const checkoutEvent = event.type === "checkout.session.completed"
    ? event.data.object as Stripe.Checkout.Session
    : null;

  return prisma.$transaction(async (tx) => {
    const receipt = await tx.billingWebhookEvent.createMany({
      data: {
        providerEventId: event.id,
        type: event.type,
        occurredAt,
      },
      skipDuplicates: true,
    });
    if (receipt.count === 0) return { processed: false, duplicate: true };

    if (checkoutEvent) {
      const billingAccountId = checkoutEvent.client_reference_id ?? checkoutEvent.metadata?.billingAccountId;
      const customerId = stripeResourceId(checkoutEvent.customer);
      if (!billingAccountId || !customerId) throw new Error("Checkout event is missing an account association.");
      const account = await tx.billingAccount.findUnique({ where: { id: billingAccountId } });
      if (!account || account.stripeCustomerId !== customerId) {
        throw new Error("Checkout customer does not match the stored billing account.");
      }
      return { processed: true, duplicate: false };
    }

    if (!subscriptionEvent) return { processed: true, duplicate: false };

    const billingAccountId = subscriptionEvent.metadata.billingAccountId;
    const customerId = stripeResourceId(subscriptionEvent.customer);
    const priceId = subscriptionEvent.items.data[0]?.price.id;
    if (!billingAccountId || !customerId || !priceId) {
      throw new Error("Subscription event is missing account, customer, or price data.");
    }
    const entitlement = getVerifiedPlanEntitlement(priceId);
    if (!entitlement || !approvedPriceIds().has(priceId)) throw new Error("Subscription uses an unapproved Stripe Price.");

    const account = await tx.billingAccount.findUnique({
      where: { id: billingAccountId },
      include: { subscription: true },
    });
    if (!account || account.stripeCustomerId !== customerId) {
      throw new Error("Subscription customer does not match the stored billing account.");
    }
    await tx.billingSubscriptionEvent.create({
      data: {
        billingAccountId: account.id,
        providerEventId: event.id,
        stripeSubscriptionId: subscriptionEvent.id,
        type: event.type,
        status: subscriptionEvent.status,
        priceId,
        occurredAt,
      },
    });
    if (!shouldApplySubscriptionEvent({
      storedSubscriptionId: account.subscription?.stripeSubscriptionId ?? null,
      storedOccurredAt: account.subscription?.lastEventOccurredAt ?? null,
      incomingSubscriptionId: subscriptionEvent.id,
      incomingOccurredAt: occurredAt,
    })) {
      return { processed: true, duplicate: false, stale: true };
    }

    const periodEnd = subscriptionEvent.items.data[0]?.current_period_end;
    const graceDays = Math.min(30, Math.max(1, Number.parseInt(process.env.BILLING_GRACE_DAYS ?? "7", 10) || 7));
    const graceUntil = subscriptionEvent.status === "past_due"
      ? new Date(occurredAt.getTime() + graceDays * 24 * 60 * 60 * 1000)
      : null;
    const lifecycleTimestamps = deriveSubscriptionLifecycleTimestamps(account.subscription, subscriptionEvent.status, occurredAt);

    await tx.billingSubscription.upsert({
      where: { billingAccountId: account.id },
      update: {
        stripeSubscriptionId: subscriptionEvent.id,
        priceId,
        ...entitlement,
        status: subscriptionEvent.status,
        currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : null,
        graceUntil,
        cancelAtPeriodEnd: subscriptionEvent.cancel_at_period_end,
        lastEventOccurredAt: occurredAt,
        ...lifecycleTimestamps,
      },
      create: {
        billingAccountId: account.id,
        stripeSubscriptionId: subscriptionEvent.id,
        priceId,
        ...entitlement,
        status: subscriptionEvent.status,
        currentPeriodEnd: typeof periodEnd === "number" ? new Date(periodEnd * 1000) : null,
        graceUntil,
        cancelAtPeriodEnd: subscriptionEvent.cancel_at_period_end,
        lastEventOccurredAt: occurredAt,
        ...lifecycleTimestamps,
      },
    });

    return { processed: true, duplicate: false, stale: false };
  });
}
