CREATE TABLE "ErasureTombstone" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "erasedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ErasureTombstone_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ErasureTombstone_userId_key" ON "ErasureTombstone"("userId");
CREATE INDEX "ErasureTombstone_erasedAt_idx" ON "ErasureTombstone"("erasedAt");