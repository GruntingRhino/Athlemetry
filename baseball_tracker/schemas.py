"""
Pydantic schemas for all pipeline inputs and outputs.

Every major output includes:
  - A 'confidence' field (float 0–1 or str high/medium/low)
  - An 'estimation_method' field explaining how it was derived
  - Nullable fields when a module fails partially

Design principle: structured outputs first, Ollama last.
"""

from __future__ import annotations
from typing import Optional, List, Tuple, Dict, Any, Literal
from pydantic import BaseModel, Field


# ---------------------------------------------------------------------------
# Input
# ---------------------------------------------------------------------------

class AnalysisInput(BaseModel):
    """User-supplied input for a single analysis run."""

    video_path: str = Field(..., description="Absolute or relative path to the video file")
    player_height_inches: Optional[float] = Field(
        default=None,
        description="Player height for scale calibration",
    )
    bat_length_inches: Optional[float] = Field(
        default=None,
        description="Bat length for scale calibration",
    )
    handedness: Optional[Literal["left", "right"]] = Field(
        default=None,
        description="Batter handedness",
    )
    camera_view: Optional[Literal["side", "front", "angled", "unknown"]] = Field(
        default="unknown",
    )
    calibration_reference: Optional[str] = Field(
        default=None,
        description="Description of any known-size calibration object in frame",
    )
    analysis_mode: Literal["full", "fast", "pose_only"] = Field(default="full")
    player_id: Optional[str] = Field(default=None)


# ---------------------------------------------------------------------------
# Video metadata
# ---------------------------------------------------------------------------

class VideoMetadata(BaseModel):
    fps: float
    width: int
    height: int
    total_frames: int
    duration_seconds: float
    codec: Optional[str] = None
    orientation: Optional[str] = None
    source_path: str


# ---------------------------------------------------------------------------
# Detection outputs
# ---------------------------------------------------------------------------

class BoundingBox(BaseModel):
    """Bounding box in pixel coordinates."""
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float

    @property
    def center(self) -> Tuple[float, float]:
        return ((self.x1 + self.x2) / 2, (self.y1 + self.y2) / 2)

    @property
    def area(self) -> float:
        return max(0, self.x2 - self.x1) * max(0, self.y2 - self.y1)


class FrameDetection(BaseModel):
    """Detections for a single frame."""
    frame_idx: int
    timestamp_sec: float
    baseball: Optional[BoundingBox] = None
    batter: Optional[BoundingBox] = None
    bat: Optional[BoundingBox] = None


class DetectionSummary(BaseModel):
    """Aggregate detection quality across the video."""
    baseball_detected_frames: int
    batter_detected_frames: int
    bat_detected_frames: int
    total_frames: int
    baseball_detection_rate: float  # 0–1
    batter_detection_rate: float
    bat_detection_rate: float
    notes: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Pose estimation
# ---------------------------------------------------------------------------

class PoseLandmark(BaseModel):
    """Single pose landmark."""
    name: str
    x: float   # pixel coordinate
    y: float
    z: Optional[float] = None  # depth (mediapipe provides this but is approximate)
    visibility: float = 1.0    # 0–1 confidence/visibility


class FramePose(BaseModel):
    """Pose estimate for a single frame."""
    frame_idx: int
    timestamp_sec: float
    landmarks: Dict[str, PoseLandmark]
    overall_confidence: float


# ---------------------------------------------------------------------------
# Tracking
# ---------------------------------------------------------------------------

class TrackPoint(BaseModel):
    """Single point on a tracked trajectory."""
    frame_idx: int
    timestamp_sec: float
    x: float
    y: float
    confidence: float
    interpolated: bool = False


class BallTrajectory(BaseModel):
    """Full ball trajectory through the clip."""
    points: List[TrackPoint]
    smoothed_points: List[TrackPoint]
    tracking_method: str = Field(
        description="e.g. 'yolo+kalman', 'optical_flow_fallback', 'partial'"
    )
    confidence: float
    notes: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Pitch analysis
# ---------------------------------------------------------------------------

class PitchAnalysis(BaseModel):
    """Conservative pitcher/pitch movement analysis from smartphone footage."""

    estimated_release_frame: Optional[int] = None
    estimated_release_point: Optional[TrackPoint] = None
    release_speed_px_per_frame: Optional[float] = None
    horizontal_break_px: Optional[float] = None
    vertical_break_px: Optional[float] = None
    total_movement_px: Optional[float] = None
    max_curve_px: Optional[float] = None
    approach_angle_deg: Optional[float] = None
    estimated_spin_rpm: Optional[float] = None
    spin_rpm_band: Optional[Tuple[float, float]] = None
    capture_assessment: str = "unknown"
    confidence: float = 0.0
    pitch_type_hint: Optional[str] = None
    notes: List[str] = Field(default_factory=list)
    limitations: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Swing event segmentation
