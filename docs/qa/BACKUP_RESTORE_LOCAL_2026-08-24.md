# Backup / Restore Rehearsal — LOCAL (2026-08-24)

**Label: LOCAL-SYNTHETIC.** This rehearsal ran entirely against a local Podman container
(`athl-pg`, image `docker.io/library/postgres:16`) on a single developer workstation with
seeded synthetic data only. It is **not** evidence about any production or hosted
environment. No real user data was involved.

## Environment

- Host: local Linux workstation, disk-constrained (single-volume)
- Container: `athl-pg` (postgres:16), database `athlemetry` with migrations + seed applied
- Method: plain `pg_dump` (SQL format) streamed over `podman exec` to the host,
  restored via `psql -q -v ON_ERROR_STOP=1`

## Procedure

```bash
# 1. Dump seeded DB (host-side timing)
podman exec athl-pg pg_dump -U postgres --no-owner --no-privileges athlemetry \
  > /tmp/athlemetry_seed_dump.sql

# 2. Fresh target database
podman exec athl-pg dropdb -U postgres --if-exists athlemetry_restore
podman exec athl-pg createdb -U postgres athlemetry_restore

# 3. Restore into second database
podman exec -i athl-pg psql -U postgres -d athlemetry_restore \
  -q -v ON_ERROR_STOP=1 < /tmp/athlemetry_seed_dump.sql
```

Both steps exited rc=0; restore had zero SQL errors under `ON_ERROR_STOP=1`.

## Timings

| Step | Result | Wall time |
|---|---|---|
| pg_dump of `athlemetry` | rc=0, 94,049 bytes (plain SQL) | **0.37 s** |
| restore into `athlemetry_restore` | rc=0, no errors | **0.96 s** |

(Total ~1.3 s for a tiny seeded dataset; timings are not extrapolated to production volume.)

## Row-count comparison (source vs restored)

All 43 relations in schema `public` compared table-by-table: **43/43 match, 0 mismatches.**

Non-empty tables after seed:

| Table | Rows (both DBs) |
|---|---|
| DrillDefinition | 17 |
| PositionTaxonomy | 5 |
| ModelVersion | 1 |
| User | 1 |
| _prisma_migrations | 45 |

All other tables: 0 rows in both source and restored databases (full list verified:
Account, BackupRecord, BenchmarkAggregate, BenchmarkRebuildJob, BenchmarkSnapshot,
BillingAccount, BillingSubscription, BillingSubscriptionEvent, BillingWebhookEvent,
CoachingPlan, CoachingPlanActionCompletion, CoachingPlanActionEvent, ConsentLog,
DataExportRequest, DrillSubmission, ErasureTombstone, GoalProgressCheckIn,
ManualOverride, MetricResult, MetricValidation, MonthlySubmissionUsage, ProcessingLog,
RateLimitWindow, RefundRequest, RetrainingJob, Session, SubmissionKeyMoment,
SubmissionShare, SubmissionShareAudit, SystemLog, Team, TeamInvitation,
TeamMembership, UserNotification, UserReport, UserReportStatusEvent,
VerificationToken, WorkerHeartbeat).

## Draft RPO/RTO notes — LOCAL rehearsal only

These are draft numbers derived from a single local run on an empty-to-tiny dataset.
They are **planning inputs only**, not validated production SLAs.

- **RPO (draft):** With plain scheduled `pg_dump`, RPO = dump interval (e.g. hourly dumps
  ⇒ up to 1 h of lost writes). Local run confirms dumps are cheap and fast at small data
  volume; production RPO should be set by backup scheduling policy, not this test.
- **RTO (draft):** Restore of the full schema+data took ~1 s locally on a near-empty DB;
  a realistic production RTO must add container/instance provisioning, DNS/cutover and
  verification time. Suggested planning figure pending larger-data rehearsal: minutes,
  dominated by infrastructure spin-up rather than pg_restore itself.
- **Gaps before treating this as production-ready:** (1) rehearse with production-scale
  row counts and blob-heavy content; (2) decide WAL/PITR vs periodic-dump posture;
  (3) automate restore verification (this run's row counts were checked by hand);
  (4) store dumps off-host (this one lived in `/tmp`).

## Verdict

Backup + restore mechanics verified working end-to-end at seed scale, locally.
No production claims made or implied.
