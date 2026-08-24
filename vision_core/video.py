"""Raw-video athlete detection, pose tracking, and sport analysis entry point."""

from __future__ import annotations

import argparse
import json
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Dict, List, Literal, Optional, Tuple, cast

import numpy as np

from .calibration import (
    aggregate_course_markers,
    detect_course_markers,
    detect_planar_markers,
    estimate_marker_crossing,
    estimate_planar_marker_homography,
)
from .geometry import HomographyCalibration, estimate_homography, physical_trajectory
from .metrics import PhysicalObjectMeasurement, PerformanceAnalysis, PoseSample, Sport, analyze_pose_sequence
from .normalization import FrameNormalizer, LensCalibration, capture_rotation_degrees, disable_decoder_auto_rotation, stabilize_pair
from .objects import ObjectEvidence, ObjectTracker, SportObjectDetector, best_reliable_evidence
from .recognition import RecognitionStatus, recognize_sport_and_drill
from .reid import AthleteReIdentifier, OnnxAppearanceEmbedder, extract_appearance
from .segmentation import segment_drill_attempts


def effective_frame_stride(drill: str, requested_stride: int) -> int:
    """Use every decoded frame when the protocol depends on fast object motion."""
    if drill in {
        "baseball-pitch-velocity",
        "baseball-pitch-command",
        "baseball-swing-timing",
        "basketball-form-capture",
    }:
        return 1
    return max(1, requested_stride)


def requires_baseball_specialist_model(drill: str) -> bool:
    """Generic object prompts cannot authorize physical pitch velocity."""
    return drill == "baseball-pitch-velocity"


def baseball_pitch_speed_authorized(drill: str, baseball_specialist_model: bool) -> bool:
    return not requires_baseball_specialist_model(drill) or baseball_specialist_model

LANDMARKS = {
    "nose": 0,
    "left_shoulder": 11,
    "right_shoulder": 12,
    "left_elbow": 13,
    "right_elbow": 14,
    "left_wrist": 15,
    "right_wrist": 16,
    "left_hip": 23,
    "right_hip": 24,
    "left_knee": 25,
    "right_knee": 26,
    "left_ankle": 27,
    "right_ankle": 28,
}

COCO_LANDMARKS = {
    "nose": 0,
    "left_shoulder": 5,
    "right_shoulder": 6,
    "left_elbow": 7,
    "right_elbow": 8,
    "left_wrist": 9,
    "right_wrist": 10,
    "left_hip": 11,
    "right_hip": 12,
    "left_knee": 13,
    "right_knee": 14,
    "left_ankle": 15,
    "right_ankle": 16,
}


@dataclass
class VideoEvidence:
    source_path: str
    fps: float
    width: int
    height: int
    duration_seconds: float
    decoded_frames: int
    analyzed_frames: int
    expected_frames: int
    decode_completion_rate: float
    codec_fourcc: str
    object_detector_failures: int
    object_detector_healthy: bool
    athlete_detected_frames: int
    athlete_detection_rate: float
    pose_detected_frames: int
    pose_detection_rate: float
    athlete_tracked_frames: int
    athlete_tracking_rate: float
    detector: str
    pose_backend: str
    calibration_method: Optional[str]
    calibration_confidence: float
    calibration_start_seconds: Optional[float]
    calibration_finish_seconds: Optional[float]
    calibration_elapsed_seconds: Optional[float]
    calibration_marker_observations: int
    normalization: Dict[str, object]
    object_evidence: Dict[str, object]
    athlete_reidentification: Dict[str, object]
    sport_drill_recognition: Dict[str, object]
    segmentation: Dict[str, object]
    planar_calibration: Optional[Dict[str, object]]


@dataclass
class VideoPerformanceAnalysis:
    evidence: VideoEvidence
    analysis: PerformanceAnalysis


@dataclass(frozen=True)
class DetectionBox:
    x1: float
    y1: float
    x2: float
    y2: float
    confidence: float


def _box_area(box: DetectionBox) -> float:
    return max(0.0, box.x2 - box.x1) * max(0.0, box.y2 - box.y1)


