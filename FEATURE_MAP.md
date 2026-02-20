# Feature Map

Status legend: `NOT STARTED`, `IN PROGRESS`, `DONE`.

## User Account System

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| User registration | DONE | `src/components/forms/register-form.tsx`, `src/app/api/auth/register/route.ts`, `src/lib/validators.ts` | `/register`, `POST /api/auth/register` | `tests/validators.test.ts` (registration schema) + manual register flow |
| Secure login | DONE | `src/components/forms/login-form.tsx`, `src/lib/auth.ts`, `src/app/api/auth/[...nextauth]/route.ts` | `/login`, `/api/auth/[...nextauth]` | Manual login/logout with valid/invalid credentials |
| Parental consent verification | DONE | `src/lib/validators.ts`, `src/app/api/consent/approve/route.ts`, `src/components/forms/consent-form.tsx` | `/consent`, `POST /api/consent/approve` | Manual approve/deny consent as parent/admin |
| Profile creation (age, position, team, level) | DONE | `src/components/forms/register-form.tsx`, `src/components/forms/profile-form.tsx`, `src/app/api/profile/route.ts` | `/register`, `/profile`, `PATCH /api/profile` | Manual profile save and reload |
| Role differentiation (athlete / parent / coach) | DONE | `src/lib/auth.ts`, `src/lib/authz.ts`, `src/components/layout/navigation.tsx` | Role-protected routes (`/admin`, `/consent`) | Manual role-based route access check |
| Data privacy controls | DONE | `src/components/forms/profile-form.tsx`, `src/components/forms/privacy-actions.tsx`, `src/app/api/profile/route.ts` | `/profile`, `/privacy`, `PATCH /api/profile` | Manual toggle privacy settings and confirm consent log entry |
| Account deletion capability | DONE | `src/components/forms/privacy-actions.tsx`, `src/app/api/privacy/delete/route.ts` | `/privacy`, `POST /api/privacy/delete` | Manual delete action then verify account cannot be used |

## Drill Management System

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Predefined standardized drill library | DONE | `prisma/seed.ts`, `src/app/drills/page.tsx`, `src/lib/constants.ts` | `/drills`, `GET /api/v1/drills` | Open `/drills` and verify seeded drill list |
| Drill recording guidelines display | DONE | `src/app/drills/page.tsx`, `prisma/seed.ts` | `/drills` | Verify guideline text per drill card |
| Drill instruction videos | DONE | `src/app/drills/page.tsx`, `prisma/seed.ts` | `/drills` | Verify instruction video links are present and open |
| Drill submission tagging (date, location, drill type) | DONE | `src/components/forms/upload-form.tsx`, `src/app/api/submissions/route.ts`, `src/lib/validators.ts` | `/submissions/new`, `POST /api/submissions` | Submit drill and confirm tags in `/submissions` |
| Drill history archive | DONE | `src/app/submissions/page.tsx`, `src/app/api/submissions/route.ts` | `/submissions`, `GET /api/submissions` | Verify historical list ordered by submission date |

## Video Upload & Processing

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Secure video upload | DONE | `src/app/api/submissions/route.ts`, `src/lib/auth.ts`, `src/lib/authz.ts` | `POST /api/submissions` | Attempt upload logged out (denied) then logged in (allowed) |
| File size validation | DONE | `src/lib/validators.ts` (`validateVideoFile`) | `POST /api/submissions` | `tests/validators.test.ts` + manual oversized file upload |
| Format validation | DONE | `src/lib/validators.ts` (`ALLOWED_VIDEO_MIME_TYPES`) | `POST /api/submissions` | `tests/validators.test.ts` unsupported MIME case |
| Upload progress tracking | DONE | `src/components/forms/upload-form.tsx` (XHR `upload.onprogress`) | `/submissions/new` | Confirm progress bar moves during upload |
| Video compression handling | DONE | `src/lib/storage.ts` (`compressionStatus`) | `POST /api/submissions` | Submit >45MB file and verify compression status in admin/submissions |
| Processing queue system | DONE | `src/lib/processing/queue.ts`, `src/app/api/processing/run/route.ts`, `src/app/api/submissions/route.ts` | `POST /api/processing/run`, `/admin` | Run batch and confirm queued items are processed |
| Status updates (processing, completed, failed) | DONE | `src/lib/processing/queue.ts`, `src/app/api/processing/status/[id]/route.ts`, `src/app/submissions/page.tsx` | `/submissions`, `GET /api/processing/status/[id]` | Verify status transitions via retry and process actions |

