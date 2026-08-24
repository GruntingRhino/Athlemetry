import cv2
import numpy as np
import pytest

from vision_core import video


def test_baseball_pitch_velocity_forces_native_frame_rate_processing():
    assert video.effective_frame_stride("baseball-pitch-velocity", 8) == 1
    assert video.effective_frame_stride("baseball-pitch-command", 8) == 1
    assert video.effective_frame_stride("baseball-swing-timing", 8) == 1
    assert video.effective_frame_stride("basketball-form-capture", 8) == 1
    assert video.effective_frame_stride("sprint-20m", 8) == 8


def test_baseball_pitch_velocity_requires_specialist_model_for_physical_ball_metrics():
    assert video.requires_baseball_specialist_model("baseball-pitch-velocity")
    assert not video.requires_baseball_specialist_model("baseball-pitch-command")
    assert not video.baseball_pitch_speed_authorized("baseball-pitch-velocity", False)
    assert video.baseball_pitch_speed_authorized("baseball-pitch-velocity", True)
from vision_core.video import DetectionBox, coco_pose_landmarks, decode_is_complete, select_pose_for_athlete, select_tracked_athlete


def test_tracker_starts_with_the_most_prominent_athlete():
    athlete = select_tracked_athlete(
        [
            DetectionBox(0.0, 0.0, 0.2, 0.2, 0.95),
            DetectionBox(0.2, 0.1, 0.8, 0.95, 0.82),
        ],
        previous=None,
    )
    assert athlete == DetectionBox(0.2, 0.1, 0.8, 0.95, 0.82)


def test_tracker_keeps_identity_when_a_more_confident_bystander_appears():
    previous = DetectionBox(0.2, 0.1, 0.6, 0.9, 0.8)
    same_athlete = DetectionBox(0.22, 0.1, 0.62, 0.9, 0.72)
    bystander = DetectionBox(0.7, 0.1, 0.95, 0.8, 0.99)
    assert select_tracked_athlete([bystander, same_athlete], previous) == same_athlete


def test_tracker_returns_none_without_person_detections():
    assert select_tracked_athlete([], previous=None) is None


def test_decoder_completion_rejects_partial_or_empty_streams():
    assert decode_is_complete(100, 100)
    assert decode_is_complete(98, 100)
    assert not decode_is_complete(90, 100)
    assert not decode_is_complete(0, 0)


def test_pose_association_rejects_distant_and_ambiguous_candidates():
    athlete = DetectionBox(0.1, 0.1, 0.4, 0.9, 0.9)
    matching = DetectionBox(0.11, 0.1, 0.41, 0.9, 0.8)
    distant = DetectionBox(0.7, 0.1, 0.95, 0.9, 0.99)
    assert select_pose_for_athlete([distant, matching], athlete) == matching
    assert select_pose_for_athlete([distant], athlete) is None
    near_duplicate = DetectionBox(0.105, 0.1, 0.405, 0.9, 0.8)
    assert select_pose_for_athlete([matching, near_duplicate], athlete) is None


def test_coco_pose_keypoints_are_converted_to_named_body_landmarks():
    points = [(index / 20.0, index / 25.0) for index in range(17)]
    landmarks, confidence = coco_pose_landmarks(points, [0.9] * 17)
    assert landmarks["left_shoulder"] == points[5]
    assert landmarks["right_wrist"] == points[10]
    assert landmarks["hip_center"] == (
        (points[11][0] + points[12][0]) / 2,
        (points[11][1] + points[12][1]) / 2,
    )
    assert confidence == 0.9


