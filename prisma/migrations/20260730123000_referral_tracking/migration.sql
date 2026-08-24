ALTER TABLE "User"
ADD COLUMN "referralCode" TEXT,
ADD COLUMN "referredByUserId" TEXT;

CREATE UNIQUE INDEX "User_referralCode_key" ON "User"("referralCode");
CREATE INDEX "User_referredByUserId_idx" ON "User"("referredByUserId");

ALTER TABLE "User"
ADD CONSTRAINT "User_referredByUserId_fkey"
FOREIGN KEY ("referredByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;