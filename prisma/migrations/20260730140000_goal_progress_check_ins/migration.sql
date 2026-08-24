CREATE TABLE "GoalProgressCheckIn" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "progressPercent" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GoalProgressCheckIn_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "GoalProgressCheckIn_athleteId_createdAt_idx"
ON "GoalProgressCheckIn"("athleteId", "createdAt");

ALTER TABLE "GoalProgressCheckIn"
ADD CONSTRAINT "GoalProgressCheckIn_athleteId_fkey"
FOREIGN KEY ("athleteId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
