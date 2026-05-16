# Phase 7 Checklist

## Auth
- [ ] OWASP Top-10 checklist reviewed; all critical and high findings resolved with documented mitigations
- [ ] Login endpoint rate-limited (e.g., max 10 attempts/minute/IP); verified by automated test
- [ ] Session tokens expire after configured idle timeout and cannot be replayed after logout
- [ ] Password hashing uses bcrypt or Argon2 with a minimum cost factor verified in code review

## Uploads
- [ ] MIME-type validation performed server-side (not only client-side); verified by submitting crafted multipart requests
- [ ] Uploaded files quarantined or scanned for malware before processing pipeline begins

## Admin
- [ ] Duplicate submission detection flags and throttles same-video uploads within a 24-hour window
- [ ] Admin audit log records all manual override actions with admin ID, timestamp, and before/after values

## Privacy/Compliance
- [ ] All data retention policies documented; automated enforcement verified (e.g., inactive account purge runs on schedule)
- [ ] COPPA/GDPR compliance checklist signed off by owner or designated legal reviewer
- [ ] Privacy policy and terms of service published at stable public URLs and linked from the signup flow

## Infrastructure
- [ ] Encryption at rest confirmed: database and object storage encryption verified in cloud provider console
- [ ] Encryption in transit confirmed: TLS 1.2+ enforced on all endpoints; HTTP redirects to HTTPS verified
- [ ] Automated security scan (e.g., OWASP ZAP or equivalent) run against staging; report reviewed and blockers resolved
- [ ] Staging environment matches production configuration (same env var keys, same infrastructure tier)
- [ ] Deployment runbook written and dry-run executed on staging without manual improvisation
- [ ] Rollback procedure tested: previous version deployed from rollback runbook in under 10 minutes
- [ ] All third-party API keys rotated from development/staging values to production-only values
- [ ] End-to-end test suite covers the critical path (register → upload drill → view extracted metrics → view percentile rank) and passes on staging
