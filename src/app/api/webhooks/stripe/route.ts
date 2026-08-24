import { NextResponse } from "next/server";

import { getStripeClient } from "@/lib/billing";
import { processStripeEvent } from "@/lib/billing-webhook";

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  const signingSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!signature || !signingSecret) {
    return NextResponse.json({ error: "Missing webhook signature configuration." }, { status: 400 });
  }

  const rawBody = await request.text();
  let event;
  try {
    event = getStripeClient().webhooks.constructEvent(rawBody, signature, signingSecret);
  } catch {
    return NextResponse.json({ error: "Invalid webhook signature." }, { status: 400 });
  }

  try {
    const result = await processStripeEvent(event);
    return NextResponse.json(result);
  } catch (error) {
    console.error("Stripe webhook processing failed", {
      eventId: event.id,
      eventType: event.type,
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Webhook processing failed." }, { status: 500 });
  }
}
