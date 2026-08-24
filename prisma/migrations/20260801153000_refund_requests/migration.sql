CREATE TABLE "RefundRequest" (
  "id" TEXT NOT NULL,
  "billingAccountId" TEXT NOT NULL,
  "requesterId" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "details" TEXT,
  "status" TEXT NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "RefundRequest_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RefundRequest_billingAccountId_status_createdAt_idx" ON "RefundRequest"("billingAccountId", "status", "createdAt");
CREATE INDEX "RefundRequest_requesterId_createdAt_idx" ON "RefundRequest"("requesterId", "createdAt");

ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_billingAccountId_fkey" FOREIGN KEY ("billingAccountId") REFERENCES "BillingAccount"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RefundRequest" ADD CONSTRAINT "RefundRequest_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
