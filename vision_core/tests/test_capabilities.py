from __future__ import annotations

import sys
from types import SimpleNamespace
from typing import Optional

import numpy as np

from vision_core.geometry import estimate_homography, physical_trajectory
from vision_core.metrics import PoseSample
from vision_core.normalization import FrameNormalizer, LensCalibration
from vision_core.objects import (
    ObjectDetection,
    ObjectEvidence,
    ObjectTrack,
    ObjectTracker,
    SportObjectDetector,
    SportObjectClass,
    canonical_object_label,
    compute_object_evidence,
    open_vocabulary_labels_for_sport,
)
from vision_core.recognition import RecognitionStatus, recognize_sport_and_drill
from vision_core.reid import AthleteAppearance, AthleteReIdentifier, OnnxAppearanceEmbedder, extract_appearance
from vision_core.segmentation import AttemptSegment, SegmentationResult, segment_drill_attempts


def sample(frame: int, timestamp: float, x: float, wrist_x: Optional[float] = None) -> PoseSample:
    landmarks = {
        "hip_center": (x, 0.55),
        "ankle_center": (x, 0.9),
        "shoulder_center": (x, 0.35),
        "right_wrist": (wrist_x if wrist_x is not None else x, 0.45),
    }
    return PoseSample(frame_index=frame, timestamp_seconds=timestamp, confidence=0.9, landmarks=landmarks)


def reliable(name: SportObjectClass) -> ObjectEvidence:
    return ObjectEvidence(name, 1, 5, 0, 4, 0.9, 1.0, 0.9, True, (), ((0, 0.2, 0.2), (1, 0.3, 0.3), (2, 0.4, 0.4)))


def test_canonical_object_classes_are_distinct_and_aliases_are_explicit():
    assert len(set(SportObjectClass)) == 7
    assert canonical_object_label("sports ball") is SportObjectClass.BALL
    assert canonical_object_label("baseball bat") is SportObjectClass.BAT
    assert canonical_object_label("person") is None


def test_object_tracker_survives_short_occlusion_without_relabeling():
    tracker = ObjectTracker(max_missing_frames=2)
    first = ObjectDetection(SportObjectClass.BALL, (0.1, 0.1, 0.2, 0.2), 0.9, 0, "sports ball")
    original_id = tracker.update([first], 0)[0].track_id
    tracker.update([], 1)
    recovered = ObjectDetection(SportObjectClass.BALL, (0.11, 0.1, 0.21, 0.2), 0.9, 2, "sports ball")
    tracks = tracker.update([recovered], 2)
    assert len(tracks) == 1
    assert tracks[0].track_id == original_id
    assert len(tracks[0].detections) == 2


def test_ambiguous_object_association_is_not_released_as_reliable():
    tracker = ObjectTracker(ambiguity_margin=1.0)
    tracker.update([ObjectDetection(SportObjectClass.BALL, (0.1, 0.1, 0.2, 0.2), 0.9, 0, "ball")], 0)
    tracker.update([
        ObjectDetection(SportObjectClass.BALL, (0.11, 0.1, 0.21, 0.2), 0.9, 1, "ball"),
        ObjectDetection(SportObjectClass.BALL, (0.12, 0.1, 0.22, 0.2), 0.9, 1, "ball"),
    ], 1)
    assert len(tracker.tracks) == 1
    evidence = compute_object_evidence(tracker.tracks[0], 2)
    assert not evidence.is_reliable
    assert "track-association-ambiguous" in evidence.limitations


def test_object_detector_records_inference_failures_instead_of_hiding_them():
    class BrokenModel:
        def predict(self, *_args, **_kwargs):
            raise RuntimeError("backend unavailable")

    detector = SportObjectDetector(model=BrokenModel())
    assert detector.detect(np.zeros((32, 32, 3), dtype=np.uint8), 0) == []
    assert detector.inference_failures == 1
    assert "RuntimeError" in (detector.last_error or "")


def test_specialist_detector_requests_high_resolution_inference_for_small_baseballs():
    class Model:
        def __init__(self):
            self.kwargs = None

        def predict(self, *_args, **kwargs):
            self.kwargs = kwargs
            return []

    model = Model()
    detector = SportObjectDetector(model=model, inference_image_size=1280)
    detector.detect(np.zeros((64, 64, 3), dtype=np.uint8), 0)
    assert model.kwargs["imgsz"] == 1280


