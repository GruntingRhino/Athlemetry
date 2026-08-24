CREATE TABLE "MetricValidation" (
    "id" TEXT NOT NULL,
    "drillDefinitionId" TEXT NOT NULL,
    "metricName" TEXT NOT NULL,
    "protocolVersion" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "sampleSize" INTEGER NOT NULL DEFAULT 0,
    "medianAbsoluteError" DOUBLE PRECISION,
    "p90Error" DOUBLE PRECISION,
    "failureRate" DOUBLE PRECISION,
    "confidenceCalibrationError" DOUBLE PRECISION,
    "evidenceUri" TEXT,
    "independentlyReviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MetricValidation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MetricValidation_drillDefinitionId_metricName_protocolVersion_key"
ON "MetricValidation"("drillDefinitionId", "metricName", "protocolVersion");

CREATE INDEX "MetricValidation_status_independentlyReviewedAt_idx"
ON "MetricValidation"("status", "independentlyReviewedAt");

ALTER TABLE "MetricValidation"
ADD CONSTRAINT "MetricValidation_drillDefinitionId_fkey"
FOREIGN KEY ("drillDefinitionId") REFERENCES "DrillDefinition"("id")
ON DELETE CASCADE ON UPDATE CASCADE;