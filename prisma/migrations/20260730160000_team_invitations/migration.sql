-- Add invitation-only athlete membership. Invitations are limited to existing, active athletes and do not grant submission access.
CREATE TYPE "TeamInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED');

CREATE TABLE "TeamInvitation" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "inviterId" TEXT NOT NULL,
    "status" "TeamInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TeamInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "TeamInvitation_teamId_recipientId_key" ON "TeamInvitation"("teamId", "recipientId");
CREATE INDEX "TeamInvitation_recipientId_status_createdAt_idx" ON "TeamInvitation"("recipientId", "status", "createdAt");
CREATE INDEX "TeamInvitation_inviterId_createdAt_idx" ON "TeamInvitation"("inviterId", "createdAt");

ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamInvitation" ADD CONSTRAINT "TeamInvitation_inviterId_fkey" FOREIGN KEY ("inviterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
