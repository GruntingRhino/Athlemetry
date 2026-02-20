# Test Plan

## Automated Tests

### Run all
```bash
npm run lint
npm test
npm run build
```

### Current automated coverage
- `tests/metrics.test.ts`
  - Validates frame-based 20m sprint timing extraction
  - Validates fallback extraction paths
- `tests/benchmarking.test.ts`
  - Validates percentile, quantile, standard deviation, and cohort-key logic
- `tests/validators.test.ts`
  - Validates registration consent constraints for minors
  - Validates video MIME/size upload validation behavior

## Manual QA Checklist

### Auth and profile
- [ ] Register as athlete, parent, coach
- [ ] Confirm secure login via `/login`
- [ ] Confirm minor registration requires parent email
- [ ] Update profile fields and privacy controls on `/profile`

### Drill workflow
- [ ] Open `/drills` and verify all standardized drills, guidelines, and instruction links
- [ ] Submit drill at `/submissions/new` with valid video and metadata
- [ ] Observe upload progress bar and successful queue message
- [ ] Confirm submission appears in `/submissions` with status and metrics

### Processing and metrics
- [ ] Trigger `/api/processing/run` from `/admin` and verify status transitions
- [ ] Confirm completed submission has extracted metrics (sprint, acceleration, etc.)
- [ ] Retry failed submissions from `/admin/submissions` or submission retry control
- [ ] Verify completed submissions are marked with `videoDeletedAt` and no persistent `fileUrl`
- [ ] Trigger `/api/admin/storage/purge-expired` and verify expired temporary video assets are purged

### Benchmarking and trends
- [ ] Confirm benchmark snapshots appear on `/benchmarking`
- [ ] Confirm dashboard charts render timeline and frequency on `/dashboard`
- [ ] Verify percentile and consistency indicators update with new data

### Privacy/compliance
- [ ] Approve minor consent via `/consent` as parent/admin
- [ ] Export account data via `/privacy`
- [ ] Delete account via `/privacy` and verify login disabled
- [ ] Verify consent logs update on privacy/consent changes

### Admin/reliability
- [ ] Validate `/admin` dataset growth and drill adoption metrics
- [ ] Validate system error + processing log visibility on `/admin`
- [ ] Submit and review user reports in `/submissions` and `/admin/reports`
- [ ] Apply manual metric/status override in `/admin`
- [ ] Activate model version and queue retraining job in `/admin`
- [ ] Hit `/api/health` and confirm latency response payload
