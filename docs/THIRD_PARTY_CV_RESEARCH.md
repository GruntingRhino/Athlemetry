# Third-party CV research boundary

Last reviewed: 2026-08-01

This document records repository-level license triage for architectural research. It is not an attribution notice and does not authorize use of model weights, training data, media, or other third-party assets.

## Permissive source-code licenses observed

- `roboflow/sports` — MIT
- `Ayan-OP/Soccer-Analytics` — MIT
- `BaseballCV/BaseballCV` — MIT
- `rainmandr/Swing-Analyzer` — MIT
- `mvch1ne/sprintlab` — MIT

Use only after source-level review, required copyright/notice retention, dependency-license review, and separate validation of every model/data artifact. Architectural inspiration does not establish athletic-metric accuracy.

## Do not incorporate directly

- `sPappalard/SwishAI` — AGPL-3.0
- `dev-labs-bg/football-stats` — GPL-3.0

Do not copy or link these into proprietary Athlemetry services absent an approved compatible licensing strategy.

## License not established from GitHub metadata

- `SkalskiP/sports`
- `mwasifanwar/SportIQ`
- `chonyy/basketball-shot-detection`
- `liuzongyue6/Basketball-Shot-Analyzer`
- `avishah3/AI-Basketball-Shot-Detection-Tracker`
- `natekbackman/Baseball-Cinematography`
- `henryczup/running-form-analyzer`
- `chonyy/AI-basketball-analysis` (`NOASSERTION` / Other)

Treat these as reference-only until an explicit, reviewed license is available.

## Product boundary

Any future CV integration must continue to fail closed for absent calibration, unsupported drills, incomplete footage, missing required detections/geometry, or insufficient confidence. No third-party implementation, weight, or dataset may be represented as validated Athlemetry performance analysis without permission, provenance, and held-out runtime evaluation.
