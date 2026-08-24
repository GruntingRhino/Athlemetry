-- Outcome counts stored before independent provenance enforcement cannot support
-- customer-facing accuracy. Remove those values and their unproven metadata.
UPDATE "MetricResult"
SET "accuracyScore" = NULL
WHERE "accuracyScore" IS NOT NULL;

UPDATE "DrillSubmission"
SET metadata = metadata - 'verifiedOutcomes'
WHERE metadata ? 'verifiedOutcomes';
