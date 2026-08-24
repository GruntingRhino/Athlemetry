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
- `UPLOAD_CLAIM_SECRET` (at least 32 random characters; binds each presigned object to the authenticated athlete and exact size/type/hash for 15 minutes)

The AWS SDK hoists `x-amz-meta-sha256` into the signed URL. Browser uploads must send the signed `Content-Type` but must not add a second `x-amz-meta-sha256` request header. Configure bucket lifecycle expiry for abandoned presigned objects in addition to application-driven deletion.

Configure the local computer-vision worker:
- Install `baseball_tracker/requirements.txt` in a Python environment.
- `VISION_PYTHON=./baseball_tracker/.venv/bin/python`
- `VISION_PERSON_MODEL=./baseball_tracker/yolov8n.pt`
- `VISION_POSE_MODEL=./yolov8n-pose.pt`
- `VISION_TIMEOUT_MS=120000`
- `WORKER_BATCH_SIZE=10` (bounded to 1–100)
- `WORKER_POLL_MS=5000` (bounded to 250–60000 ms)
- `WORKER_ID` (stable, unique deployment-instance identifier used for heartbeat and log correlation)
- `METRICS_TOKEN` (distinct random bearer token of at least 32 characters for Prometheus scraping)

Run the independently scalable worker with `npm run worker`. Use `npm run worker:once` for a scheduler-driven single batch. Workers use atomic conditional claims, recover work abandoned for 15 minutes, materialize S3 objects into isolated temporary files, and remove those files after analysis.

Production containers are built from separate targets:
```bash
docker build --target web -t athlemetry-web .
docker build --target worker -t athlemetry-worker .
```
The worker image uses pinned CPU-only PyTorch wheels and does not embed model artifacts. Mount the person and pose models read-only at the configured `VISION_PERSON_MODEL` and `VISION_POSE_MODEL` paths, and set `VISION_PERSON_MODEL_SHA256` and `VISION_POSE_MODEL_SHA256` to their lowercase SHA-256 digests. The worker exits with configuration status `78` before polling PostgreSQL when either model is missing, unreadable, empty, or does not match its configured digest. Run `npx prisma migrate deploy` as a separate release step before starting web and worker containers.

For direct browser-to-S3 uploads, allow `PUT` from the application origin in the bucket CORS policy and expose the `ETag` response header. Athlemetry verifies object size, MIME type, and the signed SHA-256 metadata before accepting the submission.

Configure hosted billing:
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_MONTHLY`
- `STRIPE_PRICE_ANNUAL`
- `BILLING_ENFORCEMENT_ENABLED=true` only after the complete Stripe test-mode lifecycle has passed

Configure a separate random `PROCESSING_WORKER_TOKEN` of at least 32 characters when invoking `/api/processing/run` or worker-authorized maintenance endpoints. The standalone worker does not use the HTTP endpoint and connects to PostgreSQL directly.

Production monitoring can scrape `GET /api/metrics` with `Authorization: Bearer <METRICS_TOKEN>`. The response includes bounded queue depth/age and aggregate worker health/counter metrics without athlete or submission identifiers. Also restrict this endpoint at the network layer.

### 4) Run migrations
```bash
npx prisma migrate deploy
npx prisma generate
```

### 5) Seed baseline data
```bash
npm run prisma:seed
```

Administrator provisioning is opt-in. Set both `SEED_ADMIN_EMAIL` and a unique `SEED_ADMIN_PASSWORD` of at least 16 characters before running the seed. If neither is present, no administrator account is created.

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
