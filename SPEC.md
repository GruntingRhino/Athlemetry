# SPEC — Athlemetry

> **Single source of truth** for what Athlemetry is, where it stands, and what remains.
> Consolidates `ATHLEMETRY.md` (goal), `BLOCKERS.md` (evidence gates), `FEATURE_MAP.md` (historical inventory), `product_requirements_document.md` (superseded), `VIDEOS.md` / `docs/*` (corpus + validation plans), and `docs/operations.md` (runbook).
> Those files stay as **detail references**; when they disagree with this file or with the code, see §11 (Drift register).
>
> **Last reconciled:** 2026-11-08 · **Repo HEAD at reconcile:** `a53219d` · **Working tree:** clean
> **Owner input applied 2026-11-08:** web-first; `baseball_tracker` retired (D13); no real recording sessions yet; development hardening before worker hosting (D14). See §0.5, §9 D8–D14, §10.
> **Update protocol:** see `CLAUDE.md`. Short form — every session that changes behavior, scope, status, or a decision updates this file *in the same commit*.

---

## 0. How to read this document

### 0.1 Status vocabulary (use exactly these)

| Status | Meaning |
|---|---|
| `EXERCISED` | Implemented **and** run with evidence (test run, command output, recorded QA doc). Evidence cited. |
| `IMPLEMENTED` | Code exists and has unit/integration tests, but has not been exercised in a real environment (browser, real DB, provider, real footage). |
| `EXTERNAL` | Cannot be closed from the repo: needs hardware, real footage, legal sign-off, a provider account, or a human decision. Never mark closed from code alone. |
| `MISSING` | Not built. |

> `DONE` in `FEATURE_MAP.md` means "code was once mapped", **not** any of the above. Do not copy that status here.

### 0.2 Todo tags and IDs

- IDs are `S<stage>-<nn>` (e.g. `S8-03`). Never renumber; retire with `~~strike~~` + reason. Commits reference IDs.
- `[A]` agent-doable now, no external dependency. `[E]` externally gated. `[H]` needs a human decision first.
- `- [ ]` open · `- [x]` closed **with evidence in the line or the Session log** · `- [~]` in progress.

### 0.3 Resume here (top of queue)

Work these in order unless the user redirects. Keep this list to ≤7 items.

Active milestone is **M1 — web staging → private beta** (§0.5). Order:

1. **Confirm the new CI jobs on GitHub** `[E]` — branch `chore/m1-baseline-and-node22` pushed 2026-11-08 with a PR; `cv-python`, `database`, the `tsc` step and the Node 22 `worker` image build were validated locally only (S8-01..S8-03, S8-12). Read the run, fix reds, merge.
2. **S11 stand-in analyzer** `[A]` — dev-only VL-model analyzer so upload → process → graded drill can be exercised before the pre-trained CV model exists (§7 S11, D16).
3. **S8-04** — authenticated Playwright E2E (register → login → profile → upload → status) on a real DB in CI; the largest remaining QA hole. Reuse the `database` job pattern.
4. **S11 Phase 6** `[A]/[E]` — the final stage (§7 S11, from `PHASE_6.md`): coach/organisation workflow, provenance categories, org/session/attempt model. **Scope is all three sports** (D17); Phase 6's soccer-only framing no longer applies.
5. **S6-09 follow-up** `[H]` — full signup-enumeration protection needs email verification (Q3).
6. **S0-01, S0-02, S0-04, S0-05** — doc drift fixes (§11).
7. **S2-04** `[H]` — Ultralytics AGPL decision (Q4); blocks public launch. Worker hosting for the beta (S7-11) is deferred by the owner until after this development phase.

### 0.4 Critical-path truth

The code is far ahead of the evidence. **Almost every physical-measurement claim is blocked by Stage 9** (real, permission-cleared footage + ground truth). No amount of additional engineering opens those gates, and the system is deliberately fail-closed. Agents must **not** weaken a gate, relabel a proxy, or fabricate evidence to make progress look faster.

---

### 0.5 Active milestone — M1: web staging → private beta (owner priority, 2026-11-08)

**Scope:** get Athlemetry running on the public web. **Web only**; native wrapper deferred (D9). Billing enforcement stays **off** (S5-01 not done).

**Recommended topology (confirm via S7-00):**
- **Web:** Vercel (README already documents it) — Next.js app + route handlers.
- **DB:** Neon (pooled `DATABASE_URL`, direct `DIRECT_URL`).
- **Video storage:** Cloudflare R2 or S3 with direct presigned browser uploads (avoids Vercel body-size/time limits; code supports it).
- **Worker:** the `worker` Docker target on a container host (Fly.io / Railway / Render / Cloud Run). **Vercel cannot run the Python CV worker**, and `/api/processing/run` is not the production path. CPU-only torch is pinned; GPU is not assumed.

**Free-tier constraints (owner: stay free for now, D12):**
- *Vercel Hobby* is restricted to personal, non-commercial use by Vercel's own docs. Fine for an unpaid, invite-only beta; **move to a paid plan before taking payments**. Hobby function-duration and body-size figures conflict across Vercel pages (60 s vs 300 s; body limit unconfirmed), so keep video off the function path (presigned direct uploads).
- *Neon* and *R2* free tiers: current quotas **not yet verified** — check storage, compute hours and operation limits in S7-10.
- *Worker* is the hard part: it needs Python + torch + YOLO weights (RAM-hungry), and typical free web-service tiers are small and sleep when idle. Proposed for the invite-only beta: **run the worker on the owner's Mac** (`npm run worker`; per README it does not use the HTTP endpoint and connects directly to Postgres and S3). Free, but it only processes while that machine is on and awake. Unverified end-to-end (S7-11). An always-on paid worker comes when the beta needs it.

**What M1 will honestly show:** upload → queue → processing status → report shell. Because every physical-metric gate is closed until Stage 9, most drills will display metrics as *withheld/unavailable* — correct fail-closed behavior, not a bug. A staging that "shows numbers" would mean a gate was bypassed. Option for a private beta to also *collect* corpus footage (needs signed releases, model-training consent, and a retention carve-out) is a human decision — Q6.

**Gating to open access beyond invite-only testers:** S2-04 (AGPL), S6-04 (legal notices, esp. minors), Q3 (email delivery for password reset), S6-08 (support contact), S7-03/S7-04 (alerting + error tracking).

**M1 exit:** staging deployed from a clean tagged commit; migrations applied; canary video processed end-to-end by the hosted worker; `/api/health` ok; authenticated E2E green in CI; rollback exercised once.

---

## 1. Objective

**Mission.** A subscription platform where soccer, basketball, and baseball athletes record a standardized drill on an ordinary phone and receive *defensible* measurements, specific coaching, personalized plans, progress tracking, and fair peer benchmarking.

**Target scale.** 20,000–30,000 paying athletes at ~$20–$30/month, with no manual processing and sustainable per-video cost.

**Users / roles** (`Role` enum): `ATHLETE`, `PARENT`, `COACH`, `ADMIN`. Minors require parental consent.

**Core outcome (14 steps)** — profile → sport/position/goal → choose drill → get capture guidance → record/upload → automatic processing → reliable explainable metrics → strengths/weaknesses → actionable recommendations → personalized plan → reassess → compare to relevant verified peers → share selectively → dispute inaccurate analysis. (Full text: `ATHLEMETRY.md`.)

**Honesty principles (non-negotiable product rules)**

1. Unsupported drill, bad footage, missing calibration, low-confidence detection → **reject or mark unavailable**, never a plausible-looking score.
2. Pipeline confidence ≠ measurement correctness. A metric is "validated/verified/benchmark-ready" **only** after passing its validation threshold; otherwise it is experimental/unavailable and excluded from rankings.
3. Distinguish: direct physical measurement · model estimate · verified outcome · coaching assessment · composite/proxy score.
4. File size and user-entered distance are **not** metric evidence.
5. Raw footage never becomes public, enters benchmarks, or trains models without explicit permission. Videos are temporary assets (default 24 h retention).
6. No medical/injury/diagnostic claims; no recruiting/scholarship/"potential" claims from an automated score.
7. User corrections never become ground truth without review.

**Success definition (not an MVP).** Complete only when every capability is implemented, integrated, persisted, secured, tested end-to-end, validated where accuracy is claimed, and operating under realistic production conditions — with evidence (files, flows, tests, validation results, deployment status, limitations, external dependencies) for each requirement.

**Out of scope (explicit).** Full-game footage analytics, injury-risk prediction, 3D reconstruction from one camera, exit-velocity/pitch-speed from poor video, arbitrary-landmark homography inference, free-form "analyze anything" mode. (PRD long-term items remain parked.)

---

## 2. Assumptions (confirm or correct)

Surfaced per spec-driven-development; none are silently decided.

1. **Web-only for now** (owner, 2026-11-08); Next.js PWA (`manifest.ts`). Native wrapper deferred; the App Store items in `docs/operations.md` are out of scope until revived (D9).
2. Production runs web on a Node host/container and the CV **worker as a separate Python-capable container** (Dockerfile has `web` and `worker` targets); Postgres = Neon; object storage = S3-compatible (R2/S3/MinIO).
3. Stripe is the only billing provider.
4. The production CV path is **`vision_core/`**, invoked by `src/lib/vision-analysis.ts` (`python -m vision_core.video`). `baseball_tracker/` was retired on 2026-11-08 (D13); baseball runs through `vision_core` only.
5. Four `.pt` weights are **tracked in git by design** (`.gitignore` note; `git ls-files '*.pt'` confirms).
6. Launch sports: soccer, basketball, baseball. Position taxonomy via `PositionTaxonomy`.
7. Password-reset and notification delivery go through a **configured webhook**, not a built-in email provider (no mail library in `package.json`). A support contact address exists (D10) but a transactional **sending** provider is still undecided → Q3.

---

## 3. Engineering spec (the six core areas)

