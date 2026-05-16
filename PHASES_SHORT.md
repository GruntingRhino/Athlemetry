# Phases Overview

## Phase 0 — Specification & Design
- Define all drills, metrics, and benchmarking requirements
- Design data schema and system architecture
- Document privacy and compliance requirements for minors
- Establish infrastructure, tooling, and third-party service decisions

## Phase 1 — Skeleton + Auth + Base Schema
- Users can register, log in, and create a role-differentiated profile (athlete / parent / coach)
- Drill library catalog is browsable with per-drill recording guidelines
- Base database schema (users, drills, submissions, metrics) deployed to staging
- CI pipeline passes and app deploys to staging with no manual steps

## Phase 2 — Core Drill Workflow
- Athletes can upload a drill video tagged with date, location, and drill type
- Upload validated, compressed, and queued for processing automatically
- Submission status transitions (pending → processing → completed / failed) visible to the athlete
- Drill history archive is browsable in chronological order

## Phase 3 — Metrics Extraction MVP
- At least one drill type produces real extracted metrics stored in the database
- Sprint time and acceleration timing verified within ±0.1 s tolerance on a test set
- Extracted metric values visible per submission on the dashboard
- Extraction retry logic operational; failure rate below 10% on test set

## Phase 4 — Benchmarking + Longitudinal Tracking
- Percentile ranks calculated per age band and position cohort for all stored metrics
- Improvement curves and historical percentile trends rendered on the dashboard
- Benchmark recalculation runs automatically within 1 hour of each new submission batch
- Drill-to-drill comparison view and percentile gauge available on drill result pages

## Phase 5 — Full Feature Completion
- All planned drill metrics (change-of-direction, shot timing, repetition count) extracted and stored
- Consistency scores, strength indicators, and suggested focus areas displayed on athlete dashboard
- Admin dashboard with error monitoring, drill adoption analytics, and manual override live
- Full privacy and compliance flow (parental consent, data export, account deletion) operational

## Phase 6 — Reliability + Scale Hardening
- 50 concurrent video jobs processed without queue backup exceeding 5 minutes (load tested)
- Nightly backup verified via successful restore test; cost and latency alerts configured
- Upload rate limiting and compression targets verified under concurrent load
- p95 API latency monitored with alert thresholds active at all times

## Phase 7 — Production Readiness
- OWASP Top-10 review and automated security scan findings resolved
- Encryption at rest and in transit verified in production cloud console
- Deployment and rollback runbooks dry-run on staging; rollback completes in under 10 minutes
- End-to-end test suite passes on staging and all third-party keys rotated to production values
