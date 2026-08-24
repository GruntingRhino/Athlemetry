# Baseball Pitch Tracking Study Contract

This contract is for the `baseball-pitch-velocity` professional validation study.
It must use the exact production analyzer image, model hashes, and protocol version.
The existing 1918 public-domain baseball clip is explicitly excluded: it is a
30-fps decode fixture, contains no radar/optical truth, and cannot count toward
this study.

## Required capture per pitch

- A permission-cleared athlete capture at >=120 fps from `behind-catcher` or
  `open-side` setup.
- A synchronized calibrated Doppler radar or optical pitch-tracking reference.
- A surveyed, lens-corrected ball-plane calibration with documented maximum
  out-of-plane error.
- The native source clip SHA-256 and annotation JSON SHA-256.
- Two independent annotators plus an adjudicator for disagreements.

## Annotation JSONL record

One record per visible baseball frame. Bounding boxes are normalized image
coordinates `[x1, y1, x2, y2]` after the documented orientation/lens-normalization
step.

```json
{"schemaVersion":"athlemetry-baseball-pitch-track-v1","clipId":"pitch-0001","frameIndex":42,"phase":"release","trackId":"baseball-1","box":[0.411,0.328,0.427,0.347],"visibility":"visible","reviewedBy":["annotator-a","annotator-b"]}
{"schemaVersion":"athlemetry-baseball-pitch-track-v1","clipId":"pitch-0001","frameIndex":43,"phase":"flight","trackId":"baseball-1","box":[0.436,0.337,0.450,0.354],"visibility":"visible","reviewedBy":["annotator-a","annotator-b"]}
```

Allowed phases are `release`, `flight`, `plate`, and `catcher_glove`. A fully
occluded or absent ball is not a false-negative annotation; it must be recorded
in the immutable adjudication record with its visibility state and is excluded
from visible-box recall.

## External speed-reference JSONL record

```json
{"clipId":"pitch-0001","speedMps":40.23,"source":"calibrated-doppler-radar","synchronized":true,"evidenceUri":"https://evidence.example/pitch-0001","reviewedBy":["reviewer-a","reviewer-b"]}
```

`source` must be `calibrated-doppler-radar` or `optical-pitch-tracking`.

## Release requirements

The evaluator in `vision_core/pitch_benchmark.py` fails closed unless all of
these hold on a frozen athlete-disjoint holdout set:

- >=500 visible annotated ball observations;
- overall ball precision >=0.90;
- overall ball recall >=0.90;
- HOTA >=0.75;
- recall >=0.90 separately at release, flight, plate, and catcher/glove;
- >=100 pitches with synchronized radar/optical reference and a prediction for
  each reference pitch;
- pitch-speed P90 absolute error <=0.67 m/s;
- no model, tracker, threshold, preprocessing, or protocol change after holdout
  freeze.

Report all failures in the denominator and include results by camera angle,
device, blur/ball size, lighting, and occlusion condition. A specialist
baseball model may replace the generic detector only after its code, weights,
training-data rights, SHA-256, and frozen-holdout results are independently
reviewed.