### 3.1 Tech stack

Next.js 16 (App Router) · React 19.2 · TypeScript (strict) · Prisma 6 + PostgreSQL (Neon) · NextAuth v4 (credentials/JWT) · Zod 4 · Tailwind v4 · Recharts 3 · Stripe 18 · AWS SDK v3 (S3) · Vitest 4 + v8 coverage · Playwright + axe · Python CV: `vision_core` (YOLO/YOLO-World, YOLO pose, YoutuReID ONNX, OpenCV ArUco homography). CI: GitHub Actions, Node 22. Containers: Docker (`web`, `worker`).

### 3.2 Commands

```bash
# Setup (node_modules is NOT present in a fresh checkout)
npm ci && npx prisma generate
cp .env.example .env            # then set DATABASE_URL, DIRECT_URL, NEXTAUTH_SECRET, NEXTAUTH_URL

# Dev / build
npm run dev                     # http://localhost:3000
npm run build                   # needs CI-equivalent placeholder env (see .github/workflows/ci.yml)
npm run lint                    # ESLint (next core-web-vitals + typescript)
npx tsc --noEmit                # strict typecheck (also run explicitly in docs/operations.md)

# Tests
npm test                                        # vitest run --coverage (tests/**/*.test.ts, node env)
npx vitest run tests/<file>.test.ts             # single file
npm run test:watch
CI=1 npm run test:a11y                          # Playwright + axe, 7 public routes
python3 -m pytest vision_core/tests -q          # CV unit tests

# Database
npm run db:up | db:down                         # local Postgres via Docker Compose
npm run prisma:migrate                          # create+apply (dev)
npm run prisma:deploy                           # apply existing (prod/CI)
npm run prisma:seed                             # drills + optional admin (SEED_ADMIN_EMAIL/PASSWORD ≥16 chars)

# Worker / ops
npm run worker                                  # long-running processing worker
npm run worker:once                             # single batch (scheduler-driven)
npm run db:backup                               # scripts/backup.sh (encrypted dump)
docker build --target web    -t athlemetry-web .
docker build --target worker -t athlemetry-worker .
```

> `ffmpeg`/`ffprobe` must be on `PATH` or one synthetic-media test fails (479/480 → 480/480 when installed).

### 3.3 Project structure

```
src/app/                 Next.js routes: pages + src/app/api/** route handlers
src/components/          forms/, dashboard/, admin/, teams/, layout/, legal/
src/lib/                 domain logic (the only dir counted for coverage)
  processing/            queue, claim, retry policy, worker, heartbeat, operations
  metrics/types.ts       persisted analyzer metric types
src/types/               NextAuth type augmentation
prisma/                  schema.prisma, 45 migrations, seed.ts, seed-config.ts
vision_core/             PRODUCTION CV (Python): video, objects, reid, recognition,
                         segmentation, calibration, normalization, metrics, benchmarks
vision_core/tests/       pytest (9 files)
scripts/                 processing-worker.ts, backup/restore, erasure ledger, fixtures, entrypoint
ops/                     prometheus + alertmanager config and rule tests
tests/                   114 Vitest files (route, policy, UI-contract, runbook-guard tests)
e2e/                     Playwright (accessibility.spec.ts only)
docs/                    runbooks, validation plans, QA records (docs/qa/*), consent templates
test-media/              technical decode fixtures only (licenses in manifest.json) — NOT validation data
opendesign/              design-generation artifacts (not runtime)
.playwright-cli/, output/  local tool artifacts — gitignored, untracked (S0-03)
```

### 3.4 Code style (match the existing house style)

Server routes: session check → scoped query → **mutation + `SECURITY_AUDIT` log in one transaction** → controlled `503` on any failure (fail closed, no detail leaked), `404` without disclosing foreign records.

```ts
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;
  try {
    const dismissed = await prisma.$transaction(async (transaction) => {
      const result = await transaction.userNotification.updateMany({
        where: { id, userId: session.user.id, readAt: null },   // ownership in the WHERE
        data: { readAt: new Date() },
      });
      if (result.count !== 1) return false;
      await transaction.systemLog.create({ data: {
        level: "INFO", category: "SECURITY_AUDIT", message: "Notification dismissed",
        metadata: { action: "NOTIFICATION_DISMISSED", actorUserId: session.user.id, notificationId: id }, // minimal metadata, no payloads
      }});
      return true;
    });
    if (!dismissed) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Notification could not be dismissed safely." }, { status: 503 });
  }
  return NextResponse.json({ ok: true });
}
```

Conventions: `@/` alias → `src/`; Zod schemas in `src/lib/validators.ts`; authz via `src/lib/authz.ts`; audit metadata contains **only** action + actor + opaque IDs; user-supplied text rejected if it contains email/phone/external links where it will be shown to others; tests mock `next-auth`, `@/lib/auth`, and the `prisma` surface via `vi.hoisted`, then `await import()` the route.

### 3.5 Testing strategy

| Level | Tool | Location | Covers | Expectation |
|---|---|---|---|---|
| Unit/route/policy | Vitest (node) | `tests/` | every route: 401/403/404, validation, ownership scoping, audit-write-failure → 503, release-gate withholding | New route or policy ⇒ new test file in the same change |
| CV unit | pytest | `vision_core/tests/` | gates, evaluators, fail-closed paths | Adversarial/negative cases required, not just happy path |
| Runbook guards | Vitest | `tests/*-runbook.test.ts`, `alertmanager-config`, `container-config` | docs/config must not over-claim | Keep passing when docs change |
| Accessibility | Playwright + axe | `e2e/` | WCAG 2 A/AA + 2.1 AA, 7 public routes | Fails on serious/critical |
| Build | `next build` | CI | prerender + types | Must pass with placeholder env |
| **Gaps (todo)** | | | authenticated E2E, mobile browser, load, DB-backed integration, real-footage regression, pentest | Stage 8 |

Synthetic/generated media validates **plumbing only** and never counts toward a corpus threshold.

### 3.6 Boundaries

- **Always:** run `npm run lint`, `npx tsc --noEmit`, and the relevant vitest files before claiming done; keep mutation+audit transactional; keep gates fail-closed; add a test with every behavior change; update this spec.
- **Ask first:** Prisma schema/migration changes (migrations are additive-only — no automatic rollback exists); new dependencies; CI/workflow edits; changes to `src/lib/capability-validation.ts`, `drill-protocols.ts` thresholds or any release gate; anything touching billing enforcement flags; deleting tracked files/media; running anything against Neon/Stripe/S3 or any deployed environment; sending email/messages.
- **Never:** commit secrets or `.env`; lower a validation threshold or relabel a proxy/unvalidated metric as validated; use synthetic or third-party footage as validation evidence; mark an `EXTERNAL` item closed without the external evidence; seed a default admin credential; edit applied migrations; remove/skip failing tests without approval; force-push or rewrite history; use real athlete names/PII in fixtures, logs, or docs.

---

## 4. Domain reference

### 4.1 Drill catalog — 17 versioned protocols (`src/lib/drill-protocols.ts`, protocol `1.1.0`)

| Sport | Slugs |
|---|---|
| Soccer (9) | `sprint-20m` · `agility-5-10-5` · `shooting-accuracy` · `shooting-mechanics` · `movement-efficiency` · `passing-accuracy` · `first-touch-control` · `cone-dribble` · `shuttle-endurance` |
| Baseball (4) | `baseball-pitch-velocity` · `baseball-pitch-command` · `baseball-throwing-mechanics` · `baseball-swing-timing` |
| Basketball (4) | `basketball-spot-shooting` · `basketball-lane-agility` · `basketball-free-throw` · `basketball-form-capture` |

`vision_core/recognition.py` carries a signature for all 17. **Not yet in the catalog** (promised by `ATHLEMETRY.md`): basketball vertical-jump/three-point/ball-handling; baseball sprint, fielding movement, bat-speed proxy; soccer additional passing variants. See S3-12.

### 4.2 Release-gate chain (a customer-visible metric is shown only if **all** pass)

```
capture adherence (fps, tracking, identity, recognition, segmentation, calibration)
 → capability validation (src/lib/capability-validation.ts; per-class/per-capability thresholds)
 → metric validation bound to exact model + protocol identity (MetricValidation, two-admin approval)
 → performance assessment (src/lib/performance-verification.ts)
 → customer release (src/lib/customer-metrics.ts) → benchmark eligibility → coaching-plan release
```

Any model/protocol/analyzer change invalidates dependent evidence and triggers benchmark rebuild jobs. Proxies (`techniqueScore`, power, agility, `consistencyScore`) are always labeled proxies until separately expert-validated.

### 4.3 Processing pipeline

Upload (`/api/submissions` direct, or `/api/uploads/presign` → `/api/submissions/cloud`) → `DrillSubmission(QUEUED)` + audit + monthly-usage claim (one transaction) → worker claims (`FOR UPDATE OF … SKIP LOCKED`, entitled accounts first, FIFO within tier) → `vision_core.video` via `vision-analysis.ts` → only supported, reliable metrics written to `MetricResult` → `BenchmarkSnapshot` → video purged by retention. Retries with schedule; dead-letter + admin requeue; worker heartbeats (`STALE` after 90 s); Prometheus `/api/metrics`.

### 4.4 Data model (42 models; see `prisma/schema.prisma`)

Identity/auth: `User, Account, Session, VerificationToken` · Pipeline: `DrillDefinition, DrillSubmission, MetricResult, ProcessingLog, WorkerHeartbeat, ModelVersion, RetrainingJob, ManualOverride, SubmissionKeyMoment` · Benchmarks: `BenchmarkSnapshot, BenchmarkAggregate, BenchmarkRebuildJob, MetricValidation, PositionTaxonomy` · Billing: `BillingAccount, BillingSubscription, BillingSubscriptionEvent, BillingWebhookEvent, MonthlySubmissionUsage, RefundRequest` · Coaching/engagement: `CoachingPlan, CoachingPlanActionCompletion, CoachingPlanActionEvent, GoalProgressCheckIn, UserNotification` · Teams/sharing: `Team, TeamMembership, TeamInvitation, SubmissionShare, SubmissionShareAudit` · Trust/privacy/ops: `ConsentLog, UserReport, UserReportStatusEvent, SystemLog, DataExportRequest, ErasureTombstone, RateLimitWindow, BackupRecord`.