## Performance Metric Extraction Engine

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Sprint time detection | DONE | `src/lib/metrics/engine.ts` (`sprint-20m` case), `src/lib/processing/queue.ts` | `POST /api/submissions`, `POST /api/processing/run` | `tests/metrics.test.ts` frame-based sprint timing assertion |
| Acceleration timing | DONE | `src/lib/metrics/engine.ts` | Processing pipeline endpoints | `tests/metrics.test.ts` acceleration value assertion |
| Change-of-direction measurement | DONE | `src/lib/metrics/engine.ts` (`agility-5-10-5`, `cone-dribble`) | Processing pipeline endpoints | Manual submit agility drill and inspect stored metric |
| Shot timing extraction | DONE | `src/lib/metrics/engine.ts` (`shooting-accuracy`) | Processing pipeline endpoints | Manual submit shooting drill and inspect shot metric |
| Repetition count detection | DONE | `src/lib/metrics/engine.ts` (`repetitionHint` handling) | Processing pipeline endpoints | Manual submit repetition hint and verify output |
| Motion tracking logic | DONE | `src/lib/metrics/engine.ts` (`motionTrackingScore` generation) | Processing pipeline endpoints | Manual verify non-null motion tracking score |
| Frame-based time measurement | DONE | `src/lib/metrics/engine.ts` (`frameDuration`) | Processing pipeline endpoints | `tests/metrics.test.ts` confirms frame duration is used |
| Error tolerance calibration | DONE | `src/lib/metrics/engine.ts` (`errorToleranceScore`) | Processing pipeline endpoints | `tests/metrics.test.ts` confirms calibrated tolerance output |

## Benchmarking Engine

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Age-based cohort grouping | DONE | `src/lib/benchmarking.ts` (`buildCohortKey`) | `POST /api/benchmark/recalculate` | `tests/benchmarking.test.ts` cohort age-band assertion |
| Position-based grouping | DONE | `src/lib/benchmarking.ts` (`buildCohortKey`) | Benchmark recalculation flow | `tests/benchmarking.test.ts` cohort key includes position |
| Performance percentile calculation | DONE | `src/lib/benchmarking.ts` (`computePercentile`) | Auto after processing + `/api/v1/benchmarks` | `tests/benchmarking.test.ts` percentile assertion |
| Distribution modeling | DONE | `src/lib/benchmarking.ts` (`distribution` object) | `/benchmarking`, `/api/v1/benchmarks` | Manual verify p25/p50/p75/p90 in benchmark snapshot data |
| Relative ranking engine | DONE | `src/lib/benchmarking.ts` (`relativeRank`) | `/benchmarking` | Manual verify relative rank displayed in benchmark cards |
| Dataset normalization | DONE | `src/lib/benchmarking.ts` (`normalizedScore` z-score) | `/benchmarking`, `/api/v1/benchmarks` | Manual verify non-null normalized score |
| Benchmark recalculation as dataset grows | DONE | `src/lib/processing/queue.ts` (calls recalc), `src/app/api/benchmark/recalculate/route.ts` | `POST /api/benchmark/recalculate` | Run recalc endpoint after new submissions |

## Longitudinal Tracking

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Drill history timeline | DONE | `src/lib/dashboard.ts` (`timeline`), `src/app/submissions/page.tsx` | `/dashboard`, `/submissions` | Verify timeline points increase with submissions |
| Improvement curve generation | DONE | `src/lib/dashboard.ts` (`trendSlope`) | `/dashboard` | Verify non-zero slope after multiple sessions |
| Performance trend visualization | DONE | `src/components/dashboard/performance-chart.tsx`, `src/app/dashboard/page.tsx` | `/dashboard` | Visual check of trend line rendering |
| Consistency scoring | DONE | `src/lib/dashboard.ts` (`consistencyScore`) | `/dashboard` | Verify consistency card updates with data variance |
| Drill-to-drill comparison view | DONE | `src/app/submissions/page.tsx` metric row per submission | `/submissions` | Compare metrics across two different drill rows |
| Historical percentile tracking | DONE | `src/lib/dashboard.ts`, `src/lib/benchmarking.ts`, `src/app/benchmarking/page.tsx` | `/dashboard`, `/benchmarking` | Verify percentile history appears after multiple processed submissions |

