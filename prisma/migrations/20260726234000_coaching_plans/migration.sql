CREATE TABLE "CoachingPlan" (
  "id" TEXT NOT NULL,
  "athleteId" TEXT NOT NULL,
  "drillDefinitionId" TEXT NOT NULL,
  "sourceSubmissionId" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'ACTIVE',
  "weaknesses" JSONB NOT NULL,
  "recommendations" JSONB NOT NULL,
  "confidenceScore" DOUBLE PRECISION NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CoachingPlan_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CoachingPlan_sourceSubmissionId_key" ON "CoachingPlan"("sourceSubmissionId");
CREATE INDEX "CoachingPlan_athleteId_status_createdAt_idx" ON "CoachingPlan"("athleteId", "status", "createdAt");
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_athleteId_fkey"
  FOREIGN KEY ("athleteId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_drillDefinitionId_fkey"
  FOREIGN KEY ("drillDefinitionId") REFERENCES "DrillDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CoachingPlan" ADD CONSTRAINT "CoachingPlan_sourceSubmissionId_fkey"
  FOREIGN KEY ("sourceSubmissionId") REFERENCES "DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
