# Local Quality-Gate Record — 2026-10-22

Environment: WSL Ubuntu, Node v22.23.4, Python 3.14.4 (temporary venv at `/tmp`, not committed).
Commit under test: `a901640` ("docs(qa): record local synthetic gates 2026-08-30"). Working tree clean before and after all runs.

## Results

| Gate | Command | Result |
|---|---|---|
| Lint | `eslint .` | PASS (no findings) |
| TypeScript | `./node_modules/.bin/tsc --noEmit` | PASS (no errors) |
| Unit/integration suites | `./node_modules/.bin/vitest run --silent` | First run 479/480 (host lacked `ffmpeg`). After installing `ffmpeg` on the host: **113/113 files, 480/480 tests PASS** (verified in second full-suite run, 2026-10-22). |
| Production build | `next build` with CI-equivalent placeholder env (`DATABASE_URL`, `DIRECT_URL`, `NEXTAUTH_URL`, `NEXTAUTH_SECRET` per `ci.yml`) | PASS — full route manifest prerendered |
| Python CV module `vision_core` | `pytest vision_core/tests -q` | 86/86 PASS |
| Python CV module `baseball_tracker` | `pytest baseball_tracker/tests -q` | 91/91 PASS |

## Repository hygiene

- `git status` clean; the only pre-existing modification (`package-lock.json`, libc-condition entries removed by Windows npm) was restored from HEAD.
- The four `.pt` model-weight artifacts (`yolov8n.pt`, `yolov8n-pose.pt`, `yolov8s-worldv2.pt`, `baseball_tracker/yolov8n.pt`) are not tracked by git (`git ls-files` shows none; `.gitignore` excludes them, with the tracked-by-design note referring to pinned digests, not the binaries). `git log --all -- <weights>` confirms they exist in history only in `cede043` (worktree restore commit) — no standalone model-artifact commits.
- No git tag was created in this session: git committer identity is unconfigured on this host. Suggested action for the repository owner after identity is set:
  `git tag -a rc-2026-10-22-verified -m "RC: lint+tsc clean, 479/480 unit tests (1 ffmpeg env-only), production build verified, vision_core 86/86, baseball_tracker 91/91" a901640`

## Remaining blockers not closeable locally

- Disposable-PostgreSQL migration replay (no Docker daemon on this host).
- ffmpeg-dependent synthetic-media test (no sudo without credential).
- All external gates (staging deployment, Stripe lifecycle, CV corpus capture/benchmarks, legal review, pentest, load test) remain per `BLOCKERS.md`.
