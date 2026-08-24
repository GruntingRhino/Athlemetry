"""Deterministic, non-destructive video-frame normalization utilities."""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import List, Optional, Tuple

import cv2
import numpy as np


@dataclass(frozen=True)
class LensCalibration:
    camera_matrix: np.ndarray
    distortion_coefficients: np.ndarray


@dataclass
class NormalizationEvidence:
    source_width: int
    source_height: int
    source_fps: float
    rotation_degrees: int
    target_width: int
    target_height: int
    variable_frame_rate: bool = False
    observed_frame_intervals_ms: List[float] = field(default_factory=list)
    stabilization_applied_frames: int = 0
    lens_correction_applied: bool = False
    limitations: List[str] = field(default_factory=list)


class FrameNormalizer:
    """Normalizes orientation, color, size, lens distortion, and mild camera shake.

    Frame timestamps remain those reported by the decoder. This avoids treating a
    variable-frame-rate clip as constant-rate timing evidence.
    """

    def __init__(
        self,
        source_width: int,
        source_height: int,
        source_fps: float,
        rotation_degrees: int = 0,
        max_dimension: int = 1280,
        stabilize: bool = True,
        lens_calibration: Optional[LensCalibration] = None,
    ):
        if rotation_degrees not in (0, 90, 180, 270):
            raise ValueError("rotation_degrees must be 0, 90, 180, or 270")
        if source_width <= 0 or source_height <= 0:
            raise ValueError("source dimensions must be positive")
        rotated_width, rotated_height = ((source_height, source_width) if rotation_degrees in (90, 270) else (source_width, source_height))
        scale = min(1.0, max_dimension / max(rotated_width, rotated_height))
        self.target_size = (max(1, round(rotated_width * scale)), max(1, round(rotated_height * scale)))
        self.rotation_degrees = rotation_degrees
        self.source_width = source_width
        self.source_height = source_height
        self.stabilize = stabilize
        self.lens_calibration = lens_calibration
        self.evidence = NormalizationEvidence(
            source_width, source_height, source_fps, rotation_degrees,
            self.target_size[0], self.target_size[1],
            lens_correction_applied=lens_calibration is not None,
        )
        if lens_calibration is None:
            self.evidence.limitations.append("lens-calibration-unavailable")
        self._previous_timestamp_ms: Optional[float] = None

    def observe_timestamp(self, timestamp_ms: float) -> None:
        if not np.isfinite(timestamp_ms) or timestamp_ms < 0:
            if "decoder-timestamp-unavailable" not in self.evidence.limitations:
                self.evidence.limitations.append("decoder-timestamp-unavailable")
            return
        if self._previous_timestamp_ms is not None and timestamp_ms > self._previous_timestamp_ms:
            self.evidence.observed_frame_intervals_ms.append(timestamp_ms - self._previous_timestamp_ms)
        self._previous_timestamp_ms = timestamp_ms
        intervals = self.evidence.observed_frame_intervals_ms
        if len(intervals) >= 5:
            median_interval = float(np.median(intervals))
            if median_interval > 0:
                p90_deviation = float(np.percentile(np.abs(np.asarray(intervals) - median_interval), 90))
                self.evidence.variable_frame_rate = p90_deviation / median_interval > 0.08

    def normalize(self, frame: np.ndarray) -> np.ndarray:
        if frame.ndim == 2:
            frame = cv2.cvtColor(frame, cv2.COLOR_GRAY2BGR)
        elif frame.ndim != 3 or frame.shape[2] not in (3, 4):
            raise ValueError("unsupported decoded frame format")
        if frame.shape[2] == 4:
            frame = cv2.cvtColor(frame, cv2.COLOR_BGRA2BGR)
        if self.lens_calibration is not None:
            frame = cv2.undistort(frame, self.lens_calibration.camera_matrix, self.lens_calibration.distortion_coefficients)
        if self.rotation_degrees == 90:
            frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
        elif self.rotation_degrees == 180:
            frame = cv2.rotate(frame, cv2.ROTATE_180)
        elif self.rotation_degrees == 270:
            frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
        if (frame.shape[1], frame.shape[0]) != self.target_size:
            frame = cv2.resize(frame, self.target_size, interpolation=cv2.INTER_AREA)
        frame = np.ascontiguousarray(frame, dtype=np.uint8)
        return frame

    def normalize_points(self, normalized_source_points: List[Tuple[float, float]]) -> List[Tuple[float, float]]:
        """Map raw normalized image points into normalized output coordinates."""
        if not normalized_source_points:
            return []
        points = np.asarray(
            [[point[0] * self.source_width, point[1] * self.source_height] for point in normalized_source_points],
            dtype=np.float64,
        ).reshape(-1, 1, 2)
        if not np.isfinite(points).all() or np.any(points < 0):
            raise ValueError("calibration points must be finite normalized coordinates")
        if self.lens_calibration is not None:
            points = cv2.undistortPoints(
                points,
                self.lens_calibration.camera_matrix,
                self.lens_calibration.distortion_coefficients,
                P=self.lens_calibration.camera_matrix,
            )
        values = points.reshape(-1, 2)
        transformed = []
        rotated_width, rotated_height = self.source_width, self.source_height
        for x, y in values:
            if self.rotation_degrees == 90:
                x, y = self.source_height - 1.0 - y, x
                rotated_width, rotated_height = self.source_height, self.source_width
            elif self.rotation_degrees == 180:
                x, y = self.source_width - 1.0 - x, self.source_height - 1.0 - y
            elif self.rotation_degrees == 270:
                x, y = y, self.source_width - 1.0 - x
                rotated_width, rotated_height = self.source_height, self.source_width
            transformed.append((float(x / rotated_width), float(y / rotated_height)))
        if any(x < -0.05 or x > 1.05 or y < -0.05 or y > 1.05 for x, y in transformed):
            raise ValueError("normalized calibration points fall outside the corrected image")
        return transformed