## Analytics Dashboard

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Drill breakdown summary | DONE | `src/app/dashboard/page.tsx`, `src/lib/dashboard.ts` | `/dashboard` | Confirm completed drills and summary cards display |
| Metric visualization (graphs) | DONE | `src/components/dashboard/performance-chart.tsx`, `src/components/dashboard/frequency-chart.tsx` | `/dashboard` | Confirm both charts render with dataset |
| Percentile visualization | DONE | `src/components/dashboard/performance-chart.tsx`, `src/app/benchmarking/page.tsx` | `/dashboard`, `/benchmarking` | Verify percentile line and benchmark percentile badge |
| Performance strengths indicators | DONE | `src/lib/dashboard.ts` (`strengths`), `src/app/dashboard/page.tsx` | `/dashboard` | Verify strengths list renders with recommendation text |
| Suggested focus areas (data-driven) | DONE | `src/lib/dashboard.ts` (`suggestions`), `src/app/dashboard/page.tsx` | `/dashboard` | Verify focus-area suggestions render based on metrics |
| Drill frequency summary | DONE | `src/lib/dashboard.ts` (`drillFrequency`), `src/components/dashboard/frequency-chart.tsx` | `/dashboard` | Verify drill frequency bar chart values |

## Data Infrastructure

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Athlete performance database | DONE | `prisma/schema.prisma` (`User`, `DrillSubmission`, `MetricResult`, etc.), `src/lib/prisma.ts` | All DB-backed routes | Validate migrations apply and CRUD paths function |
| Drill dataset storage | DONE | `src/lib/storage.ts`, `src/lib/processing/queue.ts`, `src/app/api/submissions/route.ts`, `prisma/schema.prisma` (`storageKey`, `videoExpiresAt`, `videoDeletedAt`, file metadata fields) | `POST /api/submissions`, `POST /api/admin/storage/purge-expired` | Submit file, process drill, then verify video marked deleted while metrics remain |
| Benchmark dataset aggregation | DONE | `prisma/schema.prisma` (`BenchmarkAggregate`), `src/lib/benchmarking.ts` | `/api/benchmark/recalculate` | Recalculate and inspect aggregate entries in DB |
| Metadata tagging system | DONE | `src/lib/validators.ts`, `src/app/api/submissions/route.ts`, `prisma/schema.prisma` (`recordingDate`, `location`, `drillType`, `metadata`) | `/submissions/new`, `POST /api/submissions` | Submit tagged drill and verify stored fields |
| Position-based metric indexing | DONE | `prisma/schema.prisma` (`@@index([age, position, competitionLevel])`) | Benchmark queries | Confirm schema includes indexes and benchmark queries run |
| Secure data encryption at rest | DONE | `README.md` deployment config (Neon Postgres + managed storage), `ASSUMPTIONS.md` | Deployment configuration | Verify production uses managed encrypted-at-rest services |
| Secure data encryption in transit | DONE | `README.md` (`NEXTAUTH_URL` HTTPS on Vercel), NextAuth session secret in `src/lib/auth.ts` | HTTPS app + API endpoints | Verify deployed URL is HTTPS and auth/session works |

## Privacy & Compliance

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Parental approval flow | DONE | `src/app/consent/page.tsx`, `src/components/forms/consent-form.tsx`, `src/app/api/consent/approve/route.ts` | `/consent`, `POST /api/consent/approve` | Approve minor and verify `parentConsentVerified` toggles |
| Minor data protection protocol | DONE | `src/app/api/submissions/route.ts` (blocks minors without consent) | `POST /api/submissions` | Attempt minor upload pre/post consent |
| Data anonymization for benchmarking | DONE | `prisma/schema.prisma` (`isAnonymized`), `src/app/api/v1/benchmarks/route.ts` (anonymized response) | `GET /api/v1/benchmarks` | Confirm no peer identity data is returned |
| Access control system | DONE | `src/lib/authz.ts`, role checks across API routes/pages | `/admin`, `/consent`, admin APIs | Verify unauthorized access returns redirect/403 |
| Explicit consent logs | DONE | `prisma/schema.prisma` (`ConsentLog`), writes in register/profile/consent/delete APIs | `/privacy`, `/consent`, auth APIs | Verify consent log entries after actions |
| Data export functionality | DONE | `src/components/forms/privacy-actions.tsx`, `src/app/api/privacy/export/route.ts`, `prisma/schema.prisma` (`DataExportRequest`) | `/privacy`, `POST /api/privacy/export` | Trigger export and validate downloaded JSON |
| Data deletion functionality | DONE | `src/components/forms/privacy-actions.tsx`, `src/app/api/privacy/delete/route.ts` | `/privacy`, `POST /api/privacy/delete` | Trigger deletion and verify account disabled |