### 4.5 Environment

Required: `DATABASE_URL` (pooled), `DIRECT_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`. Security/ops: `RATE_LIMIT_HMAC_SECRET`, `TRUST_PROXY_HEADERS`, `PROCESSING_WORKER_TOKEN`, `METRICS_TOKEN`, `UPLOAD_CLAIM_SECRET`, `WORKER_ID`. Storage: `STORAGE_PROVIDER`, `S3_*` (incl. `S3_OBJECT_VERSIONING_ENABLED`), `VIDEO_RETENTION_HOURS`, `KEEP_FAILED_VIDEOS_FOR_DEBUG`, `MAX_VIDEO_SIZE_MB`. CV: `VISION_PYTHON`, `VISION_{PERSON,POSE,OBJECT,REID,BASEBALL_OBJECT}_MODEL` + `*_SHA256` (worker exits `78` on mismatch), `VISION_TIMEOUT_MS`, `WORKER_BATCH_SIZE`, `WORKER_POLL_MS`. Billing: `STRIPE_*`, `BILLING_ENFORCEMENT_ENABLED` (**leave false** until the full Stripe test lifecycle passes), `ATHLEMETRY_MONTHLY_SUBMISSION_LIMIT` (default 20).

---

## 5. Current verified state (as of 2026-11-08)

Source: `docs/qa/LOCAL_GATES_2026-10-22.md`, `docs/operations.md`, `vision_core/VERIFICATION_REPORT.md`, `ci.yml`. The older table below is superseded by the **2026-11-08 re-run in §5.1**.

| Gate | Last recorded | Evidence |
|---|---|---|
| ESLint | PASS | LOCAL_GATES 2026-10-22 |
| `tsc --noEmit` | PASS | same |
| Vitest | 113 files / **480** tests PASS (needs ffmpeg) | same |
| `next build` | PASS (CI-equivalent placeholder env) | same |
| `vision_core` pytest | 86/86 PASS | same |
| `baseball_tracker` pytest | 91/91 PASS | same |
| Accessibility | 7/7 public routes PASS (local, 2026-08-25) | operations.md |
| PG backup/restore rehearsal | PASS, 43/43 tables (Podman, 2026-08-24) | docs/qa/BACKUP_RESTORE… |
| Local synthetic E2E (upload/queue/retry/metrics) | recorded | docs/qa/E2E_LOCAL_SYNTHETIC… |
| Staging/production deployment | **none** | — |
| Real-footage validation | **none** | — |

These are **VERIFIED-LOCAL / LOCAL-SYNTHETIC** only.

### 5.1 Baseline re-run — 2026-11-08 (HEAD `a53219d` + uncommitted docs/untrack)

Environment: macOS arm64; Node v26.8.2 (CI uses 22 — see S8-12); Python 3.14.7 scratch venv with numpy 2.5.4 / opencv 5.0.0 (**not** the pinned numpy 1.26.4 / opencv 4.11); ultralytics, mediapipe and torch **not installed**; ffmpeg present; Docker not exercised.

| Gate | Result | Evidence / caveat |
|---|---|---|
| ESLint | PASS | exit 0 |
| `tsc --noEmit` | PASS | exit 0 |
| Vitest | PASS — 113 files / 480 tests; coverage (src/lib) 66.6% stmts · 69.1% branches · 73.7% funcs · 68.5% lines | matches LOCAL_GATES |
| `next build` | PASS | CI-equivalent placeholder env |
| `vision_core` pytest | 86 pass in 0.37 s | tests do not run real model inference |
| `baseball_tracker` pytest | 91 pass in 12 s | same caveat; package retired 2026-11-08 |
| Accessibility | 7/7 PASS (system Chrome) | public routes only |
| Migration replay | **PASS** — 45/45 applied on a fresh PostgreSQL 16, `migrate status` up to date, 43 public tables | scratch cluster; not Neon; not CI |
| Seed (no admin vars) | PASS — 17 drills, 5 positions, 0 users | idempotency + admin path untested |
| Live app + real DB (dev server) | `/login` 200 · `/api/health` 200 · unauthenticated `/api/submissions` 401 · register athlete 200 → 1 user + 2 consent logs + 1 `ACCOUNT_REGISTERED` audit row · bad payload 400 · duplicate 409 | no browser; login, upload, processing, reports **not** exercised |

**After the 2026-11-08 changes (retirement, health fix, CI jobs, Node pin):** ESLint exit 0 · `tsc` exit 0 · Vitest 114 files / 484 tests pass on Node 26.8.2 **and** Node 22.23.4 · `next build` OK · `vision_core` 86 pass on Python 3.11 with the pinned numpy 1.26.4 / opencv 4.11.0.86 · the CI `database` job's exact commands run locally on PostgreSQL 16: `migrate deploy` + `status` clean, seed ×2 identical (17/5/0) · admin seed opt-in verified. **None of the new CI jobs has run on GitHub Actions yet.**

**First true end-to-end run — 2026-11-08 (Node 22, branch `chore/m1-baseline-and-node22`, throwaway PG16 + `next dev -p 3100` + `npm run worker:once`, local storage, billing enforcement off, dev stand-in on with local `qwen2.5vl:3b`).** Flow actually exercised with real HTTP, DB, ffmpeg and a real vision model: register 200 → duplicate register returns the identical `200 {"ok":true}` → NextAuth credentials login (session shows email/role) → multipart upload of a **synthetic test-pattern clip** `200` → queued → worker (42 s incl. model load) → `COMPLETED` → `/submissions` page renders the labelled dev panel and the "did not clear per-submission protocol checks" notice, metrics show "Research only" → `GET /api/submissions` returns no grade/summary/model name (only the honest `metricVersion: dev-vlm-standin-unvalidated` inside an `UNVERIFIED` performance assessment). DB afterwards: `MetricResult` has `reliabilityScore 0`, no `sprintTime`; `captureAssessment.status = REJECTED`; `performanceAssessment.status = UNVERIFIED`; `analysisEngine = dev-vlm-standin`. The model correctly said the test pattern does not show a sprint (grade null).
Findings from the run: (1) the first attempt **failed closed** because the 3B model answered `confidence` > 1 (percentage scale) — strict parsing rejected it (no clamping); prompt/JSON schema now state the ranges, error message trimmed; the second attempt passed. (2) Retry backoff leaves a failed item `RETRYING` for a while — reset by SQL in the throwaway DB only.
**Still unproven — assume broken until shown:** the *released* (validated) result path end to end (needs real validation evidence; only unit-tested with mocks), a real athlete-style clip through the stand-in, browser rendering (page checked as HTML only, not visually), Stripe lifecycle, email delivery, S3/R2, mobile capture, and all CV accuracy. Teardown done: server stopped, Postgres deleted, `next-env.d.ts` restored.

Observations from the run: (a) duplicate registration returns a distinct 409 "Account already exists." (enumeration signal → S6-09); (b) `/api/health` had no error handling — fixed the same day (S7-13); (c) `baseball_tracker` evidence (→ D13, retired).

---

## 6. Capability status matrix

| Area | Status | Notes |
|---|---|---|
| Registration, login, roles, profile (sport/position/goal) | IMPLEMENTED; registration EXERCISED on real local Postgres (§5.1) | Rate-limited, audited; login/session and profile not exercised; no browser path in CI. |
| Parental consent | IMPLEMENTED | Guardian identity = account/email link only (weak). |
| Drill library + in-app protocols + marker downloads | IMPLEMENTED | Catalog→upload path lacks authenticated-browser evidence. No controlled demo videos. |
| Upload (direct + presigned S3), validation, claims, retention purge | IMPLEMENTED / local synthetic EXERCISED | Real S3/R2 never exercised. |
| Queue, retries, dead-letter, heartbeats, metrics | IMPLEMENTED / local synthetic EXERCISED | No multi-worker load evidence. |
| CV: detection, tracking, ReID, recognition, segmentation, homography, normalization | IMPLEMENTED (fail-closed) | **No real-footage accuracy evidence** (Stage 9). |
| Sprint timing (controlled ArUco path) | EXERCISED technically | Needs timing-gate validation. |
| Pitch velocity | IMPLEMENTED, **blocked** | Needs specialist model + corpus + benchmark (G1). |
| Baseball swing/pitch analysis | IMPLEMENTED (gated proxies) in `vision_core`; pitch speed **blocked** (G1) | `baseball_tracker` retired 2026-11-08 (D13); there is no second analyzer. |
| Reports (definitions, units, method, limits, comparable-delta, CSV export) | IMPLEMENTED | Overlays/playback/sharing missing. |
| Coaching plans (conservative, completion, 28-day reassess prompt) | IMPLEMENTED | No prescriptions/progression/adaptive revision. |
| Benchmarking (cohorts, percentiles, rebuild jobs, anonymized v1 API) | IMPLEMENTED | **No validated cohort**; no fraud/anomaly screening. |
| Feedback/disputes (report, metric-scoped, review types, withdraw, history) | IMPLEMENTED | Evidence upload, granular repetition feedback, trust analytics, dataset promotion missing. |
| Teams (create, invite, accept, roster, remove) | IMPLEMENTED | No club hierarchy, assignments, team dashboards, coach feedback. |
| Sharing (one submission → one existing account, audited) | IMPLEMENTED | No team/coach/recruiter/public/cards. |
| Billing (Checkout, Portal, webhooks, entitlements, past-due UX, usage cap, refund requests, referral) | IMPLEMENTED | **No Stripe lifecycle ever run.** Enforcement flag off. |
| Privacy (export, delete, erasure tombstone, model-training consent, notices) | IMPLEMENTED | Legal review absent. |
| Observability (Prometheus, Alertmanager config, structured logs) | IMPLEMENTED | No real alert destination, no error tracker. |
| Backup/restore | EXERCISED locally | No production DR drill/RTO/RPO. |
| Admin (queue ops, validation panel, overrides, reports, refunds, key moments) | IMPLEMENTED | — |
| Notifications / reminders | IMPLEMENTED (in-app) | No email/push delivery. |

