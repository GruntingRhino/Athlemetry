CREATE TABLE "BillingAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "stripeCustomerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingSubscription" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT,
    "priceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'inactive',
    "currentPeriodEnd" TIMESTAMP(3),
    "graceUntil" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "lastEventOccurredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "BillingSubscription_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "BillingWebhookEvent" (
    "id" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BillingWebhookEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingAccount_userId_key" ON "BillingAccount"("userId");
CREATE UNIQUE INDEX "BillingAccount_stripeCustomerId_key" ON "BillingAccount"("stripeCustomerId");
CREATE UNIQUE INDEX "BillingSubscription_billingAccountId_key" ON "BillingSubscription"("billingAccountId");
CREATE UNIQUE INDEX "BillingSubscription_stripeSubscriptionId_key" ON "BillingSubscription"("stripeSubscriptionId");
CREATE INDEX "BillingSubscription_status_currentPeriodEnd_idx" ON "BillingSubscription"("status", "currentPeriodEnd");
CREATE UNIQUE INDEX "BillingWebhookEvent_providerEventId_key" ON "BillingWebhookEvent"("providerEventId");
CREATE INDEX "BillingWebhookEvent_type_occurredAt_idx" ON "BillingWebhookEvent"("type", "occurredAt");

ALTER TABLE "BillingAccount" ADD CONSTRAINT "BillingAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BillingSubscription" ADD CONSTRAINT "BillingSubscription_billingAccountId_fkey"
FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;