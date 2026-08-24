CREATE TABLE "RateLimitWindow" (
    "key" VARCHAR(128) NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimitWindow_pkey" PRIMARY KEY ("key")
);

CREATE INDEX "RateLimitWindow_updatedAt_idx" ON "RateLimitWindow"("updatedAt");