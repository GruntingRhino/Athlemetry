-- Bound pending team invitations so stale grants cannot be accepted indefinitely.
ALTER TABLE "TeamInvitation" ADD COLUMN "expiresAt" TIMESTAMP(3);

UPDATE "TeamInvitation"
SET "expiresAt" = "createdAt" + INTERVAL '14 days'
WHERE "expiresAt" IS NULL;

ALTER TABLE "TeamInvitation" ALTER COLUMN "expiresAt" SET NOT NULL;

CREATE INDEX "TeamInvitation_recipientId_status_expiresAt_idx"
ON "TeamInvitation"("recipientId", "status", "expiresAt");

CREATE INDEX "TeamInvitation_teamId_status_expiresAt_idx"
ON "TeamInvitation"("teamId", "status", "expiresAt");