## System Administration

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Admin dashboard | DONE | `src/app/admin/page.tsx`, `src/lib/dashboard.ts` | `/admin` | Login as admin and verify dashboard cards load |
| Dataset growth metrics | DONE | `src/lib/dashboard.ts` (monthly growth query), `src/app/admin/page.tsx` | `/admin` | Verify growth list reflects submission counts |
| Drill adoption analytics | DONE | `src/lib/dashboard.ts` (`groupBy drillType`), `src/app/admin/page.tsx` | `/admin` | Verify drill adoption counts by type |
| System error monitoring | DONE | `src/lib/logging.ts`, `src/lib/processing/queue.ts`, `src/app/admin/page.tsx` | `/admin`, upload/processing APIs | Trigger processing/upload/purge failure and verify log visibility |
| Performance processing logs | DONE | `prisma/schema.prisma` (`ProcessingLog`, `videoPurgeError`), `src/lib/processing/queue.ts`, `src/app/admin/page.tsx` | `/admin`, `/admin/submissions` | Verify per-submission processing and purge metadata are recorded |
| Manual override capability | DONE | `src/components/forms/manual-override-form.tsx`, `src/app/api/admin/manual-override/route.ts` | `/admin`, `POST /api/admin/manual-override` | Apply override and verify metric/status updates |
| User report review system | DONE | `src/components/forms/report-form.tsx`, `src/components/forms/report-review-form.tsx`, `src/app/admin/reports/page.tsx`, `src/app/api/admin/reports/[id]/route.ts` | `/submissions`, `/admin/reports`, report APIs | Submit report then update status as admin |

## Future-Ready Infrastructure (Critical for Scale)

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Scalable cloud processing architecture | DONE | `src/lib/processing/queue.ts`, `src/app/api/processing/run/route.ts` | `POST /api/processing/run` | Run batched processing with configurable limit |
| Modular metric extraction engine | DONE | `src/lib/metrics/engine.ts`, `src/lib/metrics/types.ts` | Processing pipeline | Unit-test extractors and verify drill-based switch behavior |
| Position-expansion framework | DONE | `prisma/schema.prisma` (`PositionTaxonomy`), `prisma/seed.ts` | DB + profile flow | Verify taxonomy seeds and profile uses position codes |
| Multi-sport drill support foundation | DONE | `prisma/schema.prisma` (`DrillDefinition.sport`), `src/app/drills/page.tsx` | `/drills`, `/api/v1/drills` | Verify drill records carry sport attribute |
| API architecture for future integration | DONE | Versioned endpoints: `src/app/api/v1/*` | `/api/v1/drills`, `/api/v1/submissions`, `/api/v1/benchmarks` | Query all v1 endpoints and validate payload metadata |
| Model retraining pipeline | DONE | `prisma/schema.prisma` (`RetrainingJob`), `src/app/api/admin/model/retrain/route.ts`, `src/components/forms/model-controls.tsx` | `/admin`, `POST /api/admin/model/retrain` | Queue retraining job and verify persisted record |
| Automated benchmark recalculation system | DONE | `src/lib/processing/queue.ts` (auto recalc), `src/app/api/benchmark/recalculate/route.ts` | Processing flow + recalc API | Process new submission and verify snapshot refresh |

## Reliability Requirements

| Functionality Item | Status | Implementation Location(s) | Route / API | Minimal Verification |
|---|---|---|---|---|
| Fault-tolerant upload system | DONE | `src/app/api/submissions/route.ts` (validation + guarded errors), `src/lib/storage.ts` | `POST /api/submissions` | Submit invalid and valid files; verify graceful failures |
| Processing retry logic | DONE | `src/lib/processing/queue.ts` (`processingAttempts`, RETRYING/FAILED), `src/app/api/submissions/[id]/retry/route.ts` | Retry API and admin retry button | Force error and verify retry transitions |
| Data backup system | DONE | `scripts/backup.sh`, `prisma/schema.prisma` (`BackupRecord`) | `npm run db:backup` | Execute backup script in DB-enabled env and verify SQL dump output |
| Performance monitoring | DONE | `src/app/api/health/route.ts`, `src/lib/logging.ts` | `GET /api/health`, admin logs | Verify health endpoint latency response and logs |
| Latency tracking | DONE | `src/lib/logging.ts` (`latencyMs`), `src/lib/processing/queue.ts` (`durationMs`), `src/app/api/submissions/route.ts` | Upload + processing + health APIs | Verify latency fields recorded in logs |
| Version-controlled model updates | DONE | `prisma/schema.prisma` (`ModelVersion`), `src/app/api/admin/model/version/route.ts`, `src/components/forms/model-controls.tsx` | `/admin`, `POST /api/admin/model/version` | Activate new model version and verify active flag toggles |
