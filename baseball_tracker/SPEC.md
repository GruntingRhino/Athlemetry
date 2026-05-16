# Baseball Vision Model Spec

## Local Computer Vision System for Ball Tracking, Swing Speed Estimation, and Hitter Form Analysis with Ollama

## 1. Objective

Build a local-first baseball vision system that uses computer vision and a local Ollama model to:

1. Track the baseball through video frames.
2. Estimate the baseball’s path in 2D and, where feasible, approximate trajectory metrics.
3. Detect and analyze hitter body mechanics and bat motion.
4. Estimate swing speed from video.
5. Generate structured form feedback for the hitter.
6. Run fully or primarily on local hardware, with Ollama used for interpretation, coaching feedback, and optional reasoning over extracted metrics.

This system is not intended to be MLB-grade biomechanical hardware. It is intended to be a practical, local, camera-based analysis tool that produces useful feedback from consumer video.

## 2. Product Goal

The product should let a user upload or record a baseball swing video and receive:

- Ball path visualization
- Swing speed estimate
- Bat path estimate
- Key body position analysis
- Form feedback
- Structured improvement suggestions
- Confidence indicators for each metric

The system must prioritize:

- Local processing
- Low operational cost
- Clear modular architecture
- Extendability for future multi-camera or radar integration

## 3. Scope

### In Scope

- Single-video analysis from phone or camera footage
- Local inference pipeline
- Baseball detection and tracking
- Batter pose estimation
- Bat motion approximation
- Swing phase segmentation
- Swing speed estimation from video
- Form scoring based on mechanical heuristics
- Ollama-based local feedback generation
- Export of structured results

### Out of Scope for V1

- Perfect 3D reconstruction from one camera
- Exact exit velocity measurement
- Exact pitch velocity measurement from poor-quality video
- Catcher/framing analysis
- Full pitcher biomechanics
- Real-time live game production tracking
- Sensor fusion with Blast Motion, Rapsodo, Hawk-Eye, etc.
- Cloud dependency

## 4. Core User Stories

### Player

- I upload a side-view or angled swing video.
- I get my swing speed estimate.
- I see whether my mechanics are efficient.
- I get coaching feedback I can act on.

### Coach

- I upload multiple athlete videos.
- I compare mechanics across swings.
- I review structured metrics, not just text feedback.

### Developer

- I can swap detectors, trackers, or pose models.
- I can inspect intermediate outputs.
- I can run everything locally.

## 5. High-Level System Architecture

The system should be split into the following modules:

1. Video Input Module
2. Frame Preprocessing Module
3. Object Detection Module
   - baseball
   - bat
   - hitter
4. Pose Estimation Module
5. Tracking Module
6. Swing Event Segmentation Module
7. Metric Calculation Module
8. Form Evaluation Module
9. Ollama Reasoning/Coaching Module
10. Visualization and Export Module

Pipeline:

```text
Video Input
  -> Frame Extraction / Preprocessing
  -> Object Detection + Pose Estimation
  -> Temporal Tracking
  -> Event Segmentation
  -> Metric Computation
  -> Form Scoring
  -> Ollama Feedback Generation
  -> JSON + Visual Output
```

## 6. Functional Requirements

### 6.1 Video Input

The system must support:

- MP4, MOV, AVI
- 30 FPS minimum
- Prefer 60 FPS or higher if available
- 720p minimum resolution
- 1080p preferred

The system should accept:

- Uploaded local file
- Optional webcam/live capture later

The system should record metadata:

- frame rate
- resolution
- duration
- camera orientation
- estimated field of view if inferable

### 6.2 Preprocessing

The preprocessing module must:

- Extract all frames
- Normalize frame timestamps
- Handle rotation/orientation correction
- Optionally stabilize shaky footage
- Resize frames for inference while preserving original scale metadata
- Improve contrast/brightness when footage is poor
- Optionally denoise frames

The system should preserve mapping between:

- raw frame index
- timestamp
- resized frame coordinates
- original frame coordinates

### 6.3 Object Detection

The system must detect:

- baseball
- batter
- bat

Detection requirements:

- Per-frame bounding boxes
- Confidence scores
- Ability to handle brief occlusion

Preferred implementation:

- YOLO-family detector or equivalent lightweight local detector
- Separate fine-tuned model for baseball if general detector performs poorly

Notes:

- Baseball is small and fast, so the architecture must allow specialized handling.
- Bat detection may be noisy; fallback inference from hand/wrist motion is acceptable.

### 6.4 Pose Estimation

The system must estimate hitter body landmarks across frames.

Minimum landmarks of interest:

- head
- neck
- shoulders
- elbows
- wrists
- hips
- knees
- ankles

Preferred pose backends:

- MediaPipe Pose
- MoveNet
- RTMPose
- YOLO pose variant

Pose output must include:

