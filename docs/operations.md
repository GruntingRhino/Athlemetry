# Phase 7 Operations Runbook

## Required local and CI verification

Run these before deployment and require the GitHub Actions `CI` workflow to pass:

```bash
npm run lint
npx tsc --noEmit
npm test
npm run build
CI=1 npm run test:a11y
podman build --target web -t athlemetry-web:release .
podman build --target worker -t athlemetry-worker:release .
```

### Local verification record (2026-08-25)

The current canonical `main` head was `694ed0cf194de81edd265912f44ab7a3e8eada15`.
On the disk-constrained local VM, the following were verified: ESLint PASS; TypeScript
typecheck PASS; Vitest PASS (113 files, 480 tests); Next.js production build PASS; and
the accessibility spec PASS (7/7 with `CI=1`, Playwright Chromium, one worker).
The local Prometheus/Alertmanager config tests also passed as part of Vitest. `promtool`
and `amtool` were not installed, so deployed-version rule/config validation remains
unverified locally. A Podman PostgreSQL backup/restore rehearsal passed with 43/43 public
tables matching. These are **VERIFIED-LOCAL / LOCAL-SYNTHETIC** results only, not staging
or production evidence.

The first local Vitest attempt exposed a missing `ffprobe` executable; the VM's ffmpeg
binary was already present and a local-only ffprobe compatibility shim was used to rerun
the test. CI now installs the `ffmpeg` package explicitly before tests. The latest GitHub
Actions run for this head had failed at `npm test` before this correction; rerun CI after
the workflow change and require a green run before launch claims.

## Staging deployment checklist

1. Configure staging with distinct database, object-storage bucket, `NEXTAUTH_SECRET`, and application URL.
2. Set all required environment variables from `.env.example`; never copy production credentials into staging.
3. Confirm HTTPS redirect, authentication, minor consent gating, upload/processing, retention purge, privacy export/delete, and admin authorization.
4. Run an authenticated API/E2E security suite and a dependency/security scan against the staging build.
5. Record deployment version, migration version, and rollback target.
6. Run `npx prisma migrate deploy` as a one-shot release task before replacing web or worker instances.
7. Mount both CV models read-only and configure their `VISION_*_MODEL_SHA256` values. Treat worker exit `78` as a release-configuration failure; do not restart-loop it.
8. Require `/api/health` to report `status: ok` before routing web traffic. Confirm at least one worker starts, processes a known permission-cleared canary video, and records a terminal processing log before enabling customer uploads.
9. Give each worker instance a stable, unique `WORKER_ID`. Confirm `/admin` reports it as `ACTIVE`; a running worker with no heartbeat for more than 90 seconds is classified as `STALE`. Alert on zero active workers while ready queue depth is nonzero, any stale worker, sustained queue lag, or dead-letter growth.

## Worker incident triage

1. Check `/admin` for active/stale worker counts, queue depth, oldest ready-job age, and dead-letter details.
2. A graceful shutdown records `STOPPED`. A process that disappears while still marked `RUNNING` becomes `STALE` after 90 seconds.
3. Review the worker's structured logs by `workerId` before requeueing a poison job.
4. Use the administrator requeue control only after correcting the recorded failure. Requeue resets attempts and queue age and writes both processing and administrator audit records.
5. Do not repeatedly requeue integrity failures, unsupported media, or invalid model output; preserve evidence according to the configured failed-video retention window and remediate the cause first.

## Distributed abuse protection

1. Configure a distinct random `RATE_LIMIT_HMAC_SECRET` in every production environment. It hashes IP/user identifiers before they enter `RateLimitWindow`; do not reuse or log the raw value.
2. Registration, credential login, privacy export, and account deletion use PostgreSQL-backed windows, so limits are shared across all web replicas. Login applies both a source-attempt ceiling and an account-failure ceiling, performs dummy password work for unknown/blocked accounts, and clears account failures only after successful authentication. Database or key-configuration failure fails closed rather than silently disabling protection.
3. Restrict which edge proxy may set `X-Forwarded-For`, strip every client-supplied forwarding header, and add the canonical address before proxying. Set `TRUST_PROXY_HEADERS=true` only after verifying that edge behavior. Production registration and login fail closed when this attestation is absent, and malformed forwarded addresses collapse to the non-attacker-selected `unknown` key.
4. Schedule `POST /api/admin/rate-limits/purge-expired` with the processing-worker bearer credential. Each call deletes at most 1,000 rows older than 24 hours; repeat until `deleted` is below 1,000. The bounded cleanup preserves active windows and avoids an unbounded transaction. A cleanup failure affects storage growth, not active-window correctness.

## Metrics and alerting

