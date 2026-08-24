ALTER TABLE "User" ADD COLUMN "engagementCheckedAt" TIMESTAMP(3);
CREATE INDEX "User_role_deletedAt_engagementCheckedAt_idx" ON "User"("role", "deletedAt", "engagementCheckedAt");

CREATE TABLE "UserNotification" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "actionHref" TEXT,
  "readAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserNotification_userId_key_key" ON "UserNotification"("userId", "key");
CREATE INDEX "UserNotification_userId_readAt_createdAt_idx" ON "UserNotification"("userId", "readAt", "createdAt");
ALTER TABLE "UserNotification" ADD CONSTRAINT "UserNotification_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
