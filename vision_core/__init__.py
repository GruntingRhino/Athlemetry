"""Athlemetry shared computer-vision analysis core."""

from .geometry import HomographyCalibration, PhysicalTrajectory, estimate_homography, physical_trajectory
from .metrics import PerformanceAnalysis, PhysicalObjectMeasurement, PoseSample, analyze_pose_sequence
from .normalization import FrameNormalizer, LensCalibration, NormalizationEvidence
from .objects import (
    ObjectDetection,
    ObjectEvidence,
    ObjectTrack,
    ObjectTracker,
    SportObjectClass,
    SportObjectDetector,
    best_reliable_evidence,
    canonical_object_label,
    compute_object_evidence,
)
from .recognition import RecognitionResult, RecognitionStatus, recognize_sport_and_drill
from .reid import AthleteAppearance, AthleteReIdentifier, AthleteTrack, ReIDEvidence, extract_appearance
from .segmentation import AttemptSegment, SegmentationResult, segment_drill_attempts

__all__ = [
    "AthleteAppearance",
    "AthleteReIdentifier",
    "AthleteTrack",
    "AttemptSegment",
    "FrameNormalizer",
    "HomographyCalibration",
    "LensCalibration",
    "NormalizationEvidence",
    "ObjectDetection",
    "ObjectEvidence",
    "ObjectTrack",
    "ObjectTracker",
    "PerformanceAnalysis",
    "PhysicalObjectMeasurement",
    "PhysicalTrajectory",
    "PoseSample",
    "ReIDEvidence",
    "RecognitionResult",
    "RecognitionStatus",
    "SegmentationResult",
    "SportObjectClass",
    "SportObjectDetector",
    "analyze_pose_sequence",
    "best_reliable_evidence",
    "canonical_object_label",
    "compute_object_evidence",
    "estimate_homography",
    "extract_appearance",
    "physical_trajectory",
    "recognize_sport_and_drill",
    "segment_drill_attempts",
]