def _box_iou(first: DetectionBox, second: DetectionBox) -> float:
    intersection = max(0.0, min(first.x2, second.x2) - max(first.x1, second.x1)) * max(
        0.0, min(first.y2, second.y2) - max(first.y1, second.y1)
    )
    union = _box_area(first) + _box_area(second) - intersection
    return intersection / union if union > 0 else 0.0


def _center_distance(first: DetectionBox, second: DetectionBox) -> float:
    first_center = ((first.x1 + first.x2) / 2.0, (first.y1 + first.y2) / 2.0)
    second_center = ((second.x1 + second.x2) / 2.0, (second.y1 + second.y2) / 2.0)
    return min(1.0, ((first_center[0] - second_center[0]) ** 2 + (first_center[1] - second_center[1]) ** 2) ** 0.5)


def decode_is_complete(decoded_frames: int, expected_frames: int) -> bool:
    return decoded_frames > 0 and (expected_frames <= 0 or decoded_frames >= max(1, expected_frames - 2))


def select_tracked_athlete(
    detections: List[DetectionBox],
    previous: Optional[DetectionBox],
) -> Optional[DetectionBox]:
    if not detections:
        return None
    if previous is None:
        return max(detections, key=lambda box: _box_area(box) * box.confidence)
    return max(
        detections,
        key=lambda box: _box_iou(previous, box) * 0.65 + (1.0 - _center_distance(previous, box)) * 0.25 + box.confidence * 0.1,
    )


def select_pose_for_athlete(
    candidates: List[DetectionBox],
    athlete: Optional[DetectionBox],
    ambiguity_margin: float = 0.05,
) -> Optional[DetectionBox]:
    """Associate a pose result with the re-identified athlete or reject it."""
    if not candidates or athlete is None:
        return None
    scored = sorted(
        (
            (
                _box_iou(athlete, candidate) * 0.7
                + (1.0 - _center_distance(athlete, candidate)) * 0.2
                + candidate.confidence * 0.1,
                _box_iou(athlete, candidate),
                _center_distance(athlete, candidate),
                candidate,
            )
            for candidate in candidates
        ),
        key=lambda item: item[0],
        reverse=True,
    )
    best = scored[0]
    if best[1] < 0.1 and best[2] > 0.1:
        return None
    if len(scored) > 1 and best[0] - scored[1][0] < ambiguity_margin:
        return None
    return best[3]


def _center(first: Tuple[float, float], second: Tuple[float, float]) -> Tuple[float, float]:
    return ((first[0] + second[0]) / 2.0, (first[1] + second[1]) / 2.0)


def _pose_landmarks(result) -> Tuple[Dict[str, Tuple[float, float]], float]:
    pose_landmarks = result.pose_landmarks
    if not pose_landmarks:
        return {}, 0.0
    points: Dict[str, Tuple[float, float]] = {}
    visibility: List[float] = []
    for name, index in LANDMARKS.items():
        landmark = pose_landmarks.landmark[index]
        points[name] = (float(landmark.x), float(landmark.y))
        visibility.append(float(landmark.visibility))
    points["shoulder_center"] = _center(points["left_shoulder"], points["right_shoulder"])
    points["hip_center"] = _center(points["left_hip"], points["right_hip"])
    points["knee_center"] = _center(points["left_knee"], points["right_knee"])
    points["ankle_center"] = _center(points["left_ankle"], points["right_ankle"])
    return points, sum(visibility) / len(visibility)


def coco_pose_landmarks(
    keypoints: List[Tuple[float, float]],
    confidences: List[float],
) -> Tuple[Dict[str, Tuple[float, float]], float]:
    if len(keypoints) < 17 or len(confidences) < 17:
        return {}, 0.0
    points = {name: keypoints[index] for name, index in COCO_LANDMARKS.items()}
    points["shoulder_center"] = _center(points["left_shoulder"], points["right_shoulder"])
    points["hip_center"] = _center(points["left_hip"], points["right_hip"])
    points["knee_center"] = _center(points["left_knee"], points["right_knee"])
    points["ankle_center"] = _center(points["left_ankle"], points["right_ankle"])
    used_confidences = [confidences[index] for index in COCO_LANDMARKS.values()]
    return points, round(sum(used_confidences) / len(used_confidences), 6)


