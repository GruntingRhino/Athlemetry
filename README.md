# Athlemetry

Production-oriented Next.js web app for structured soccer drill uploads, metric extraction, cohort benchmarking, and longitudinal athlete tracking.

## Stack
- Next.js 16 (App Router, TypeScript)
- Prisma ORM + PostgreSQL
- Neon Serverless Postgres (recommended host)
- NextAuth (credentials provider)
- Storage provider pattern: local filesystem or S3-compatible object storage
- Recharts for metric/percentile visualization

## Project Phases
- Phase 0: Requirements extraction and feature baseline tracking (`PHASE0_CHECKLIST.md`, initial `FEATURE_MAP.md`)
- Phase 1: Deployable skeleton (auth, roles, profile, schema, smoke paths)
- Phase 2: Drill submission workflow (library, upload, queue, statuses, admin submissions)
- Phase 3: Metrics MVP (real 20m sprint frame-based timing + persisted metrics)
- Phase 4: Benchmarking and trends (cohorts, percentiles, longitudinal charts)
- Phase 5: Completion/hardening (privacy/compliance flows, admin tooling, retries, monitoring, feature closure)

## Local Setup

### Prerequisites
- Node.js 20+
- npm 10+
- PostgreSQL 15+ (local) or Neon project

### 1) Install dependencies
```bash
npm install
```

### 2) Configure environment
```bash
cp .env.example .env
```

Set required values:
- `DATABASE_URL`
- `DIRECT_URL`
- `NEXTAUTH_SECRET`
- `NEXTAUTH_URL`

Neon connection format:
- `DATABASE_URL`: pooled host (contains `-pooler`)
- `DIRECT_URL`: direct host (no `-pooler`), used by Prisma migrations

### 3) Configure storage provider
Default (local filesystem):
- `STORAGE_PROVIDER=local`
- `VIDEO_RETENTION_HOURS=24`
- `KEEP_FAILED_VIDEOS_FOR_DEBUG=false`

Optional S3-compatible provider:
- `STORAGE_PROVIDER=s3`
- `S3_BUCKET`
- `S3_REGION`
- `S3_ENDPOINT` (for R2/MinIO/custom endpoints)
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_FORCE_PATH_STYLE` (set `true` for MinIO/localstack style)

### 4) Run migrations
```bash
npx prisma migrate deploy
npx prisma generate
```

### 5) Seed baseline data
```bash
npm run prisma:seed
```

Default seeded admin:
- Email: `admin@athlemetry.dev`
- Password: `admin1234`

### 6) Run locally
```bash
npm run dev
```

Open `http://localhost:3000`.

## Quality Gates
- Lint: `npm run lint`
- Tests: `npm test`
- Production build: `npm run build`

## Free-Tier Deployment (Vercel + Neon)

### 1) Create free Neon project
- In Neon Console, create a project/database.
- Copy both connection strings from **Connect**:
  - Pooled connection (runtime): host includes `-pooler`
  - Direct connection (migrations): host without `-pooler`

### 2) Set Vercel environment variables
Required:
- `DATABASE_URL` (Neon pooled)
- `DIRECT_URL` (Neon direct)
- `NEXTAUTH_URL` (your Vercel URL)
- `NEXTAUTH_SECRET`
- `MAX_VIDEO_SIZE_MB` (optional)

Storage:
- Local-only mode: `STORAGE_PROVIDER=local`
- S3-compatible mode: `STORAGE_PROVIDER=s3` + `S3_*` variables
- Metrics-first retention: set `VIDEO_RETENTION_HOURS` and `KEEP_FAILED_VIDEOS_FOR_DEBUG`

### 3) Deploy app
- Connect repository to Vercel
- Deploy `main` branch

### 4) Run DB migrations against Neon
From local machine with production env configured:
```bash
npx prisma migrate deploy
npm run prisma:seed
```

## API Surface (selected)
- Auth: `/api/auth/[...nextauth]`, `/api/auth/register`
- Submissions: `/api/submissions`, `/api/submissions/[id]/retry`, `/api/processing/status/[id]`
- Processing: `/api/processing/run`
- Privacy: `/api/privacy/export`, `/api/privacy/delete`, `/api/consent/approve`
- Admin: `/api/admin/manual-override`, `/api/admin/reports/[id]`, `/api/admin/model/version`, `/api/admin/model/retrain`, `/api/admin/storage/purge-expired`
- Integration v1: `/api/v1/drills`, `/api/v1/submissions`, `/api/v1/benchmarks`

## Neon Notes
- Use pooled Neon URL at runtime (`DATABASE_URL`) and direct URL for Prisma CLI (`DIRECT_URL`).
- If Neon compute is cold, a `connect_timeout` query param on `DATABASE_URL` helps avoid startup timeout errors.

## Notes
- Storage defaults to local filesystem (`uploads/`) when `STORAGE_PROVIDER=local`.
- Uploaded videos are treated as temporary processing assets and are purged by retention policy; metrics and drill metadata remain durable.
- Benchmarks and trends are computed from processed submissions and updated automatically.
- For full validation coverage, run manual QA from `TEST_PLAN.md`.
