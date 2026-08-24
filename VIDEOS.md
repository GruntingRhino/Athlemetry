# Video and Annotation Collection Requirements

This document specifies the minimum collection needed to close Athlemetry's remaining computer-vision blockers. The goal is not to accumulate arbitrary clips: it is to build a permission-cleared, diverse, athlete-disjoint corpus with ground truth for training and held-out evaluation.

## Non-negotiable rules for every clip

- Obtain written permission from both the athlete and videographer for commercial ML training, evaluation, annotation, storage, and internal use.
- Preserve the original unedited iPhone video and metadata. Do not trim, re-encode, export through social media, add filters, use digital zoom, interpolate slow motion, add overlays, or screen-record playback.
- Use the rear camera, landscape orientation, fixed tripod, and good/even lighting whenever possible.
- Record a metadata row for every raw file: pseudonymous athlete ID, session ID, sport, drill, phone model, camera/lens, resolution, FPS, orientation, camera position, lighting, date, calibration setup, and any independent ground-truth device.
- Assign every athlete to exactly one split: `train`, `validation`, or `held-out`. The held-out athletes must never be used for training or tuning.
- Store raw media outside Git. Commit only manifests, annotations, checksums, protocol documents, and reviewed aggregate results.

## Collection sequence

1. Record a small pilot first: 2–3 athletes, 10 pitches each, following the baseball protocol below.
2. Run the pipeline and annotation workflow on the pilot before collecting the full study.
3. Collect the structured corpus below.
4. Freeze the model and configuration before evaluating the untouched held-out athletes.

---

## A. Baseball pitch velocity: primary remaining blocker

### Required capture setup

- **Frame rate:** 240 FPS iPhone Slo-mo preferred; 120 FPS minimum. Never use 30 or 60 FPS for pitch-speed validation.
- **Resolution:** 1080p minimum; retain the original file. 4K is welcome only if the chosen high-FPS mode supports it.
- **Camera:** rear lens, no digital zoom, fixed on a tripod.
- **Angle:** preferred side view perpendicular to ball flight; acceptable behind-catcher view. Do not use a diagonal angle that hides release, flight, or target.
- **Framing:** pitcher, release point, full visible ball flight, plate/target, and catcher/glove or net must remain in frame throughout every pitch.
- **Lighting:** bright daylight or strong, even artificial light. Avoid dark indoor footage, backlit ball flight, flickering lights, and backgrounds that obscure a white ball.
- **Ball:** use a regulation baseball.
- **Video:** uninterrupted raw session; no cuts between pitches.

### Ground truth and calibration

- For at least **100 held-out pitches**, record speed with a calibrated radar gun. Preserve the per-pitch radar reading and the device/model information.
- If radar is unavailable, use the approved two-phone 240-FPS optical protocol: two synchronized cameras, a surveyed pitch span, visible reference markers in the ball-flight plane, a calibration report, and two independent reviewers.
- Record measured pitcher-to-plate/target distance and all surveyed marker coordinates in metres.
- Place at least two visible, measured markers in the same physical plane as ball flight. Ground-only markers do not authorize ball-plane speed.

### Volume and diversity

- Target **50 pitchers total**, with **10–15 pitches per pitcher**: 500–750 pitches.
- Reserve at least **10–15 pitchers** and their entire sessions for held-out testing.
- For training and validation, target **2,000–5,000 annotated ball-visible frames**. Include release, flight, plate, and catcher-glove phases.
- The held-out test set needs at least **500 annotated ball observations** and **100 pitches with independent speed truth**.
- Deliberately include left/right-handed pitchers, different pitch speeds, uniform colors, mound/cage/backgrounds, daytime/overcast/even indoor lighting, motion blur, partial occlusion, and several camera distances.

### Required labels

For each pitch:

- Athlete/session/pitch ID and split.
- Pitch start, release, ball-flight, plate-crossing/target, and catcher-glove frame ranges.
- Bounding box for the ball in sampled visible frames; maintain one track ID through the pitch.
- Ball visibility/occlusion state.
- Radar or optical ground-truth speed when available.
- Calibration ID and calibration-plane evidence.
- Pass/fail protocol assessment and failure reason when unusable.

---

## B. Athlete re-identification

This can reuse footage from every sport, but it must include multi-person scenes.

- Include at least **50 distinct athletes** across the corpus.
- Capture each athlete on multiple days or in multiple appearances: changed clothing, angle, lighting, and distance.
- Include scenes containing two or more athletes, crossing paths, partial occlusion, leaving/re-entering frame, and temporary detector loss.
- Target at least **500 held-out labeled person-track observations** across 50 held-out-capable athletes.
- Label person track IDs consistently within each clip. Do not use real names in labels; use pseudonymous IDs.

---

## C. Drill recognition, repetition segmentation, and invalid-attempt detection

Collect all nine supported drills:

1. Soccer 20-metre sprint (`sprint-20m`)
2. Soccer 5-10-5 agility shuttle (`agility-5-10-5`)
3. Soccer shooting accuracy (`shooting-accuracy`)
4. Soccer cone dribble (`cone-dribble`)
5. Soccer shuttle endurance (`shuttle-endurance`)
6. Baseball pitch velocity (`baseball-pitch-velocity`)
7. Baseball pitch command (`baseball-pitch-command`)
8. Baseball swing timing (`baseball-swing-timing`)
9. Basketball form capture (`basketball-form-capture`)