- landmark coordinates
- confidence values
- temporal consistency smoothing

### 6.5 Tracking

Tracking is required for:

- baseball
- bat or bat proxy
- hitter keypoints over time

Tracking methods can combine:

- detection-by-tracking
- Kalman filter
- optical flow
- SORT/DeepSORT-like tracking for larger objects
- custom small-object temporal linking for baseball

The tracking system must:

- interpolate short gaps
- flag low-confidence segments
- store trajectory history

Ball tracking output:

- frame-by-frame position
- smoothed path
- confidence per segment

### 6.6 Swing Event Segmentation

The system must identify key swing phases.

Minimum phases:

1. stance/setup
2. load
3. stride
4. swing initiation
5. contact zone
6. follow-through
7. finish

If exact bat-ball contact is not visible, the system should infer a likely contact window.

Segmentation can use:

- pose velocity changes
- wrist acceleration
- bat motion changes
- ball proximity
- rule-based temporal heuristics

Each phase should have:

- start frame
- end frame
- confidence score

### 6.7 Swing Speed Estimation

The system must estimate swing speed from video.

Since video-based swing speed is approximate, the system must:

- estimate bat barrel motion or a strong proxy
- convert pixel displacement to physical displacement
- compute speed over time
- report peak swing speed
- report confidence

Possible methods:

1. Direct bat detection across frames
2. Wrist-driven bat-speed proxy
3. Hand-to-barrel geometric estimation if bat is partially visible
4. Multi-point motion estimation using optical flow

Calibration options:

- User provides known reference object length
- Use approximate body proportions
- Use bat length prior
- Use batter height input for scale estimation

Output:

- peak bat speed
- average bat speed during swing window
- confidence band
- calibration method used

Important:  
The spec must explicitly state that swing speed is an estimate, not certified measurement.

### 6.8 Ball Path Tracking

The system must reconstruct the baseball path in image space and estimate useful trajectory descriptors.

Outputs:

- 2D trajectory polyline
- release-to-contact or pitch-window path if visible
- launch direction after contact if post-contact frames exist
- trajectory smoothness
- confidence

If enough information exists, estimate:

- approach angle in image plane
- vertical drop in image plane
- relative pitch location at contact zone
- contact point relative to hitter stance

Single-camera limitation:  
True 3D ball path is not guaranteed in V1. The system should report 2D path and only infer pseudo-3D or approximate metrics if confidence is sufficient.

### 6.9 Form Analysis

The system must score swing form using interpretable rule-based mechanics.

Metrics to evaluate:

- stance balance
- head stability
- hip-shoulder separation proxy
- stride length
- hand path efficiency
- rear elbow behavior
- front side stability
- rotational sequencing
- posture maintenance
- follow-through balance

The form system should produce:

- per-metric score
- overall score
- concise issue list
- suggested corrections

The form engine should use:

- explicit biomechanical heuristics
- threshold-based rules
- temporal motion features
- optional learned classifier later

Important:  
Do not let Ollama directly compute raw biomechanics from pixels. Ollama should interpret structured outputs, not replace CV/math.

### 6.10 Ollama Usage

Ollama must be used locally for:

1. Converting computed metrics into natural-language coaching feedback
2. Explaining likely swing inefficiencies
3. Generating drill recommendations
4. Producing concise player-facing summaries
5. Producing coach-facing technical reports

Ollama must not be responsible for:

- raw object detection
- tracking
- geometry computation
- frame-by-frame biomechanics extraction

Ollama input should be structured JSON, for example:

```json
{
  "player_id": "sample_001",
  "video_metadata": {
    "fps": 60,
    "resolution": [1920, 1080]
  },
  "swing_metrics": {
    "peak_swing_speed_mph": 68.4,
    "speed_confidence": 0.71,
    "bat_path_efficiency_score": 0.63
  },
  "form_scores": {
    "head_stability": 0.82,
    "stride_balance": 0.57,
    "hip_rotation_timing": 0.61
  },
  "issues": [
    "Early head drift",
    "Front side opens early",
    "Stride timing inconsistent"
  ]
}
```

Ollama output should be constrained into structured sections:

- Summary
- Mechanical strengths
- Mechanical weaknesses
- Top 3 priorities
- Suggested drills
- Confidence caveats

Preferred local model categories:

- small/medium instruct model
- coding/reasoning capable enough to follow schema
- deterministic output preferred

The implementation should allow pluggable Ollama models via config.

## 7. Non-Functional Requirements

### 7.1 Local-First

- System should run without cloud APIs
- All videos remain local by default
- Ollama runs locally
- No required third-party telemetry

### 7.2 Performance

Target for V1:

- Analyze a 10-second 1080p clip in under 2 minutes on a reasonably strong local machine
- Allow lower-resolution fast mode
- Use GPU acceleration if available
- Fall back to CPU when needed

