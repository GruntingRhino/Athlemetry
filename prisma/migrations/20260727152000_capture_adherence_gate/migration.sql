-- Per-submission capture adherence is now required in addition to global metric validation.
-- Existing snapshots and coaching plans predate the signed assessment and must not remain customer-visible.
DELETE FROM "BenchmarkSnapshot";
DELETE FROM "BenchmarkAggregate";
DELETE FROM "CoachingPlan";
