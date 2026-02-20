-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."Role" AS ENUM ('ATHLETE', 'PARENT', 'COACH', 'ADMIN');

-- CreateEnum
CREATE TYPE "public"."ProcessingStatus" AS ENUM ('QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'RETRYING');

-- CreateEnum
CREATE TYPE "public"."CompressionStatus" AS ENUM ('NOT_REQUIRED', 'PENDING', 'COMPRESSED', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."ReportStatus" AS ENUM ('OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED');

-- CreateEnum
CREATE TYPE "public"."ExportStatus" AS ENUM ('REQUESTED', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "emailVerified" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "role" "public"."Role" NOT NULL DEFAULT 'ATHLETE',
    "age" INTEGER,
    "position" TEXT,
    "team" TEXT,
    "competitionLevel" TEXT,
    "gender" TEXT,
    "parentEmail" TEXT,
    "parentConsentVerified" BOOLEAN NOT NULL DEFAULT false,
    "shareInBenchmarks" BOOLEAN NOT NULL DEFAULT true,
    "anonymizeForBenchmark" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Account" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "refresh_token" TEXT,
    "access_token" TEXT,
    "expires_at" INTEGER,
    "token_type" TEXT,
    "scope" TEXT,
    "id_token" TEXT,
    "session_state" TEXT,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Session" (
    "id" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VerificationToken" (
    "identifier" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expires" TIMESTAMP(3) NOT NULL
);

-- CreateTable
CREATE TABLE "public"."DrillDefinition" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'soccer',
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "guidelines" TEXT NOT NULL,
    "instructionVideoUrl" TEXT,
    "metricPrimaryKey" TEXT NOT NULL DEFAULT 'sprintTime',
    "lowerIsBetter" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrillDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DrillSubmission" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "drillDefinitionId" TEXT NOT NULL,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "recordingDate" TIMESTAMP(3) NOT NULL,
    "location" TEXT NOT NULL,
    "drillType" TEXT NOT NULL,
    "fileUrl" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "mimeType" TEXT NOT NULL,
    "compressionStatus" "public"."CompressionStatus" NOT NULL DEFAULT 'NOT_REQUIRED',
    "uploadProgress" INTEGER NOT NULL DEFAULT 0,
    "processingStatus" "public"."ProcessingStatus" NOT NULL DEFAULT 'QUEUED',
    "processingAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastError" TEXT,
    "frameRate" DOUBLE PRECISION,
    "startFrame" INTEGER,
    "finishFrame" INTEGER,
    "repetitionHint" INTEGER,
    "metadata" JSONB,
    "queuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "DrillSubmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."MetricResult" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "metricVersion" TEXT NOT NULL,
    "sprintTime" DOUBLE PRECISION,
    "accelerationTiming" DOUBLE PRECISION,
    "changeOfDirectionMeasurement" DOUBLE PRECISION,
    "shotTiming" DOUBLE PRECISION,
    "repetitionCount" INTEGER,
    "motionTrackingScore" DOUBLE PRECISION,
    "frameBasedDuration" DOUBLE PRECISION,
    "errorToleranceScore" DOUBLE PRECISION,
    "drillCompletionRate" DOUBLE PRECISION,
    "consistencyScore" DOUBLE PRECISION,
    "normalizedScore" DOUBLE PRECISION,
    "reliabilityScore" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MetricResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BenchmarkSnapshot" (
    "id" TEXT NOT NULL,
    "athleteId" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "cohortKey" TEXT NOT NULL,
    "percentile" DOUBLE PRECISION NOT NULL,
    "relativeRank" INTEGER NOT NULL,
    "normalizedScore" DOUBLE PRECISION NOT NULL,
    "distribution" JSONB NOT NULL,
    "isAnonymized" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BenchmarkAggregate" (
    "id" TEXT NOT NULL,
    "cohortKey" TEXT NOT NULL,
    "drillDefinitionId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "sampleSize" INTEGER NOT NULL,
    "mean" DOUBLE PRECISION NOT NULL,
    "stdDev" DOUBLE PRECISION NOT NULL,
    "p50" DOUBLE PRECISION NOT NULL,
    "p90" DOUBLE PRECISION NOT NULL,
    "lastRecalculated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BenchmarkAggregate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ConsentLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "actorUserId" TEXT,
    "consentType" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ConsentLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."UserReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "submissionId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" "public"."ReportStatus" NOT NULL DEFAULT 'OPEN',
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ManualOverride" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "adminId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "notes" TEXT,
    "payload" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ManualOverride_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessingLog" (
    "id" TEXT NOT NULL,
    "submissionId" TEXT NOT NULL,
    "status" "public"."ProcessingStatus" NOT NULL,
    "message" TEXT NOT NULL,
    "attempt" INTEGER NOT NULL,
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessingLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."SystemLog" (
    "id" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB,
    "latencyMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SystemLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ModelVersion" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "notes" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ModelVersion_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."RetrainingJob" (
    "id" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'QUEUED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RetrainingJob_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BackupRecord" (
    "id" TEXT NOT NULL,
    "location" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackupRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PositionTaxonomy" (
    "id" TEXT NOT NULL,
    "sport" TEXT NOT NULL DEFAULT 'soccer',
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PositionTaxonomy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."DataExportRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "public"."ExportStatus" NOT NULL DEFAULT 'REQUESTED',
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "exportUrl" TEXT,

    CONSTRAINT "DataExportRequest_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email");

-- CreateIndex
CREATE INDEX "User_role_idx" ON "public"."User"("role");

-- CreateIndex
CREATE INDEX "User_age_position_competitionLevel_idx" ON "public"."User"("age", "position", "competitionLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "public"."Account"("provider", "providerAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "public"."Session"("sessionToken");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "public"."VerificationToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "public"."VerificationToken"("identifier", "token");

-- CreateIndex
CREATE UNIQUE INDEX "DrillDefinition_slug_key" ON "public"."DrillDefinition"("slug");

-- CreateIndex
CREATE INDEX "DrillDefinition_sport_isActive_idx" ON "public"."DrillDefinition"("sport", "isActive");

-- CreateIndex
CREATE INDEX "DrillSubmission_athleteId_submittedAt_idx" ON "public"."DrillSubmission"("athleteId", "submittedAt");

-- CreateIndex
CREATE INDEX "DrillSubmission_processingStatus_queuedAt_idx" ON "public"."DrillSubmission"("processingStatus", "queuedAt");

-- CreateIndex
CREATE INDEX "DrillSubmission_drillDefinitionId_submittedAt_idx" ON "public"."DrillSubmission"("drillDefinitionId", "submittedAt");

-- CreateIndex
CREATE UNIQUE INDEX "MetricResult_submissionId_key" ON "public"."MetricResult"("submissionId");

-- CreateIndex
CREATE INDEX "MetricResult_createdAt_idx" ON "public"."MetricResult"("createdAt");

-- CreateIndex
CREATE INDEX "BenchmarkSnapshot_cohortKey_createdAt_idx" ON "public"."BenchmarkSnapshot"("cohortKey", "createdAt");

-- CreateIndex
CREATE INDEX "BenchmarkSnapshot_athleteId_createdAt_idx" ON "public"."BenchmarkSnapshot"("athleteId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkSnapshot_submissionId_key" ON "public"."BenchmarkSnapshot"("submissionId");

-- CreateIndex
CREATE INDEX "BenchmarkAggregate_cohortKey_lastRecalculated_idx" ON "public"."BenchmarkAggregate"("cohortKey", "lastRecalculated");

-- CreateIndex
CREATE UNIQUE INDEX "BenchmarkAggregate_cohortKey_drillDefinitionId_metricName_key" ON "public"."BenchmarkAggregate"("cohortKey", "drillDefinitionId", "metricName");

-- CreateIndex
CREATE INDEX "ConsentLog_userId_createdAt_idx" ON "public"."ConsentLog"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "UserReport_status_createdAt_idx" ON "public"."UserReport"("status", "createdAt");

-- CreateIndex
CREATE INDEX "ManualOverride_submissionId_createdAt_idx" ON "public"."ManualOverride"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "ProcessingLog_submissionId_createdAt_idx" ON "public"."ProcessingLog"("submissionId", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_category_createdAt_idx" ON "public"."SystemLog"("category", "createdAt");

-- CreateIndex
CREATE INDEX "SystemLog_level_createdAt_idx" ON "public"."SystemLog"("level", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ModelVersion_version_key" ON "public"."ModelVersion"("version");

-- CreateIndex
CREATE INDEX "RetrainingJob_status_createdAt_idx" ON "public"."RetrainingJob"("status", "createdAt");

-- CreateIndex
CREATE INDEX "BackupRecord_createdAt_idx" ON "public"."BackupRecord"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PositionTaxonomy_code_key" ON "public"."PositionTaxonomy"("code");

-- CreateIndex
CREATE INDEX "DataExportRequest_userId_requestedAt_idx" ON "public"."DataExportRequest"("userId", "requestedAt");

-- AddForeignKey
ALTER TABLE "public"."Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DrillSubmission" ADD CONSTRAINT "DrillSubmission_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DrillSubmission" ADD CONSTRAINT "DrillSubmission_drillDefinitionId_fkey" FOREIGN KEY ("drillDefinitionId") REFERENCES "public"."DrillDefinition"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."MetricResult" ADD CONSTRAINT "MetricResult_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BenchmarkSnapshot" ADD CONSTRAINT "BenchmarkSnapshot_athleteId_fkey" FOREIGN KEY ("athleteId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BenchmarkSnapshot" ADD CONSTRAINT "BenchmarkSnapshot_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BenchmarkAggregate" ADD CONSTRAINT "BenchmarkAggregate_drillDefinitionId_fkey" FOREIGN KEY ("drillDefinitionId") REFERENCES "public"."DrillDefinition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConsentLog" ADD CONSTRAINT "ConsentLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ConsentLog" ADD CONSTRAINT "ConsentLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserReport" ADD CONSTRAINT "UserReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserReport" ADD CONSTRAINT "UserReport_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "public"."User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."UserReport" ADD CONSTRAINT "UserReport_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."DrillSubmission"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualOverride" ADD CONSTRAINT "ManualOverride_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ManualOverride" ADD CONSTRAINT "ManualOverride_adminId_fkey" FOREIGN KEY ("adminId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcessingLog" ADD CONSTRAINT "ProcessingLog_submissionId_fkey" FOREIGN KEY ("submissionId") REFERENCES "public"."DrillSubmission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."DataExportRequest" ADD CONSTRAINT "DataExportRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

