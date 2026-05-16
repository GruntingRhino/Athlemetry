# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev           # Start Next.js dev server on http://localhost:3000
npm run build         # Production build
npm run lint          # ESLint check
npm run lint:fix      # ESLint auto-fix

# Testing
npm test              # Run all tests with coverage (vitest)
npm run test:watch    # Run tests in watch mode
# Run a single test file:
npx vitest run tests/metrics.test.ts

# Database
npm run db:up         # Start local Postgres via Docker Compose
npm run db:down       # Stop Postgres container
npm run prisma:migrate   # Create and apply new migration (dev)
npm run prisma:deploy    # Apply existing migrations (prod/CI)
npm run prisma:generate  # Regenerate Prisma client after schema changes
npm run prisma:seed      # Seed baseline drill definitions + default admin
```

Default seeded admin: `admin@athlemetry.dev` / `admin1234`

## Architecture

**Stack:** Next.js 16 App Router, TypeScript, Prisma ORM, PostgreSQL (Neon recommended), NextAuth v4 (credentials/JWT), Recharts, Zod, Tailwind v4.

### Request / Auth flow

`src/lib/auth.ts` — NextAuth config (credentials provider, JWT strategy, custom session fields).  
`src/lib/authz.ts` — Server-side helpers (`requireUser`, `requireRole`, `assertRole`). All protected pages/routes call these. Four roles: `ATHLETE | PARENT | COACH | ADMIN`.

### Drill submission & processing pipeline

1. Athlete uploads a video via the submission form → `POST /api/submissions` stores the file via the storage provider and creates a `DrillSubmission` record with `processingStatus: QUEUED`.
2. `POST /api/processing/run` dequeues submissions and calls `src/lib/processing/queue.ts` to drive state transitions.
3. Metrics are extracted by `src/lib/metrics/engine.ts` (`extractMetrics()`). Input is frame-based timing data or a file-size baseline; output is drill-specific metric fields written to `MetricResult`.
4. After extraction, `BenchmarkSnapshot` is computed and stored (percentile, cohort distribution).
5. Videos are treated as temporary assets: `src/lib/storage.ts` handles `local` and `s3`-compatible providers. Purge is driven by `VIDEO_RETENTION_HOURS`.

### Storage provider

`src/lib/storage.ts` exports `storeVideo()` and `purgeStoredVideo()`. Provider is selected by `STORAGE_PROVIDER` env var (`local` | `s3`). Local storage writes to `uploads/` (or `/tmp/athlemetry-uploads` on serverless). S3-compatible provider supports Cloudflare R2 / MinIO via `S3_ENDPOINT` + `S3_FORCE_PATH_STYLE`.

### Key lib modules

| Path | Purpose |
|---|---|
| `src/lib/prisma.ts` | Singleton Prisma client |
| `src/lib/benchmarking.ts` | Cohort percentile computation |
| `src/lib/dashboard.ts` | Aggregated stats for dashboard views |
| `src/lib/metrics/engine.ts` | Drill metric extraction (frame-based or file-size fallback) |
| `src/lib/metrics/types.ts` | `ExtractionInput` / `ExtractedMetrics` types |
| `src/lib/processing/queue.ts` | Submission queue runner |
| `src/lib/validators.ts` | Zod schemas for request validation |
| `src/lib/constants.ts` | App-wide constants (drill slugs, cohort keys, etc.) |
| `src/lib/logging.ts` | Structured `SystemLog` writer |

### API surface

```
/api/auth/[...nextauth]          NextAuth handler
/api/auth/register               New user registration
/api/submissions                 List / create drill submissions
/api/submissions/[id]/retry      Retry failed submission
/api/processing/run              Trigger processing queue
/api/processing/status/[id]      Poll processing status
/api/privacy/export              GDPR data export request
/api/privacy/delete              Account deletion request
/api/consent/approve             Record parental consent
/api/admin/manual-override       Admin metric override
/api/admin/reports/[id]          Review user reports
/api/admin/model/version         Model version management
/api/admin/model/retrain         Trigger retraining job
/api/admin/storage/purge-expired Purge expired videos
/api/v1/drills                   Integration: drill definitions
/api/v1/submissions              Integration: submission data
/api/v1/benchmarks               Integration: benchmark data
```

### Database schema highlights

- `DrillSubmission` — central entity; links athlete, drill definition, video storage metadata, processing state, and metric result.
- `MetricResult` — persisted metrics per submission; drill-specific nullable columns (e.g. `sprintTime`, `changeOfDirectionMeasurement`).
- `BenchmarkAggregate` — pre-computed cohort stats (mean, stdDev, p50, p90) keyed on `cohortKey + drillDefinitionId + metricName`.
- `BenchmarkSnapshot` — per-submission percentile snapshot for historical trending.
- Soft-delete pattern on `User` via `deletedAt`.

### Tests

Tests live in `tests/` and use Vitest. Coverage is collected only from `src/lib/**/*.ts`. Tests run in a `node` environment — no jsdom.

### Environment variables

Required: `DATABASE_URL` (pooled), `DIRECT_URL` (direct, for Prisma CLI), `NEXTAUTH_SECRET`, `NEXTAUTH_URL`.  
Optional: `STORAGE_PROVIDER`, `VIDEO_RETENTION_HOURS`, `KEEP_FAILED_VIDEOS_FOR_DEBUG`, `MAX_VIDEO_SIZE_MB`, S3 vars (`S3_BUCKET`, `S3_REGION`, `S3_ENDPOINT`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE`).

For Neon: use the pooled URL for `DATABASE_URL` (contains `-pooler`) and the direct URL for `DIRECT_URL`.
