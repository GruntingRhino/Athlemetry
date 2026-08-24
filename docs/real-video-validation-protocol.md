# Real-Video Validation Protocol

Synthetic media in `test-media/generated/` tests deterministic media plumbing only. It must not be used to claim athlete detection, motion tracking, or sports-metric accuracy.

## Permission and provenance

For every real clip, retain a signed release or a source record proving public-domain/CC0 use, participant age/guardian authorization, location authorization, and a content hash. Do not use arbitrary internet, social-media, or YouTube clips as fixtures or evidence.

## Minimum launch corpus

For each launch sport (soccer, baseball, basketball), collect at least 30 consent-cleared clips across: indoor/outdoor conditions, representative athlete demographics, target drill types, and required camera angles. Capture a calibrated reference measurement and an independent manual ground-truth annotation for each target event.

For the 20 m sprint protocol v1.1.0, independently establish the lane with a calibrated steel tape, place printable ArUco ID 0 and ID 1 markers at the measured start and finish, and keep both complete borders visible in a fixed-camera recording. Marker crossings provide automated timing only; marker presence never establishes or verifies the physical lane distance. Compare every automated crossing timestamp with synchronized dual-beam timing gates, including clips with occlusion, camera movement, reverse travel, incomplete crossings, and marker jitter.

## Accuracy acceptance evidence

Before publishing metric claims, report sample size, per-sport/per-drill error distribution, median absolute error, 90th-percentile error, failed-analysis rate, confidence calibration, and known failure conditions. Keep raw videos only under the documented retention policy.

## Release gate

Do not enable claims of automated athlete detection, motion tracking, velocity, form analysis, or accuracy until an independently reviewed corpus demonstrates the predefined acceptance threshold for that exact metric and camera setup.
