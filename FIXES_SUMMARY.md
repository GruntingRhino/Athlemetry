# Fixes Summary

## Validation Run
- `npm run lint` ✅
- `npm test` ✅ (15 tests)
- `npm run build` ✅
- `npm run prisma:seed` ✅
- Targeted smoke checks ✅
  - `POST /api/auth/register` with `role=ADMIN` returns `403`
  - `submissionMetadataSchema` accepts `datetime-local` and empty optional numeric fields
  - `storeVideo()` with `VERCEL=1 STORAGE_PROVIDER=local` writes/purges successfully via `/tmp`

---

## 1) Black text on dark buttons (UI)
- Root cause: Deployed issue came from incorrect/missing light text classes on dark action buttons.
- Files changed:
  - None in this pass (current branch already had correct `text-white` classes on all reported buttons).
- Exact fix implemented:
  - Verified all reported dark buttons render with `text-white`:
    - Home hero CTA
    - `/drills` header CTA
    - `/submissions` header CTA
    - Navbar logged-out Register CTA
- Confirmation of no regressions:
  - Build and lint pass; all inspected button class strings are correct.

## 2) Registration fields not role-adaptive (UX/Logic)
- Root cause: Register form always rendered athlete fields and schema always required athlete attributes (`age`, `position`, `competitionLevel`) regardless of role.
- Files changed:
  - `src/components/forms/register-form.tsx`
  - `src/lib/validators.ts`
  - `tests/validators.test.ts`
- Exact fix implemented:
  - Added role state in UI and conditionally render athlete-only fields (`age`, `position`, `team`, `competitionLevel`, `parentEmail`) only for `ATHLETE`.
  - Updated schema so athlete profile fields are optional at base level and required only when `role === "ATHLETE"` via `superRefine`.
  - Added tests for role-adaptive validation behavior.
- Confirmation of no regressions:
  - Automated tests validate athlete/non-athlete paths; full test/build pass.

## 3) ADMIN self-registration vulnerability
- Root cause: Public role options included `ADMIN`; registration schema/API accepted and created admin users.
- Files changed:
  - `src/lib/constants.ts`
  - `src/components/forms/register-form.tsx`
  - `src/lib/validators.ts`
  - `src/app/api/auth/register/route.ts`
  - `src/app/register/page.tsx`
  - `tests/validators.test.ts`
- Exact fix implemented:
  - Added `SELF_REGISTRATION_ROLE_OPTIONS = ["ATHLETE", "PARENT", "COACH"]`.
  - Register form now uses only self-registration roles.
  - Register schema now uses self-registration roles (rejects `ADMIN`).
  - API route now explicitly denies payloads with `role: "ADMIN"` with `403` before any DB write.
- Confirmation of no regressions:
  - Smoke test confirmed `403` response for admin registration attempts.
  - Existing seeded/internal admin role remains intact (no schema/db enum changes).

## 4) Drill links all pointed to Rick Astley
- Root cause: All drill definitions used the same placeholder Rick Astley URL.
- Files changed:
  - `src/lib/constants.ts`
  - `prisma/seed.ts`
  - `ASSUMPTIONS.md`
- Exact fix implemented:
  - Replaced all 5 drill instruction links with drill-specific YouTube resources/search URLs.
  - Updated seed data and runtime constants to stay consistent.
  - Documented ambiguity assumption for canonical video selection.
- Confirmation of no regressions:
  - No rickroll URLs remain in source/seed; build/tests pass.

## 5) Drill submission blocked by datetime mismatch
- Root cause: Client sent `datetime-local` values (`YYYY-MM-DDTHH:mm`) while server validation required strict ISO datetime with timezone.
- Files changed:
  - `src/components/forms/upload-form.tsx`
  - `src/lib/validators.ts`
  - `tests/validators.test.ts`
- Exact fix implemented:
  - Client now normalizes recording date to `toISOString()` before submit.
  - Server schema now transforms both local datetime strings and ISO datetime inputs into canonical ISO.
  - Added test coverage for `datetime-local` acceptance.
- Confirmation of no regressions:
  - Validator tests pass; upload form payload is now schema-compatible.

## 6) Vercel upload 500 from read-only local filesystem
- Root cause: Local storage provider always wrote to `<cwd>/uploads` which is read-only on Vercel (`/var/task`).
- Files changed:
  - `src/lib/storage.ts`
- Exact fix implemented:
  - Local provider now resolves writable directory with precedence:
    1. `LOCAL_STORAGE_DIR` (if set)
    2. `/tmp/athlemetry-uploads` on serverless runtimes (`VERCEL`/`AWS_LAMBDA_FUNCTION_NAME`)
    3. `<cwd>/uploads` for local non-serverless dev
- Confirmation of no regressions:
  - Smoke test with `VERCEL=1 STORAGE_PROVIDER=local` verified successful store+purge flow.

## 7) Session not terminated after account deletion
- Root cause: Deletion endpoint soft-deleted account but did not invalidate active auth session/cookies.
- Files changed:
  - `src/app/api/privacy/delete/route.ts`
  - `src/components/forms/privacy-actions.tsx`
- Exact fix implemented:
  - Deletion route now:
    - deletes DB-backed sessions (`prisma.session.deleteMany`)
    - expires relevant NextAuth cookies (`session-token`, `callback-url`, `csrf-token`, secure variants)
  - Privacy UI now redirects to login immediately after successful deletion.
- Confirmation of no regressions:
  - Route builds/runs and session invalidation logic is explicit and immediate.

## 8) `passwordHash` exposed in data export
- Root cause: Export endpoint returned full `user` record via broad include/select path, leaking `passwordHash`.
- Files changed:
  - `src/app/api/privacy/export/route.ts`
- Exact fix implemented:
  - Replaced broad fetch with explicit `select` whitelist excluding `passwordHash`.
  - Added not-found handling that marks export request `FAILED` and returns `404`.
- Confirmation of no regressions:
  - `passwordHash` is no longer selected/exported; export route remains build-valid.

---

## Regression Safety Notes
- Architecture and DB schema were preserved (no migration required).
- Core routes still compile and are listed in production build output.
- Existing benchmark, metrics, storage retention, and validator suites all remain green.
