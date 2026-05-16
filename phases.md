# Inputs
- Product requirements: [product_requirements_document.md](product_requirements_document.md)
- Required features checklist: [functionality_list.md](functionality_list.md)

# Non-negotiable rules
1) Do NOT invent requirements. If something is missing or ambiguous, make the smallest reasonable assumption and document it in ASSUMPTIONS.md.
2) Every item in functionality_list.md must map to:
   - code implementation location(s)
   - route/page name(s) or API endpoint(s)
   - a minimal test or verification step
3) Build in phases. Each phase must be runnable and deployable before starting the next phase.
4) Keep early development + hosting cost at $0 using free tiers only.

# Cost/hosting constraints (free-tier friendly)
- Prefer: Next.js + Postgres (Supabase free tier) OR SQLite for earliest MVP, with an easy migration path.
- Use free auth only (Supabase Auth or NextAuth with email provider that has a free tier).
- Avoid paid APIs, GPU requirements, and proprietary services.
- Use Vercel free tier (or Cloudflare Pages) for deployment.
- Store files on free storage (Supabase Storage free tier) OR local-only for MVP with a feature flag.

# Deliverables
Create:
1) README.md with setup + deployment steps (free-tier path).
2) ASSUMPTIONS.md for any ambiguities.
3) FEATURE_MAP.md that lists every functionality_list.md item and where it is implemented.
4) A minimal test plan (automated tests where feasible + manual QA checklist).
5) Working app code with clean structure and linting.

# Implementation plan (must follow)
Phase 0 — Requirements extraction
- Read both documents fully.
- Output a checklist of functionality_list items grouped by: Auth, Uploads, Metrics, Benchmarking, Dashboards, Admin, Privacy/Compliance, Infrastructure.
- Create FEATURE_MAP.md with every item marked "NOT STARTED".

Phase 1 — Minimal deployable skeleton (exit criteria: deploys on free tier)
- Landing page + basic layout
- Auth (roles: athlete/parent/coach/admin per docs)
- Profile creation
- Database schema + migrations
- FEATURE_MAP.md updated to "DONE" only for completed items
- Add basic smoke tests

Phase 2 — Core drill workflow (exit criteria: end-to-end drill submission works)
- Drill library + drill submission UI
- Video upload (or stub upload with file metadata if storage not ready)
- Processing status (queued/completed/failed)
- Admin view of submissions
- Basic dashboard showing submitted drills
- Minimal verification steps or tests

Phase 3 — Metrics extraction MVP (exit criteria: produces real metrics for at least 1 drill)
- Implement metric extraction for 1 standardized drill first (e.g., 20m sprint timing)
- Store results in DB
- Display metrics in athlete dashboard
- Ensure failures are handled gracefully

Phase 4 — Benchmarking + longitudinal tracking (exit criteria: percentiles + trends shown)
- Cohort grouping (age/position/level)
- Percentile calculation
- Trend charts over time
- Data anonymization rules applied for benchmarking

Phase 5 — Full functionality completion (exit criteria: every item DONE)
- Implement remaining drills + metrics
- Privacy/compliance flows (consent logs, export, delete)
- Reliability features (retries, monitoring logs)
- Hardened error handling and validation
- FEATURE_MAP.md: all items marked DONE

# Definition of done
- App runs locally from README instructions.
- App deploys on free-tier per README.
- FEATURE_MAP.md has every functionality_list.md item marked DONE with file/route references.
- No critical missing flows from product_requirements_document.md.