### 7.3 Reliability

- Must not crash on partially occluded video
- Must return partial results when some modules fail
- Must expose confidence scores and fallback behavior

### 7.4 Interpretability

- Every major output must state:
  - how it was estimated
  - confidence level
  - whether it is approximate

### 7.5 Modularity

- Detection, pose, tracking, scoring, and Ollama modules should be replaceable
- Use clean interfaces and typed schemas

## 8. Suggested Technical Stack

### Core

- Python
- OpenCV
- NumPy
- SciPy
- PyTorch
- ONNX Runtime optional
- Ultralytics YOLO or equivalent
- MediaPipe / MoveNet / RTMPose
- Ollama local API
- Pydantic for schema validation

### Optional

- FFmpeg for video processing
- Trackers: filterpy or custom Kalman logic
- FastAPI for local API layer
- Streamlit or simple React frontend later
- SQLite for local run history

## 9. Recommended Module Breakdown

### 9.1 `video_ingest`

Responsibilities:

- load video
- inspect metadata
- extract frames
- timestamp mapping

### 9.2 `preprocess`

Responsibilities:

- rotate/orient
- stabilize
- resize
- enhance contrast if needed

### 9.3 `detectors`

Responsibilities:

- baseball detector
- bat detector
- batter detector

### 9.4 `pose`

Responsibilities:

- hitter pose inference
- smoothing landmarks
- quality checks

### 9.5 `tracking`

Responsibilities:

- ball tracking
- bat tracking
- landmark temporal smoothing

### 9.6 `events`

Responsibilities:

- detect swing phases
- detect likely contact region
- segment time windows

### 9.7 `metrics`

Responsibilities:

- bat speed estimation
- trajectory extraction
- stance and posture metrics
- rotational timing proxies

### 9.8 `scoring`

Responsibilities:

- rule-based form evaluation
- weighted overall score
- issue extraction

### 9.9 `llm_feedback`

Responsibilities:

- format JSON prompt for Ollama
- call local Ollama endpoint
- parse structured response

### 9.10 `visualization`

Responsibilities:

- overlay path
- skeleton rendering
- bat path rendering
- phase labels
- speed readout

### 9.11 `export`

Responsibilities:

- JSON results
- CSV summaries
- coach report
- player summary

## 10. Input/Output Contracts

### Input

Required:

- video file path

Optional:

- player height
- bat length
- handedness
- camera view type
- known calibration object
- desired output detail level

Example input schema:

```json
{
  "video_path": "/videos/swing1.mp4",
  "player_height_inches": 70,
  "bat_length_inches": 33,
  "handedness": "right",
  "camera_view": "side",
  "calibration_reference": null,
  "analysis_mode": "full"
}
```

### Output

Output should include:

```json
{
  "video_metadata": {},
  "detections_summary": {},
  "swing_phases": {},
  "ball_trajectory": {},
  "swing_speed": {},
  "form_scores": {},
  "issues": [],
  "ollama_feedback": {},
  "artifacts": {
    "annotated_video_path": "",
    "trajectory_plot_path": "",
    "json_report_path": ""
  }
}
```

## 11. Confidence and Fallback Design

Every metric must include confidence.

Examples:

- `high`
- `medium`
- `low`

or numeric `0-1`

Fallback rules:

- If bat not detected reliably, estimate swing speed from wrists and label as proxy
- If baseball disappears after few frames, report partial trajectory only
- If pose confidence is weak, suppress advanced form claims
- If calibration is missing, report relative rather than absolute speed when needed

The system must never present weak estimates as certain.

## 12. Calibration Strategy

Because physical speed requires converting pixels to distance, the system should support multiple calibration modes:

### Mode A: User-provided reference

Best option.  
Examples:

- known bat length
- known player height
- calibration stick/object

### Mode B: Anthropometric estimation

Use body proportions from pose.

### Mode C: Bat prior estimation

Assume standard bat size.

### Mode D: Relative metrics only

If absolute scale is too weak, report relative swing speed score and comparative frame velocity.

Each result must record which calibration mode was used.

## 13. Form Scoring Heuristics

V1 should use explicit heuristic scoring rather than black-box scoring.

Example categories:

### Head Stability

- Measure head displacement from stance to contact
- Penalize excessive forward or vertical drift

### Balance

- Track center-of-mass proxy relative to feet base
- Penalize unstable shift patterns

### Hip Rotation Timing

- Estimate pelvis rotation onset relative to hands and shoulders
- Penalize clearly late or early sequence

### Stride Control

- Measure stride distance normalized by leg length
- Penalize over-stride or inconsistent landing timing

### Hand Path

- Track wrists relative to torso
- Penalize casting or inefficient outward path

### Finish

- Evaluate whether hitter remains balanced in follow-through

Each score:

