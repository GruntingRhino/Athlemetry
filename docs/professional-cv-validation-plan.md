# Professional CV Validation Execution Plan

## Release rule

No Athlemetry capability or metric is professional-grade until a permission-cleared study for the exact analyzer version, model hashes, drill protocol version, device/camera setup, and metric clears both:

1. `src/lib/capability-validation.ts`; and
2. the drill/metric thresholds in `src/lib/drill-protocols.ts`.

Synthetic clips validate software plumbing only. They do not count toward any corpus threshold.

## Required artifacts

Each study must retain:

- a corpus manifest accepted by `vision_core.validation_manifest.validate_validation_manifest`;
- immutable media and annotation SHA-256 values;
- adult participant release or participant plus guardian release for minors;
- exact person, pose, object, and ReID model SHA-256 values;
- exact analyzer and protocol versions;
- frame-level athlete identities, visibility/occlusion state, object boxes/tracks, attempt boundaries, validity labels, and outcomes;
- synchronized equipment output for every physical metric;
- two distinct independent reviewers and an immutable HTTPS evidence report;
- the completed capability report based on `docs/schemas/capability-validation-v1.example.json`.

The example report is deliberately marked `independentlyReviewed: false` and cannot open release gates.

## Minimum capability evidence

- Object tracking: at least 500 annotated observations; precision and recall at least 0.90; HOTA at least 0.75.
- Athlete ReID: at least 500 observations across at least 50 athletes; IDF1 at least 0.90; identity-switch rate no more than 0.01; long-occlusion recovery at least 0.90.
- Sport/drill recognition: at least 300 clips; accuracy at least 0.95; false-confirmation rate no more than 0.01.
- Repetition segmentation: at least 300 attempts; precision and recall at least 0.90.
- Invalid-attempt detection: at least 300 attempts including at least 100 invalid attempts; sensitivity and specificity at least 0.90.
- Planar calibration: at least 100 captures; P90 positional error no more than 0.05 m; failure rate no more than 0.05.
- Video normalization: at least 100 clips across at least five phone models; decode failure no more than 0.01.
- Every individual metric: at least 100 permission-cleared examples and the metric-specific P90 error limit in `src/lib/drill-protocols.ts`.

## Ground-truth equipment

### Soccer

- Sprint and agility: dual-beam electronic timing gates, calibrated steel tape, and surveyed planar control markers.
- Shooting: synchronized goal cameras or instrumented target net; radar for ball speed where claimed.
- Cone dribble: timing gates plus calibrated overhead or surveyed planar tracking.
- Shuttle endurance: synchronized official audio, line-event timestamps, and dual independent adjudicators.

### Basketball

- Synchronized optical or instrumented ball tracking for release timing and trajectory.
- Regulation surveyed hoop/backboard/free-throw geometry.
- Multi-camera motion capture for technique-rubric validation where a 3D claim is made.
- Two independent reviewers using one locked, versioned mechanics rubric.

### Baseball

- Pitch velocity: calibrated Doppler radar or optical pitch tracking plus synchronized high-speed video.
- Pitch command: calibrated strike-zone target or optical pitch-location system.
- Swing timing/speed: instrumented bat sensor or calibrated optical bat tracking plus synchronized high-speed video.
- Surveyed home-plate/batter-box control plane and documented maximum out-of-plane error.

## Collection design

For every drill, stratify captures across:

- supported camera angles and distances;
- at least five phone models and all supported codecs/orientations;
- indoor/outdoor lighting and high/low contrast uniforms;
- single athlete, bystanders, matching uniforms, partial occlusion, long occlusion, and complete re-entry;
- valid, incomplete, extra-repetition, wrong-drill, wrong-sport, obstructed, and off-protocol attempts;
- representative adult and youth cohorts only when releases and guardian consent permit use.

Split by athlete, not clip, so the same athlete cannot appear in both model-tuning and final test partitions. Freeze the final test set before threshold tuning. Preserve all failed analyses in the denominator.

## Execution sequence

1. Register exact model and analyzer artifacts and hashes.
2. Retain legal approval for every model's code, weights, and training-data lineage, or train replacements solely on data whose releases authorize the intended commercial use.
3. Collect and checksum released footage plus synchronized ground truth.
4. Independently annotate and adjudicate disagreements.
5. Validate the corpus manifest.
6. Run the containerized analyzer without network access.
7. Run `vision_core.reid_benchmark` for identity metrics and the corresponding object/segmentation/calibration evaluators.
8. Produce the capability report and per-metric error report.
9. Obtain independent review and immutable HTTPS evidence.
10. Submit the report through the administrator validation panel.
11. Require a different administrator to approve it.
12. Confirm customer APIs remain closed below any threshold and open only for the exact model/protocol identity.

## Current status

The engineering paths, release gates, benchmark scaffolding, marker assets, and provenance controls exist. No repository artifact currently contains the required permission-cleared real-athlete corpus or synchronized equipment results. Therefore professional release remains blocked until the study above is executed; this is an evidence requirement, not a code-test failure.
