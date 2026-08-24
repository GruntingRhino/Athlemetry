"""Automatic course-marker calibration for fixed-camera linear drills."""

from __future__ import annotations

from dataclasses import dataclass, replace
from math import hypot
from statistics import median
from typing import Dict, List, Optional, Set, Tuple

from .geometry import HomographyCalibration, estimate_homography
from .metrics import PoseSample

Point = Tuple[float, float]


@dataclass(frozen=True)
class CourseMarkers:
    start: Point
    finish: Point
    observations: int


@dataclass(frozen=True)
class MarkerCrossing:
    start_seconds: float
    finish_seconds: float
    elapsed_seconds: float
    confidence: float


@dataclass(frozen=True)
class PlanarMarkerObservation:
    width: int
    height: int
    centers: Dict[int, Point]


def detect_planar_markers(frame, allowed_ids: Optional[Set[int]] = None) -> Optional[PlanarMarkerObservation]:
    """Detect planar ArUco marker centers in pixel coordinates."""
    import cv2  # type: ignore[import-not-found]

    if frame is None or len(frame.shape) < 2:
        return None
    height, width = frame.shape[:2]
    if width <= 0 or height <= 0:
        return None
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    if hasattr(cv2.aruco, "ArucoDetector"):
        detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())
        corners, ids, _ = detector.detectMarkers(frame)
    else:
        corners, ids, _ = cv2.aruco.detectMarkers(frame, dictionary)
    if ids is None:
        return None
    centers: Dict[int, Point] = {}
    for marker_corners, marker_id in zip(corners, ids.flatten().tolist()):
        if allowed_ids is not None and marker_id not in allowed_ids:
            continue
        points = marker_corners.reshape(-1, 2)
        centers[marker_id] = (float(points[:, 0].mean()), float(points[:, 1].mean()))
    return PlanarMarkerObservation(width, height, centers) if centers else None


def estimate_planar_marker_homography(
    observations: List[PlanarMarkerObservation],
    world_points_by_id: Dict[int, Point],
    source: str,
    minimum_observations: int = 4,
    maximum_normalized_drift: float = 0.01,
) -> Optional[HomographyCalibration]:
    """Estimate a metric homography only from stable, repeatedly seen surveyed markers."""
    if len(observations) < minimum_observations or len(world_points_by_id) < 4:
        return None
    width, height = observations[0].width, observations[0].height
    if width <= 0 or height <= 0 or any(item.width != width or item.height != height for item in observations):
        return None
    stable_centers: Dict[int, Point] = {}
    marker_observation_counts: Dict[int, int] = {}
    for marker_id in world_points_by_id:
        points = [item.centers[marker_id] for item in observations if marker_id in item.centers]
        if len(points) < minimum_observations:
            continue
        center = (median(point[0] for point in points), median(point[1] for point in points))
        if any(
            hypot((point[0] - center[0]) / width, (point[1] - center[1]) / height) > maximum_normalized_drift
            for point in points
        ):
            return None
        stable_centers[marker_id] = center
        marker_observation_counts[marker_id] = len(points)
    marker_ids = sorted(stable_centers)
    if len(marker_ids) < 4:
        return None
    calibration = estimate_homography(
        [stable_centers[marker_id] for marker_id in marker_ids],
        [world_points_by_id[marker_id] for marker_id in marker_ids],
        source,
    )
    if calibration is None:
        return None
    observation_confidence = min(1.0, min(marker_observation_counts.values()) / 8.0)
    return replace(calibration, confidence=min(calibration.confidence, observation_confidence))


def aggregate_course_markers(observations: List[CourseMarkers]) -> Optional[CourseMarkers]:
    """Combine repeated detections only when a fixed camera kept markers stable."""
    if len(observations) < 4:
        return None
    start = (
        median(item.start[0] for item in observations),
        median(item.start[1] for item in observations),
    )
    finish = (
        median(item.finish[0] for item in observations),
        median(item.finish[1] for item in observations),
    )
    if any(
        hypot(item.start[0] - start[0], item.start[1] - start[1]) > 0.03
        or hypot(item.finish[0] - finish[0], item.finish[1] - finish[1]) > 0.03
        for item in observations
    ):
        return None
    return CourseMarkers(start=start, finish=finish, observations=len(observations))


def detect_course_markers(frame) -> Optional[CourseMarkers]:
    """Detect DICT_4X4_50 marker 0 (start) and marker 1 (finish)."""
    import cv2  # type: ignore[import-not-found]

    if frame is None or len(frame.shape) < 2:
        return None
    height, width = frame.shape[:2]
    if width <= 0 or height <= 0:
        return None

    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    if hasattr(cv2.aruco, "ArucoDetector"):
        detector = cv2.aruco.ArucoDetector(dictionary, cv2.aruco.DetectorParameters())
        corners, ids, _ = detector.detectMarkers(frame)
    else:
        corners, ids, _ = cv2.aruco.detectMarkers(frame, dictionary)
    if ids is None:
        return None

    centers = {}
    for marker_corners, marker_id in zip(corners, ids.flatten().tolist()):
        if marker_id not in (0, 1):
            continue
        points = marker_corners.reshape(-1, 2)
        centers[marker_id] = (
            float(points[:, 0].mean()) / width,
            float(points[:, 1].mean()) / height,
        )
    if 0 not in centers or 1 not in centers:
        return None
    start = centers[0]
    finish = centers[1]
    if abs(finish[0] - start[0]) < 0.05 and abs(finish[1] - start[1]) < 0.05:
        return None
    return CourseMarkers(start=start, finish=finish, observations=1)


def _crossing_time(samples: List[Tuple[float, float]], threshold: float) -> Optional[float]:
    for (previous_time, previous), (current_time, current) in zip(samples, samples[1:]):
        if previous <= threshold <= current and current > previous:
            fraction = (threshold - previous) / (current - previous)
            return previous_time + fraction * (current_time - previous_time)
    return None


def estimate_marker_crossing(samples: List[PoseSample], markers: CourseMarkers) -> Optional[MarkerCrossing]:
    """Interpolate when the tracked hip center crosses start and finish markers."""
    delta_x = markers.finish[0] - markers.start[0]
    delta_y = markers.finish[1] - markers.start[1]
    horizontal = abs(delta_x) >= abs(delta_y)
    denominator = delta_x if horizontal else delta_y
    if abs(denominator) < 0.05:
        return None

    projected: List[Tuple[float, float]] = []
    for sample in samples:
        hip = sample.landmarks.get("hip_center")
        if hip is None:
            continue
        coordinate = hip[0] if horizontal else hip[1]
        origin = markers.start[0] if horizontal else markers.start[1]
        projected.append((sample.timestamp_seconds, (coordinate - origin) / denominator))
    if len(projected) < 4:
        return None

    start_seconds = _crossing_time(projected, 0.0)
    finish_seconds = _crossing_time(projected, 1.0)
    if start_seconds is None or finish_seconds is None or finish_seconds <= start_seconds:
        return None
    elapsed = finish_seconds - start_seconds
    if elapsed < 0.2:
        return None
    return MarkerCrossing(
        start_seconds=round(start_seconds, 6),
        finish_seconds=round(finish_seconds, 6),
        elapsed_seconds=round(elapsed, 6),
        confidence=round(min(1.0, markers.observations / 8.0), 3),
    )