def test_open_vocabulary_detector_configures_every_canonical_object(monkeypatch):
    class FakeWorld:
        def __init__(self, path):
            self.path = path
            self.classes = []

        def set_classes(self, classes):
            self.classes = classes

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLOWorld=FakeWorld))
    detector = SportObjectDetector(model_path="sports-world.pt")
    assert set(detector.model.classes) == {
        "sports ball", "baseball bat", "basketball hoop", "soccer goal", "home plate", "sports cone", "sports target",
    }


def test_sport_specific_open_vocabulary_prompts_remove_irrelevant_classes():
    baseball_labels = open_vocabulary_labels_for_sport("baseball")
    assert "baseball" in baseball_labels
    assert "baseball bat" in baseball_labels
    assert "home plate" in baseball_labels
    assert "soccer goal" not in baseball_labels

    basketball_labels = open_vocabulary_labels_for_sport("basketball")
    assert "basketball" in basketball_labels
    assert "basketball hoop" in basketball_labels
    assert "home plate" not in basketball_labels


def test_world_detector_uses_known_sport_specific_prompts(monkeypatch):
    class FakeWorld:
        def __init__(self, _path):
            self.classes = []

        def set_classes(self, classes):
            self.classes = classes

    monkeypatch.setitem(sys.modules, "ultralytics", SimpleNamespace(YOLOWorld=FakeWorld))
    detector = SportObjectDetector(model_path="sports-world.pt", sport="baseball")
    assert detector.model.classes == ["baseball", "baseball bat", "home plate", "pitching target"]


def test_reidentifier_recovers_after_occlusion_and_rejects_ambiguous_identity():
    frame = np.zeros((120, 120, 3), dtype=np.uint8)
    frame[10:100, 15:55] = (20, 100, 220)
    appearance = extract_appearance(frame, (0.1, 0.05, 0.5, 0.9))
    reid = AthleteReIdentifier(max_missing_frames=3)
    created = reid.update([appearance], 0)[0]
    reid.update([], 1)
    recovered = reid.update([appearance], 2)
    assert any(item.accepted and item.track_id == created.track_id for item in recovered)

    ambiguous = reid.update([appearance, appearance], 3)
    assert any(item.ambiguous and not item.accepted for item in ambiguous)
    assert reid.tracks[created.track_id].identity_ambiguous


def test_reidentifier_allows_exact_configured_occlusion_window():
    frame = np.zeros((100, 100, 3), dtype=np.uint8)
    frame[20:80, 20:50] = (30, 160, 220)
    appearance = extract_appearance(frame, (0.2, 0.2, 0.5, 0.8))
    reid = AthleteReIdentifier(max_missing_frames=2, min_match_score=0.2)
    track_id = reid.update([appearance], 0)[0].track_id
    reid.update([], 1)
    reid.update([], 2)
    recovered = reid.update([appearance], 3)
    assert any(item.accepted and item.track_id == track_id for item in recovered)


def test_reidentifier_seeds_tracks_with_detector_confidence():
    frame = np.zeros((80, 80, 3), dtype=np.uint8)
    appearance = extract_appearance(frame, (0.1, 0.1, 0.8, 0.9), detection_confidence=0.42)
    reid = AthleteReIdentifier()
    created = reid.update([appearance], 0)[0]
    assert reid.tracks[created.track_id].current is not None
    assert reid.tracks[created.track_id].current.match_confidence == 0.42


def test_expiring_reid_track_does_not_block_new_track_capacity():
    first_frame = np.zeros((80, 80, 3), dtype=np.uint8)
    first_frame[10:70, 10:40] = (0, 0, 255)
    second_frame = np.zeros((80, 80, 3), dtype=np.uint8)
    second_frame[10:70, 10:40] = (0, 255, 0)
    first = extract_appearance(first_frame, (0.1, 0.1, 0.5, 0.9))
    second = extract_appearance(second_frame, (0.1, 0.1, 0.5, 0.9))
    reid = AthleteReIdentifier(max_missing_frames=1, max_tracks=1)
    original_id = reid.update([first], 0)[0].track_id
    reid.update([], 1)
    replacement = reid.update([second], 2)
    assert len(reid.tracks) == 1
    assert replacement and replacement[0].reason == "new-track"
    assert replacement[0].track_id != original_id


