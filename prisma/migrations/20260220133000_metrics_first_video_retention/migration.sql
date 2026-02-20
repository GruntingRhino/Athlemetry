-- Alter DrillSubmission for metrics-first video retention
ALTER TABLE "public"."DrillSubmission"
  ALTER COLUMN "fileUrl" DROP NOT NULL,
  ADD COLUMN "storageProvider" TEXT,
  ADD COLUMN "storageKey" TEXT,
  ADD COLUMN "videoHash" TEXT,
  ADD COLUMN "videoExpiresAt" TIMESTAMP(3),
  ADD COLUMN "videoDeletedAt" TIMESTAMP(3),
  ADD COLUMN "videoPurgeError" TEXT,
  ADD COLUMN "retainVideoForAudit" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "DrillSubmission_videoDeletedAt_videoExpiresAt_idx"
  ON "public"."DrillSubmission"("videoDeletedAt", "videoExpiresAt");
