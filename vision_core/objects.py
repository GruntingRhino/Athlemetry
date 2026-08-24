"""Sport-object detection and temporal tracking.

The default COCO detector can identify sports balls and baseball bats. Other
canonical objects require a configured detector whose labels map to the aliases
below. Unsupported classes remain absent; callers must fail closed.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum
from math import hypot
from statistics import median
from typing import Any, Dict, Iterable, List, Mapping, Optional, Sequence, Tuple

import numpy as np


class SportObjectClass(str, Enum):
    BALL = "ball"
    BAT = "bat"
    HOOP = "hoop"
    GOAL = "goal"
    PLATE = "plate"
    CONE = "cone"
    TARGET = "target"


SPORT_REQUIRED_OBJECTS: Dict[str, Tuple[SportObjectClass, ...]] = {
    "soccer": (SportObjectClass.BALL, SportObjectClass.GOAL, SportObjectClass.CONE, SportObjectClass.TARGET),
    "basketball": (SportObjectClass.BALL, SportObjectClass.HOOP, SportObjectClass.TARGET),
    "baseball": (SportObjectClass.BALL, SportObjectClass.BAT, SportObjectClass.PLATE, SportObjectClass.TARGET),
}

_LABEL_ALIASES: Dict[str, SportObjectClass] = {
    "sports ball": SportObjectClass.BALL,
    "sport ball": SportObjectClass.BALL,
    "ball": SportObjectClass.BALL,
    "soccer ball": SportObjectClass.BALL,
    "basketball": SportObjectClass.BALL,
    "baseball": SportObjectClass.BALL,
    "baseball bat": SportObjectClass.BAT,
    "bat": SportObjectClass.BAT,
    "basketball hoop": SportObjectClass.HOOP,
    "basketball rim": SportObjectClass.HOOP,
    "hoop": SportObjectClass.HOOP,
    "basket": SportObjectClass.HOOP,
    "soccer goal": SportObjectClass.GOAL,
    "goal": SportObjectClass.GOAL,
    "home plate": SportObjectClass.PLATE,
    "baseball plate": SportObjectClass.PLATE,
    "plate": SportObjectClass.PLATE,
    "traffic cone": SportObjectClass.CONE,
    "sports cone": SportObjectClass.CONE,
    "cone": SportObjectClass.CONE,
    "target": SportObjectClass.TARGET,
    "target zone": SportObjectClass.TARGET,
    "sports target": SportObjectClass.TARGET,
    "pitching target": SportObjectClass.TARGET,
}

OPEN_VOCABULARY_LABELS = (
    "sports ball",
    "baseball bat",
    "basketball hoop",
    "soccer goal",
    "home plate",
    "sports cone",
    "sports target",
)

_SPORT_OPEN_VOCABULARY_LABELS: Dict[str, Tuple[str, ...]] = {
    "soccer": ("soccer ball", "soccer goal", "traffic cone", "sports target"),
    "basketball": ("basketball", "basketball hoop", "basketball rim", "sports target"),
    "baseball": ("baseball", "baseball bat", "home plate", "pitching target"),
}


def open_vocabulary_labels_for_sport(sport: Optional[str]) -> Tuple[str, ...]:
    """Use sport-specific prompts when the drill establishes the sport.

    Open-vocabulary matching is susceptible to cross-sport false positives;
    unknown sports retain the full canonical prompt set rather than guessing.
    """
    return _SPORT_OPEN_VOCABULARY_LABELS.get((sport or "").strip().lower(), OPEN_VOCABULARY_LABELS)


def canonical_object_label(label: str) -> Optional[SportObjectClass]:
    normalized = " ".join(label.strip().lower().replace("_", " ").replace("-", " ").split())
    return _LABEL_ALIASES.get(normalized)


@dataclass(frozen=True)
class ObjectDetection:
    object_class: SportObjectClass
    box: Tuple[float, float, float, float]
    confidence: float
    frame_index: int
    source_label: str

    @property
    def center(self) -> Tuple[float, float]:
        x1, y1, x2, y2 = self.box
        return ((x1 + x2) / 2.0, (y1 + y2) / 2.0)

    @property
    def area(self) -> float:
        x1, y1, x2, y2 = self.box
        return max(0.0, x2 - x1) * max(0.0, y2 - y1)


@dataclass
class ObjectTrack:
    track_id: int
    object_class: SportObjectClass
    detections: List[ObjectDetection] = field(default_factory=list)
    missing_frames: int = 0
    velocity: Tuple[float, float] = (0.0, 0.0)
    ambiguous: bool = False
    ambiguity_events: int = 0

    @property
    def latest(self) -> Optional[ObjectDetection]:
        return self.detections[-1] if self.detections else None

    def predicted_center(self, frame_index: int) -> Tuple[float, float]:
        if not self.latest:
            return (0.0, 0.0)
        delta = max(0, frame_index - self.latest.frame_index)
        x, y = self.latest.center
        return (x + self.velocity[0] * delta, y + self.velocity[1] * delta)


@dataclass(frozen=True)
class ObjectEvidence:
    object_class: SportObjectClass
    track_id: int
    observations: int
    first_frame: int
    last_frame: int
    median_confidence: float
    analyzed_frame_coverage: float
    trajectory_consistency: float
    is_reliable: bool
    limitations: Tuple[str, ...]
    centers: Tuple[Tuple[int, float, float], ...]


class SportObjectDetector:
    """Adapter around an Ultralytics-compatible detector.

    A custom model may be injected for tests or deployment. Labels which cannot
    be mapped to canonical sport objects are ignored rather than guessed.
    """

    def __init__(
        self,
        model_path: str = "yolov8n.pt",
        confidence_threshold: float = 0.35,
        model: Any = None,
        inference_image_size: Optional[int] = None,
        sport: Optional[str] = None,
    ):
        if not 0.0 <= confidence_threshold <= 1.0:
            raise ValueError("confidence_threshold must be between 0 and 1")
        if inference_image_size is not None and inference_image_size <= 0:
            raise ValueError("inference_image_size must be positive")
        if model is None:
            if "world" in model_path.lower():
                from ultralytics import YOLOWorld  # type: ignore[import-not-found]
                model = YOLOWorld(model_path)
                model.set_classes(list(open_vocabulary_labels_for_sport(sport)))
            else:
                from ultralytics import YOLO  # type: ignore[import-not-found]
                model = YOLO(model_path)
        self.model = model
        self.confidence_threshold = confidence_threshold
        self.inference_image_size = inference_image_size
        self.inference_failures = 0
        self.last_error: Optional[str] = None

    def detect(self, frame: np.ndarray, frame_index: int) -> List[ObjectDetection]:
        try:
            kwargs = {"conf": self.confidence_threshold, "verbose": False}
            if self.inference_image_size is not None:
                kwargs["imgsz"] = self.inference_image_size
            results = self.model.predict(frame, **kwargs)
        except Exception as exc:
            self.inference_failures += 1
            self.last_error = f"{type(exc).__name__}: {exc}"[:240]
            return []
        if not results or getattr(results[0], "boxes", None) is None:
            return []
        boxes = results[0].boxes
        names: Mapping[int, str] = getattr(results[0], "names", None) or getattr(self.model, "names", {})
        height, width = frame.shape[:2]
        if height <= 0 or width <= 0:
            return []
        output: List[ObjectDetection] = []
        for coords, confidence, class_id in zip(
            boxes.xyxy.cpu().tolist(), boxes.conf.cpu().tolist(), boxes.cls.cpu().tolist()
        ):
            confidence = float(confidence)
            if confidence < self.confidence_threshold:
                continue
            source_label = str(names.get(int(class_id), int(class_id)))
            canonical = canonical_object_label(source_label)
            if canonical is None:
                continue
            x1, y1, x2, y2 = (float(value) for value in coords)
            normalized = (
                max(0.0, min(1.0, x1 / width)), max(0.0, min(1.0, y1 / height)),
                max(0.0, min(1.0, x2 / width)), max(0.0, min(1.0, y2 / height)),
            )
            if normalized[2] <= normalized[0] or normalized[3] <= normalized[1]:
                continue
            output.append(ObjectDetection(canonical, normalized, confidence, frame_index, source_label))
        return output


def _iou(first: ObjectDetection, second: ObjectDetection) -> float:
    ax1, ay1, ax2, ay2 = first.box
    bx1, by1, bx2, by2 = second.box
    intersection = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
    union = first.area + second.area - intersection
    return intersection / union if union > 0 else 0.0


class ObjectTracker:
    """Class-aware motion/IoU tracker which preserves tracks over short occlusion."""

    def __init__(self, max_missing_frames: int = 15, max_center_distance: float = 0.18, ambiguity_margin: float = 0.04):
        self.max_missing_frames = max_missing_frames
        self.max_center_distance = max_center_distance
        self.ambiguity_margin = ambiguity_margin
        self.tracks: List[ObjectTrack] = []
        self._next_id = 1

    def update(self, detections: Sequence[ObjectDetection], frame_index: int) -> List[ObjectTrack]:
        remaining = list(detections)
        ambiguous_detection_ids: set[int] = set()
        for track in self.tracks:
            if not track.latest:
                continue
            scored: List[Tuple[float, int, ObjectDetection]] = []
            predicted = track.predicted_center(frame_index)
            for index, detection in enumerate(remaining):
                if detection.object_class != track.object_class:
                    continue
                distance = hypot(predicted[0] - detection.center[0], predicted[1] - detection.center[1])
                if distance > self.max_center_distance * (1.0 + track.missing_frames * 0.25):
                    continue
                score = 0.55 * _iou(track.latest, detection) + 0.35 * max(0.0, 1.0 - distance / self.max_center_distance) + 0.10 * detection.confidence
                scored.append((score, index, detection))
            scored.sort(key=lambda item: item[0], reverse=True)
            if not scored:
                track.missing_frames += 1
                continue
            best = scored[0]
            track.ambiguous = len(scored) > 1 and best[0] - scored[1][0] < self.ambiguity_margin
            if track.ambiguous:
                track.ambiguity_events += 1
                ambiguous_detection_ids.update(id(item[2]) for item in scored)
                track.missing_frames += 1
                continue
            _, index, detection = best
            previous = track.latest
            delta = max(1, detection.frame_index - previous.frame_index)
            track.velocity = ((detection.center[0] - previous.center[0]) / delta, (detection.center[1] - previous.center[1]) / delta)
            track.detections.append(detection)
            track.missing_frames = 0
            remaining.pop(index)

        for detection in remaining:
            if id(detection) in ambiguous_detection_ids:
                continue
            self.tracks.append(ObjectTrack(self._next_id, detection.object_class, [detection]))
            self._next_id += 1
        self.tracks = [track for track in self.tracks if track.missing_frames <= self.max_missing_frames]
        return list(self.tracks)


def compute_object_evidence(track: ObjectTrack, total_analyzed_frames: int) -> ObjectEvidence:
    if not track.detections:
        return ObjectEvidence(track.object_class, track.track_id, 0, 0, 0, 0.0, 0.0, 0.0, False, ("no-detections",), ())
    confidences = [item.confidence for item in track.detections]
    centers = [(item.frame_index, *item.center) for item in track.detections]
    jumps = [hypot(a[1] - b[1], a[2] - b[2]) for a, b in zip(centers, centers[1:])]
    trajectory_consistency = 1.0
    if len(jumps) >= 2:
        typical = median(jumps)
        deviation = median(abs(value - typical) for value in jumps)
        trajectory_consistency = max(0.0, 1.0 - deviation / max(0.01, typical))
    coverage = len(track.detections) / max(1, total_analyzed_frames)
    limitations: List[str] = []
    if len(track.detections) < 5:
        limitations.append("insufficient-observations")
    if median(confidences) < 0.40:
        limitations.append("low-detection-confidence")
    if trajectory_consistency < 0.30:
        limitations.append("inconsistent-trajectory")
    span = max(1, track.detections[-1].frame_index - track.detections[0].frame_index + 1)
    if len(track.detections) / span < 0.35:
        limitations.append("track-temporal-coverage-insufficient")
    if track.ambiguous or track.ambiguity_events:
        limitations.append("track-association-ambiguous")
    return ObjectEvidence(
        track.object_class, track.track_id, len(track.detections), track.detections[0].frame_index,
        track.detections[-1].frame_index, float(median(confidences)), coverage,
        trajectory_consistency, not limitations, tuple(limitations), tuple(centers),
    )


def best_reliable_evidence(tracks: Iterable[ObjectTrack], total_analyzed_frames: int) -> Dict[str, ObjectEvidence]:
    result: Dict[str, ObjectEvidence] = {}
    for track in tracks:
        evidence = compute_object_evidence(track, total_analyzed_frames)
        key = track.object_class.value
        current = result.get(key)
        if evidence.is_reliable and (current is None or evidence.observations > current.observations):
            result[key] = evidence
    return result
