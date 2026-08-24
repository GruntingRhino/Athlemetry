ALTER TABLE "CoachingPlan"
ADD COLUMN "reassessmentDueAt" TIMESTAMP(3);

UPDATE "CoachingPlan"
SET "reassessmentDueAt" = "createdAt" + INTERVAL '28 days'
WHERE "reassessmentDueAt" IS NULL;

ALTER TABLE "CoachingPlan"
ALTER COLUMN "reassessmentDueAt" SET NOT NULL;

DROP INDEX "CoachingPlan_athleteId_status_createdAt_idx";

CREATE INDEX "CoachingPlan_athleteId_status_reassessmentDueAt_idx"
ON "CoachingPlan"("athleteId", "status", "reassessmentDueAt");
