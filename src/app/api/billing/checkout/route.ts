import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { billingReturnUrl, getStripeClient, resolveBillingPrice } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const planCode = typeof body.plan === "string" ? body.plan : "monthly";
  let priceId: string;
  try {
    priceId = resolveBillingPrice(planCode);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid plan." }, { status: 400 });
  }

  const user = await prisma.user.findFirst({ where: { id: session.user.id, deletedAt: null } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });

  let billingAccount;
  try {
    billingAccount = await prisma.$transaction(async (transaction) => {
      const account = await transaction.billingAccount.upsert({
        where: { userId: user.id },
        update: {},
        create: { userId: user.id },
        include: { subscription: true },
      });
      if (!account.subscription || !["active", "trialing", "past_due"].includes(account.subscription.status)) {
        await transaction.systemLog.create({
          data: {
            level: "INFO",
            category: "SECURITY_AUDIT",
            message: "Stripe Checkout initiated",
            metadata: { action: "STRIPE_CHECKOUT_INITIATED", actorUserId: user.id, planCode },
          },
        });
      }
      return account;
    });
  } catch {
    return NextResponse.json({ error: "Checkout could not be recorded safely." }, { status: 503 });
  }
  if (billingAccount.subscription && ["active", "trialing", "past_due"].includes(billingAccount.subscription.status)) {
    return NextResponse.json({ error: "Manage the existing subscription in the billing portal." }, { status: 409 });
  }

  const stripe = getStripeClient();
  let stripeCustomerId = billingAccount.stripeCustomerId;
  if (!stripeCustomerId) {
    const customer = await stripe.customers.create(
      { metadata: { billingAccountId: billingAccount.id } },
      { idempotencyKey: `billing-customer:${billingAccount.id}` },
    );
    const updated = await prisma.billingAccount.update({
      where: { id: billingAccount.id },
      data: { stripeCustomerId: customer.id },
    });
    stripeCustomerId = updated.stripeCustomerId;
  }
  if (!stripeCustomerId) throw new Error("Stripe customer association failed.");

  const bucket = Math.floor(Date.now() / (30 * 60 * 1000));
  const checkout = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: stripeCustomerId,
    client_reference_id: billingAccount.id,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { billingAccountId: billingAccount.id },
    subscription_data: { metadata: { billingAccountId: billingAccount.id } },
    success_url: billingReturnUrl("/billing?checkout=returned"),
    cancel_url: billingReturnUrl("/billing?checkout=canceled"),
    allow_promotion_codes: true,
  }, { idempotencyKey: `checkout:${billingAccount.id}:${priceId}:${bucket}` });

  if (!checkout.url) throw new Error("Stripe did not return a hosted Checkout URL.");
  return NextResponse.json({ url: checkout.url });
}
