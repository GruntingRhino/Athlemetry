# E2E LOCAL-SYNTHETIC — Web Server, Upload, Queue, Metrics (2026-08-25)

**Label:** LOCAL-SYNTHETIC. Every artifact below was produced on the local VM against
the seeded `athl-pg` container (postgres:16) and throwaway fixtures. Nothing here is
production evidence. No real user data involved.

**Repo state at test time:** `main` @ `306c0af` (working tree; doc commit follows).
**Server:** production build (`next start`, standalone output), `NODE_ENV=production`,
bound to localhost:3000, `NEXTAUTH_URL=http://localhost:3000`.
**DB:** podman container `athl-pg`, database `athlemetry`, migrated + seeded.

## 0. Server start — root cause of the earlier 503s

Prior attempts saw `register_http=503`. Root cause found this session:

> In production mode, `rateLimitSource()` (src/lib/distributed-rate-limit.ts) throws
> "Trusted proxy headers are not explicitly configured." unless
> `TRUST_PROXY_HEADERS === "true"`. The local `.env` ships
> `TRUST_PROXY_HEADERS="false"`, so every register/login request failed closed with
> 503 ("Registration protection is temporarily unavailable.") before touching the DB.

Fix for local run only: restart server with an env override
(`TRUST_PROXY_HEADERS=true npm run start`). This is a legitimate deploy requirement
surfaced by the E2E pass — in production a reverse proxy must be present and trust
explicitly declared; locally there is no proxy and no XFF header is sent (rate-limit
identity falls back to `"unknown"`).

Health after correct start:

```
GET /api/health -> HTTP=200
{"status":"ok","latencyMs":79,"timestamp":"2026-08-25T00:19:21.924Z"}
```

## 1. Register throwaway user

`POST /api/auth/register` (JSON). Two validation rejections observed first (honest
transcript): `primarySport` must be lowercase enum (`soccer|baseball|basketball`);
ATHLETE requires `position` and `competitionLevel`. Final payload used
`role=ATHLETE, age=25, primarySport=soccer, position=FWD, competitionLevel=academy`.

```json
{"ok":true,"user":{"id":"cmt7x4xxn0000bjcbeslxwdpg",
 "email":"e2e-local-001933@example.invalid","role":"ATHLETE",
 "parentConsentVerified":true}}
HTTP=200
```

Password: random per-run value, never recorded here.

## 2. Billing fixture (LOCAL-SYNTHETIC deviation)

Production mode enforces subscriptions (`shouldEnforceBilling()` returns true when
`NODE_ENV === "production"`), so the throwaway athlete would get 402 on upload. To
exercise the paid path locally we inserted a subscription directly via SQL:

```
BillingAccount {id: e2efixacct0001, userId: cmt7x4xxn0000bjcbeslxwdpg}
BillingSubscription {id: e2efixsub00001, status: 'active',
                    currentPeriodEnd: now()+30d}
-> INSERT 0 1
```

This is test-fixture setup, not product behavior evidence.

## 3. Login (NextAuth credentials)

Standard CSRF dance with cookie jar:

```
GET  /api/auth/csrf                      -> csrfToken acquired (64 chars)
POST /api/auth/callback/credentials      -> login_http=200
GET  /api/auth/session                   -> authenticated session:
{"user":{"name":"E2E Local Throwaway","role":"ATHLETE", ...,
 "expires":"2026-08-26T00:20:50.095Z"}}
```

## 4. Upload through the submissions multipart flow

`POST /api/submissions` (multipart), fields exactly as the API expects:

| field             | value                                   |
|-------------------|-----------------------------------------|
| video             | test-media/generated/soccer-side-sprint.mp4 (12K synthetic MP4, SHA256SUMS-tracked) |
| drillDefinitionId | cmt7w0vx30001bjijeolx8qvi (`sprint-20m`) |
| recordingDate     | 2026-08-24T10:00                        |
| location          | Local Synthetic Field                   |
| drillType         | training                                |

```
{"ok":true,"submissionId":"cmt7x5yoh0007bjcbao4x86rf"}
HTTP=200
```

Queued-state confirmation, both surfaces:

```
DB:  processingStatus=QUEUED | processingAttempts=0 | storageProvider=local
API: GET /api/submissions -> api_status: QUEUED | drill: sprint-20m
```

