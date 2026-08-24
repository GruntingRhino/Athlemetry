-- Preserve provider-confirmed subscription transitions for internal conversion and lifecycle reporting.
ALTER TABLE "BillingSubscription"
ADD COLUMN "trialStartedAt" TIMESTAMP(3),
ADD COLUMN "firstPaidAt" TIMESTAMP(3);

CREATE TABLE "BillingSubscriptionEvent" (
    "id" TEXT NOT NULL,
    "billingAccountId" TEXT NOT NULL,
    "providerEventId" TEXT NOT NULL,
    "stripeSubscriptionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "priceId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingSubscriptionEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BillingSubscriptionEvent_providerEventId_key"
ON "BillingSubscriptionEvent"("providerEventId");

CREATE INDEX "BillingSubscriptionEvent_billingAccountId_occurredAt_idx"
ON "BillingSubscriptionEvent"("billingAccountId", "occurredAt");

CREATE INDEX "BillingSubscriptionEvent_type_occurredAt_idx"
ON "BillingSubscriptionEvent"("type", "occurredAt");

CREATE INDEX "BillingSubscriptionEvent_status_occurredAt_idx"
ON "BillingSubscriptionEvent"("status", "occurredAt");

ALTER TABLE "BillingSubscriptionEvent"
ADD CONSTRAINT "BillingSubscriptionEvent_billingAccountId_fkey"
FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
