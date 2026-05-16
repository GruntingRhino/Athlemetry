# Phase 4 Checklist

## Benchmarking
- [ ] Cohort grouping by age band (e.g., U12, U14, U16, U18, 18+) applied to all percentile calculations
- [ ] Cohort grouping by position (e.g., forward, midfielder, defender, goalkeeper) applied to all percentile calculations
- [ ] Percentile rank calculated for each stored metric value relative to same-cohort submissions
- [ ] Percentile calculation requires a minimum of 10 submissions per cohort; displays "insufficient data" message below that threshold
- [ ] Distribution model (normal or empirical) fit and stored per cohort per metric
- [ ] Relative ranking engine returns percentile result in under 200 ms for existing cohorts
- [ ] Dataset normalization applied before percentile computation to handle unit drift across submissions
- [ ] Benchmark recalculated nightly (or on-demand via admin trigger) as new submissions arrive

## Dashboards
- [ ] Improvement curve graph shows metric value across all submissions for a given drill type in chronological order
- [ ] Performance trend line displayed with a configurable rolling average (default 30 days)
- [ ] Drill-to-drill comparison view shows two submissions side-by-side with metric deltas highlighted
- [ ] Historical percentile tracking chart shows percentile rank per submission date for a drill type
- [ ] Percentile badge or gauge renders on the drill result detail page

## Infrastructure
- [ ] Benchmark dataset aggregation job runs on a schedule without manual intervention
- [ ] Position-based metric index created; cohort percentile query executes in under 200 ms at 10,000-row scale
- [ ] Automated benchmark recalculation triggers within 1 hour of each new submission batch completing
