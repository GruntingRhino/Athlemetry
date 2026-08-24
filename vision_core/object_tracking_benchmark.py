"""Fail-closed per-class evaluation for the seven canonical sports objects.

This evaluates independently annotated, held-out footage. It deliberately keeps
classes separate so a strong ball detector cannot hide failures on goals, hoops,
plates, cones, bats, or targets.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import sqrt
from typing import Dict, Iterable, Mapping, Sequence, Tuple

from .objects import SportObjectClass

Box = Tuple[float, float, float, float]
MIN_OBSERVATIONS_PER_CLASS = 500
MIN_PRECISION_PER_CLASS = 0.95
MIN_RECALL_PER_CLASS = 0.95
MIN_HOTA_PER_CLASS = 0.75


@dataclass(frozen=True)
class ObjectTrackAnnotation:
    clip_id: str
    frame_index: int
    object_class: SportObjectClass
    track_id: str
    box: Box


@dataclass(frozen=True)
class ObjectTrackPrediction:
    clip_id: str
    frame_index: int
    object_class: SportObjectClass
    track_id: str
    box: Box
    confidence: float


@dataclass(frozen=True)
class ObjectClassTrackingMetrics:
    observations: int
    precision: float
    recall: float
    hota: float
    release_reasons: Tuple[str, ...]

    @property
    def released(self) -> bool:
        return not self.release_reasons


@dataclass(frozen=True)
class ObjectTrackingBenchmark:
    by_class: Mapping[SportObjectClass, ObjectClassTrackingMetrics]
    released: bool


def _iou(first: Box, second: Box) -> float:
    ax1, ay1, ax2, ay2 = first
    bx1, by1, bx2, by2 = second
    intersection = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
    first_area = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1)
    second_area = max(0.0, bx2 - bx1) * max(0.0, by2 - by1)
    union = first_area + second_area - intersection
    return intersection / union if union > 0 else 0.0


def _evaluate_class(
    annotations: Sequence[ObjectTrackAnnotation],
    predictions: Sequence[ObjectTrackPrediction],
    iou_threshold: float,
) -> ObjectClassTrackingMetrics:
    expected_by_frame: Dict[Tuple[str, int], list[ObjectTrackAnnotation]] = {}
    observed_by_frame: Dict[Tuple[str, int], list[ObjectTrackPrediction]] = {}
    for item in annotations:
        expected_by_frame.setdefault((item.clip_id, item.frame_index), []).append(item)
    for item in predictions:
        observed_by_frame.setdefault((item.clip_id, item.frame_index), []).append(item)

    matches: list[Tuple[ObjectTrackAnnotation, ObjectTrackPrediction]] = []
    false_positives = 0
    false_negatives = 0
    for key in set(expected_by_frame) | set(observed_by_frame):
        expected = expected_by_frame.get(key, [])
        unmatched = set(range(len(expected)))
        for prediction in sorted(observed_by_frame.get(key, []), key=lambda item: item.confidence, reverse=True):
            candidates = [(index, _iou(prediction.box, expected[index].box)) for index in unmatched]
            candidates = [(index, score) for index, score in candidates if score >= iou_threshold]
            if not candidates:
                false_positives += 1
                continue
            index, _ = max(candidates, key=lambda item: item[1])
            unmatched.remove(index)
            matches.append((expected[index], prediction))
        false_negatives += len(unmatched)

    true_positives = len(matches)
    precision = true_positives / (true_positives + false_positives) if true_positives + false_positives else 0.0
    recall = true_positives / (true_positives + false_negatives) if true_positives + false_negatives else 0.0
    detection_accuracy = true_positives / (true_positives + false_positives + false_negatives) if true_positives + false_positives + false_negatives else 0.0
    matched_by_truth: Dict[str, list[str]] = {}
    matched_by_prediction: Dict[str, list[str]] = {}
    for annotation, prediction in matches:
        matched_by_truth.setdefault(annotation.track_id, []).append(prediction.track_id)
        matched_by_prediction.setdefault(prediction.track_id, []).append(annotation.track_id)
    association = []
    for annotation, prediction in matches:
        true_associations = sum(track_id == prediction.track_id for track_id in matched_by_truth[annotation.track_id])
        false_associations = len(matched_by_truth[annotation.track_id]) - true_associations
        false_associations += len(matched_by_prediction[prediction.track_id]) - true_associations
        association.append(true_associations / (true_associations + false_associations) if true_associations + false_associations else 0.0)
    hota = sqrt(detection_accuracy * (sum(association) / len(association) if association else 0.0))

    reasons = []
    if len(annotations) < MIN_OBSERVATIONS_PER_CLASS:
        reasons.append("corpus-insufficient")
    if precision < MIN_PRECISION_PER_CLASS:
        reasons.append("precision-below-threshold")
    if recall < MIN_RECALL_PER_CLASS:
        reasons.append("recall-below-threshold")
    if hota < MIN_HOTA_PER_CLASS:
        reasons.append("hota-below-threshold")
    return ObjectClassTrackingMetrics(len(annotations), precision, recall, hota, tuple(reasons))


def evaluate_object_tracking(
    annotations: Iterable[ObjectTrackAnnotation],
    predictions: Iterable[ObjectTrackPrediction],
    iou_threshold: float = 0.5,
) -> ObjectTrackingBenchmark:
    """Evaluate each canonical object independently; every class must release."""
    if not 0 < iou_threshold <= 1:
        raise ValueError("iou_threshold must be in (0, 1]")
    expected = tuple(annotations)
    observed = tuple(predictions)
    by_class = {
        object_class: _evaluate_class(
            [item for item in expected if item.object_class is object_class],
            [item for item in observed if item.object_class is object_class],
            iou_threshold,
        )
        for object_class in SportObjectClass
    }
    return ObjectTrackingBenchmark(by_class, all(metrics.released for metrics in by_class.values()))
