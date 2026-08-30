# Athlemetry Local Verification — 2026-08-30

**Evidence class:** LOCAL-SYNTHETIC only. This document is not production, CV, compliance, or leaderboard evidence.

## Source and environment

- Repository: `/home/abhay/Hermes/RTB/apps/Athlemetry` on PC WSL (`GODPC`)
- Source synchronized from `origin/main` before gates
- Source commit: `d7cf0a634d0ba7e256b1925baf7e163205057586`
- Node: `v22.12.0`; npm: `10.9.0`
- PostgreSQL: local Homebrew PostgreSQL 16 on `127.0.0.1:5432`; synthetic `athlemetry` database created for this run
- Temporary build/test outputs were removed after verification

## Gates

| Gate | Command | Result |
|---|---|---|
| Dependencies | `unset NODE_ENV && npm ci --include=dev` | PASS — 612 packages installed; npm reported 7 audit vulnerabilities (1 low, 6 high) |
| Lint | `npm run lint` | PASS (exit 0) |
| Typecheck | `npx tsc --noEmit` | PASS (exit 0) |
| Unit/integration tests | `PATH=...ffmpeg... npm test` | PASS — 113 files, 480 tests; coverage all files 66.6% statements / 69.14% branches |
| Production build | `npm run build` with non-production placeholder env | PASS — Next.js 16.2.12 compiled, typechecked, and generated 46 static pages |
| Migrations | `npx prisma migrate deploy` | PASS — all 45 migrations applied to fresh synthetic DB |
| Seed | `npm run prisma:seed` | PASS (exit 0) |
| Health | production `npm run start` on port 3001; `GET /api/health` | PASS — HTTP 200, `status: ok`, `latencyMs: 1` |
| Metrics unauthenticated | `GET /api/metrics` | PASS fail-closed behavior — HTTP 401 |
| Metrics authenticated | Bearer token supplied via synthetic runtime env | BLOCKED — HTTP 401; no metrics scrape evidence claimed |
| Accessibility | `CI=1 npm run test:a11y -- --workers=1` | BLOCKED — Playwright browser launched but host lacks `libnss3.so`; 7/7 tests could not start browser |

## Notes and blockers

- The existing local PostgreSQL service uses role `abhay`; no container runtime (`podman`/`docker`) is installed. Database gates therefore used a fresh local synthetic database without modifying repository code.
- The repository's current `playwright.config.ts` expects browser revision 1234. That browser was installed locally, but execution remains blocked by the missing host shared library `libnss3.so`; installing OS packages requires user/root action.
- The metrics endpoint correctly rejects unauthenticated access. The synthetic authenticated probe also returned 401, so authenticated scrape success is intentionally unresolved rather than inferred.
- No upload/worker/CV completion evidence was fabricated. A real CV stack and real athlete media are user/environment-dependent.
- No application source changes were necessary after synchronizing to canonical `origin/main`; only this dated QA evidence document is added.

## Cleanup

Generated `coverage/`, `test-results/`, and `playwright-report/` directories were removed. No secrets or production credentials were written or committed.
