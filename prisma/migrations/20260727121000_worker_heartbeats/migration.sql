CREATE TABLE "WorkerHeartbeat" (
    "id" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,
    "processedTotal" INTEGER NOT NULL DEFAULT 0,
    "errorTotal" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkerHeartbeat_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "WorkerHeartbeat_workerId_key" ON "WorkerHeartbeat"("workerId");
CREATE INDEX "WorkerHeartbeat_status_lastSeenAt_idx" ON "WorkerHeartbeat"("status", "lastSeenAt");