---

## 7. Stage roadmap and todos

Stages overlap; dependencies noted. `[A]` can start now. Every closed item cites evidence.

### S0 — Repo hygiene and doc consolidation  · status: IN PROGRESS
**Exit:** docs agree with code and each other; tree contains no stray artifacts; baseline re-run recorded.

- [x] S0-00 `[A]` Consolidated `SPEC.md` + `CLAUDE.md` created (2026-11-08).
- [ ] S0-01 `[A]` Fix README: remove refs to nonexistent `PHASE0_CHECKLIST.md`/`TEST_PLAN.md`; Node 22; replace "Phase 3: Metrics MVP" list with a pointer to this spec; mention 17 drills and worker.
- [ ] S0-02 `[A]` Mark superseded docs with a header banner: `product_requirements_document.md`, `ASSUMPTIONS.md` (MVP-era), `FEATURE_MAP.md` (already caveated). Do not delete.
- [x] S0-03 Untracked `.playwright-cli/` + `output/` (28 files) with `git rm -r --cached`; `.gitignore` updated; files remain on disk; committed as `070ed86`. Owner approved and confirmed `test-user.json` is dummy data. `opendesign/REPO_AUDIT.md` still cites `output/playwright/*.png` (on disk only).
- [ ] S0-04 `[A]` Correct `BLOCKERS.md` stale claims (§11 "fourteen protocols"/"Basketball has one flow", §3/VIDEOS "nine drills", §12 "no refund workflow", §16 migration/tree counts) — see §11.
- [ ] S0-05 `[A]` Correct `docs/qa/LOCAL_GATES_2026-10-22.md` (says weights are untracked; they are tracked) and `docs/professional-cv-validation-plan.md` object-tracking thresholds (0.90 → 0.95 per code).
- [x] S0-06 Full baseline re-run 2026-11-08 — results and caveats in §5.1 (all green locally; unit-level only).
- [ ] S0-07 `[H]` Configure git committer identity and create the RC tag suggested in LOCAL_GATES (`rc-2026-10-22-verified` at `a901640`).
- [x] S0-08 Superseded: `baseball_tracker` retired 2026-11-08 (D13).

### S1 — Core platform (auth, drills, upload, queue)  · status: IMPLEMENTED; local-synthetic EXERCISED
**Exit:** an authenticated user completes register → upload → processed result in a deployed environment.

- [x] S1-00 Core flows implemented and unit-tested (see §6); local synthetic E2E recorded `docs/qa/E2E_LOCAL_SYNTHETIC_2026-08-24.md`.
- [x] S1-01 Seed verified on PostgreSQL 16 (2026-11-08): two runs give identical counts 17/5/0; with both `SEED_ADMIN_*` set → 1 ADMIN and a re-run stays at 1; only the email set → error, no admin; short password → rejected, no admin. Idempotency is now also enforced by the CI `database` job (S8-03).
- [ ] S1-02 `[E]` Exercise presigned upload against a real S3/R2 bucket incl. CORS/ETag/lifecycle expiry (README documents requirements).
- [ ] S1-03 `[A]` Confirm `TRUST_PROXY_HEADERS` fail-closed behavior is documented in the deploy checklist (root cause recorded in the E2E QA doc).

### S2 — CV pipeline (`vision_core`)  · status: IMPLEMENTED, fail-closed; accuracy EXTERNAL (S9)
**Exit:** every capability passes its threshold on frozen models against held-out real data (Stage 9).

- [x] S2-00 Software paths complete for detection, tracking, ReID, recognition, segmentation, homography, normalization, metrics; benchmark evaluators exist (`vision_core/*_benchmark.py`). `vision_core` pytest 86/86 (LOCAL_GATES).
- [ ] S2-01 `[A]` Reconcile recognition coverage with the 17-drill catalog in `capability-validation` and corpus requirements (VIDEOS.md §C lists 9).
- [ ] S2-02 `[E]` Train/obtain a **specialist baseball detector** with documented data rights, checksum, reproducible inference config (`VISION_BASEBALL_OBJECT_MODEL`). Generic YOLO is not authorized for pitch speed.
- [ ] S2-03 `[E]` Replace YOLO-World baseline with a validation-approved custom detector for the 7 canonical classes (`ball, bat, hoop, goal, plate, cone, target`) if baseline fails per-class gates.
- [ ] S2-04 `[H]` **Blocks any public web launch.** Resolve Ultralytics AGPL-3.0 for SaaS (Q4): buy an Enterprise license, replace the Ultralytics-based models (`yolov8n.pt`, `yolov8n-pose.pt`, `yolov8s-worldv2.pt`; `vision_core/requirements.txt` pins `ultralytics`), or obtain counsel's written position. Also YoutuReID training-data lineage review (`docs/cv-model-provenance.md`). `[E]` Retain the dated legal sign-off in `docs/`.
- [ ] S2-05 `[A]` Containerized, **network-off** analyzer run harness for benchmarks (needed by plan step 6).
- [ ] S2-06 `[A]` Per-clip cost/latency telemetry (CPU-seconds per video) to support S7 unit-economics.
- [ ] S2-07 `[E]` Proxy validation studies (technique/power/consistency) via ≥2 blinded qualified coaches per `VIDEOS.md` §H.

**Baseball integration — retired (D13).** `baseball_tracker` was removed on 2026-11-08, so S2-08..S2-14 are struck. Baseball analysis continues inside `vision_core` (S2-02 specialist model, S9 corpus). Any future idea from the old prototype must be re-implemented there with tests and pass the §4.2 gates.

- ~~S2-08~~ Retired with D13.
- ~~S2-09~~ Retired with D13.
- ~~S2-10~~ Retired with D13.
- ~~S2-11~~ Retired with D13: Ollama coaching text is not shipped; use deterministic, evidence-linked templates (S3-02).
- ~~S2-12~~ Retired with D13.
- ~~S2-13~~ Retired with D13.
- ~~S2-14~~ Retired with D13.

### S3 — Athlete product depth (reports, coaching, progress, feedback, onboarding)  · status: PARTIAL
**Exit:** the 14-step athlete journey is complete in-app on mobile, with no placeholder pages, using only released metrics.

- [ ] S3-01 `[A]` Reviewed key-moment **video overlays + playback/seek** in the report (currently label/note/frame index only). Verify: component test + browser check.
- [ ] S3-02 `[A]` Exercise prescriptions: frequency, volume, progression, reassessment timing per recommendation (evidence-linked; no medical claims; coaching-claim gate retained).
- [ ] S3-03 `[A]` Adaptive plan revision on new compatible assessment; plateau/regression detection; personal records; "recommended next assessment".
- [ ] S3-04 `[A]` Longitudinal view that excludes/flags incompatible protocol/model/camera/age-band changes (library gate exists; surface it in UI).
- [ ] S3-05 `[A]` Benchmark UI: show sample size, percentile methodology, data freshness, confidence, limitations.
- [ ] S3-06 `[A]` Guided onboarding flow wired to `buildOnboardingSteps` (exists in `engagement.ts`; confirm UI).
- [ ] S3-07 `[A]` Feedback depth: granular repetition/action selection; supporting-evidence upload (bounded, scanned, private); trust/satisfaction analytics; reviewed-dataset promotion controls (admin-gated; never auto-ground-truth).
- [ ] S3-08 `[H]` Controlled in-app drill demonstration media (needs produced video assets; replaces removed external links).
- [ ] S3-09 `[A]` Account recovery end-to-end (routes exist; delivery is webhook-only) — pair with Q3 email provider decision.
- [ ] S3-10 `[A]` Notifications: email/push delivery for reassessment, processing-complete, plan prompts (currently in-app only). Depends on Q3.
- [ ] S3-11 `[A]` Mobile-first polish pass (impeccable / frontend-ui-engineering): record flow, upload progress, results. Use `opendesign/DESIGN.md` as input, not authority.
- [ ] S3-12 `[H]` Drill-library expansion to match `ATHLEMETRY.md` (vertical jump, three-point, ball handling, baseball sprint/fielding, bat speed). Each needs protocol + signature + corpus; may be post-GA.
- [ ] S3-13 `[A]` Authenticated browser evidence for: catalog→selected-upload, protocol recording-error guidance, report render/CSV export, completion/adherence tracking.

### S4 — Coach, team, parent, and sharing  · status: PARTIAL (foundation only)
**Exit:** coaches/parents/clubs operate without admin intervention; athlete controls visibility per result.

- [ ] S4-01 `[A]` Coach: assign assessments; review athlete reports (only with granted access); leave feedback; correct contextual info; build/assign plans; export; team permissions.
- [ ] S4-02 `[A]` Team performance dashboard over **valid, compatible** metrics only.
- [ ] S4-03 `[A]` Parent role: link/manage minor accounts, view progress, control retention & sharing, manage billing, request export/delete.
- [ ] S4-04 `[A]` Visibility model: private / coach-visible / team-visible / public / shareable per result; default private. Schema + authz + audit.
- [ ] S4-05 `[A]` Club hierarchy (club → teams) and coach/club plans (couples to S5-05).
- [ ] S4-06 `[A]` Shareable performance cards (no raw video, no PII, framing that avoids superiority/recruiting claims).
- [ ] S4-07 `[H]` Recruiter/public sharing policy decision (legal + safety; minors) before any build.
- [ ] S4-08 `[A]` Team-scale athlete-search/enumeration protection (invitation limits exist; discovery surface does not).

