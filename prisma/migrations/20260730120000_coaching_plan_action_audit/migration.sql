CREATE TABLE "CoachingPlanActionEvent" (
    "id" TEXT NOT NULL,
    "coachingPlanId" TEXT NOT NULL,
    "actionIndex" INTEGER NOT NULL,
    "actorUserId" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoachingPlanActionEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CoachingPlanActionEvent_coachingPlanId_actionIndex_createdAt_idx"
ON "CoachingPlanActionEvent"("coachingPlanId", "actionIndex", "createdAt");

CREATE INDEX "CoachingPlanActionEvent_actorUserId_createdAt_idx"
ON "CoachingPlanActionEvent"("actorUserId", "createdAt");

ALTER TABLE "CoachingPlanActionEvent"
ADD CONSTRAINT "CoachingPlanActionEvent_coachingPlanId_fkey"
FOREIGN KEY ("coachingPlanId") REFERENCES "CoachingPlan"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "CoachingPlanActionEvent"
ADD CONSTRAINT "CoachingPlanActionEvent_actorUserId_fkey"
FOREIGN KEY ("actorUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
