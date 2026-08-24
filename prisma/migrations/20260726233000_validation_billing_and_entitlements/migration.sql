-- Add expert-review and two-person approval evidence to the existing metric validation table.
ALTER TABLE "MetricValidation"
  ADD COLUMN "expertAgreement" DOUBLE PRECISION,
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "submittedByUserId" TEXT,
  ADD COLUMN "approvedByUserId" TEXT;

ALTER TABLE "MetricValidation" ADD CONSTRAINT "MetricValidation_submittedByUserId_fkey"
  FOREIGN KEY ("submittedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MetricValidation" ADD CONSTRAINT "MetricValidation_approvedByUserId_fkey"
  FOREIGN KEY ("approvedByUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