def test_reidentifier_recovers_dormant_identity_from_strong_learned_embedding():
    histogram = np.zeros(24 * 16, dtype=np.float32)
    histogram[0] = 1.0
    embedding = np.asarray([1.0, 0.0, 0.0], dtype=np.float32)
    first = AthleteAppearance((0.05, 0.1, 0.25, 0.9), histogram, embedding)
    returned = AthleteAppearance((0.75, 0.1, 0.95, 0.9), histogram, embedding)
    reid = AthleteReIdentifier(
        max_missing_frames=1,
        max_reid_frames=10,
        min_deep_reid_score=0.85,
    )
    original_id = reid.update([first], 0)[0].track_id
    reid.update([], 1)
    reid.update([], 2)
    recovered = reid.update([returned], 6)
    assert any(
        item.accepted
        and item.track_id == original_id
        and item.reason == "long-occlusion-reidentified"
        for item in recovered
    )


def test_reidentifier_rejects_ambiguous_dormant_embedding_match():
    histogram = np.zeros(24 * 16, dtype=np.float32)
    histogram[0] = 1.0
    embedding = np.asarray([1.0, 0.0, 0.0], dtype=np.float32)
    reid = AthleteReIdentifier(max_missing_frames=1, max_reid_frames=10, min_deep_reid_score=0.85)
    reid.update([
        AthleteAppearance((0.05, 0.1, 0.25, 0.9), histogram, embedding),
        AthleteAppearance((0.35, 0.1, 0.55, 0.9), histogram, embedding),
    ], 0)
    reid.update([], 1)
    reid.update([], 2)
    returned = AthleteAppearance((0.75, 0.1, 0.95, 0.9), histogram, embedding)
    evidence = reid.update([returned], 6)
    assert any(item.ambiguous and item.reason == "long-occlusion-identity-ambiguous" for item in evidence)
    assert not any(item.accepted for item in evidence)


def test_onnx_appearance_embedder_normalizes_output_and_records_input_shape():
    class FakeNet:
        def __init__(self):
            self.input = None

        def setInput(self, value):
            self.input = value

        def forward(self):
            return np.asarray([[3.0, 4.0]], dtype=np.float32)

    net = FakeNet()
    embedder = OnnxAppearanceEmbedder(net=net, model_name="test-reid")
    frame = np.full((240, 160, 3), 127, dtype=np.uint8)
    embedding = embedder.embed(frame, (0.1, 0.1, 0.9, 0.9))
    assert net.input.shape == (1, 3, 256, 128)
    assert embedding is not None
    assert np.allclose(embedding, np.asarray([0.6, 0.8], dtype=np.float32))
    assert embedder.inference_failures == 0


def test_onnx_appearance_embedder_fails_closed_on_inference_error():
    class BrokenNet:
        def setInput(self, value):
            pass

        def forward(self):
            raise RuntimeError("bad model")

    embedder = OnnxAppearanceEmbedder(net=BrokenNet(), model_name="broken-reid")
    assert embedder.embed(np.zeros((80, 80, 3), dtype=np.uint8), (0.1, 0.1, 0.9, 0.9)) is None
    assert embedder.inference_failures == 1
    assert "RuntimeError" in (embedder.last_error or "")


def test_extract_appearance_carries_learned_embedding_into_reidentification_evidence():
    learned = np.asarray([0.25, 0.75], dtype=np.float32)
    appearance = extract_appearance(
        np.zeros((80, 80, 3), dtype=np.uint8),
        (0.1, 0.1, 0.9, 0.9),
        learned_embedding=learned,
    )
    assert appearance.pose_embedding is learned


def test_learned_embedding_dominates_identical_uniform_color_for_identity_matching():
    histogram = np.zeros(24 * 16, dtype=np.float32)
    histogram[0] = 1.0
    first = AthleteAppearance(
        (0.1, 0.1, 0.4, 0.9), histogram, np.asarray([1.0, 0.0], dtype=np.float32)
    )
    different_athlete = AthleteAppearance(
        (0.1, 0.1, 0.4, 0.9), histogram, np.asarray([0.0, 1.0], dtype=np.float32)
    )
    assert first.similarity(different_athlete) <= 0.20


def test_homography_recovers_metric_speed_and_rejects_degenerate_points():
    image = [(100.0, 100.0), (500.0, 100.0), (500.0, 300.0), (100.0, 300.0)]
    world = [(0.0, 0.0), (20.0, 0.0), (20.0, 10.0), (0.0, 10.0)]
    calibration = estimate_homography(image, world, "test")
    assert calibration is not None
    trajectory = physical_trajectory([(0.0, 100.0, 100.0), (1.0, 300.0, 100.0), (2.0, 500.0, 100.0)], calibration)
    assert trajectory.speed_mps is not None
    assert abs(trajectory.speed_mps - 10.0) < 0.01
    assert estimate_homography([(1, 1), (2, 2), (3, 3), (4, 4)], world, "bad") is None
    near_singular_world = [(0.0, 0.0), (1e-8, 0.0), (1e-8, 10.0), (0.0, 10.0)]
    assert estimate_homography(image, near_singular_world, "ill-conditioned") is None


