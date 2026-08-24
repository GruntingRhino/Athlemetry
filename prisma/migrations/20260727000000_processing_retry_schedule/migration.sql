ALTER TABLE "DrillSubmission"
  ADD COLUMN "nextAttemptAt" TIMESTAMP(3),
  ADD COLUMN "deadLetteredAt" TIMESTAMP(3);

CREATE INDEX "DrillSubmission_processingStatus_nextAttemptAt_queuedAt_idx"
  ON "DrillSubmission"("processingStatus", "nextAttemptAt", "queuedAt");
