# PREPARATION — Labeling Plan: raw recordings → validation-manifest entries

Status: PREPARATION. Defines how day-3 recordings become entries that pass `vision_core/validation_manifest.py::validate_validation_manifest` (schema `athlemetry-cv-validation-v1`/`v2`).

## 1. Folder layout (local working tree, mirrored to object storage)

```
corpus/
  <studyId>/                          # one study per collection campaign, e.g. cv-validation-2026-q3
    raw/
      <YYYYMMDD>_<sport>_<drill>_<angle>_<attempt>_<alias>.mp4
    annotations/
      <same-stem>_ann.json            # manual ground-truth annotation per clip
    releases/
      <alias>_release.pdf             # SIGNED scan (HTTPS-hosted URI goes in manifest)
      <alias>_guardian-release.pdf    # minors only
      <alias>_guardian-consent-addendum.pdf
    calibration/
      <drill>_<date>_<lane>_calib.jpg # steel-tape photos, marker placement, control points
      <drill>_<date>_calibration-report.md
    manifests/
      validation-manifest.json        # assembled, then machine-validated
```

Filename stems follow `docs/CAPTURE_KIT_2026-08-25.md` §5. Aliases only — never legal names in filenames.

## 2. Annotation fields (per clip)

`annotations/<stem>_ann.json` carries what reviewers produce manually; the manifest wraps it:

- `drill` — exact slug from `src/lib/drill-protocols.ts`.
- `cameraAngle` — the angle used (must be one of the drill's accepted angles).
- `environment` — e.g. `outdoor-sun`, `outdoor-overcast`, `indoor-gym`, `indoor-lowlight` (feeds lighting stratification).
- `deviceModel`, `fps`, orientation, approximate camera distance.
- Event-level ground truth per drill type:
  - sprint: start-crossing and finish-crossing timestamps (frame-indexed) + dual-beam gate timestamps;
  - agility/shuttle/lane drills: each line-touch event timestamp;
  - shooting/passing/first-touch/free-throw/spot-shooting: contact/release frame, first-outcome frame, adjudicated result;
  - pitch/swing (120 fps): release/contact frames, radar value where available.
- `attemptClass`: `valid | incomplete | extra-repetition | wrong-drill | wrong-sport | obstructed | off-protocol` (all classes preserved in the denominator).
- Reviewer fields: at least **two distinct reviewers** per clip (`groundTruth.reviewedBy`), disagreement resolution note for boundary events.

SHA-256 of the mp4 and of the annotation JSON go into the manifest (`mediaSha256`, `annotationSha256`).

## 3. Manifest assembly (matching vision_core formats)

Each `clips[]` entry needs (validated by `validate_validation_manifest`):

- `sport` ∈ {soccer, basketball, baseball}; `drill` with a matching `protocolVersions[drill]` entry (use `1.1.0`);
- `mediaSha256`, `annotationSha256` (lowercase hex);
- `participantRelease`: `status: "SIGNED"`, `ageCategory: adult|minor`, HTTPS `releaseUri`, plus `guardianReleaseUri` for minors — no signed scan on file ⇒ clip excluded, fail closed;
- `capture.deviceModel`, `capture.fps`, `capture.cameraAngle`, `capture.environment`;
- `capabilities` ⊆ {object-detection, object-tracking, athlete-reid, sport-drill-recognition, repetition-segmentation, invalid-attempt, planar-calibration, physical-metric, technique-rubric};
- `groundTruth.annotationUri` (HTTPS), `reviewedBy` (≥2 distinct), and for `physical-metric` clips: `groundTruth.synchronized: true` + `equipment` list (e.g. dual-beam timing gates, Doppler radar). v2 additionally requires the full `opticalReference` block (240 fps two-phone study) whenever equipment includes `calibrated-high-speed-optical`;
- study level: `schemaVersion`, `studyId`, `analyzerVersion`, `independentlyReviewed: true`, `modelArtifacts` {person, pose, object, reid} each with sha256 + HTTPS sourceUri.

Assemble → run the validator → fix errors → only then commit the manifest.

## 4. Folds — athlete-grouped splits

Split by **athlete alias, never by clip** (per professional-cv-validation-plan): all clips from one athlete land entirely in train/tuning OR final test. Freeze the final test partition before threshold tuning. Keep stratification cells (lighting, device, occlusion class, attempt class, adult/minor cohorts) represented in both partitions where corpus size allows. Preserve failed analyses in the denominator.

Minimum corpus: ≥30 consent-cleared clips per launch sport across indoor/outdoor conditions, demographics, drill types, and required camera angles.
