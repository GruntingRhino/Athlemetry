# Phase 3 Checklist

## Metrics
- [ ] Sprint time detected from video frames with ±0.1 s tolerance verified against manual stopwatch on a 20-video test set
- [ ] Acceleration timing extracted and stored per submission for sprint-type drills
- [ ] Frame-based timestamp measurement pipeline runs on every submitted video without manual triggering
- [ ] Motion tracking algorithm identifies the athlete bounding box across frames with fewer than 5% frames lost
- [ ] Error tolerance calibration: metric extraction failure rate below 10% on the 20-video test set
- [ ] Extracted metric values written to metrics table linked to the submission ID

## Dashboards
- [ ] Drill breakdown summary displays extracted metric values for each completed submission
- [ ] Basic line chart renders a single metric value over time for one drill type

## Infrastructure
- [ ] Modular metric extraction engine exposes a per-drill plugin interface (adding a new drill requires no changes to the core worker)
- [ ] Metric extraction worker runs as a separate process from the upload worker
- [ ] Processing retry logic retries a failed extraction job up to 3 times before marking the submission as permanently failed