1. Configure a distinct random `METRICS_TOKEN` of at least 32 characters. Do not reuse authentication, worker, Stripe, or storage credentials.
2. Scrape `GET /api/metrics` with `Authorization: Bearer <METRICS_TOKEN>`. The endpoint is non-cacheable and returns Prometheus text without athlete identifiers or per-submission labels.
3. Alert when `athlemetry_queue_jobs{status="dead_lettered"}` increases, `athlemetry_workers{health="stale"}` is nonzero, or queued work exists while `athlemetry_workers{health="active"}` is zero.
4. Define queue-age thresholds from measured service capacity before launch. Do not invent an SLO before representative multi-worker load evidence exists.
5. Restrict the metrics endpoint at the network layer in addition to bearer authentication and rotate the token after suspected disclosure.
6. Mount `ops/prometheus/prometheus.yml` at `/etc/prometheus/prometheus.yml`, `ops/prometheus/alerts.yml` at `/etc/prometheus/alerts.yml`, and the raw bearer token as `/run/secrets/metrics_token`. The default scrape target is `web:3000`; override service discovery in the deployment platform rather than embedding credentials.
7. Deploy Alertmanager as the `alertmanager:9093` service, mount `ops/alertmanager/alertmanager.yml` read-only, and mount the operator webhook URL as `/run/secrets/alertmanager_webhook_url`. The URL file is a secret and must not be committed, logged, or reused as another credential. Restrict Alertmanager's API to the monitoring network.
8. Validate every monitoring release with `promtool check config /etc/prometheus/prometheus.yml`, `promtool test rules ops/prometheus/alerts.test.yml`, and `amtool check-config /etc/alertmanager/alertmanager.yml` using the exact deployed versions.
9. Send a uniquely named canary through Prometheus and observe both firing and resolved notifications at the real operator destination. Record receiver ownership and escalation behavior. A disposable webhook proves routing mechanics but does not prove production paging or human response.
10. Run at least two Alertmanager peers in production when the deployment platform supports stable peer discovery; test receiver failure and peer loss before relying on the path for incident response.

## Rollback procedure

1. Stop new traffic or promote the last known-good deployment in the hosting provider.
2. Do not roll database schema backward automatically; use only additive, backward-compatible migrations until a tested rollback migration exists.
3. Verify login, upload, processing, and privacy endpoints after rollback.
4. Record the incident, affected window, remediation, and verification evidence.

## Backup and restore verification

1. Mount a random backup key as a readable file owned by the backup job. Run `DATABASE_URL=... BACKUP_ENCRYPTION_KEY_FILE=/run/secrets/backup_key BACKUP_DIR=/backups scripts/backup.sh`. The job requires Node.js plus PostgreSQL client tools, writes a PostgreSQL custom-format dump encrypted with AES-256-CBC/PBKDF2, writes a SHA-256 sidecar, and leaves no plaintext dump behind.
2. Replicate both `.dump.enc` and `.sha256` objects into access-controlled durable storage with provider encryption, version retention, and lifecycle policy. Backing up PostgreSQL does not back up video objects; inventory and replicate the configured object-storage bucket separately.
3. Create an empty, isolated restore database. Run `RESTORE_CONFIRM_ISOLATED=true RESTORE_DATABASE_URL=... DATABASE_URL=... BACKUP_FILE=... BACKUP_ENCRYPTION_KEY_FILE=... scripts/restore-backup.sh`. The restore refuses a source/target URL match, a bad checksum, or a nonempty public schema.
4. Compare aggregate counts and non-identifying content hashes for migrations, users, submissions, metrics, benchmark snapshots, coaching plans, consent, billing, notifications, and retention metadata. Exercise login, export, deletion, and a permission-cleared processing canary against the restored staging application.
5. Destroy plaintext temporary state, the isolated database, and restored object bucket after recording backup age, restore duration, recovery-point loss, recovery-time result, and operator. Never print key material or database URLs in the evidence report.

## Object-storage retention and erasure

1. Set `S3_OBJECT_VERSIONING_ENABLED` explicitly to the real bucket setting. Production deletion fails closed when it is omitted. Never set it to `false` merely to bypass missing IAM permissions.
2. For a versioned bucket, grant the application only the bucket/key-prefix permissions needed to list object versions and delete exact-key versions and delete markers. Athlemetry first removes the current object, enumerates every exact-key historical version, deletes them in bounded batches, and verifies no versions remain.
3. Exercise erasure in staging by creating multiple versions of one non-sensitive canary key, invoking the same application purge path used by retention and account deletion, and confirming the provider lists zero versions and delete markers for that exact key.
4. Treat access-denied responses, non-advancing pagination, provider deletion errors, or residual versions as failed erasure. Account deletion remains uncommitted so the operation can be retried after storage remediation.
5. Backup or replication buckets are separate erasure domains. Document their legal retention basis and deletion workflow; deleting the live object does not prove replicated or provider-managed backup copies were erased.

## Manual owner/provider/legal evidence required before launch

- Provider encryption-at-rest, TLS, retention, and regional-processing settings.
- Production credential rotation and least-privilege service accounts.
- Signed Privacy Policy, Terms, COPPA/GDPR review, and youth-data processing approval.
- Staging security scan, load test, disaster-recovery drill, and rollback exercise.
- App Store privacy labels, review materials, and iOS device validation.

These cannot be truthfully completed from repository code alone.
