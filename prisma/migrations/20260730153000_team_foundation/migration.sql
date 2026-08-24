-- Establish the owner-scoped team foundation. Invitations and cross-account membership remain separate flows.
CREATE TYPE "TeamMembershipRole" AS ENUM ('OWNER', 'COACH', 'ATHLETE');

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sport" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMembership" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "TeamMembershipRole" NOT NULL DEFAULT 'OWNER',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TeamMembership_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "Team_ownerId_name_key" ON "Team"("ownerId", "name");
CREATE INDEX "Team_sport_createdAt_idx" ON "Team"("sport", "createdAt");
CREATE UNIQUE INDEX "TeamMembership_teamId_userId_key" ON "TeamMembership"("teamId", "userId");
CREATE INDEX "TeamMembership_userId_joinedAt_idx" ON "TeamMembership"("userId", "joinedAt");

ALTER TABLE "Team" ADD CONSTRAINT "Team_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMembership" ADD CONSTRAINT "TeamMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
