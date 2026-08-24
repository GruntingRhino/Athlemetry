-- Preserve the athlete's claimed corrected value for a scoped metric report.
-- This is a review input only; it does not alter an analyzed metric result.
ALTER TABLE "UserReport" ADD COLUMN "reportedValue" DOUBLE PRECISION;
