CREATE TABLE "CoachingPlanActionCompletion" (
    "id" TEXT NOT NULL,
    "coachingPlanId" TEXT NOT NULL,
    "actionIndex" INTEGER NOT NULL,
    "completedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingPlanActionCompletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CoachingPlanActionCompletion_coachingPlanId_actionIndex_key"
ON "CoachingPlanActionCompletion"("coachingPlanId", "actionIndex");

CREATE INDEX "CoachingPlanActionCompletion_coachingPlanId_completedAt_idx"
ON "CoachingPlanActionCompletion"("coachingPlanId", "completedAt");

ALTER TABLE "CoachingPlanActionCompletion"
ADD CONSTRAINT "CoachingPlanActionCompletion_coachingPlanId_fkey"
FOREIGN KEY ("coachingPlanId") REFERENCES "CoachingPlan"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
