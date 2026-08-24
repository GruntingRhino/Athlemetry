-- Preserve administrator-reviewed video moments without exposing reviewer identity to athletes.
CREATE TABLE "SubmissionKeyMoment" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "reviewerId" TEXT NOT NULL,
    "frameIndex" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "note" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubmissionKeyMoment_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "SubmissionKeyMoment_submissionId_frameIndex_label_key"
ON "SubmissionKeyMoment"("submissionId", "frameIndex", "label");

CREATE INDEX "SubmissionKeyMoment_submissionId_createdAt_idx"
ON "SubmissionKeyMoment"("submissionId", "createdAt");

CREATE INDEX "SubmissionKeyMoment_reviewerId_createdAt_idx"
ON "SubmissionKeyMoment"("reviewerId", "createdAt");

ALTER TABLE "SubmissionKeyMoment"
ADD CONSTRAINT "SubmissionKeyMoment_submissionId_fkey"
FOREIGN KEY ("submissionId") REFERENCES "DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "SubmissionKeyMoment"
ADD CONSTRAINT "SubmissionKeyMoment_reviewerId_fkey"
FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
