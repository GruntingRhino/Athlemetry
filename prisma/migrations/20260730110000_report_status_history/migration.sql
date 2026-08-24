CREATE TABLE "UserReportStatusEvent" (
  "id" TEXT NOT NULL,
  "reportId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL,
  "status" "ReportStatus" NOT NULL,
  "resolutionNote" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "UserReportStatusEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "UserReportStatusEvent_reportId_createdAt_idx"
  ON "UserReportStatusEvent"("reportId", "createdAt");

ALTER TABLE "UserReportStatusEvent"
  ADD CONSTRAINT "UserReportStatusEvent_reportId_fkey"
  FOREIGN KEY ("reportId") REFERENCES "UserReport"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "UserReportStatusEvent"
  ADD CONSTRAINT "UserReportStatusEvent_actorUserId_fkey"
  FOREIGN KEY ("actorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
