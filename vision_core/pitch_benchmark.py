"""Ground-truth evaluation for high-speed baseball pitch ball tracking.

This module evaluates already annotated, permission-cleared pitch footage.  It
never infers radar/optical truth from video: missing references are a release
failure, not a value to estimate.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import ceil, sqrt
from typing import Dict, Iterable, Literal, Mapping, Optional, Sequence, Tuple


PitchPhase = Literal["release", "flight", "plate", "catcher_glove"]
Box = Tuple[float, float, float, float]
PHASES: Tuple[PitchPhase, ...] = ("release", "flight", "plate", "catcher_glove")
MIN_TRACKING_PRECISION = 0.95
MIN_TRACKING_RECALL = 0.95
MIN_PHASE_RECALL = 0.95


@dataclass(frozen=True)
class PitchBallAnnotation:
    clip_id: str
    frame_index: int
    phase: PitchPhase
    track_id: str
    box: Box


@dataclass(frozen=True)
class PitchBallPrediction:
    clip_id: str
    frame_index: int
    track_id: str
    box: Box
    confidence: float


@dataclass(frozen=True)
class PitchSpeedReference:
    clip_id: str
    speed_mps: float
    source: Literal["calibrated-doppler-radar", "optical-pitch-tracking", "calibrated-high-speed-optical"]


@dataclass(frozen=True)
class PitchTrackingBenchmark:
    observations: int
    precision: float
    recall: float
    hota: float
    phase_recall: Dict[PitchPhase, float]
    pitch_speed_p90_error_mps: Optional[float]
    speed_reference_count: int
    released: bool
    release_reasons: Tuple[str, ...]


def _iou(first: Box, second: Box) -> float:
    ax1, ay1, ax2, ay2 = first
    bx1, by1, bx2, by2 = second
    intersection = max(0.0, min(ax2, bx2) - max(ax1, bx1)) * max(0.0, min(ay2, by2) - max(ay1, by1))
    union = max(0.0, ax2 - ax1) * max(0.0, ay2 - ay1) + max(0.0, bx2 - bx1) * max(0.0, by2 - by1) - intersection
    return intersection / union if union > 0 else 0.0


def _p90(values: Iterable[float]) -> Optional[float]:
    ordered = sorted(values)
    if not ordered:
        return None
    return ordered[max(0, ceil(len(ordered) * 0.9) - 1)]


def evaluate_pitch_tracking(
    annotations: Sequence[PitchBallAnnotation],
    predictions: Sequence[PitchBallPrediction],
    references: Sequence[PitchSpeedReference],
    estimated_speeds_mps: Mapping[str, float],
    iou_threshold: float = 0.5,
) -> PitchTrackingBenchmark:
    """Evaluate held-out pitch tracks against frame annotations and external speed truth.

    HOTA uses the detection/association decomposition for the annotated baseball
    tracks. It is intentionally computed from all predictions, including false
    positives and identity switches, so failed analyses remain in the denominator.
    """
    if not 0 < iou_threshold <= 1:
        raise ValueError("iou_threshold must be in (0, 1]")

    annotations_by_frame: Dict[Tuple[str, int], list[PitchBallAnnotation]] = {}
    predictions_by_frame: Dict[Tuple[str, int], list[PitchBallPrediction]] = {}
    for annotation in annotations:
        annotations_by_frame.setdefault((annotation.clip_id, annotation.frame_index), []).append(annotation)
    for prediction in predictions:
        predictions_by_frame.setdefault((prediction.clip_id, prediction.frame_index), []).append(prediction)

    matches: list[Tuple[PitchBallAnnotation, PitchBallPrediction]] = []
    false_positives = 0
    false_negatives = 0
    phase_total: Dict[PitchPhase, int] = {phase: 0 for phase in PHASES}
    phase_true_positive: Dict[PitchPhase, int] = {phase: 0 for phase in PHASES}

    for key in set(annotations_by_frame) | set(predictions_by_frame):
        expected = annotations_by_frame.get(key, [])
        observed = sorted(predictions_by_frame.get(key, []), key=lambda item: item.confidence, reverse=True)
        unmatched = set(range(len(expected)))
        for prediction in observed:
            candidates = [
                (index, _iou(prediction.box, expected[index].box))
                for index in unmatched
                if _iou(prediction.box, expected[index].box) >= iou_threshold
            ]
            if not candidates:
                false_positives += 1
                continue
            annotation_index, _ = max(candidates, key=lambda item: item[1])
            unmatched.remove(annotation_index)
            annotation = expected[annotation_index]
            matches.append((annotation, prediction))
            phase_true_positive[annotation.phase] += 1
        false_negatives += len(unmatched)
        for annotation in expected:
            phase_total[annotation.phase] += 1

    true_positives = len(matches)
    precision = true_positives / (true_positives + false_positives) if true_positives + false_positives else 0.0
    recall = true_positives / (true_positives + false_negatives) if true_positives + false_negatives else 0.0
    detection_accuracy = true_positives / (true_positives + false_positives + false_negatives) if true_positives + false_positives + false_negatives else 0.0

    matched_by_gt: Dict[str, list[str]] = {}
    matched_by_prediction: Dict[str, list[str]] = {}
    for annotation, prediction in matches:
        matched_by_gt.setdefault(annotation.track_id, []).append(prediction.track_id)
        matched_by_prediction.setdefault(prediction.track_id, []).append(annotation.track_id)
    association_scores = []
    for annotation, prediction in matches:
        true_associations = sum(1 for track_id in matched_by_gt[annotation.track_id] if track_id == prediction.track_id)
        false_associations = len(matched_by_gt[annotation.track_id]) - true_associations
        false_associations += len(matched_by_prediction[prediction.track_id]) - true_associations
        association_scores.append(true_associations / (true_associations + false_associations) if true_associations + false_associations else 0.0)
    association_accuracy = sum(association_scores) / len(association_scores) if association_scores else 0.0
    hota = sqrt(detection_accuracy * association_accuracy)

    phase_recall: Dict[PitchPhase, float] = {
        phase: phase_true_positive[phase] / phase_total[phase] if phase_total[phase] else 0.0
        for phase in PHASES
    }
    reference_by_clip = {reference.clip_id: reference for reference in references}
    errors = [
        abs(float(estimated_speeds_mps[clip_id]) - reference.speed_mps)
        for clip_id, reference in reference_by_clip.items()
        if clip_id in estimated_speeds_mps
    ]
    speed_p90 = _p90(errors)

    reasons = []
    if len(annotations) < 500:
        reasons.append("ball-track-corpus-insufficient")
    if precision < MIN_TRACKING_PRECISION:
        reasons.append("ball-track-precision-below-threshold")
    if recall < MIN_TRACKING_RECALL:
        reasons.append("ball-track-recall-below-threshold")
    if hota < 0.75:
        reasons.append("ball-track-hota-below-threshold")
    for phase in PHASES:
        if phase_total[phase] == 0:
            reasons.append(f"{phase}-observations-insufficient")
        elif phase_recall[phase] < MIN_PHASE_RECALL:
            reasons.append(f"{phase}-recall-below-threshold")
    if len(reference_by_clip) < 100 or len(errors) != len(reference_by_clip):
        reasons.append("pitch-speed-reference-insufficient")
    if speed_p90 is None or speed_p90 > 0.67:
        reasons.append("pitch-speed-p90-error-above-threshold")

    return PitchTrackingBenchmark(
        observations=len(annotations), precision=precision, recall=recall,
        hota=hota, phase_recall=phase_recall, pitch_speed_p90_error_mps=speed_p90,
        speed_reference_count=len(reference_by_clip), released=not reasons,
        release_reasons=tuple(reasons),
    )