- `0 to 100` or `0.0 to 1.0`
- accompanied by textual rationale

## 14. Visual Outputs

The system should generate:

1. Annotated video with:
   - pose skeleton
   - ball path overlay
   - bat/bat proxy path
   - phase labels
   - speed readout

2. Static summary image(s):
   - stance frame
   - contact frame
   - follow-through frame

3. Charts:
   - bat speed over time
   - wrist speed over time
   - confidence over time

4. JSON report
5. Optional coach PDF later

## 15. CLI Requirements

Claude Code CLI implementation should expose a command like:

```bash
python main.py analyze --video /path/to/video.mp4 --output ./runs/run_001
```

Optional arguments:

- `--player-height`
- `--bat-length`
- `--handedness`
- `--camera-view`
- `--fast`
- `--no-ollama`
- `--model-config`
- `--export-video`

The CLI should:

- print progress by stage
- save logs
- save intermediate outputs when debug mode is enabled

## 16. API Requirements

Optional local API with endpoints:

### `POST /analyze`

Input: video + metadata  
Output: run id / immediate response

### `GET /runs/{id}`

Return structured analysis

### `GET /runs/{id}/artifacts`

Return paths or downloadable assets

This API must remain local-only by default.

## 17. Logging and Debuggability

The system should save:

- raw detections
- smoothed tracks
- pose confidence data
- event segmentation results
- calibration assumptions
- Ollama prompt/response logs
- error logs per module

Debug mode should help answer:

- why swing speed is low confidence
- whether bat was actually detected
- where trajectory tracking failed

## 18. Testing Requirements

The implementation should include:

### Unit Tests

- geometry utilities
- speed calculations
- smoothing functions
- phase segmentation logic
- schema validation

### Integration Tests

- end-to-end analysis on sample clips
- partial failure scenarios
- no-ball / no-bat cases
- low-light input cases

### Manual Validation Set

Create a small internal benchmark set with:

- side view swings
- front-angle swings
- tee work
- soft toss
- machine/live pitch if available

Track:

- ball detection success
- pose stability
- swing segmentation correctness
- qualitative usefulness of feedback

## 19. Risks and Constraints

### Main Risks

1. Baseball is small and blurred in consumer video
2. Bat is often hard to detect cleanly
3. Single-camera depth ambiguity limits true 3D metrics
4. Swing speed without calibration may be noisy
5. LLM hallucination risk if not constrained to structured metrics

### Mitigations

- Use small-object specialized tracking
- Prefer high FPS input
- Keep raw metric computation outside Ollama
- Add strict schema-based prompts
- Surface confidence and caveats everywhere

## 20. Success Criteria for V1

V1 is successful if it can, on decent consumer swing footage:

1. Detect hitter pose reliably across most frames
2. Track the baseball for a useful segment of the pitch/hit path in many clips
3. Produce a reasonable swing speed estimate with transparent confidence
4. Segment the swing into major phases
5. Generate useful, non-generic form feedback through Ollama
6. Export structured results and annotated media locally

## 21. V2 Expansion Paths

Future versions may include:

- multi-camera synchronization
- better 3D triangulation
- pitcher analysis
- exit velocity estimation with better calibration
- comparison against player baseline history
- team dashboard
- automatic drill library matching
- real-time analysis mode
- personalized coaching memory locally stored

## 22. Implementation Guidance for Claude Code CLI

Claude Code CLI should build this in phases, not all at once.

Recommended order:

### Phase 1

- video ingestion
- preprocessing
- pose estimation
- simple hitter-only analysis
- JSON export

### Phase 2

- baseball detection
- ball tracking
- path visualization

### Phase 3

- bat detection or wrist-based proxy
- swing event segmentation
- swing speed estimation

### Phase 4

- rule-based form scoring
- confidence system
- visualization polish

### Phase 5

- Ollama integration
- structured feedback generation
- CLI/report polishing

Claude should prioritize:

- correctness
- modularity
- inspectability
- graceful failure

It should avoid:

- giant monolithic scripts
- hidden assumptions
- LLM-driven raw metric computation
- hardcoded magic constants without explanation

## 23. Acceptance Criteria

The implementation is acceptable when:

- Running the CLI on a valid video completes without crashing
- A structured JSON report is produced
- Annotated output is produced for supported clips
- Swing speed estimate includes confidence and calibration source
- Form feedback is based on computed metrics, not generic LLM text
- Ollama can be disabled without breaking the rest of the pipeline
- Each module is independently testable

## 24. Final Engineering Principle

This project is a computer vision system first and an LLM system second.

Ollama should act as:

- interpreter
- explainer
- coach-language generator

Ollama should not act as:

- detector
- tracker
- physics engine
- biomechanics calculator

All measurable outputs must come from deterministic or model-based vision/math modules before Ollama is called.