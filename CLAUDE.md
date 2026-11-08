# CLAUDE.md — working agreement for Athlemetry

Athlemetry: phone-video drill analysis for soccer/basketball/baseball (Next.js 16 + Prisma/Postgres + Python CV worker). **`SPEC.md` is the single source of truth** for goals, status, todos, decisions, and drift. `AGENTS.md` has the architecture/API/env reference (don't duplicate it here). Older docs (`BLOCKERS.md`, `FEATURE_MAP.md`, PRD, `ASSUMPTIONS.md`) are detail references only — see SPEC §11 before trusting them.

## 1. Session start (always, in this order)

1. Read `SPEC.md` §0 (vocabulary, **§0.3 Resume here**, §0.4), then §12 (last session log). Read other sections only as the task needs.
2. `git status` and `git log --oneline -5`. If HEAD differs from SPEC's "Repo HEAD at reconcile", note what changed before trusting §5/§6.
3. Pick the task: the user's request wins; otherwise take the top `[A]` item in §0.3. State the SPEC task ID(s) you're working on.
4. If `node_modules` is missing, `npm ci && npx prisma generate` before running anything.
5. Check `~/AGENTS.md` skill mapping and invoke the matching skill *before* implementing (bug → `debugging-and-error-recovery`; feature → `spec-driven-development` + `incremental-implementation` + `test-driven-development`; UI → `frontend-ui-engineering`; security → `security-and-hardening`; review → `code-review-and-quality`; etc.). For Next 16 / Prisma 6 / Zod 4 / NextAuth v4 APIs, verify against current docs (`source-driven-development`) rather than memory.

## 2. Keeping SPEC.md alive (non-negotiable)

Update `SPEC.md` **in the same change** whenever you:

| You did… | Update |
|---|---|
| Finished/started/retired a todo | tick `- [x]` with **evidence in the line** (test name, command + result, doc path) or `- [~]`; never tick on code alone if it's `[E]` |
| Changed behavior, scope, or a gate | the relevant stage, §6 matrix row, §8 gate row, and §4 if domain facts changed |
| Made a design/architecture/policy choice | append to §9 Decision log (next `D#`, date, one-line why) |
| Found a doc↔code mismatch | add a row to §11 (and fix the doc if it's yours to fix) |
| Hit a question only a human can answer | add to §10 (`Q#`) and surface it to the user — don't guess |
| Added/removed routes, models, drills, env vars, commands | §3, §4 |
| Ran the quality gates | update §5 with real numbers + date |
| Ended the session | append ≤5 lines to §12 (what changed, what's next, any red flags) and refresh §0.3 (≤7 items, ordered) |

Rules: statuses use only `EXERCISED / IMPLEMENTED / EXTERNAL / MISSING`. IDs are stable — never renumber (strike through instead). New work not in SPEC gets a new ID first. Update "Last reconciled" date and HEAD when you do a full pass. If SPEC and code disagree, **code wins** — fix SPEC and log it in §11.

## 3. Engineering rules

**Honesty / fail-closed (product-defining)**
- Never lower a threshold in `src/lib/capability-validation.ts` / `drill-protocols.ts`, relabel a proxy as validated, or let an unvalidated metric reach athletes, rankings, or coaching plans. No gate changes without asking.
- Never use synthetic, generated, or third-party footage as validation evidence. `[E]` items stay open until real external evidence exists; surface them, don't fake them.
- Unsupported/low-confidence ⇒ reject or mark unavailable. File size and user-entered distance are never metric evidence.

**Code**
- Follow the house pattern (SPEC §3.4): session → ownership-scoped query → mutation **+ minimal `SECURITY_AUDIT` log in one transaction** → controlled `503` on failure; `404` without disclosing foreign records; audit metadata = action + actor + opaque IDs only.
- Validate all input with Zod (`src/lib/validators.ts`). Reject contact info/links in user text that others will see.
- Smallest diff that solves the task. No drive-by refactors, no new dependencies, no speculative abstractions. Match surrounding style; `@/` alias; strict TS (no `any` escapes).
- Prisma: migrations are **additive-only**; never edit an applied migration. Schema/migration changes require asking first and a SPEC §4.4 update.
- Python (`vision_core/`): adversarial/negative tests required; failures must fail closed with structured reasons.

**Testing (TDD where logic changes)**
- New route/policy/behavior ⇒ test in the same change (`tests/<name>.test.ts`, Vitest, node env; mock `next-auth` + `@/lib/auth` + prisma via `vi.hoisted`, then `await import` the route). Cover 401/403/404, validation, scoping, audit-failure→503.
- Bug fix ⇒ write the failing test first, then fix (`debugging-and-error-recovery`). Find root cause; don't patch symptoms.
- Never delete/skip a failing test without approval.

**Definition of done** (run what's relevant; report results truthfully, including failures)
`npm run lint` · `npx tsc --noEmit` · `npx vitest run <touched tests>` (full `npm test` before declaring a stage item closed) · `python3 -m pytest vision_core/tests -q` if CV touched · `npm run build` for route/page/config changes (needs CI-equivalent placeholder env; see `.github/workflows/ci.yml`) · SPEC updated. If something wasn't run, say so — never imply it passed.

## 4. Git, safety, and scope

- Commit/push **only when the user asks**. When they do: conventional commits matching history (`feat(scope):`, `fix(ci):`, `docs(qa):`), include the SPEC task ID in the body, and include the SPEC.md change in that commit. Never force-push, rewrite history, or skip hooks. Don't stage unrelated files.
- **Ask first:** schema/migrations, new deps, CI edits, gate/threshold changes, billing-enforcement flag, deleting tracked files/media, any action against Neon/Stripe/S3 or deployed environments, sending email/messages, anything irreversible or outward-facing.
- **Never:** commit `.env`/secrets; seed default admin credentials; put real athlete names/PII in fixtures, logs, docs, or audit metadata; print key material or DB URLs; publish raw athlete footage anywhere.
- Don't use the Neon MCP write tools or browser automation against real accounts without explicit direction.
- Stay in scope: if you notice an unrelated problem, log it in SPEC (todo or §11) instead of fixing it inline.

## 5. Repo gotchas

- `ffmpeg`/`ffprobe` must be installed or one synthetic-media test fails (479/480).
- Four `.pt` weights are tracked in git **by design** (don't `.gitignore` them; mind size when staging).
- `BILLING_ENFORCEMENT_ENABLED` stays off until the Stripe test lifecycle passes (S5-01).
- `TRUST_PROXY_HEADERS` must be explicitly set in prod; registration/login fail closed (503) without it.
- Worker exits `78` on missing/mismatched model digest — config failure, not a crash-loop to "fix" by retry.
- `output/` and `.playwright-cli/` are now gitignored (untracked 2026-11-08, S0-03). Raw corpus media never goes in git (SPEC S9).
- `baseball_tracker/` was retired on 2026-11-08 (SPEC D13). Don't resurrect it or copy from it; baseball analysis lives in `vision_core/`. It clamped implausible values into plausible-looking ones — never reuse that pattern.
- Disposable Postgres for local checks: `initdb` in the scratchpad, start with `pg_ctl -o "-p 54329 -c unix_socket_directories=''"` (the scratchpad path is too long for a Unix socket), connect over `127.0.0.1`, stop and delete it afterwards. Never point tests or smoke runs at Neon.
- Owner stance (2026-11-08): assume everything is broken until demonstrated. Passing mocked/unit tests is not evidence a flow works; say which flows have actually been run (SPEC §5.1 lists them).
- Ultralytics/YOLO is AGPL-3.0 (SPEC Q4): don't add new Ultralytics-dependent models/packages or expose the app publicly before S2-04 is resolved.
- Active milestone is M1 (web staging → private beta, SPEC §0.5). Web only; no native/App Store work.
- Support contact comes from a `SUPPORT_EMAIL` env var; never hard-code or commit the owner's personal email address.
- zsh: quote globs in `grep --include='*.ts'`.
- zsh has no `PIPESTATUS` (it's `$pipestatus`); when you need a command's exit code, don't pipe it.
- Match CI's Node locally with `/opt/homebrew/opt/node@22/bin` (local default may be newer); Node 22 is the supported runtime (D15).
- `next dev` rewrites `next-env.d.ts` (`.next/types` ↔ `.next/dev/types`). Run `git checkout -- next-env.d.ts` before committing; never commit that churn.
- Dev-server/E2E uses port 3100 (Playwright) vs 3000 (`npm run dev`); local port 5432 may belong to another Postgres.

## 6. Communication

Be concise and factual. Report outcomes as they are (failing tests with output; skipped steps named). Recommend rather than survey options. When blocked on a human decision, ask one specific question and record it in SPEC §10. End each session with: what changed, evidence, SPEC items updated, and the next suggested item.