### S5 — Commercial operations  · status: IMPLEMENTED; provider lifecycle EXTERNAL
**Exit:** a Stripe lifecycle passes in a production-like environment and enforcement is on.

- [x] S5-00 Checkout, Portal, signed webhooks (idempotent), entitlements, past-due recovery, usage cap, referral attribution, refund-request workflow + admin page (code + tests).
- [ ] S5-01 `[E]` Stripe **test-mode** lifecycle: checkout → webhook → upgrade/downgrade → cancel → failure/recovery → refund → entitlement revocation. Then (and only then) `BILLING_ENFORCEMENT_ENABLED=true`.
- [ ] S5-02 `[H]` Pricing/plan policy: trial config, monthly vs annual, founding offer, usage limits, plan comparison/upgrade UX.
- [ ] S5-03 `[A]` Plan-comparison and upgrade-path UI.
- [ ] S5-04 `[A]` Conversion/retention analytics beyond current trial/convert/cancel counters (cohort retention; no PII).
- [ ] S5-05 `[H]` Coach/club pricing and entitlement rules.
- [ ] S5-06 `[E]` Tax/billing-record process (Stripe Tax or equivalent), support procedure, refund policy text.
- [ ] S5-07 `[A]` Referral abuse prevention and reward rules (attribution only today).
- [ ] S5-08 `[E]` Provider-cost evidence (per-video compute + storage) to validate margin at $20–30.

### S6 — Privacy, safety, trust  · status: IMPLEMENTED (controls); legal/prod EXTERNAL
**Exit:** legal + production privacy/security reviews pass; moderation and guardian protections operate.