def stabilize_pair(previous_frame: np.ndarray, current_frame: np.ndarray) -> Tuple[np.ndarray, bool]:
    previous_gray = cv2.cvtColor(previous_frame, cv2.COLOR_BGR2GRAY)
    current_gray = cv2.cvtColor(current_frame, cv2.COLOR_BGR2GRAY)
    points = cv2.goodFeaturesToTrack(previous_gray, maxCorners=150, qualityLevel=0.02, minDistance=10)
    if points is None or len(points) < 12:
        return current_frame, False
    tracked, status, _ = cv2.calcOpticalFlowPyrLK(previous_gray, current_gray, points, None)  # type: ignore[call-overload]
    if tracked is None or status is None:
        return current_frame, False
    mask = status.reshape(-1) == 1
    if int(mask.sum()) < 10:
        return current_frame, False
    transform, inliers = cv2.estimateAffinePartial2D(tracked[mask], points[mask], method=cv2.RANSAC, ransacReprojThreshold=2.0)
    if transform is None or inliers is None or int(inliers.sum()) < 8:
        return current_frame, False
    translation = float(np.hypot(transform[0, 2], transform[1, 2]))
    rotation_scale = transform[:, :2]
    if translation > max(current_frame.shape[:2]) * 0.08 or abs(float(np.linalg.det(rotation_scale)) - 1.0) > 0.15:
        return current_frame, False
    stabilized = cv2.warpAffine(current_frame, transform, (current_frame.shape[1], current_frame.shape[0]), borderMode=cv2.BORDER_REFLECT)
    return stabilized, True


def capture_rotation_degrees(capture: cv2.VideoCapture) -> int:
    property_id = getattr(cv2, "CAP_PROP_ORIENTATION_META", None)
    if property_id is None:
        return 0
    value = int(round(capture.get(property_id) or 0)) % 360
    return value if value in (0, 90, 180, 270) else 0


def disable_decoder_auto_rotation(capture: cv2.VideoCapture) -> bool:
    """Ensure orientation metadata is applied once by FrameNormalizer."""
    property_id = getattr(cv2, "CAP_PROP_ORIENTATION_AUTO", None)
    if property_id is None:
        return False
    return bool(capture.set(property_id, 0))