def _load_pose_estimator(mp, model_name: str):
    if hasattr(mp, "solutions"):
        return mp.solutions.pose.Pose(
            static_image_mode=False,
            model_complexity=1,
            smooth_landmarks=True,
            min_detection_confidence=0.5,
            min_tracking_confidence=0.5,
        ), "mediapipe-blazepose"
    from ultralytics import YOLO  # type: ignore[import-not-found]
    return YOLO(model_name), f"ultralytics-pose:{model_name}"


def _estimate_pose(estimator, backend_name: str, frame, cv2, tracked: Optional[DetectionBox]):
    if backend_name == "mediapipe-blazepose":
        if tracked is None:
            return {}, 0.0
        height, width = frame.shape[:2]
        margin = 0.03
        x1, y1 = max(0.0, tracked.x1 - margin), max(0.0, tracked.y1 - margin)
        x2, y2 = min(1.0, tracked.x2 + margin), min(1.0, tracked.y2 + margin)
        crop = frame[int(y1 * height):max(int(y1 * height) + 1, int(y2 * height)), int(x1 * width):max(int(x1 * width) + 1, int(x2 * width))]
        if crop.size == 0:
            return {}, 0.0
        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        points, confidence = _pose_landmarks(estimator.process(rgb))
        remapped = {name: (x1 + point[0] * (x2 - x1), y1 + point[1] * (y2 - y1)) for name, point in points.items()}
        return remapped, confidence
    results = estimator.predict(frame, conf=0.35, verbose=False)
    if not results or results[0].keypoints is None or results[0].boxes is None:
        return {}, 0.0
    boxes = results[0].boxes
    candidates = [
        DetectionBox(float(x1), float(y1), float(x2), float(y2), float(confidence))
        for (x1, y1, x2, y2), confidence in zip(boxes.xyxyn.cpu().tolist(), boxes.conf.cpu().tolist())
    ]
    if not candidates:
        return {}, 0.0
    selected = select_pose_for_athlete(candidates, tracked)
    if selected is None:
        return {}, 0.0
    selected_index = candidates.index(selected)
    points = [
        (float(point[0]), float(point[1]))
        for point in results[0].keypoints.xyn[selected_index].cpu().tolist()
    ]
    confidence_tensor = results[0].keypoints.conf
    confidences = (
        [float(value) for value in confidence_tensor[selected_index].cpu().tolist()]
        if confidence_tensor is not None
        else [0.0] * len(points)
    )
    return coco_pose_landmarks(points, confidences)


def _load_person_detector(model_name: str):
    try:
        from ultralytics import YOLO  # type: ignore[import-not-found]
        return YOLO(model_name), f"ultralytics:{model_name}"
    except Exception:
        return None, "unavailable"


def _person_detections(detector, frame, threshold: float) -> List[DetectionBox]:
    if detector is None:
        return []
    try:
        results = detector.predict(frame, classes=[0], conf=threshold, verbose=False)
        if not results or results[0].boxes is None:
            return []
        boxes = results[0].boxes
        coordinates = boxes.xyxyn.cpu().tolist()
        confidences = boxes.conf.cpu().tolist()
        return [
            DetectionBox(float(x1), float(y1), float(x2), float(y2), float(confidence))
            for (x1, y1, x2, y2), confidence in zip(coordinates, confidences)
        ]
    except Exception:
        return []


