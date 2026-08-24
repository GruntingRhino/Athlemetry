import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { billingReturnUrl, getStripeClient } from "@/lib/billing";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  let stripeCustomerId: string | null;
  try {
    stripeCustomerId = await prisma.$transaction(async (transaction) => {
      const billingAccount = await transaction.billingAccount.findUnique({
        where: { userId: session.user.id },
      });
      if (!billingAccount?.stripeCustomerId) return null;

      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Stripe billing portal initiated",
          metadata: { action: "STRIPE_BILLING_PORTAL_INITIATED", actorUserId: session.user.id },
        },
      });
      return billingAccount.stripeCustomerId;
    });
  } catch {
    return NextResponse.json({ error: "Billing portal could not be recorded safely." }, { status: 503 });
  }
  if (!stripeCustomerId) return NextResponse.json({ error: "No billing account exists." }, { status: 404 });

  const portal = await getStripeClient().billingPortal.sessions.create({
    customer: stripeCustomerId,
    return_url: billingReturnUrl("/billing"),
  });
  return NextResponse.json({ url: portal.url });
}
