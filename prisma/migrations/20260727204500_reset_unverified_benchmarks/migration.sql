-- Legacy benchmark membership trusted a mutable boolean without metric/model/protocol
-- identity. Rebuild all cohorts exclusively from server-owned structured assessments.
DELETE FROM "BenchmarkSnapshot";
DELETE FROM "BenchmarkAggregate";

UPDATE "DrillSubmission"
SET metadata = metadata - 'performanceVerified' - 'performanceAssessment'
WHERE metadata ? 'performanceVerified' OR metadata ? 'performanceAssessment';