def test_sprint_segmentation_accepts_vertical_image_motion():
    samples = []
    for index in range(7):
        pose = sample(index, 0.2 + index * 0.2, 0.5)
        pose.landmarks["hip_center"] = (0.5, 0.2 + index * 0.1)
        samples.append(pose)
    result = segment_drill_attempts("sprint-20m", samples, {}, 1.6)
    assert result.attempts
    assert all("course-displacement-insufficient" not in attempt.reasons for attempt in result.attempts)


def test_normalizer_tracks_variable_timing_and_normalizes_orientation_and_color():
    normalizer = FrameNormalizer(80, 40, 30.0, rotation_degrees=90, max_dimension=80, stabilize=False)
    for timestamp in (0.0, 33.0, 66.0, 120.0, 153.0, 210.0, 243.0):
        normalizer.observe_timestamp(timestamp)
    gray = np.zeros((40, 80), dtype=np.uint8)
    output = normalizer.normalize(gray)
    assert output.shape == (80, 40, 3)
    assert normalizer.evidence.variable_frame_rate
    normalizer.observe_timestamp(float("nan"))
    normalizer.observe_timestamp(float("nan"))
    assert normalizer.evidence.limitations.count("decoder-timestamp-unavailable") == 1


def test_normalizer_applies_lens_and_orientation_transform_to_calibration_points():
    calibration = LensCalibration(
        np.asarray([[100.0, 0.0, 40.0], [0.0, 100.0, 20.0], [0.0, 0.0, 1.0]]),
        np.zeros(5),
    )
    normalizer = FrameNormalizer(80, 40, 30.0, rotation_degrees=90, lens_calibration=calibration)
    transformed = normalizer.normalize_points([(0.5, 0.5)])
    assert len(transformed) == 1
    assert abs(transformed[0][0] - 0.5) < 0.03
    assert abs(transformed[0][1] - 0.5) < 0.03
    assert normalizer.evidence.lens_correction_applied


def test_segmentation_marks_missing_objects_and_incomplete_repetition_invalid():
    samples = [sample(i, i * 0.2, 0.5, wrist) for i, wrist in enumerate((0.2, 0.22, 0.7, 0.25, 0.22, 0.7, 0.2))]
    result = segment_drill_attempts("baseball-swing-timing", samples, {}, 1.2, expected_repetitions=3)
    assert result.invalid_repetitions >= 1
    assert not result.complete
    assert "expected-repetitions-incomplete" in result.reasons
    assert any("bat-track-not-detected" in attempt.reasons for attempt in result.attempts)
    extra_samples = [
        sample(i, i * 0.4, 0.5, wrist)
        for i, wrist in enumerate((0.2, 0.2, 0.8, 0.8, 0.2, 0.2, 0.8, 0.8, 0.2))
    ]
    extra = segment_drill_attempts(
        "baseball-swing-timing",
        extra_samples,
        {"ball": reliable(SportObjectClass.BALL), "bat": reliable(SportObjectClass.BAT)},
        4.0,
        expected_repetitions=1,
    )
    assert not extra.complete
    assert "unexpected-extra-repetitions" in extra.reasons


def test_recognition_confirms_independent_basketball_evidence_and_rejects_sport_mismatch():
    samples = [sample(i, float(i), 0.2 + i * 0.05) for i in range(5)]
    objects = {"ball": reliable(SportObjectClass.BALL), "hoop": reliable(SportObjectClass.HOOP)}
    segmentation = SegmentationResult(
        "basketball-form-capture",
        (AttemptSegment(1, "shot", 1.0, 2.0, 0.9, True, True, ()),),
        1, 0, True, (),
    )
    confirmed = recognize_sport_and_drill(
        "basketball", "basketball-form-capture", samples, objects, segmentation, 5.0,
    )
    assert confirmed.status is RecognitionStatus.CONFIRMED
    mismatch = recognize_sport_and_drill(
        "soccer", "sprint-20m", samples, objects, segmentation, 5.0, "aruco-course-markers",
    )
    assert mismatch.status is RecognitionStatus.MISMATCH
    assert "visual-sport-mismatch" in mismatch.reasons


