CREATE TABLE "BenchmarkRebuildJob" (
  "id" TEXT NOT NULL,
  "cohortKey" TEXT NOT NULL,
  "drillDefinitionId" TEXT NOT NULL,
  "metricName" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'PENDING',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "cursorSubmissionId" TEXT,
  "lastError" TEXT,
  "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "claimedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "BenchmarkRebuildJob_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BenchmarkRebuildJob_cohortKey_drillDefinitionId_metricName_key"
  ON "BenchmarkRebuildJob"("cohortKey", "drillDefinitionId", "metricName");
CREATE INDEX "BenchmarkRebuildJob_status_queuedAt_idx"
  ON "BenchmarkRebuildJob"("status", "queuedAt");
