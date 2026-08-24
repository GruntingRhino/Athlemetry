ALTER TABLE "UserReport" ADD COLUMN "metricName" TEXT;
CREATE INDEX "UserReport_submissionId_metricName_createdAt_idx" ON "UserReport"("submissionId", "metricName", "createdAt");
