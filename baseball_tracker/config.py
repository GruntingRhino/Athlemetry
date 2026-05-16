"""
Configuration management for the Baseball Vision Tracker.
All tuneable constants are centralised here with explanations.
"""

from __future__ import annotations
import os
from pathlib import Path
from pydantic import BaseModel, Field
from typing import Literal, Optional


class DetectorConfig(BaseModel):
    """Configuration for object detection models."""

    # YOLO model path – can be a HuggingFace model ID or local .pt file
    yolo_model: str = Field(
        default="yolov8n.pt",
        description="YOLO model to use for general detection (batter, bat)",
    )
    # A specialised small-object model for baseball; falls back to yolo_model if None
    baseball_model: Optional[str] = Field(
        default=None,
        description="Optional dedicated model for small-object baseball detection",
    )
    detection_confidence: float = Field(
        default=0.35,
        description="Minimum detection confidence threshold (0–1)",
    )
    # IOU threshold for NMS
    iou_threshold: float = Field(default=0.45, description="NMS IoU threshold")
    # Run every Nth frame to trade speed for accuracy
    detection_stride: int = Field(
        default=1,
        description="Run detection on every Nth frame (1 = every frame)",
    )


class PoseConfig(BaseModel):
    """Configuration for pose estimation."""

    backend: Literal["mediapipe", "movenet", "yolo_pose", "none"] = Field(
        default="mediapipe",
        description="Pose estimation backend to use",
    )
    min_detection_confidence: float = Field(default=0.5)
    min_tracking_confidence: float = Field(default=0.5)
    # Landmark smoothing window (frames)
    smoothing_window: int = Field(
        default=5,
        description="Rolling window size for landmark temporal smoothing",
    )


class TrackingConfig(BaseModel):
    """Configuration for object tracking."""

    # Kalman process noise – higher → more reactive to detections
    # Ball tracking specific
    ball_process_noise: float = Field(
        default=1.0,
        description=(
            "Kalman filter process noise for ball tracker. "
            "Higher = more responsive; lower = smoother"
        ),
    )
    ball_measurement_noise: float = Field(default=5.0)
    # Maximum number of frames to interpolate a missing ball
    max_ball_gap_frames: int = Field(
        default=8,
        description="Maximum frame gap over which ball track is interpolated",
    )
    # Optical flow params
    use_optical_flow_fallback: bool = Field(
        default=True,
        description="Use optical flow to refine ball position when detector misses",
    )


class MetricConfig(BaseModel):
    """Configuration for metric computation."""

    # Assumed bat length in inches when no calibration is provided
    default_bat_length_inches: float = Field(
        default=33.0,
        description=(
            "Default bat length prior (inches) used when no calibration is supplied. "
            "Standard wood: 33–34 in, aluminium youth: 28–32 in"
        ),
    )
    # Frames-per-second assumed when metadata extraction fails
    fallback_fps: float = Field(default=30.0)
    # Minimum bat-speed estimate to be considered valid (mph)
    min_plausible_bat_speed_mph: float = Field(
        default=20.0,
        description="Speeds below this are flagged as implausible",
    )
    max_plausible_bat_speed_mph: float = Field(
        default=120.0,
        description="Speeds above this are flagged as implausible",
    )


class ScoringConfig(BaseModel):
    """Weights and thresholds for form scoring heuristics."""

    # Pixel threshold for head drift (normalised to frame height %)
    head_drift_threshold_pct: float = Field(
        default=0.04,
        description=(
            "Head vertical/horizontal drift > this fraction of frame height "
            "triggers a head-stability penalty"
        ),
    )
    # Minimum hip-rotation-lead over shoulders (degrees) for a good sequence
    hip_lead_min_degrees: float = Field(
        default=10.0,
        description=(
            "Hips should rotate at least this many degrees before shoulders "
            "for proper kinetic sequence"
        ),
    )
    # Stride length target: 70–100 % of batter leg length is ideal
    stride_length_target_min_pct: float = Field(default=0.70)
    stride_length_target_max_pct: float = Field(default=1.00)


class OllamaConfig(BaseModel):
    """Ollama local LLM integration settings."""

    host: str = Field(
        default="http://localhost:11434",
        description="Base URL of the local Ollama instance",
    )
    model: str = Field(
        default="llama3",
        description="Ollama model tag to use for coaching feedback",
    )
    timeout_seconds: int = Field(default=120)
    # Temperature; lower = more deterministic coaching responses
    temperature: float = Field(default=0.2)
    max_tokens: int = Field(default=1024)


class AnalysisConfig(BaseModel):
    """Top-level analysis configuration."""

    detector: DetectorConfig = Field(default_factory=DetectorConfig)
    pose: PoseConfig = Field(default_factory=PoseConfig)
    tracking: TrackingConfig = Field(default_factory=TrackingConfig)
    metrics: MetricConfig = Field(default_factory=MetricConfig)
    scoring: ScoringConfig = Field(default_factory=ScoringConfig)
    ollama: OllamaConfig = Field(default_factory=OllamaConfig)

    # Fast mode: skip expensive modules
    fast_mode: bool = Field(
        default=False,
        description=(
            "Enable fast mode: skip optical flow, reduce resolution, "
            "skip Ollama feedback"
        ),
    )
    enable_ollama: bool = Field(
        default=True,
        description="Set to False to skip LLM feedback generation entirely",
    )
    debug: bool = Field(
        default=False,
        description="Save intermediate outputs for debugging",
    )
    export_video: bool = Field(
        default=True,
        description="Render and save an annotated output video",
    )

    @classmethod
    def from_env(cls) -> "AnalysisConfig":
        """Load config, overriding fields from environment variables."""
        cfg = cls()
        if host := os.getenv("OLLAMA_HOST"):
            cfg.ollama.host = host
        if model := os.getenv("OLLAMA_MODEL"):
            cfg.ollama.model = model
        return cfg

    @classmethod
    def from_file(cls, path: str | Path) -> "AnalysisConfig":
        """Load config from a JSON file."""
        import json
        data = json.loads(Path(path).read_text())
        return cls.model_validate(data)


# Singleton default config – modules import this when no config is passed
DEFAULT_CONFIG = AnalysisConfig()