Storage provider resolved to `local` (STORAGE_PROVIDER unset -> default); file landed
under `uploads/2026-08-25_...mp4`.

## 5. Worker claim + honest FAILED/retry path

`WORKER_ONCE=true npm run worker:once` — two bounded passes:

```
pass 1: {"event":"worker-batch","total":1,"completed":0,"failed":1,...}
        -> status RETRYING, processingAttempts=1, nextAttemptAt set
pass 2: {"event":"worker-batch","total":1,"completed":0,"failed":1,...}
        -> status RETRYING, processingAttempts=2 (retry loop reclaims correctly)
```

Failure reason (from `DrillSubmission.lastError`):

```
Command failed: python3 -m vision_core.video --video uploads/...mp4 --sport soccer
  --drill sprint-20m --person-model yolov8n.pt --pose-model yolov8n-pose.pt
  ...
  File "/tmp/athl-gate/vision_core/geometry.py", line 8, in <module>
    import cv2
ModuleNotFoundError: No module named 'cv2'
```

### Honest FAILED-path note

The **COMPLETED path was NOT exercised**: the Python vision stack (OpenCV/cv2, YOLO
person+pose models) is not installed on this VM and installing it is out of scope for
a disk-constrained local gate. What IS proven end-to-end: upload persistence, QUEUED
enqueue, worker queue claim, vision invocation wiring, failure capture into
`lastError`, retry scheduling with attempt backoff (attempts 0 -> 1 -> 2), and
queue-depth visibility in metrics. Reaching COMPLETED requires a worker environment
with the real CV dependencies; that remains an open item.

## 6. GET /api/metrics (throwaway METRICS_TOKEN)

Negative check first, then authorized scrape (token read from `.env` at runtime,
never printed):

```
GET /api/metrics without token            -> HTTP=401 (www-authenticate: Bearer)
GET /api/metrics with Authorization: Bearer $METRICS_TOKEN -> HTTP=200
content-type: text/plain; version=0.0.4; charset=utf-8   (20 lines scraped)
```

Relevant samples — note our in-flight retry is visible:

```
athlemetry_queue_jobs{status="queued"} 0
athlemetry_queue_jobs{status="retrying"} 1
athlemetry_queue_jobs{status="processing"} 0
athlemetry_queue_jobs{status="dead_lettered"} 0
athlemetry_workers{health="stopped"} 2
athlemetry_worker_jobs_processed_total 2
athlemetry_worker_errors_total 2
```

## Result summary

| Gate                          | Outcome |
|-------------------------------|---------|
| Production server boots       | PASS (requires TRUST_PROXY_HEADERS=true in prod-mode) |
| Register + validation         | PASS |
| NextAuth credentials login    | PASS |
| Multipart submission upload   | PASS |
| QUEUED status                 | PASS (DB + API) |
| Worker claim                  | PASS |
| Vision processing -> COMPLETED| NOT EXERCISED (cv2/YOLO unavailable locally — see FAILED-path note) |
| FAILED/retry path             | PASS (RETRYING, attempts increment, nextAttemptAt scheduled) |
| Prometheus metrics endpoint   | PASS (401 unauthenticated / 200 with token, live queue gauges) |

Playwright accessibility spec: see appended section below.

## Accessibility spec run (LOCAL-SYNTHETIC) — 2026-08-25

Repo @ e6f82a2, Playwright 1.62.0, bundled chromium-1234 (headless shell).

```
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:5432/athlemetry \
CI=1 npx playwright test e2e/accessibility.spec.ts --reporter=line
```

Notes:
- `CI=1` selects the config's bundled-chromium launch branch — no system Chrome
  exists on this VM, so the local default `channel: "chrome"` cannot resolve.
- The config's webServer hook booted its own `npm run dev` on 127.0.0.1:3100
  against the seeded athl-pg container (127.0.0.1:5432).
- Axe tags per route: wcag2a, wcag2aa, wcag21aa; test passes only when zero
  critical/serious violations are detected.

| Route           | Result |
|-----------------|--------|
| /               | PASS   |
| /login          | PASS   |
| /register       | PASS   |
| /privacy-notice | PASS   |
| /terms          | PASS   |
| /drills         | PASS   |
| /protocols      | PASS   |

**Result: 7 passed, 0 failed (53.3s), 1 worker, 0 retries consumed.**
