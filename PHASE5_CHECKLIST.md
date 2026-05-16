# Phase 5 Checklist

## Auth
- [ ] Parental consent email sent and confirmation link verified before an under-13 account activates
- [ ] Data privacy visibility toggles stored per user and respected by all API queries
- [ ] Account deletion flow requires password re-confirmation before executing

## Metrics
- [ ] Change-of-direction measurement extracted and stored for all applicable drills
- [ ] Shot timing extracted and stored for applicable drills (e.g., shooting accuracy drill)
- [ ] Repetition count detected and stored for applicable drills (e.g., dribbling, juggling)

## Dashboards
- [ ] Consistency score calculated per drill type (standard deviation of metric across last N submissions) and displayed
- [ ] Performance strengths indicators highlight the top 3 metrics above the 70th percentile
- [ ] Suggested focus areas list up to 3 metrics below the 40th percentile with specific drill recommendations

## Admin
- [ ] Admin dashboard accessible only to admin role; returns HTTP 403 for all other roles
- [ ] Dataset growth chart shows submission count over time broken down by drill type
- [ ] Drill adoption chart shows unique athlete count per drill type
- [ ] System error monitoring page lists recent processing failures with timestamps and error codes
- [ ] Performance processing logs searchable by submission ID, athlete ID, and date range
- [ ] Manual override: admin can mark a submission as processed or failed with a required audit note
- [ ] User report review queue lists flagged content with approve and remove actions

## Privacy/Compliance
- [ ] Parental approval flow: under-13 accounts require parent/guardian email confirmation before activation
- [ ] Minor data protection: date-of-birth field masked in all API responses for non-owner callers
- [ ] Benchmarking data pipeline uses anonymized IDs; no PII present in aggregated cohort dataset
- [ ] Access control enforced: athlete data readable only by owner, linked parent, and linked coach
- [ ] Explicit consent log records timestamp, IP address, and consent version for each user at signup
- [ ] Data export: authenticated user can download all their data as JSON within 30 seconds of request
- [ ] Data deletion: account deletion removes all PII and associated video files within 24 hours

## Infrastructure
- [ ] Position-expansion framework allows adding a new position without a database schema migration
- [ ] Multi-sport drill support: drill schema includes sport field; basketball/soccer/general filter works end-to-end
- [ ] API versioned (e.g., /api/v1/) so that clients can pin to a version without breaking on future changes
- [ ] Model retraining pipeline triggers on a new labeled dataset batch (manual or scheduled)
- [ ] Version-controlled model: each metric extraction job records the model version used in the metrics row