# ---------------------------------------------------------------------------

SwingPhaseLabel = Literal[
    "stance", "load", "stride", "initiation", "contact_zone", "follow_through", "finish"
]


class SwingPhase(BaseModel):
    label: SwingPhaseLabel
    start_frame: int
    end_frame: int
    start_time_sec: float
    end_time_sec: float
    confidence: float


class SwingEventSegmentation(BaseModel):
    phases: List[SwingPhase]
    likely_contact_frame: Optional[int] = None
    likely_contact_time_sec: Optional[float] = None
    segmentation_method: str
    confidence: float
    notes: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Swing speed
# ---------------------------------------------------------------------------

CalibrationMode = Literal[
    "user_bat_length",
    "user_player_height",
    "anthropometric_estimation",
    "bat_prior",
    "relative_only",
]


class SwingSpeed(BaseModel):
    """
    IMPORTANT: This is an ESTIMATE from video, not a certified measurement.
    Actual bat speed should be verified with dedicated hardware (radar, sensor).
    """
    peak_speed_mph: Optional[float] = Field(
        default=None,
        description="Estimated peak bat barrel speed in mph. APPROXIMATE.",
    )
    average_speed_mph: Optional[float] = Field(
        default=None,
        description="Average speed during the swing window. APPROXIMATE.",
    )
    confidence: float = Field(
        description="Confidence in the speed estimate (0–1)"
    )
    confidence_band_mph: Optional[Tuple[float, float]] = Field(
        default=None,
        description="Plausible range [low, high] for peak speed",
    )
    calibration_mode: CalibrationMode
    pixels_per_inch: Optional[float] = None
    estimation_method: str = Field(
        description="Describes how speed was derived (wrist proxy, direct bat, etc.)"
    )
    is_estimate: bool = True  # Always True – surfaced so consumers can't miss it


# ---------------------------------------------------------------------------
# Form scoring
# ---------------------------------------------------------------------------

class FormMetric(BaseModel):
    """A single form evaluation metric."""
    name: str
    score: float = Field(description="0.0 (poor) to 1.0 (excellent)")
    confidence: float
    rationale: str
    issues: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)


class FormScores(BaseModel):
    head_stability: Optional[FormMetric] = None
    stance_balance: Optional[FormMetric] = None
    hip_rotation_timing: Optional[FormMetric] = None
    stride_control: Optional[FormMetric] = None
    hand_path_efficiency: Optional[FormMetric] = None
    rear_elbow: Optional[FormMetric] = None
    front_side_stability: Optional[FormMetric] = None
    rotational_sequencing: Optional[FormMetric] = None
    posture_maintenance: Optional[FormMetric] = None
    follow_through_balance: Optional[FormMetric] = None
    overall_score: Optional[float] = None
    overall_confidence: float = 0.0
    issues: List[str] = Field(default_factory=list)
    suggestions: List[str] = Field(default_factory=list)


# ---------------------------------------------------------------------------
# Ollama coaching feedback
# ---------------------------------------------------------------------------

class OllamaFeedback(BaseModel):
    """Structured coaching feedback generated by the local Ollama model."""
    summary: str
    mechanical_strengths: List[str]
    mechanical_weaknesses: List[str]
    top_3_priorities: List[str]
    suggested_drills: List[str]
    confidence_caveats: List[str]
    raw_response: Optional[str] = None
    model_used: Optional[str] = None
    generation_time_sec: Optional[float] = None


# ---------------------------------------------------------------------------
# Final output
# ---------------------------------------------------------------------------

class ArtifactPaths(BaseModel):
    annotated_video_path: Optional[str] = None
    trajectory_plot_path: Optional[str] = None
    speed_chart_path: Optional[str] = None
    json_report_path: Optional[str] = None
    csv_summary_path: Optional[str] = None
    debug_dir: Optional[str] = None


class AnalysisResult(BaseModel):
    """Complete analysis output for one swing video."""
    run_id: str
    input: AnalysisInput
    video_metadata: Optional[VideoMetadata] = None
    detections_summary: Optional[DetectionSummary] = None
    swing_phases: Optional[SwingEventSegmentation] = None
    ball_trajectory: Optional[BallTrajectory] = None
    pitch_analysis: Optional[PitchAnalysis] = None
    swing_speed: Optional[SwingSpeed] = None
    form_scores: Optional[FormScores] = None
    ollama_feedback: Optional[OllamaFeedback] = None
    artifacts: ArtifactPaths = Field(default_factory=ArtifactPaths)

    # Per-module status – allows partial results
    module_status: Dict[str, Literal["ok", "partial", "failed", "skipped"]] = Field(
        default_factory=dict
    )
    module_errors: Dict[str, str] = Field(default_factory=dict)
    pipeline_duration_sec: Optional[float] = None
