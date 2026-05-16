# Phase 6 Checklist

## Uploads
- [ ] Video compression verified to meet size target under a concurrent 10-upload load without degradation
- [ ] Upload endpoint rate-limited per user (e.g., max 20 uploads/hour); excess requests receive HTTP 429

## Admin
- [ ] System error alerts delivered via configured channel (e.g., email or Slack) within 5 minutes of an error spike
- [ ] Performance processing logs retained for a minimum of 90 days and queryable without DBA access

## Infrastructure
- [ ] Scalable cloud processing verified: 50 concurrent video jobs complete without queue backup exceeding 5 minutes
- [ ] Auto-scaling policy configured and verified by load test simulating 200 concurrent users
- [ ] Data backup runs nightly; restore from the most recent backup tested successfully
- [ ] Performance monitoring dashboard shows p50/p95/p99 API latency and is always-on with no manual refresh required
- [ ] Latency alert fires when p95 API latency exceeds 2 seconds for more than 1 minute
- [ ] Cost controls: budget alert configured at 80% and 100% of monthly spend limit
- [ ] Queue depth monitored; alert fires when depth exceeds 500 unprocessed jobs
- [ ] Database connection pool configured; no connection exhaustion observed under load test
- [ ] Processing retry logic with exponential backoff confirmed in logs: 3 retries before permanent failure
