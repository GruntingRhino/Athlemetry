-- Preserve an athlete's explicit human-review request independently from the report text.
CREATE TYPE "ReportRequestType" AS ENUM ('ISSUE', 'HUMAN_REVIEW');

ALTER TABLE "UserReport"
  ADD COLUMN "requestType" "ReportRequestType" NOT NULL DEFAULT 'ISSUE';