- [x] S6-00 Rate limits (distributed, HMAC-pseudonymized), consent ledger, export/delete + erasure tombstones, model-training consent default-deny, retention purge, audited sensitive actions (many), abuse runbook `docs/abuse-response.md`.
- [ ] S6-01 `[A]` Comprehensive sensitive-action audit coverage (inventory every mutating route; test each writes minimal audit + fails closed). Produce the inventory table first.
- [ ] S6-02 `[H]` Guardian identity verification method beyond email linkage (legal-driven: COPPA verifiable parental consent).
- [ ] S6-03 `[A]` Content moderation for user-supplied text (extend current contact/link rejection) and abuse-reporting UX/admin controls; account suspension capability (runbook notes it's absent).
- [ ] S6-04 `[E]` Legal review/sign-off: Privacy Notice, Terms, COPPA/GDPR, youth-data processing, consent templates in `docs/consent/`.
- [ ] S6-05 `[E]` Production encryption/KMS verification, provider TLS/retention/region settings, credential rotation, least-privilege IAM.
- [ ] S6-06 `[A]` Disposable-Postgres tests proving transaction rollback on audit failure for the audited routes (currently mock-only).
- [ ] S6-07 `[E]` Operator training and an exercised incident drill.
- [ ] S6-08 `[A]` Support contact: add a `SUPPORT_EMAIL` env var (owner provides value; **never committed**) and surface it in the footer, Privacy Notice/Terms (`src/lib/product-notices.ts`), abuse-response runbook, and error pages. No contact address exists in `src/` today. Owner should consider a dedicated alias before public launch (a personal inbox is published to minors' parents).
- [x] S6-09 Registration enumeration fixed 2026-11-08: new and duplicate emails now both return `200 {ok:true}` (no echoed user), duplicate does the same bcrypt work, referral validation runs before the existence lookup, malformed JSON → 400. Evidence: `tests/auth-register.test.ts` "account enumeration" ×4 (+1 updated); 5 failed on the old code, full suite 114 files / 488 pass. **Residual:** a soft-deleted email falls through to create and ends in `503` (P2002); full protection needs email verification (Q3). Form copy updated.

### S7 — Infrastructure and operations  · status: IMPLEMENTED (configs); deployment EXTERNAL
**Exit:** reproducible deployment with monitoring, rollback, DR, and a capacity result for 20–30k athletes.

- [x] S7-00 Topology confirmed by owner 2026-11-08 (D12): Vercel + Neon + R2/S3 + separately hosted worker, free tiers for now. Region and secrets store still to pick (S7-10).
- [ ] S7-01 `[A]` Infrastructure-as-code for the chosen target (after S7-00).
- [ ] S7-02 `[E]` Staging deployment following `docs/operations.md` checklist; canary video through worker; `/api/health` gate.
- [ ] S7-03 `[E]` Real alert destination + canary fire/resolve; Alertmanager HA peers; run `promtool`/`amtool` at deployed versions.
- [ ] S7-04 `[A]` External error tracking (e.g., Sentry) with PII scrubbing; define log retention.
- [ ] S7-05 `[A]` Cost and per-video monitoring dashboards.
- [ ] S7-06 `[E]` Horizontal-scaling proof; load/soak test at target concurrency; derive queue-age SLO from measured capacity (runbook forbids inventing one).
- [ ] S7-07 `[E]` Production DR drill with stated RTO/RPO; object-storage replication and versioned-erasure staging exercise.
- [ ] S7-08 `[E]` Rollback exercise; tested rollback migrations (policy today: additive-only).
- [x] S7-09 All **45** migrations replayed on a fresh disposable PostgreSQL 16: `migrate deploy` clean, `migrate status` up to date, 43 public tables (2026-11-08, §5.1). Still to do: the same in CI (S8-03) and against a Neon branch before staging.
- [ ] S7-10 `[A]` Vercel web config: env var matrix per environment, confirm `output: "standalone"` is harmless on Vercel, ensure uploads use presigned direct-to-bucket (no large bodies through functions), set `NEXTAUTH_URL`, `TRUST_PROXY_HEADERS` only after verifying Vercel's forwarding behavior, run `prisma migrate deploy` as a release step. Add `vercel.json` only if needed (none exists).
- [ ] S7-11 `[A]` Worker hosting: pick container host, mount/download pinned model artifacts with `*_SHA256`, stable `WORKER_ID`, secrets, restart policy that does **not** crash-loop on exit `78`, autoscale on queue depth (`/api/metrics`).
- [ ] S7-12 `[A]` Bucket setup: CORS (PUT + expose `ETag`), lifecycle expiry for abandoned presigned objects, `S3_OBJECT_VERSIONING_ENABLED` set truthfully, least-privilege IAM.
- [x] S7-13 `/api/health` now fails closed: DB probe wrapped, controlled `503 {"status":"unavailable"}` with `cache-control: no-store`, no driver detail in the response or logs. `tests/health-route.test.ts` (4 tests, written first and seen failing for the right reason). Dockerfile HEALTHCHECK is unaffected (it only checks for a non-OK status).

### S8 — QA and security  · status: PARTIAL
**Exit:** all suites run in CI or a documented release process and pass declared thresholds.

- [~] S8-01 CI job `cv-python` added: Python 3.11, numpy 1.26.4 + opencv-contrib-python-headless 4.11.0.86 extracted from `vision_core/requirements.txt`, pytest. Verified locally: 86 pass on those exact versions. **Not yet run on GitHub Actions.** Gap: no torch/ultralytics, so no real model inference is tested (S8-08).
- [~] S8-02 `npx tsc --noEmit` step added to `verify`; passes locally on Node 26 and 22. Pending the first green GitHub run.
- [~] S8-03 CI job `database` added (postgres:16 service; `migrate deploy`, `migrate status`, seed twice with an identical-count check). Its exact commands were executed locally against a throwaway PostgreSQL 16: pass. **Not yet run on GitHub Actions.** DB-backed integration tests (claim query, usage-upsert concurrency, audit rollback) are still to write.
- [ ] S8-04 `[A]` Authenticated Playwright E2E for the main journeys (athlete, parent consent, coach team flow, admin validation, billing in Stripe test mode).
- [ ] S8-05 `[A]` Extend axe coverage to authenticated pages, forms, media/keyboard interaction; `[E]` assistive-tech manual review.
- [ ] S8-06 `[E]` Real mobile-browser testing (iOS Safari, Android Chrome) incl. in-browser camera recorder.
- [ ] S8-07 `[A]` Load/concurrency suite (k6 or similar) for upload, queue claim, webhook bursts.
- [ ] S8-08 `[E]` Real-footage CV regression corpus + device/body/age/uniform/lighting/angle matrix (consumes S9 data).
- [ ] S8-09 `[A]` Dependency/SAST scan in CI (`npm audit`, secret scan).
- [ ] S8-10 `[E]` Independent security assessment / penetration test.
- [ ] S8-11 `[A]` Run `/security-review` on the branch before each release candidate.
- [x] S8-12 Node aligned on **22** everywhere (D15): `.nvmrc`, `engines.node >=22`, CI `setup-node 22`, `Dockerfile` base `node:22-bookworm-slim`, README. Evidence: `docker build --target web` succeeded and the image reports `v22.23.4`; suite passes on Node 22 and 26. **Not yet run:** the `worker` image build on Node 22 (CI does it).

### S9 — Validation corpus and evidence  · status: EXTERNAL — **critical path**
**Exit:** each capability, each metric, and the benchmark/longitudinal system clears its gate on frozen configurations, independently reviewed, with immutable HTTPS evidence.

Detail: `VIDEOS.md` (what to record), `docs/CAPTURE_KIT_2026-08-25.md` (shot lists), `docs/LABELING_PLAN.md` (folders → manifest), `docs/professional-cv-validation-plan.md` (execution), `docs/schemas/capability-validation-v1.example.json`.

- [ ] S9-01 `[H]` Appoint study owner; schedule sessions; acquire equipment (timing gates, tripods, radar or two-phone 240 fps optical rig, steel tapes, printed ArUco markers).
- [ ] S9-02 `[E]` Legal: finalize athlete/guardian release pack (`docs/consent/`); no clip without a signed release (manifest validator enforces).
- [ ] S9-03 `[E]` Pilot: 2–3 athletes × 10 pitches; run pipeline + annotation workflow (VIDEOS.md sequence step 1–2).
- [ ] S9-04 `[E]` Baseball pitch corpus: ~50 pitchers, 500–750 pitches, ≥10–15 held-out pitchers, ≥100 radar/optical-truth pitches, ≥500 held-out ball observations.
- [ ] S9-05 `[E]` Per-drill corpus for **all 17 drills**: 20–30 valid + 10–15 genuinely invalid each; ≥300 attempts per capability; athlete-disjoint splits; held-out frozen **before** tuning.
- [ ] S9-06 `[E]` Object classes: ≥500 held-out annotated frames **per class** × 7 classes.
- [ ] S9-07 `[E]` ReID: ≥50 athletes, ≥500 held-out observations, multi-day appearances, occlusion/re-entry.
- [ ] S9-08 `[E]` Calibration ≥100 surveyed captures; normalization ≥100 clips from ≥5 phone models.
- [ ] S9-09 `[E]` Independent annotation (≥2 reviewers), adjudication, `validate_validation_manifest` pass, SHA-256 for every file, media stored outside git.
- [ ] S9-10 `[E]` Freeze models + analyzer; run benchmarks network-off; produce capability + per-metric error reports; independent review; submit via admin panel; **different** admin approves.
- [ ] S9-11 `[E]` Longitudinal study: ≥3 compatible sessions/athlete; prove exclusion on model/protocol change and benchmark rebuild/invalidation.
- [ ] S9-12 `[E]` Confidence-calibration study (measured calibration error) and repeatability/agreement stats per metric.
- [ ] S9-13 `[E]` Capture-adherence assessor accuracy per drill (verified/rejected/unverified).

### S10 — Launch readiness and GA  · status: NOT STARTED
**Exit:** all `EXTERNAL` gates closed or consciously descoped by a human; launch checklist signed.

- [ ] S10-01 `[H]` Define launch scope: which metrics ship validated vs. "experimental/unavailable". A staged launch that ships only validated drills is acceptable and honest.
- [ ] S10-02 `[A]` Release-candidate procedure: clean tree → build/test from that exact commit → tag → deploy (`shipping-and-launch` skill).
- [ ] S10-03 `[E]` Staged rollout + rollback plan; support channel; status page.
- ~~S10-04~~ Descoped 2026-11-08: web-only for now (D9). Revive if a native wrapper is requested.
- [ ] S10-05 `[A]` Final evidence matrix: per requirement → files, flows, tests, validation results, deployment status, limitations, external dependencies.

### S11 — Phase 6: dev stand-in analyzer, then coach-first launch (all three sports)  · status: IN PROGRESS (S11-A done except browser/coach views; S11-B/C not started)
Source: `~/Downloads/PHASE_6.md` v1.0 (owner's file, **not** in the repo; the rules below are summarised so SPEC stays self-contained; its `docs/phase6/*` deliverables are listed in S11-40). Phase 6 is *proposed, not complete*; it narrows the product to a **coach-first, soccer-first testing system** (P0 `sprint-20m`, `agility-5-10-5`; P1 `cone-dribble`), sells to **organisations**, and says Athlemetry earns expansion through validated measurements, repeat coach use and real payments. Its own rules bind us: baseline-audit before touching billing/schema/gates; never weaken thresholds; no synthetic data as evidence; human tasks (consent, clubs, captures, timing gates, payments, independent review) are **external blockers**, never claimed as done by an agent.

**Owner target state (D16):** everything is built and exercised except plugging in the pre-trained CV model. Until then a **dev-only stand-in analyzer** drives the whole flow.

**S11-A Dev stand-in analyzer (VL model).** Purpose: exercise upload → queue → analysis → result → report → coach views end to end. *It is plumbing, not measurement.*
Hard rules (decision D16): enabled only by an explicit env flag and refused when `NODE_ENV=production`; every output is `EXPERIMENTAL` with provenance `dev-vlm-standin`; must **never** satisfy a capability/metric validation, enter customer-visible metrics, benchmarks, rankings or coaching-plan release; no gate or threshold changes; frames are sent only to a local model unless the owner approves an outside provider (athlete footage is sensitive); no real athlete footage in fixtures.
- [x] S11-01 Design (from reading the code, 2026-11-08): the single seam is `runVisionAnalysis` called once at `src/lib/processing/queue.ts`; the contract is `VisionAnalysisResult`. Customer views already whitelist metadata (`CUSTOMER_METADATA_FIELDS`), so analyzer output reaches athletes only through `MetricResult` + the release gates. Stand-in design: report **zero CV evidence**, reliability `unavailable` ⇒ `mapVisionAnalysisToMetrics` yields only `motionTrackingScore`/`reliabilityScore` (0), capture adherence never verifies, model version `dev-vlm-standin-unvalidated`, `metricReleased` forced false, grade kept only in `metadata.devStandIn`, shown only in a labelled dev panel when the flag is on. (Original task: Read `src/lib/vision-analysis.ts`, `src/lib/processing/queue.ts`, `src/lib/customer-metrics.ts`, `src/lib/capability-validation.ts`; write the integration design (analyzer interface = the `vision_core` evidence schema) into §3/§9 before coding.
- [x] S11-02 `src/lib/analysis-engine.ts` (`runAnalysisEngine`); queue uses it. Real analyzer is the default; stand-in failure never falls back to real. `tests/analysis-engine.test.ts` ×4. (Pluggable analyzer interface with two implementations: `vision_core` (real, default) and `dev-vlm-standin`. Selection by env; fails closed to the real analyzer when unset.
- [x] S11-03 Implemented and **run against a real local model** (`qwen2.5vl:3b`, 3.2 GB, pulled 2026-11-08; see §5.1). Implemented in `src/lib/dev-standin.ts` (ffprobe/ffmpeg sampling, Ollama `/api/chat` with a JSON schema, strict Zod parse, loopback-only, no `:cloud` models). Unit-tested with injected deps; **not yet run against a real vision model** — none installed locally (see S11-07). (Stand-in implementation: ffmpeg frame sampling → local vision-capable model (Ollama; pick an installed model that actually supports images — verify, don't assume) → structured JSON with a strict Zod schema → mapped to the evidence schema with `EXPERIMENTAL` and a `not validated` reason.
- [x] S11-04 `tests/dev-standin.test.ts` ×41, `tests/dev-standin-queue.test.ts` ×5 (hostile: `isPrimaryMetricReleased` mocked true, still never released/coached), `tests/dev-standin-customer-view.test.ts` ×1; written before the code. Full suite 118 files / 539 pass. (Adversarial tests first: production refusal; flag off ⇒ real path; malformed/hallucinated model output ⇒ `REJECTED`/`UNAVAILABLE`; stand-in output can never reach `customer-metrics` release, benchmarks or coaching plans (assert each gate still closes).
- [x] S11-05 Done 2026-11-08 — run recorded in §5.1 (register → login → upload synthetic clip → worker → labelled result page; fail-closed retry observed). Not a browser run and not a released-metric run.
- [~] S11-06 `DevStandInPanel` on `/submissions`, shown only when the flag is on outside production; verified in the rendered HTML and the customer API (§5.1). Not yet seen in a browser; coach/export views don't exist yet (S11-17/19). (UI honesty: every stand-in result is labelled experimental/not validated in the athlete, coach and export views.
- [~] S11-07 `[H]` Local model chosen provisionally: `qwen2.5vl:3b` (the installed Ollama models are text-only; `*-cloud` models are refused by design). Outside providers remain off (Q13).

**S11-B Phase 6 engineering (6A, 6D, 6E mapped).** Do 6A first.
- [ ] S11-10 `[A]` (6A) Baseline audit: implemented vs exercised vs blocked matrix at a named commit → `docs/phase6/baseline-audit.md`. SPEC §5.1/§6 are the seed.
- [ ] S11-11 `[A]` (6A) `docs/phase6/decisions.md`: record deferred work. **Revised 2026-11-08 (D17):** basketball/baseball are *not* frozen — launch scope is soccer, basketball and baseball. Keep: 17-drill catalog not a launch prerequisite (each drill ships only if its own gates pass); no 10 m sprint or vertical jump (not interchangeable with `sprint-20m`).
- [ ] S11-12 `[A]` (3.4) **Per-drill/metric release decision trace.** Owner removed the soccer-only premise (D17), so the original motivation (an unrelated-sport capability blocking a soccer launch) is not assumed. Re-evaluate against the current global `evaluateCapabilityRelease` first: does it block *any* launching drill for reasons unrelated to that drill? If yes, propose a dependency-scoped evaluation that keeps every genuinely required capability and all thresholds, with a decision trace (required / validated / why others not required); if no, add only the decision trace/reporting. Gate-adjacent ⇒ **ask first**, tests before code. Invariant unchanged: `customer_metric_visible = legal_permission ∧ protocol_supported ∧ complete_capture_evidence ∧ exact_model_version_validated ∧ all_required_capabilities_validated ∧ metric_gate_passed`.
- [ ] S11-13 `[A]` (6D) Provenance categories `VALIDATED / REFERENCE_MEASURED / EXPERIMENTAL / REJECTED / UNAVAILABLE` with `measurementSource` (`AUTO_VALIDATED`, `REFERENCE_MANUAL`, `EXPERIMENTAL`, `UNAVAILABLE`) through API, UI and export; a manual reference can never be relabelled automated; experimental output never enters percentiles, rankings or verified-only trends.
- [ ] S11-14 `[A]` (6D) Tenant strategy decision from the current `Team`/billing models (reuse `Team`; add `Organization` only if multi-team billing needs it; never bill a user *and* their organisation for the same seats). **Schema/migration ⇒ ask first**, §4.4 update, additive and reversible, tested on a scrubbed DB. `[H]`
- [ ] S11-15 `[A]` (6D) Assessment session / enrolment / attempt model + routes (`/api/assessment-sessions/**`), consent enforced per athlete, idempotent attempt upload, immutable audit events. Follows S11-14.
- [ ] S11-16 `[A]` (6D) Capture preflight + guided setup (distances, markings, camera angle, min fps, stability); reports `UNAVAILABLE` with a corrective suggestion instead of a plausible number.
- [ ] S11-17 `[A]` (6D) Coach review / comment / correction / dispute with history; reference-measurement entry (`ReferenceMeasurement`) labelled manual.
- [ ] S11-18 `[A]` (6D) Compatible-history comparison only (same drill, distance, protocol version) with an uncertainty warning; benchmarks suppressed unless adequately supported.
- [ ] S11-19 `[A]` (6D) CSV (RFC-4180, formula-injection safe) and PDF exports that carry provenance on every metric and include rejected/unavailable rows.
- [ ] S11-20 `[A]` (6D/5.1) Organisation-scoped checkout and authoritative seat enforcement; keep `coach-monthly` (25) and `club-monthly` (100) keys; Stripe test-mode lifecycle (S5-01) first. Billing enforcement flag stays off until then.
- [ ] S11-21 `[A]` (6E) RBAC audit across multi-team, coach transfer, revoked invites, expired links; two-club isolation test; guardian-revocation hides results/media/exports.
- [ ] S11-22 `[A]` (§8) Server-side, privacy-minimised funnel events (definitions in PHASE_6 §8) incl. cost per **accepted** assessment; never log raw media, embeddings or guardian identifiers.
- [ ] S11-23 `[A]` (6E) Runbooks: worker outage, corrupted upload, billing discrepancy, data incident; staged E2E for coach/athlete/parent/owner/admin (links S8-04).

**S11-C Evidence, commercial and legal (all `[E]`/`[H]`; agent may prepare materials only).**
- [ ] S11-30 `[E]` (6C) Real study: athlete-disjoint, permission-cleared captures, dual-beam timing-gate reference, ≥100 held-out attempts per metric *as defined in code on the day* (code today: see §8), all rejects in the denominator, two distinct reviewers + a separate release approver, frozen model/protocol/hashes. Surfaces as S9 evidence; **no agent may produce it.**
- [ ] S11-31 `[A]` (6C) Prepare study-registration, reference-equipment, capture-protocol and consent/release templates (drafts for human/legal review).
- [ ] S11-32 `[E]` (6B) 15 structured buyer interviews, 30-club list, $49 one-time 30-day paid pilot offered to 5 organisations, 3 real payments, 2 renewals at ≈$99/month. Dated competitor table (HomeCourt, Onform, Sportsbox AI, My Jump Lab, Dashr) — verify current prices before any public use.
- [ ] S11-33 `[E]` (6E) Legal/privacy review for minors (COPPA assessment, biometric/embedding question, controller/processor roles, auto-renewal disclosures). **Deferred by the owner to the public-launch phase (D16)**, but it is a hard precondition for collecting minors' video or taking recurring payments.
- [ ] S11-34 `[E]` (6F) ≥2 independent coach-run repeat sessions; 3 permissioned case reports; observed revenue/cost/support hours.
- [ ] S11-40 `[A]` Maintain `docs/phase6/` deliverables as work lands: `baseline-audit.md`, `decisions.md`, `study-registration.md`, `reference-equipment.md`, `capture-protocol.md`, `validation-report.md`, `error-analysis.md`, `release-gate-report.json`, `deployment-readiness.md`, `pilot-offer.md`, `field-operations.md`, `buyer-interviews.csv`, `competitive-landscape.md`, `pilot-unit-economics.csv`, `commercial-scorecard.md`, `verdict.md` (template: `PHASE_6_STATUS`, `GO_TO_MARKET_VERDICT`, …). Nothing is ticked without linked evidence.

**Exit (from PHASE_6 §0.3, unchanged):** ≥3 independent paid pilots; ≥2 renewals at the standard offer; ≥2 metrics passing the exact code-defined gates; ≥2 coaches complete a second session unaided; coach workflow roster → assignment → capture → review → report → invoice works in the deployed environment; legal/consent controls done before minors' data; actual unit economics reported. **If commercial gates pass before scientific ones, run research/supervised pilots only — do not sell unverified CV metrics as accurate.**

---

## 8. Evidence-gate register (from `BLOCKERS.md`; thresholds verified against `src/lib/capability-validation.ts`)

| Gate | Capability | Status | Close when (summary) |
|---|---|---|---|
| G1 | Pro baseball pitch tracking | EXTERNAL | specialist model + legal corpus + held-out ≥500 obs; P≥95%, R≥95%, per-phase R≥95%, HOTA≥0.75; 100 synchronized speed refs, P90 err ≤0.67 m/s |
| G2 | Object tracking, 7 classes | EXTERNAL | per class: ≥500 obs, P≥95%, R≥95%, HOTA≥0.75 |
| G3 | Sport/drill recognition | EXTERNAL | ≥300 clips, acc ≥95%, false-confirm ≤1% |
| G4 | Athlete ReID | EXTERNAL | ≥500 obs, ≥50 athletes, IDF1 ≥90%, switch ≤1%, occlusion recovery ≥90%; training-data lineage legally approved |
| G5 | Repetition + invalid-attempt | EXTERNAL | ≥300 attempts; P/R ≥90%; invalid: ≥100 invalid, sens/spec ≥90% |
| G6 | Homography + normalization | EXTERNAL | ≥100 captures P90 ≤0.05 m, fail ≤5%; ≥100 clips, ≥5 devices, decode fail ≤1% |
| G7 | Basketball/baseball physical metrics | EXTERNAL | held-out ground truth per exact drill/plane/model/protocol |
| G8 | Technique/power/agility proxies | EXTERNAL | separate expert-reviewed held-out study; remain non-scientific proxies until then |
| G9 | Capture-protocol evidence | EXTERNAL | adherence classification accuracy per drill on real captures |
| G10 | Longitudinal + benchmarking | EXTERNAL | ≥3 sessions/athlete; version-exclusion + rebuild proven |
| G11 | Product depth / multi-user | BUILD + EVIDENCE | Stages S3–S4 complete, browser/mobile exercised |
| G12 | Commercial ops | BUILD + EXTERNAL | Stage S5 |
| G13 | Privacy/safety/trust | BUILD + EXTERNAL | Stage S6 |
| G14 | Infra/ops | EXTERNAL | Stage S7 |
| G15 | QA/security | BUILD + EXTERNAL | Stage S8 |
| G16 | DB / release-candidate | BUILD + EXTERNAL | S7-09 + S10-02 |

Per-metric rule: ≥100 permission-cleared examples and the metric's P90 limit in `drill-protocols.ts`.

---

## 9. Decision log (append-only)

| # | Date | Decision | Why |
|---|---|---|---|
| D1 | 2026-02 | Next.js + Prisma/Postgres (Neon) + NextAuth credentials/JWT | Free-tier-friendly, single codebase |
| D2 | 2026-07 | Fail-closed customer release chain bound to model+protocol identity | Prevents unvalidated metrics reaching athletes/benchmarks |
| D3 | 2026-07 | Production CV = `vision_core` via subprocess; standalone worker with atomic claims | Independent horizontal scaling |
| D4 | 2026-07 | Migrations additive-only | No tested rollback migrations |
| D5 | 2026-07 | Videos are temporary (default 24 h); metrics durable | Privacy + cost |
| D6 | 2026-11-08 | `SPEC.md` is the single source of truth; older docs demoted to detail references | Resume-ability; ended doc drift |
| D7 | 2026-11-08 | Agent work splits into `[A]` (do) vs `[E]/[H]` (surface, never fake) | Prevents fabricated evidence |
| D8 | 2026-11-08 | **Superseded by D13.** `baseball_tracker` was to be integrated into production baseball analysis (ported into `vision_core`, audit first). Its outputs go through the same fail-closed gate chain; Ollama text is not shipped unless S2-11 says so | Owner direction: the product covers basketball, soccer **and** baseball |
| D9 | 2026-11-08 | Web-only for now; native wrapper/App Store work descoped (S10-04) | Owner priority: get on the web |
| D10 | 2026-11-08 | Support contact = an owner-provided Gmail address, configured via `SUPPORT_EMAIL` env var and **not committed**. A transactional sending provider is still needed (Q3) | Avoid publishing a personal address in git history; contact ≠ delivery service |
| D11 | 2026-11-08 | Milestone M1 = web staging → invite-only private beta; billing enforcement stays off; public access gated on S2-04, S6-04, Q3, S6-08 | Honest sequencing given closed validation gates |
| D12 | 2026-11-08 | Topology confirmed by owner: Vercel (web) + Neon + Cloudflare R2/S3 + separately hosted worker; **free tiers for now**. Vercel Hobby is personal/non-commercial per Vercel's docs → acceptable for an unpaid invite-only beta; upgrade before charging. Neon/R2 quotas unverified (S7-10). Worker hosting open (S7-11) | Owner constraint: stay free; Vercel cannot run the Python worker |
| D13 | 2026-11-08 | **CONFIRMED by owner: `baseball_tracker/` retired.** Evidence: its only real-footage runs (`test-media/analysis-runs/`, a 1918 newsreel) had a failed module in 3 of 4 runs and the best run found 0 ball points; it clamped an implausible swing-speed estimate (log: 146.1 mph → exported `peak_speed_mph: 120.0`, band 96–144 around the clamped value, raw value not exported), violating principle 1; swing speed was a wrist-displacement proxy on anthropometric scale; its 91 passing tests were unit-level; it overlapped `vision_core` and added mediapipe/ollama/fastapi plus another AGPL Ultralytics consumer. Caveat: the clip was a 1918 newsreel, so this was not a fair accuracy test — judged under the owner's "assume the worst". **Executed:** `git rm -r baseball_tracker` (29 tracked files, incl. a `yolov8n.pt` byte-identical to the root copy); `.env.example`, README, `.dockerignore`, `.gitignore` repointed to repo-root `./.venv` and `./yolov8n.pt`. Historical run artifacts stay in `test-media/analysis-runs/` as the evidence record; `docs/qa/LOCAL_GATES_2026-10-22.md` still mentions it as a past record. Baseball continues in `vision_core`; salvage nothing without a re-implementation and tests | Owner: "retire" |
| D14 | 2026-11-08 | Work order: development hardening first (CI, database, health, tests); worker hosting for the beta is discussed afterwards (S7-11, Q5) | Owner direction |
| D15 | 2026-11-08 | Node 22 is the single supported runtime (`.nvmrc`, `engines`, CI, Docker). Dockerfile moved from 26 to 22 | Owner: "resolve the node version mismatch"; 22 is the LTS CI already used and the suite passes on it |
| D16 | 2026-11-08 | Licence/legal work (S2-04 Ultralytics AGPL, S6-04 legal notices) is deferred to the public-launch phase. Target state before that: only the pre-trained CV model is left to plug in; a **dev-only VL stand-in** exercises the whole app meanwhile and can never produce validated/released metrics | Owner direction |
| D17 | 2026-11-08 | Launch scope is **soccer, basketball and baseball**; PHASE_6's soccer-first narrowing and its basketball/baseball freeze are not adopted. Its other rules (provenance, fail-closed gates, no synthetic evidence, human tasks are external blockers) still apply. S11-12 reframed | Owner: "Soccer only release decision is not true anymore" |

---

## 10. Open questions (need a human)

**Open**

- **Q3** Which transactional email provider sends password-reset, reminders, invitations (e.g., Resend/Postmark/SES)? Support *contact* is settled (D10); *sending* is not. Needed before public access; password reset is webhook-only today.
- **Q4** Ultralytics AGPL-3.0 route — **owner said "no clue"; explained here.** YOLOv8/YOLO-World (our `yolov8n`, `yolov8n-pose`, `yolov8s-worldv2` weights and the `ultralytics` package) are AGPL-3.0. Ultralytics' own licensing page states that SaaS/API deployment triggers the obligation to publish the whole derivative work's source unless an Enterprise License is purchased (vendor position, not legal advice; prices unpublished). Running it behind a public web service is exactly that case, so this blocks public launch. Options: (a) buy Enterprise license, (b) open-source the networked app under AGPL, (c) replace with permissively licensed detector/pose models (needs a new benchmark and validation), (d) get counsel's written view. Recommend (a) or (c), decided with counsel. Private, invite-only staging is a lower-risk interim but still involves use; confirm with counsel.
- **Q5** Free worker hosting (S7-11): run it on the owner's Mac for the invite-only beta, or find a free always-on container host that fits torch + YOLO (not yet researched). CPU-only assumed. **Deferred by the owner until after the current development phase.**
- **Q6** Launch scope: ship only validated drills at first? Should the private beta double as a consented corpus-collection channel (releases + model-training consent + retention carve-out)? (S10-01, S9)
- **Q10** Dedicated support alias (e.g., on the product's domain) instead of a personal inbox before public launch? What domain will the site use?
- ~~**Q12**~~ Resolved 2026-11-08: Node 22 everywhere (D15).
- **Q13** Dev stand-in analyzer: provisional answer `qwen2.5vl:3b` local (works, but small — expect hallucinated or mis-scaled output; the strict parser rejects it). Is any outside provider (e.g. Anthropic API, no key set today) acceptable for *synthetic* test clips only? Default proposed: local Ollama model, synthetic clips, no outside calls.
- ~~**Q14**~~ Resolved 2026-11-08 by the owner: the soccer-only release premise is no longer true; launch scope is all three sports (D17).

**Resolved**

- ~~Q1~~ Native wrapper → no; web-only for now (D9).
- ~~Topology~~ Vercel + Neon + R2/S3 + separate worker, free tiers (D12).
- ~~Q2~~ `baseball_tracker` → was to be integrated (D8); retired instead (D13). Q9 (Ollama text) and Q11 (retire?) closed with it.
- ~~Q7~~ Real recording sessions → none have happened; no corpus exists. S9-03 pilot is still the first real step.
- ~~Q8~~ `output/playwright/test-user.json` → dummy data; S0-03 only needs untrack approval.

---

## 11. Drift register (docs vs. code — resolved facts)

| Item | Docs say | Code/evidence says | Authority |
|---|---|---|---|
| Drill count | BLOCKERS §11: "fourteen"; §3 & VIDEOS §C: "nine" | **17** protocols and 17 recognition signatures | code |
| Basketball flows | BLOCKERS §11: "one form-capture flow" | 4 basketball protocols + 3 workflow test files | code |
| Object-tracking thresholds | validation plan: P/R ≥ 0.90 | `capability-validation.ts`: ≥ 0.95 | code |
| Password reset | BLOCKERS §11: "delivery remains absent" | request/confirm routes + webhook delivery exist; no email provider | code |
| Refund workflow | BLOCKERS §12: "no refund workflow" | `RefundRequest` model, API route, admin page, migration | code (verify at runtime) |
| Migrations | BLOCKERS §16: 42 | **45** (3 added 2026-08-01) | repo |
| Working tree | BLOCKERS §16: 417 entries dirty | clean at `a53219d` | git |
| `.pt` weights | LOCAL_GATES 2026-10-22: untracked, ignored | **tracked**; `.gitignore` says tracked by design | git |
| Backend admin seed | ASSUMPTIONS #12: seeded default admin | opt-in only, no default credential | seed.ts/AGENTS.md |
| README | refs `PHASE0_CHECKLIST.md`, `TEST_PLAN.md`; Node 20+ | files absent; CI uses Node 22 | repo |
| `FEATURE_MAP.md` | "DONE" | historical mapping only | its own banner |
| PRD | soccer-only "Athlemitry" | superseded by `ATHLEMETRY.md` | ATHLEMETRY.md |
| `VERIFICATION_REPORT.md` counts | 50 pytest / 245 vitest | 86 / 480 (later) | LOCAL_GATES |

---

## 12. Session log (append-only; newest last; ≤5 lines each)

- **2026-11-08** — Consolidated `SPEC.md` and `CLAUDE.md` created from full repo review (`a53219d`). Found/recorded drift (§11). No code changed; baseline not re-run (no `node_modules`). Next: S0-01..S0-06.
- **2026-11-08 (later)** — Owner answers applied: web-only (D9), `baseball_tracker` → production (D8), no real recordings yet, test user is dummy, support contact via env (D10). Researched Ultralytics AGPL for SaaS → Q4/S2-04 now blocks public launch. Added §0.5 (M1), S2-08..S2-14, S6-08, S7-10..S7-12; descoped S10-04. Docs only; no code changed. Next: S0-06, S7-00 (needs owner), S8-01..S8-03.
- **2026-11-08 (evening)** — Owner: topology confirmed, free tier, "assume the worst", untrack approved. Untracked 28 files (staged, uncommitted) + `.gitignore`. Ran the full baseline (§5.1: all green, unit-level only), replayed 45 migrations on a throwaway PG16 (S7-09), seeded, and registered a user against a live dev server on that DB. Reviewed `baseball_tracker` run artifacts → D13 (retire, awaiting confirmation). New: S6-09, S7-13, S8-12, Q11. Next: owner decisions D13/S0-03 commit/S7-11, then S8-01..S8-03.
- **2026-11-08 (night)** — Owner: retire `baseball_tracker`, commit the untrack, develop first, worker later. Committed `070ed86` (untrack). Retired `baseball_tracker` (D13, uncommitted). Fixed `/api/health` test-first (S7-13). Added CI jobs `cv-python` + `database` and a `tsc` step, `.nvmrc` + `engines` (S8-01..03, S8-12) — all verified locally only. Proved seed idempotency and the admin-seed opt-in path (S1-01). Suite: 114 files / 484 tests on Node 22 and 26. **Uncommitted:** `.dockerignore`, `.env.example`, `.github/workflows/ci.yml`, `.gitignore`, `.nvmrc`, `README.md`, `package.json`, `src/app/api/health/route.ts`, `tests/health-route.test.ts`, deletion of `baseball_tracker/`, `SPEC.md`, `CLAUDE.md`. Next: owner go-ahead to commit, confirm CI on GitHub, then S8-04.
- **2026-11-08 (late)** — Owner: commit+push, fix Node and signup message, defer licence, aim for "only the CV model left", adopt `PHASE_6.md` as the final stage. Committed on branch `chore/m1-baseline-and-node22` (4 commits: retire `baseball_tracker`; `/api/health`; CI + Node 22; signup enumeration S6-09). Suite 114 files / 488 tests. Not yet run on GitHub. Next: PR + CI read, then S11 stand-in analyzer and Phase 6 integration.
- **2026-11-08 (late, cont.)** — Built the dev stand-in analyzer (S11-01..06; 52 new tests; suite 118 files / 540) and ran the first true end-to-end flow on a throwaway DB with a real local vision model (§5.1). PR #1 open; CI `verify`/`cv-python`/`database` green on its first push (incl. Node 22 web+worker images). Next: read the final CI on the latest push and merge; then S11-10 baseline audit / S11-12 scoped release decision (ask first), S8-04 authenticated Playwright E2E. Red flags: a Vercel preview deployment exists for the PR via an existing integration (check it needs login and uses no real secrets).
- **2026-11-08 (late, cont. 2)** — Owner: launch scope is all three sports (D17, Q14 closed). Owner also stated the app is now at the "just upload a video and it works" stage; **recorded precisely**: upload → process → labelled result works with the dev stand-in (§5.1), but no validated/graded customer result exists until the real CV model passes S9. Next: merge PR #1 after the final CI read; S8-04 browser E2E; S11-10 baseline audit.
