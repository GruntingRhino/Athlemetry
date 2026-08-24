CREATE TABLE "MonthlySubmissionUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "monthStart" TIMESTAMP(3) NOT NULL,
    "submissionCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MonthlySubmissionUsage_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MonthlySubmissionUsage_userId_monthStart_key" ON "MonthlySubmissionUsage"("userId", "monthStart");
CREATE INDEX "MonthlySubmissionUsage_monthStart_idx" ON "MonthlySubmissionUsage"("monthStart");

ALTER TABLE "MonthlySubmissionUsage"
  ADD CONSTRAINT "MonthlySubmissionUsage_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