def analyze_video(
    video_path: str,
    sport: str,
    drill: str,
    calibration_distance_meters: Optional[float] = None,
    frame_stride: int = 2,
    person_model: str = "yolov8n.pt",
    person_confidence: float = 0.35,
    verified_outcomes: Optional[Dict[str, int]] = None,
    pose_model: str = "yolov8n-pose.pt",
    object_model: Optional[str] = None,
    baseball_specialist_model: bool = False,
    reid_model: Optional[str] = None,
    expected_repetitions: Optional[int] = None,
    homography_image_points: Optional[List[Tuple[float, float]]] = None,
    homography_world_points_meters: Optional[List[Tuple[float, float]]] = None,
    homography_marker_world_points_meters: Optional[Dict[int, Tuple[float, float]]] = None,
    homography_subject: Optional[Literal["ground", "ball", "bat"]] = None,
    homography_protocol_reference: Optional[str] = None,
    lens_camera_matrix: Optional[List[List[float]]] = None,
    lens_distortion_coefficients: Optional[List[float]] = None,
    lens_reference_size: Optional[Tuple[int, int]] = None,
) -> VideoPerformanceAnalysis:
    if homography_subject not in (None, "ground", "ball", "bat"):
        raise ValueError("homography_subject must be ground, ball, or bat")
    if (homography_image_points is None) != (homography_world_points_meters is None):
        raise ValueError("homography image and world points must be supplied together")
    if homography_image_points is not None and homography_subject is None:
        raise ValueError("homography_subject is required with homography points")
    if homography_marker_world_points_meters is not None and homography_image_points is not None:
        raise ValueError("manual homography points and marker layout are mutually exclusive")
    if homography_marker_world_points_meters is not None and (homography_subject is None or not homography_protocol_reference):
        raise ValueError("homography subject and protocol reference are required with marker layout")
    if (lens_camera_matrix is None) != (lens_distortion_coefficients is None):
        raise ValueError("camera matrix and distortion coefficients must be supplied together")
    try:
        import cv2  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError("OpenCV is required for video analysis") from exc
    try:
        import mediapipe as mp  # type: ignore[import-not-found]
    except ImportError:
        mp = None

    source = Path(video_path).resolve()
    capture = cv2.VideoCapture(str(source))
    if not capture.isOpened():
        raise ValueError(f"Unable to decode video: {source}")
    disable_decoder_auto_rotation(capture)

    fps = float(capture.get(cv2.CAP_PROP_FPS) or 0.0)
    timing_fps = fps if fps > 0 else 30.0
    width = int(capture.get(cv2.CAP_PROP_FRAME_WIDTH) or 0)
    height = int(capture.get(cv2.CAP_PROP_FRAME_HEIGHT) or 0)
    expected_frames = int(capture.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    codec_value = int(capture.get(cv2.CAP_PROP_FOURCC) or 0)
    codec_fourcc = "".join(chr((codec_value >> (8 * index)) & 0xFF) for index in range(4)).strip("\x00") or "unknown"
    duration = expected_frames / timing_fps if expected_frames > 0 else 0.0
    rotation_degrees = capture_rotation_degrees(capture)
    lens_calibration = None
    if lens_camera_matrix is not None and lens_distortion_coefficients is not None:
        matrix = np.asarray(lens_camera_matrix, dtype=np.float64)
        coefficients = np.asarray(lens_distortion_coefficients, dtype=np.float64)
        if matrix.shape != (3, 3) or coefficients.size not in (4, 5, 8, 12, 14) or not np.isfinite(matrix).all() or not np.isfinite(coefficients).all():
            raise ValueError("invalid camera calibration dimensions or values")
        if lens_reference_size is not None:
            reference_width, reference_height = lens_reference_size
            if reference_width <= 0 or reference_height <= 0:
                raise ValueError("lens reference dimensions must be positive")
            scale_x, scale_y = width / reference_width, height / reference_height
            matrix = matrix.copy()
            matrix[0, 0] *= scale_x
            matrix[0, 2] *= scale_x
            matrix[1, 1] *= scale_y
            matrix[1, 2] *= scale_y
        lens_calibration = LensCalibration(matrix, coefficients)
    normalizer = FrameNormalizer(
        width,
        height,
        fps,
        rotation_degrees=rotation_degrees,
        lens_calibration=lens_calibration,
    )
    stride = effective_frame_stride(drill, frame_stride)
    detector, detector_name = _load_person_detector(person_model)
    object_detector = SportObjectDetector(
        model_path=object_model or "yolov8s-worldv2.pt",
        inference_image_size=1280 if baseball_specialist_model else None,
        sport=sport,
    )
    object_tracker = ObjectTracker()
    appearance_embedder = OnnxAppearanceEmbedder(reid_model) if reid_model else None
    athlete_reidentifier = AthleteReIdentifier(max_missing_frames=max(8, round(max(fps, 30.0))))
    samples: List[PoseSample] = []
    decoded = 0
    analyzed = 0
    athlete_frames = 0
    tracked_frames = 0
    tracked_athlete: Optional[DetectionBox] = None
    primary_track_id: Optional[int] = None
    ambiguous_identity_frames = 0
    embedding_frames = 0
    marker_observations = []
    planar_marker_observations = []
    previous_normalized_frame = None
    frame_timestamps: Dict[int, float] = {}

    pose, pose_backend = _load_pose_estimator(mp, pose_model)
    try:
        while True:
            ok, frame = capture.read()
            if not ok:
                break
            frame_index = decoded
            decoded += 1
            if frame_index % stride:
                continue
            analyzed += 1
            timestamp_ms = float(capture.get(cv2.CAP_PROP_POS_MSEC) or 0.0)
            normalizer.observe_timestamp(timestamp_ms)
            frame_timestamps[frame_index] = timestamp_ms / 1000.0 if timestamp_ms > 0 else frame_index / timing_fps
            frame = normalizer.normalize(frame)
            if previous_normalized_frame is not None and normalizer.stabilize:
                frame, stabilized = stabilize_pair(previous_normalized_frame, frame)
                if stabilized:
                    normalizer.evidence.stabilization_applied_frames += 1
            previous_normalized_frame = frame.copy()
            if sport == "soccer":
                marker_observation = detect_course_markers(frame)
                if marker_observation is not None:
                    marker_observations.append(marker_observation)
            if homography_marker_world_points_meters is not None:
                planar_marker_observation = detect_planar_markers(
                    frame,
                    allowed_ids=set(homography_marker_world_points_meters),
                )
                if planar_marker_observation is not None:
                    planar_marker_observations.append(planar_marker_observation)
            object_detections = object_detector.detect(frame, frame_index)
            object_tracker.update(object_detections, frame_index)
            detections = _person_detections(detector, frame, person_confidence)
            if detections:
                athlete_frames += 1
            appearances = []
            for item in detections:
                box = (item.x1, item.y1, item.x2, item.y2)
                embedding = appearance_embedder.embed(frame, box) if appearance_embedder else None
                if embedding is not None:
                    embedding_frames += 1
                appearances.append(extract_appearance(
                    frame,
                    box,
                    detection_confidence=item.confidence,
                    learned_embedding=embedding,
                ))
            reid_evidence = athlete_reidentifier.update(appearances, frame_index)
            if primary_track_id is None:
                primary = athlete_reidentifier.select_primary_track()
                primary_track_id = primary.track_id if primary else None
            primary = athlete_reidentifier.tracks.get(primary_track_id) if primary_track_id is not None else None
            if primary is None or primary.current is None or primary.identity_ambiguous or primary.missing_frames > 0:
                if any(item.ambiguous for item in reid_evidence):
                    ambiguous_identity_frames += 1
                tracked_athlete = None
                continue
            box = primary.current.appearance.box
            tracked_athlete = DetectionBox(*box, primary.current.match_confidence)
            tracked_frames += 1
            landmarks, confidence = _estimate_pose(pose, pose_backend, frame, cv2, tracked_athlete)
            if landmarks:
                samples.append(PoseSample(
                    frame_index=frame_index,
                    timestamp_seconds=timestamp_ms / 1000.0 if timestamp_ms > 0 else frame_index / timing_fps,
                    confidence=confidence,
                    landmarks=landmarks,
                ))
    finally:
        if hasattr(pose, "close"):
            pose.close()
        capture.release()

    course_markers = aggregate_course_markers(marker_observations)
    marker_crossing = estimate_marker_crossing(samples, course_markers) if course_markers else None
    effective_distance = calibration_distance_meters
    calibration_method = None
    calibration_confidence = 0.0
    if marker_crossing is not None:
        calibration_method = "aruco-course-markers"
        calibration_confidence = marker_crossing.confidence
    elif effective_distance is not None:
        calibration_method = "verified-distance-pose-span"
        calibration_confidence = 1.0

    reliable_objects = best_reliable_evidence(object_tracker.tracks, analyzed)
    planar_calibration: Optional[HomographyCalibration] = None
    if homography_image_points and homography_world_points_meters and lens_calibration is not None:
        normalized_points = normalizer.normalize_points(homography_image_points)
        image_pixels = [
            (point[0] * normalizer.target_size[0], point[1] * normalizer.target_size[1])
            for point in normalized_points
        ]
        planar_calibration = estimate_homography(
            image_pixels,
            homography_world_points_meters,
            source="verified-field-correspondences",
        )
    elif homography_marker_world_points_meters and lens_calibration is not None and homography_protocol_reference:
        planar_calibration = estimate_planar_marker_homography(
            planar_marker_observations,
            homography_marker_world_points_meters,
            source=f"verified-planar-marker-layout:{homography_protocol_reference}",
        )
    if planar_calibration is not None and calibration_method is None:
        calibration_method = "verified-planar-marker-homography" if homography_marker_world_points_meters else "verified-planar-homography"
        calibration_confidence = planar_calibration.confidence
    physical_measurements: Dict[str, PhysicalObjectMeasurement] = {}
    if planar_calibration is not None:
        for object_name in ("ball", "bat"):
            if (
                object_name == "ball"
                and not baseball_pitch_speed_authorized(drill, baseball_specialist_model)
            ):
                continue
            if homography_subject != object_name:
                continue
            object_item = reliable_objects.get(object_name)
            if object_item is None:
                continue
            trajectory = physical_trajectory(
                (
                    (
                        frame_timestamps.get(frame_index, frame_index / timing_fps),
                        x * normalizer.target_size[0],
                        y * normalizer.target_size[1],
                    )
                    for frame_index, x, y in object_item.centers
                ),
                planar_calibration,
            )
            if trajectory.speed_mps is not None and not trajectory.limitations:
                physical_measurements[f"{object_name}_speed_mps"] = PhysicalObjectMeasurement(
                    value=trajectory.speed_mps,
                    unit="m/s",
                    confidence=min(planar_calibration.confidence, object_item.median_confidence, trajectory.confidence),
                    method=f"{object_name} detector track projected through verified planar homography",
                    subject=cast(Literal["ball", "bat"], object_name),
                )

    clip_duration = max(duration, max(frame_timestamps.values(), default=0.0))
    decode_completion_rate = min(1.0, decoded / expected_frames) if expected_frames > 0 else (1.0 if decoded > 0 else 0.0)
    decoder_complete = decode_is_complete(decoded, expected_frames)
    object_detector_failures = int(getattr(object_detector, "inference_failures", 0))
    object_detector_healthy = object_detector_failures <= max(1, round(analyzed * 0.02))
    object_evidence_required = drill not in ("sprint-20m", "agility-5-10-5", "shuttle-endurance")
    segmentation = segment_drill_attempts(
        drill,
        samples,
        reliable_objects,
        clip_duration,
        expected_repetitions,
        (
            marker_crossing.start_seconds,
            marker_crossing.finish_seconds,
            marker_crossing.confidence,
        ) if marker_crossing else None,
        (planar_calibration is not None and homography_subject == "ground") or marker_crossing is not None,
    )
    recognition = recognize_sport_and_drill(
        sport,
        drill,
        samples,
        reliable_objects,
        segmentation,
        clip_duration,
        (
            f"verified-planar-homography:{homography_protocol_reference}"
            if planar_calibration is not None and homography_subject == "ground" and homography_protocol_reference
            else calibration_method
        ),
    )
    primary_track = athlete_reidentifier.tracks.get(primary_track_id) if primary_track_id is not None else None
    embedding_inference_failures = appearance_embedder.inference_failures if appearance_embedder else 0
    embedding_healthy = bool(
        appearance_embedder
        and embedding_frames >= max(4, round(analyzed * 0.30))
        and embedding_inference_failures <= max(1, round(analyzed * 0.02))
    )
    identity_confirmed = bool(
        primary_track
        and embedding_healthy
        and len(primary_track.states) >= max(4, round(analyzed * 0.30))
        and ambiguous_identity_frames / max(1, analyzed) <= 0.02
    )

    analysis = analyze_pose_sequence(
        sport=cast(Sport, sport),
        drill=drill,
        samples=samples,
        total_frames=analyzed,
        calibration_distance_meters=effective_distance,
        calibration_elapsed_seconds=marker_crossing.elapsed_seconds if marker_crossing else None,
        calibration_confidence=calibration_confidence,
        verified_outcomes=verified_outcomes,
        physical_object_measurements=physical_measurements,
    )
    if not baseball_pitch_speed_authorized(drill, baseball_specialist_model):
        metric = analysis.metrics.get("speed_mps")
        if metric is not None:
            metric.value = None
            metric.confidence = 0.0
            metric.validation_status = "unavailable"
            metric.limitations.append("baseball-specialist-object-model-required")
    if (
        recognition.status is not RecognitionStatus.CONFIRMED
        or not segmentation.complete
        or not identity_confirmed
        or not decoder_complete
        or (object_evidence_required and not object_detector_healthy)
    ):
        release_reasons = list(recognition.reasons) + list(segmentation.reasons)
        if recognition.status is not RecognitionStatus.CONFIRMED:
            release_reasons.append("sport-drill-not-independently-confirmed")
        if not segmentation.complete:
            release_reasons.append("attempt-segmentation-incomplete")
        if not identity_confirmed:
            release_reasons.append("athlete-identity-continuity-unconfirmed")
        if not embedding_healthy:
            release_reasons.append("athlete-reidentification-model-unavailable-or-unhealthy")
        if not decoder_complete:
            release_reasons.append("video-decode-incomplete")
        if object_evidence_required and not object_detector_healthy:
            release_reasons.append("object-detector-inference-unreliable")
        for metric in analysis.metrics.values():
            metric.value = None
            metric.confidence = 0.0
            metric.validation_status = "unavailable"
            metric.limitations.extend(reason for reason in release_reasons if reason not in metric.limitations)
        analysis.overall_score = None
        analysis.reliability.status = "unavailable"
        analysis.reliability.score = 0.0
        analysis.reliability.limitations.extend(
            reason for reason in release_reasons if reason not in analysis.reliability.limitations
        )
    evidence = VideoEvidence(
        source_path=str(source),
        fps=fps,
        width=width,
        height=height,
        duration_seconds=duration,
        decoded_frames=decoded,
        analyzed_frames=analyzed,
        expected_frames=expected_frames,
        decode_completion_rate=decode_completion_rate,
        codec_fourcc=codec_fourcc,
        object_detector_failures=object_detector_failures,
        object_detector_healthy=object_detector_healthy,
        athlete_detected_frames=athlete_frames,
        athlete_detection_rate=athlete_frames / analyzed if analyzed else 0.0,
        pose_detected_frames=len(samples),
        pose_detection_rate=len(samples) / analyzed if analyzed else 0.0,
        athlete_tracked_frames=tracked_frames,
        athlete_tracking_rate=tracked_frames / analyzed if analyzed else 0.0,
        detector=detector_name,
        pose_backend=pose_backend,
        calibration_method=calibration_method,
        calibration_confidence=calibration_confidence,
        calibration_start_seconds=marker_crossing.start_seconds if marker_crossing else None,
        calibration_finish_seconds=marker_crossing.finish_seconds if marker_crossing else None,
        calibration_elapsed_seconds=marker_crossing.elapsed_seconds if marker_crossing else None,
        calibration_marker_observations=course_markers.observations if course_markers else 0,
        normalization=asdict(normalizer.evidence),
        object_evidence={name: asdict(item) for name, item in reliable_objects.items()},
        athlete_reidentification={
            "primary_track_id": primary_track_id,
            "active_track_count": len(athlete_reidentifier.tracks),
            "ambiguous_identity_frames": ambiguous_identity_frames,
            "embedding_model": appearance_embedder.model_name if appearance_embedder else None,
            "embedding_frames": embedding_frames,
            "embedding_inference_failures": embedding_inference_failures,
            "embedding_last_error": appearance_embedder.last_error if appearance_embedder else None,
            "embedding_healthy": embedding_healthy,
            "identity_confirmed": identity_confirmed,
        },
        sport_drill_recognition=asdict(recognition),
        segmentation=asdict(segmentation),
        planar_calibration={
            "source": planar_calibration.source,
            "confidence": planar_calibration.confidence,
            "inlier_count": planar_calibration.inlier_count,
            "correspondence_count": planar_calibration.correspondence_count,
            "median_reprojection_error_pixels": planar_calibration.median_reprojection_error_pixels,
            "subject": homography_subject,
        } if planar_calibration else None,
    )
    return VideoPerformanceAnalysis(evidence=evidence, analysis=analysis)


def _json_default(value):
    from enum import Enum

    if hasattr(value, "__dataclass_fields__"):
        return asdict(value)
    if isinstance(value, Enum):
        return value.value
    if hasattr(value, "tolist"):
        return value.tolist()
    raise TypeError(f"Cannot serialize {type(value)!r}")


def main() -> None:
    parser = argparse.ArgumentParser(description="Athlemetry multi-sport video analysis")
    parser.add_argument("--video", required=True)
    parser.add_argument("--sport", required=True, choices=["soccer", "basketball", "baseball"])
    parser.add_argument("--drill", required=True)
    parser.add_argument("--distance-meters", type=float)
    parser.add_argument("--frame-stride", type=int, default=2)
    parser.add_argument("--person-model", default="yolov8n.pt")
    parser.add_argument("--pose-model", default="yolov8n-pose.pt")
    parser.add_argument("--object-model")
    parser.add_argument("--baseball-specialist-model", action="store_true")
    parser.add_argument("--reid-model")
    parser.add_argument("--outcomes-json")
    parser.add_argument("--expected-repetitions", type=int)
    parser.add_argument("--homography-json", help="Verified {imagePoints:[[x,y]],worldPointsMeters:[[x,y]]}; image points are normalized")
    parser.add_argument("--camera-calibration-json", help="Verified intrinsic matrix, distortion coefficients, and reference dimensions")
    args = parser.parse_args()
    verified_outcomes = json.loads(args.outcomes_json) if args.outcomes_json else None
    homography = json.loads(args.homography_json) if args.homography_json else {}
    camera_calibration = json.loads(args.camera_calibration_json) if args.camera_calibration_json else {}
    result = analyze_video(
        args.video,
        args.sport,
        args.drill,
        calibration_distance_meters=args.distance_meters,
        frame_stride=args.frame_stride,
        person_model=args.person_model,
        pose_model=args.pose_model,
        object_model=args.object_model,
        baseball_specialist_model=args.baseball_specialist_model,
        reid_model=args.reid_model,
        verified_outcomes=verified_outcomes,
        expected_repetitions=args.expected_repetitions,
        homography_image_points=homography.get("imagePoints"),
        homography_world_points_meters=homography.get("worldPointsMeters"),
        homography_marker_world_points_meters={
            int(marker_id): tuple(point)
            for marker_id, point in homography.get("markerWorldPointsMetersById", {}).items()
        } or None,
        homography_subject=homography.get("subject"),
        homography_protocol_reference=homography.get("protocolReference"),
        lens_camera_matrix=camera_calibration.get("cameraMatrix"),
        lens_distortion_coefficients=camera_calibration.get("distortionCoefficients"),
        lens_reference_size=(camera_calibration["imageWidth"], camera_calibration["imageHeight"]) if camera_calibration else None,
    )
    print(json.dumps(result, default=_json_default, separators=(",", ":")))


if __name__ == "__main__":
    main()