def test_analyze_video_automatically_uses_stable_course_markers(monkeypatch, tmp_path):
    output = tmp_path / "marked-sprint.avi"
    writer = cv2.VideoWriter(str(output), cv2.VideoWriter_fourcc(*"MJPG"), 1.0, (800, 400))
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    start = cv2.cvtColor(cv2.aruco.generateImageMarker(dictionary, 0, 100), cv2.COLOR_GRAY2BGR)
    finish = cv2.cvtColor(cv2.aruco.generateImageMarker(dictionary, 1, 100), cv2.COLOR_GRAY2BGR)
    for _ in range(5):
        frame = np.full((400, 800, 3), 255, dtype=np.uint8)
        frame[250:350, 110:210] = start
        frame[250:350, 590:690] = finish
        writer.write(frame)
    writer.release()

    class Pose:
        def close(self):
            return None

    positions = iter((0.0, 0.2, 0.5, 0.8, 1.0))
    object_detector_kwargs = []
    class NoObjects:
        def __init__(self, *_args, **kwargs):
            object_detector_kwargs.append(kwargs)

        def detect(self, *_args):
            return []

    embedding_calls = []
    class ReIDEmbedder:
        model_name = "test-reid"
        inference_failures = 0
        last_error = None

        def __init__(self, model_path):
            assert model_path == "test-reid.onnx"

        def embed(self, _frame, box):
            embedding_calls.append(box)
            return np.asarray([1.0, 0.0], dtype=np.float32)

    monkeypatch.setattr(video, "_load_person_detector", lambda _name: (object(), "test-person"))
    monkeypatch.setattr(video, "SportObjectDetector", NoObjects)
    monkeypatch.setattr(video, "OnnxAppearanceEmbedder", ReIDEmbedder)
    monkeypatch.setattr(video, "_load_pose_estimator", lambda _mp, _name: (Pose(), "test-pose"))
    monkeypatch.setattr(video, "_person_detections", lambda *_args: [DetectionBox(0, 0, 1, 1, 0.9)])
    monkeypatch.setattr(
        video,
        "_estimate_pose",
        lambda *_args: ({"hip_center": (next(positions), 0.5), "ankle_center": (0.5, 0.9)}, 0.9),
    )

    result = video.analyze_video(
        str(output), "soccer", "sprint-20m", frame_stride=1, reid_model="test-reid.onnx"
    )

    assert object_detector_kwargs[0]["sport"] == "soccer"
    assert result.evidence.calibration_method == "aruco-course-markers"
    assert result.evidence.calibration_marker_observations == 5
    assert result.evidence.calibration_elapsed_seconds == pytest.approx(2.0, abs=0.01)
    assert len(embedding_calls) == 5
    assert result.evidence.athlete_reidentification["embedding_model"] == "test-reid"
    assert result.evidence.athlete_reidentification["embedding_healthy"] is True
    assert result.analysis.metrics["speed_mps"].value is None

    positions = iter((0.0, 0.2, 0.5, 0.8, 1.0))
    measured = video.analyze_video(
        str(output),
        "soccer",
        "sprint-20m",
        frame_stride=1,
        calibration_distance_meters=20.0,
        reid_model="test-reid.onnx",
    )
    assert measured.analysis.metrics["speed_mps"].value == pytest.approx(10.0, abs=0.01)


def test_analyze_video_automatically_calibrates_verified_planar_marker_layout(monkeypatch, tmp_path):
    output = tmp_path / "planar-markers.avi"
    writer = cv2.VideoWriter(str(output), cv2.VideoWriter_fourcc(*"MJPG"), 10.0, (800, 600))
    dictionary = cv2.aruco.getPredefinedDictionary(cv2.aruco.DICT_4X4_50)
    placements = {10: (100, 100), 11: (600, 100), 12: (600, 400), 13: (100, 400)}
    for _ in range(5):
        frame = np.full((600, 800, 3), 255, dtype=np.uint8)
        for marker_id, (left, top) in placements.items():
            marker = cv2.aruco.generateImageMarker(dictionary, marker_id, 100)
            frame[top:top + 100, left:left + 100] = cv2.cvtColor(marker, cv2.COLOR_GRAY2BGR)
        writer.write(frame)
    writer.release()

    class Pose:
        def close(self):
            return None

    class NoObjects:
        inference_failures = 0
        def __init__(self, *_args, **_kwargs):
            pass
        def detect(self, *_args):
            return []

    class ReIDEmbedder:
        model_name = "test-reid"
        inference_failures = 0
        last_error = None
        def __init__(self, _model_path):
            pass
        def embed(self, _frame, _box):
            return np.asarray([1.0, 0.0], dtype=np.float32)

    monkeypatch.setattr(video, "_load_person_detector", lambda _name: (object(), "test-person"))
    monkeypatch.setattr(video, "SportObjectDetector", NoObjects)
    monkeypatch.setattr(video, "OnnxAppearanceEmbedder", ReIDEmbedder)
    monkeypatch.setattr(video, "_load_pose_estimator", lambda _mp, _name: (Pose(), "test-pose"))
    monkeypatch.setattr(video, "_person_detections", lambda *_args: [DetectionBox(0.2, 0.1, 0.5, 0.9, 0.9)])
    monkeypatch.setattr(video, "_estimate_pose", lambda *_args: ({"hip_center": (0.4, 0.5), "ankle_center": (0.4, 0.9)}, 0.9))

    result = video.analyze_video(
        str(output),
        "soccer",
        "agility-5-10-5",
        frame_stride=1,
        reid_model="test-reid.onnx",
        homography_marker_world_points_meters={
            10: (0.0, 0.0), 11: (10.0, 0.0), 12: (10.0, 5.0), 13: (0.0, 5.0),
        },
        homography_subject="ground",
        homography_protocol_reference="agility-5-10-5",
        lens_camera_matrix=[[800.0, 0.0, 400.0], [0.0, 800.0, 300.0], [0.0, 0.0, 1.0]],
        lens_distortion_coefficients=[0.0, 0.0, 0.0, 0.0, 0.0],
        lens_reference_size=(800, 600),
    )
    assert result.evidence.planar_calibration is not None
    assert result.evidence.planar_calibration["source"] == "verified-planar-marker-layout:agility-5-10-5"
    assert result.evidence.planar_calibration["correspondence_count"] == 4