For each drill:

- Capture **20–30 valid examples** and **10–15 deliberately invalid/incomplete examples**, from multiple athletes and setups.
- A continuous raw session may contain multiple attempts; label each attempt separately rather than creating one file per rep.
- Keep at least 20% of athletes/examples held out.
- Record the correct drill label, each repetition start/end, expected repetition count, validity, and structured reason for any invalid attempt.

### Valid framing by drill

- **20m sprint:** side/diagonal fixed view; full lane, clean start marker, finish marker, and runner visible.
- **5-10-5 agility:** wide side/diagonal view; all cones, line touches, start cue, and full route visible.
- **Soccer shooting:** behind-goal or diagonal view; goal, target zones, ball path, and shooter visible.
- **Cone dribble:** top-side, side, or diagonal view; entire cone layout and return route visible.
- **Shuttle endurance:** field-length framing; all rep markers and uninterrupted route visible.
- **Pitch command:** behind-pitcher or catcher view; full strike zone/target and every pitch visible.
- **Swing timing:** open-side batting view; hands, hips, bat, and contact point visible.
- **Basketball form:** side/diagonal view; athlete, ball, hoop, and free-throw/three-point line visible.

### Deliberate invalid examples

Capture genuine failures, not artificial edits: action out of frame, missing endpoint/target, early stop, wrong drill, wrong camera angle, bad lighting, ball/contact hidden, missing calibration markers, extra athlete confusion, incomplete route, and occlusion.

---

## D. Multi-sport object tracking

The canonical object classes are: `ball`, `bat`, `hoop`, `goal`, `plate`, `cone`, and `target`.

- Collect clips covering every class in realistic use:
  - Soccer: ball, goal, cone, target.
  - Baseball: ball, bat, plate, target.
  - Basketball: ball, hoop.
- Produce at least **500 held-out annotated frames per class**.
- For training, collect substantially more diverse annotations than the held-out minimum; target 2,000+ useful annotated frames per frequently moving class such as ball.
- Preserve object track IDs across visible frames.
- Include small objects, blur, fast motion, occlusion, varied lighting, indoor/outdoor conditions, varied backgrounds, and different camera distances.

---

## E. Planar calibration / homography

- Collect at least **100 separately calibrated captures** across supported soccer, baseball, and basketball setups.
- Use surveyed fiducials/markers with recorded real-world coordinates in metres.
- Make markers clearly visible, stationary, and in the relevant measurement plane.
- For ball/bat physical measurements, calibration markers must be in the actual ball/bat plane; a ground-plane calibration is not enough.
- For each capture, save marker locations, measured distances, calibration photos, protocol version, reviewer IDs, and an immutable evidence reference.
- Include normal usable setups and realistic failure cases: missing marker, obscured marker, too few markers, camera movement, wrong plane, and non-planar view.

---

## F. Video normalization and decoder robustness

- Collect at least **100 raw clips from five or more distinct phone/device models**.
- Cover portrait and landscape orientation; 30/60/120/240 FPS; 1080p and supported higher resolutions; daylight, overcast, indoor, and moderate shake.
- Retain original files and metadata so rotation, timestamps, variable-frame-rate behavior, stabilization, and color normalization can be evaluated.
- Include a small explicitly labeled rejection set: truncated/corrupt file, extremely dark clip, severe blur, excessive shake, and unsupported/no-subject clip. These must be rejected or marked unavailable, never turned into fabricated metrics.

---

## G. Basketball and baseball physical outcomes

### Baseball swing timing

- Record open-side video at 120 FPS minimum; 240 FPS preferred.
- Keep hands, hips, bat, ball/contact region, and target/net in frame.
- Label whether contact is visible, hidden, missed, or too blurred to assess.

### Basketball form and shot outcomes

- Use 120 FPS minimum; 240 FPS preferred for fast ball tracking.
- Fixed side/diagonal tripod view with athlete, ball, hoop, and a visible court line.
- For any accuracy validation, record independently verified made/missed outcome for every shot, preferably reviewed by two distinct reviewers with a stable evidence reference.
- Do not use a self-reported shot count as accuracy ground truth.

---

## H. Proxy validation: technique, power, and consistency

These remain non-scientific proxies unless separately validated.

- For held-out clips, have at least two qualified coaches score the declared construct using a written rubric while blinded to Athlemetry output.
- Preserve each reviewer score, rubric version, reviewer identity/qualification record, and disagreement resolution.
- Do not ask reviewers to validate a metric that the video cannot support (for example, camera-scale-dependent release height).

---

## What to deliver with the videos

For each batch, deliver:

1. Original raw files only.
2. A CSV or JSON manifest with the required metadata and pseudonymous athlete/session IDs.
3. Signed permissions/releases stored separately from the video manifest.
4. Calibration measurements and photos.
5. Radar/optical speed records for pitch-speed ground truth.
6. Annotation files for frames, tracks, phases, repetitions, outcomes, and validity.
7. SHA-256 checksum for every raw file after transfer.

## Do not collect or use

- Broadcast, YouTube, TikTok, Instagram, or other third-party footage without explicit commercial ML rights.
- Video of minors without the required guardian releases and legal review.
- Edited exports, social-media copies, screen recordings, or videos whose original FPS/metadata is unavailable.
- Training examples that leak the same athlete/session into the held-out test split.
- Unsupported physical claims based only on entered distance, manually selected frames, or an unverified outcome count.
