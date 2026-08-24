ALTER TABLE "MetricValidation"
ADD COLUMN "modelVersion" TEXT NOT NULL DEFAULT 'unversioned';

DROP INDEX IF EXISTS "MetricValidation_drillDefinitionId_metricName_protocolVersion_key";
DROP INDEX IF EXISTS "MetricValidation_drillDefinitionId_metricName_protocolVersion_k";

CREATE UNIQUE INDEX "MetricValidation_drill_metric_protocol_model_k"
ON "MetricValidation"("drillDefinitionId", "metricName", "protocolVersion", "modelVersion");