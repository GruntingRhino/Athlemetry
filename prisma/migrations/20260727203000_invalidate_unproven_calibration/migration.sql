-- A legacy boolean flag did not provide independently reviewable calibration
-- provenance. Physical values created before provenance enforcement are withheld.
UPDATE "MetricResult"
SET
  "speed" = NULL,
  "acceleration" = NULL
WHERE "speed" IS NOT NULL OR "acceleration" IS NOT NULL;

UPDATE "DrillSubmission"
SET metadata = metadata - 'calibrationVerified'
WHERE metadata ? 'calibrationVerified';
