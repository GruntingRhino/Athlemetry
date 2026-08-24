"""Planar calibration and physically scaled trajectory utilities."""
from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from typing import Iterable, Optional, Sequence, Tuple

import cv2
import numpy as np

Point = Tuple[float, float]


@dataclass(frozen=True)
class HomographyCalibration:
    matrix: np.ndarray
    inlier_count: int
    correspondence_count: int
    median_reprojection_error_pixels: float
    source: str
    confidence: float

    def project(self, point: Point) -> Point:
        source = np.asarray([[[point[0], point[1]]]], dtype=np.float64)
        projected = cv2.perspectiveTransform(source, self.matrix)[0, 0]
        return (float(projected[0]), float(projected[1]))


@dataclass(frozen=True)
class PhysicalTrajectory:
    points: Tuple[Tuple[float, float, float], ...]
    speed_mps: Optional[float]
    peak_speed_mps: Optional[float]
    confidence: float
    limitations: Tuple[str, ...]


def estimate_homography(
    image_points: Sequence[Point],
    world_points_meters: Sequence[Point],
    source: str,
    maximum_reprojection_error_pixels: float = 4.0,
) -> Optional[HomographyCalibration]:
    if len(image_points) != len(world_points_meters) or len(image_points) < 4:
        return None
    image = np.asarray(image_points, dtype=np.float64)
    world = np.asarray(world_points_meters, dtype=np.float64)
    if not np.isfinite(image).all() or not np.isfinite(world).all():
        return None
    if abs(float(cv2.contourArea(image.astype(np.float32)))) < 25.0:
        return None
    if abs(float(cv2.contourArea(world.astype(np.float32)))) < 0.01:
        return None
    world_to_image, mask = cv2.findHomography(world, image, cv2.RANSAC, maximum_reprojection_error_pixels)
    if world_to_image is None or mask is None or not np.isfinite(world_to_image).all():
        return None
    try:
        matrix = np.linalg.inv(world_to_image)
    except np.linalg.LinAlgError:
        return None
    if abs(float(np.linalg.det(matrix))) < 1e-10 or float(np.linalg.cond(matrix)) > 1e6:
        return None
    inliers = mask.reshape(-1).astype(bool)
    inlier_count = int(inliers.sum())
    if inlier_count < 4 or inlier_count / len(image_points) < 0.75:
        return None
    reconstructed = cv2.perspectiveTransform(world.reshape(-1, 1, 2), world_to_image).reshape(-1, 2)
    errors = np.linalg.norm(reconstructed - image, axis=1)
    median_error = float(np.median(errors[inliers]))
    if not np.isfinite(median_error) or median_error > maximum_reprojection_error_pixels:
        return None
    confidence = max(0.0, min(1.0, (inlier_count / len(image_points)) * (1.0 - median_error / (maximum_reprojection_error_pixels * 2.0))))
    return HomographyCalibration(matrix, inlier_count, len(image_points), median_error, source, confidence)


def physical_trajectory(
    samples: Iterable[Tuple[float, float, float]],
    calibration: Optional[HomographyCalibration],
    minimum_confidence: float = 0.60,
) -> PhysicalTrajectory:
    if calibration is None or calibration.confidence < minimum_confidence:
        return PhysicalTrajectory((), None, None, 0.0, ("dimensional-calibration-unavailable",))
    projected = []
    for timestamp, x, y in samples:
        if not np.isfinite([timestamp, x, y]).all():
            continue
        world_x, world_y = calibration.project((x, y))
        projected.append((float(timestamp), world_x, world_y))
    if len(projected) < 3:
        return PhysicalTrajectory(tuple(projected), None, None, calibration.confidence, ("trajectory-observations-insufficient",))
    speeds = []
    for first, second in zip(projected, projected[1:]):
        elapsed = second[0] - first[0]
        if elapsed <= 0:
            continue
        speeds.append(hypot(second[1] - first[1], second[2] - first[2]) / elapsed)
    if len(speeds) < 2:
        return PhysicalTrajectory(tuple(projected), None, None, calibration.confidence, ("trajectory-timing-insufficient",))
    # Median suppresses isolated detector jumps; peak is a p90 rather than a raw maximum.
    return PhysicalTrajectory(
        tuple(projected), float(np.median(speeds)), float(np.percentile(speeds, 90)),
        calibration.confidence, (),
    )
