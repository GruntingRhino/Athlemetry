CREATE TYPE "SubmissionShareAction" AS ENUM ('GRANTED', 'REVOKED');

CREATE TABLE "SubmissionShare" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "active" BOOLEAN NOT NULL DEFAULT true,
  "updatedByUserId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "SubmissionShare_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SubmissionShareAudit" (
  "id" TEXT NOT NULL,
  "submissionId" TEXT NOT NULL,
  "recipientId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "action" "SubmissionShareAction" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "SubmissionShareAudit_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubmissionShare_submissionId_recipientId_key" ON "SubmissionShare"("submissionId", "recipientId");
CREATE INDEX "SubmissionShare_recipientId_active_updatedAt_idx" ON "SubmissionShare"("recipientId", "active", "updatedAt");
CREATE INDEX "SubmissionShareAudit_submissionId_recipientId_createdAt_idx" ON "SubmissionShareAudit"("submissionId", "recipientId", "createdAt");

ALTER TABLE "SubmissionShare" ADD CONSTRAINT "SubmissionShare_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionShare" ADD CONSTRAINT "SubmissionShare_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionShare" ADD CONSTRAINT "SubmissionShare_updatedByUserId_fkey" FOREIGN KEY ("updatedByUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionShareAudit" ADD CONSTRAINT "SubmissionShareAudit_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionShareAudit" ADD CONSTRAINT "SubmissionShareAudit_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "SubmissionShareAudit" ADD CONSTRAINT "SubmissionShareAudit_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