def test_recognition_confirms_passing_only_with_ball_target_and_kick_evidence():
    samples = [sample(i, i * 0.2, 0.2 + i * 0.03) for i in range(8)]
    objects = {
        "ball": reliable(SportObjectClass.BALL),
        "target": reliable(SportObjectClass.TARGET),
    }
    segmentation = SegmentationResult(
        "passing-accuracy",
        (AttemptSegment(1, "kick", 0.4, 1.2, 0.9, True, True, ()),),
        1,
        0,
        True,
        (),
    )

    result = recognize_sport_and_drill("soccer", "passing-accuracy", samples, objects, segmentation, 2.0)

    assert result.status is RecognitionStatus.CONFIRMED
    assert result.inferred_drill == "passing-accuracy"


def test_recognition_confirms_first_touch_only_with_ball_target_cone_and_kick_evidence():
    samples = [sample(i, i * 0.2, 0.2 + i * 0.03) for i in range(8)]
    segmentation = SegmentationResult(
        "first-touch-control",
        (AttemptSegment(1, "kick", 0.4, 1.2, 0.9, True, True, ()),),
        1,
        0,
        True,
        (),
    )
    objects = {
        "ball": reliable(SportObjectClass.BALL),
        "target": reliable(SportObjectClass.TARGET),
        "cone": reliable(SportObjectClass.CONE),
    }

    result = recognize_sport_and_drill("soccer", "first-touch-control", samples, objects, segmentation, 2.0)

    assert result.status is RecognitionStatus.CONFIRMED
    assert result.inferred_drill == "first-touch-control"
    missing_cone = recognize_sport_and_drill(
        "soccer",
        "first-touch-control",
        samples,
        {name: evidence for name, evidence in objects.items() if name != "cone"},
        segmentation,
        2.0,
    )
    assert missing_cone.status is RecognitionStatus.MISMATCH
    assert "required-object-missing:cone" in missing_cone.reasons
    assert "visual-drill-mismatch" in missing_cone.reasons


def test_shooting_mechanics_fails_closed_without_the_required_plant_marker_evidence():
    samples = [sample(i, i * 0.2, 0.2 + i * 0.03) for i in range(8)]
    segmentation = SegmentationResult(
        "shooting-mechanics",
        (AttemptSegment(1, "kick", 0.4, 1.2, 0.9, True, True, ()),),
        1,
        0,
        True,
        (),
    )
    objects = {
        "ball": reliable(SportObjectClass.BALL),
        "goal": reliable(SportObjectClass.GOAL),
        "target": reliable(SportObjectClass.TARGET),
    }

    result = recognize_sport_and_drill("soccer", "shooting-mechanics", samples, objects, segmentation, 2.0)

    assert result.status is RecognitionStatus.MISMATCH
    assert "required-object-missing:cone" in result.reasons
    assert "visual-drill-mismatch" in result.reasons


def test_shooting_mechanics_segmentation_rejects_a_clip_without_plant_marker_evidence():
    samples = [sample(i, i * 0.2, 0.5, wrist) for i, wrist in enumerate((0.2, 0.22, 0.7, 0.25, 0.22, 0.7, 0.2))]

    result = segment_drill_attempts(
        "shooting-mechanics",
        samples,
        {
            "ball": reliable(SportObjectClass.BALL),
            "goal": reliable(SportObjectClass.GOAL),
            "target": reliable(SportObjectClass.TARGET),
        },
        1.2,
    )

    assert result.attempts
    assert not result.complete
    assert any("cone-track-not-detected" in attempt.reasons for attempt in result.attempts)


def test_baseball_throwing_mechanics_fails_closed_without_the_required_target_evidence():
    samples = [sample(i, i * 0.2, 0.2 + i * 0.03) for i in range(8)]
    segmentation = SegmentationResult(
        "baseball-throwing-mechanics",
        (AttemptSegment(1, "throw", 0.4, 1.2, 0.9, True, True, ()),),
        1,
        0,
        True,
        (),
    )
    objects = {
        "ball": reliable(SportObjectClass.BALL),
        "plate": reliable(SportObjectClass.PLATE),
    }

    result = recognize_sport_and_drill("baseball", "baseball-throwing-mechanics", samples, objects, segmentation, 2.0)

    assert result.status is RecognitionStatus.INCONCLUSIVE
    assert "required-object-missing:target" in result.reasons


