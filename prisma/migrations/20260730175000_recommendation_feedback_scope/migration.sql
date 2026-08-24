-- Preserve athlete feedback about one released coaching recommendation without changing the recommendation or queueing work.
ALTER TABLE "UserReport"
  ADD COLUMN "coachingPlanId" TEXT,
  ADD COLUMN "recommendationActionIndex" INTEGER;

ALTER TABLE "UserReport"
  ADD CONSTRAINT "UserReport_coachingPlanId_fkey"
  FOREIGN KEY ("coachingPlanId") REFERENCES "CoachingPlan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "UserReport_coachingPlanId_recommendationActionIndex_createdAt_idx"
  ON "UserReport"("coachingPlanId", "recommendationActionIndex", "createdAt");
