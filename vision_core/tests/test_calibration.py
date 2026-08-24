import cv2
import numpy as np
import pytest

from vision_core.calibration import (
    CourseMarkers,
    aggregate_course_markers,
    detect_planar_markers,
    detect_course_markers,
    estimate_planar_marker_homography,
    estimate_marker_crossing,
)
from vision_core.metrics import PoseSample


def pose(timestamp: float, x: float) -> PoseSample:
    return PoseSample(
        frame_index=round(timestamp * 10),
        timestamp_seconds=timestamp,
        confidence=0.9,
        landmarks={"hip_center": (x, 0.5)},
    )


def test_detects_standard_start_and_finish_aruco_markers():
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    canvas = np.full((400, 800, 3), 255, dtype=np.uint8)
    canvas[100:300, 50:250] = cv2.cvtColor(cv2.aruco.generateImageMarker(dictionary, 0, 200), cv2.COLOR_GRAY2BGR)
    canvas[100:300, 550:750] = cv2.cvtColor(cv2.aruco.generateImageMarker(dictionary, 1, 200), cv2.COLOR_GRAY2BGR)

    markers = detect_course_markers(canvas)

    assert markers is not None
    assert markers.start == pytest.approx((0.187, 0.499), abs=0.002)
    assert markers.finish == pytest.approx((0.812, 0.499), abs=0.002)


def test_interpolates_elapsed_time_between_marker_crossings():
    samples = [pose(0, 0.0), pose(1, 0.2), pose(2, 0.5), pose(3, 0.8), pose(4, 1.0)]
    markers = CourseMarkers(start=(0.2, 0.8), finish=(0.8, 0.8), observations=8)

    crossing = estimate_marker_crossing(samples, markers)

    assert crossing is not None
    assert crossing.start_seconds == 1.0
    assert crossing.finish_seconds == 3.0
    assert crossing.elapsed_seconds == 2.0
    assert crossing.confidence == 1.0


def test_rejects_track_that_does_not_cross_both_markers():
    samples = [pose(0, 0.3), pose(1, 0.5), pose(2, 0.7)]

    assert estimate_marker_crossing(
        samples,
        CourseMarkers(start=(0.2, 0.8), finish=(0.8, 0.8), observations=4),
    ) is None


def test_aggregates_stable_marker_observations_and_rejects_camera_motion():
    stable = [
        CourseMarkers(start=(0.2 + offset, 0.8), finish=(0.8 + offset, 0.8), observations=1)
        for offset in (0.0, 0.002, -0.002, 0.001)
    ]
    aggregated = aggregate_course_markers(stable)
    assert aggregated is not None
    assert aggregated.observations == 4

    moving = stable + [CourseMarkers(start=(0.4, 0.8), finish=(1.0, 0.8), observations=1)]
    assert aggregate_course_markers(moving) is None


def test_planar_marker_layout_recovers_metric_homography_and_rejects_motion():
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    canvas = np.full((600, 800, 3), 255, dtype=np.uint8)
    placements = {
        10: (100, 100),
        11: (600, 100),
        12: (600, 400),
        13: (100, 400),
    }
    for marker_id, (left, top) in placements.items():
        marker = cv2.aruco.generateImageMarker(dictionary, marker_id, 100)
        canvas[top:top + 100, left:left + 100] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
    detected = detect_planar_markers(canvas, allowed_ids={10, 11, 12, 13})
    assert detected is not None
    calibration = estimate_planar_marker_homography(
        [detected, detected, detected, detected],
        {10: (0.0, 0.0), 11: (10.0, 0.0), 12: (10.0, 5.0), 13: (0.0, 5.0)},
        source="verified-planar-marker-layout-v1",
    )
    assert calibration is not None
    assert calibration.project(detected.centers[12]) == pytest.approx((10.0, 5.0), abs=0.05)

    shifted = type(detected)(
        detected.width,
        detected.height,
        {**detected.centers, 13: (detected.centers[13][0] + 100.0, detected.centers[13][1])},
    )
    assert estimate_planar_marker_homography(
        [detected, detected, detected, shifted],
        {10: (0.0, 0.0), 11: (10.0, 0.0), 12: (10.0, 5.0), 13: (0.0, 5.0)},
        source="moving-camera",
    ) is None