def test_baseball_throwing_mechanics_segmentation_rejects_a_clip_without_the_plate_marker():
    samples = [sample(i, i * 0.2, 0.5, wrist) for i, wrist in enumerate((0.2, 0.22, 0.7, 0.25, 0.22, 0.7, 0.2))]

    result = segment_drill_attempts(
        "baseball-throwing-mechanics",
        samples,
        {
            "ball": reliable(SportObjectClass.BALL),
            "target": reliable(SportObjectClass.TARGET),
        },
        1.2,
    )

    assert result.attempts
    assert not result.complete
    assert result.attempts[0].action == "throw"
    assert any("plate-track-not-detected" in attempt.reasons for attempt in result.attempts)


def test_movement_efficiency_fails_closed_as_a_cone_dribble_mismatch_without_finish_target_evidence():
    samples = [sample(i, i * 0.2, 0.2 + i * 0.03) for i in range(8)]
    segmentation = SegmentationResult(
        "movement-efficiency",
        (
            AttemptSegment(1, "course-leg", 0.2, 0.8, 0.9, True, True, ()),
            AttemptSegment(2, "course-leg", 0.9, 1.5, 0.9, True, True, ()),
        ),
        2,
        0,
        True,
        (),
    )
    objects = {
        "ball": reliable(SportObjectClass.BALL),
        "cone": reliable(SportObjectClass.CONE),
    }

    result = recognize_sport_and_drill(
        "soccer", "movement-efficiency", samples, objects, segmentation, 2.0,
        "verified-planar-homography:movement-efficiency",
    )

    assert result.status is RecognitionStatus.MISMATCH
    assert result.inferred_drill == "cone-dribble"
    assert "required-object-missing:target" in result.reasons
    assert "visual-drill-mismatch" in result.reasons


def test_movement_efficiency_segmentation_rejects_a_route_without_finish_target_evidence():
    samples = [sample(i, i * 0.2, x, wrist) for i, (x, wrist) in enumerate(((0.1, 0.2), (0.3, 0.25), (0.7, 0.7), (0.5, 0.25), (0.2, 0.22), (0.6, 0.7), (0.9, 0.2)))]

    result = segment_drill_attempts(
        "movement-efficiency",
        samples,
        {"cone": reliable(SportObjectClass.CONE)},
        1.2,
        course_geometry_verified=True,
    )

    assert result.attempts
    assert not result.complete
    assert any("target-track-not-detected" in attempt.reasons for attempt in result.attempts)


def test_first_touch_segmentation_rejects_a_clip_without_control_square_cone_evidence():
    samples = [sample(i, i * 0.2, 0.5, wrist) for i, wrist in enumerate((0.2, 0.22, 0.7, 0.25, 0.22, 0.7, 0.2))]

    result = segment_drill_attempts(
        "first-touch-control",
        samples,
        {
            "ball": reliable(SportObjectClass.BALL),
            "target": reliable(SportObjectClass.TARGET),
        },
        1.2,
    )

    assert result.attempts
    assert not result.complete
    assert any("cone-track-not-detected" in attempt.reasons for attempt in result.attempts)


def test_recognition_disambiguates_pitch_command_from_velocity_by_target_setup():
    objects = {
        name: reliable(SportObjectClass(object_class))
        for name, object_class in (("ball", "ball"), ("plate", "plate"), ("target", "target"))
    }
    attempts = tuple(AttemptSegment(index, "pitch", index, index + 0.8, 0.9, True, True, ()) for index in (1, 2))
    segmentation = SegmentationResult("baseball-pitch-command", attempts, 2, 0, True, ())
    result = recognize_sport_and_drill(
        "baseball", "baseball-pitch-velocity", [sample(i, i * 0.2, 0.5) for i in range(12)], objects, segmentation, 4.0,
    )
    assert result.status is RecognitionStatus.MISMATCH
    assert result.inferred_drill == "baseball-pitch-command"


def test_sprint_recognition_is_inconclusive_without_verified_course_markers():
    samples = [sample(i, float(i), i / 4) for i in range(5)]
    segmentation = SegmentationResult(
        "sprint-20m", (AttemptSegment(1, "sprint", 0.5, 3.5, 0.8, True, True, ()),), 1, 0, True, (),
    )
    result = recognize_sport_and_drill("soccer", "sprint-20m", samples, {}, segmentation, 5.0)
    assert result.status is RecognitionStatus.INCONCLUSIVE
    assert "sprint-course-markers-unavailable" in result.reasons
