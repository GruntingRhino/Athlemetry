"""Drill-aware action, attempt, and repetition segmentation.

Rules are deterministic and conservative. They produce structured invalidity
reasons and do not convert an uncertain segment into a valid performance result.
"""
from __future__ import annotations

from dataclasses import dataclass
from math import hypot
from typing import Dict, List, Optional, Sequence, Tuple

import numpy as np

from .metrics import PoseSample
from .objects import ObjectEvidence


@dataclass(frozen=True)
class AttemptSegment:
    attempt_index: int
    action: str
    start_seconds: float
    end_seconds: float
    confidence: float
    complete: bool
    valid: bool
    reasons: Tuple[str, ...]


@dataclass(frozen=True)
class SegmentationResult:
    drill: str
    attempts: Tuple[AttemptSegment, ...]
    valid_repetitions: int
    invalid_repetitions: int
    complete: bool
    reasons: Tuple[str, ...]


def _landmark_series(samples: Sequence[PoseSample], landmark: str) -> List[Tuple[float, float, float, float]]:
    return [
        (sample.timestamp_seconds, sample.landmarks[landmark][0], sample.landmarks[landmark][1], sample.confidence)
        for sample in samples if landmark in sample.landmarks and np.isfinite(sample.timestamp_seconds)
    ]


def _speed(series: Sequence[Tuple[float, float, float, float]]) -> List[Tuple[float, float]]:
    output = []
    for first, second in zip(series, series[1:]):
        elapsed = second[0] - first[0]
        if elapsed > 0:
            output.append((second[0], hypot(second[1] - first[1], second[2] - first[2]) / elapsed))
    return output


def _event_peaks(values: Sequence[Tuple[float, float]], threshold: float, minimum_gap: float) -> List[float]:
    peaks: List[float] = []
    for index in range(1, len(values) - 1):
        time, value = values[index]
        if value < threshold or value < values[index - 1][1] or value < values[index + 1][1]:
            continue
        if peaks and time - peaks[-1] < minimum_gap:
            if value > max(item[1] for item in values if abs(item[0] - peaks[-1]) < minimum_gap / 2):
                peaks[-1] = time
            continue
        peaks.append(time)
    return peaks


def _object_available(objects: Dict[str, ObjectEvidence], name: str) -> bool:
    return bool(objects.get(name) and objects[name].is_reliable)


def _attempt(
    index: int, action: str, start: float, end: float, confidence: float,
    reasons: List[str], minimum_duration: float,
) -> AttemptSegment:
    if end - start < minimum_duration:
        reasons.append("attempt-duration-too-short")
    complete = "attempt-start-clipped" not in reasons and "attempt-end-clipped" not in reasons and "attempt-duration-too-short" not in reasons
    return AttemptSegment(index, action, max(0.0, start), max(start, end), max(0.0, min(1.0, confidence)), complete, complete and not reasons, tuple(dict.fromkeys(reasons)))


def segment_drill_attempts(
    drill: str,
    samples: Sequence[PoseSample],
    objects: Dict[str, ObjectEvidence],
    clip_duration_seconds: float,
    expected_repetitions: Optional[int] = None,
    verified_attempt_window: Optional[Tuple[float, float, float]] = None,
    course_geometry_verified: bool = False,
) -> SegmentationResult:
    if len(samples) < 4:
        return SegmentationResult(drill, (), 0, 0, False, ("pose-sequence-insufficient",))
    samples = sorted(samples, key=lambda item: item.timestamp_seconds)
    attempts: List[AttemptSegment] = []
    overall_reasons: List[str] = []

    hips = _landmark_series(samples, "hip_center")
    wrists = _landmark_series(samples, "right_wrist") or _landmark_series(samples, "left_wrist")
    ankles = _landmark_series(samples, "ankle_center")

    if drill == "sprint-20m":
        if verified_attempt_window is not None:
            start, end, confidence = verified_attempt_window
            verified = _attempt(1, "sprint", start, end, confidence, [], 0.5)
            return SegmentationResult(drill, (verified,), 1 if verified.valid else 0, 0 if verified.valid else 1, verified.valid, ())
        speeds = _speed(hips)
        moving = [time for time, value in speeds if value >= 0.08]
        if moving:
            start, end = moving[0], moving[-1]
            reasons = []
            if start <= samples[0].timestamp_seconds + 0.05:
                reasons.append("attempt-start-clipped")
            if end >= samples[-1].timestamp_seconds - 0.05:
                reasons.append("attempt-end-clipped")
            displacement = hypot(hips[-1][1] - hips[0][1], hips[-1][2] - hips[0][2]) if len(hips) > 1 else 0.0
            if displacement < 0.15:
                reasons.append("course-displacement-insufficient")
            attempts.append(_attempt(1, "sprint", start, end, float(np.mean([item[3] for item in hips])), reasons, 0.5))
        else:
            overall_reasons.append("sprint-motion-not-detected")

    elif drill in ("agility-5-10-5", "movement-efficiency", "cone-dribble", "shuttle-endurance", "basketball-lane-agility"):
        if drill in ("movement-efficiency", "cone-dribble") and not _object_available(objects, "cone"):
            overall_reasons.append("course-markers-not-detected")
        if drill == "movement-efficiency" and not _object_available(objects, "target"):
            overall_reasons.append("target-track-not-detected")
        if drill in ("agility-5-10-5", "movement-efficiency", "shuttle-endurance") and not course_geometry_verified:
            overall_reasons.append("course-geometry-unverified")
        if drill == "cone-dribble" and not _object_available(objects, "ball"):
            overall_reasons.append("ball-track-not-detected")
        if drill == "basketball-lane-agility" and not _object_available(objects, "court-line"):
            overall_reasons.append("court-line-track-not-detected")
        if drill == "basketball-lane-agility" and not course_geometry_verified:
            overall_reasons.append("course-geometry-unverified")
        x_values = [(item[0], item[1]) for item in hips]
        direction_changes: List[float] = []
        previous_sign = 0
        for first, second in zip(x_values, x_values[1:]):
            delta = second[1] - first[1]
            sign = 1 if delta > 0.01 else -1 if delta < -0.01 else 0
            if sign and previous_sign and sign != previous_sign:
                direction_changes.append(second[0])
            if sign:
                previous_sign = sign
        minimum_changes = 2 if drill in ("agility-5-10-5", "movement-efficiency", "basketball-lane-agility") else 1
        if len(direction_changes) < minimum_changes:
            overall_reasons.append("required-direction-changes-missing")
        boundaries = [samples[0].timestamp_seconds] + direction_changes + [samples[-1].timestamp_seconds]
        for index, (start, end) in enumerate(zip(boundaries, boundaries[1:]), 1):
            reasons = list(overall_reasons)
            if index == 1 and start <= 0.05:
                reasons.append("attempt-start-clipped")
            attempts.append(_attempt(index, "course-leg", start, end, float(np.mean([item[3] for item in hips])), reasons, 0.25))

    elif drill in ("shooting-accuracy", "shooting-mechanics", "passing-accuracy", "first-touch-control", "basketball-form-capture", "basketball-free-throw", "basketball-spot-shooting"):
        required = (
            ("ball", "goal") if drill == "shooting-accuracy"
            else ("ball", "goal", "target", "cone") if drill == "shooting-mechanics"
            else ("ball", "target") if drill == "passing-accuracy"
            else ("ball", "target", "cone") if drill == "first-touch-control"
            else ("ball", "hoop", "court-line") if drill in ("basketball-free-throw", "basketball-spot-shooting")
            else ("ball", "hoop")
        )
        missing = [f"{name}-track-not-detected" for name in required if not _object_available(objects, name)]
        wrist_speeds = _speed(wrists)
        peaks = _event_peaks(wrist_speeds, threshold=0.20, minimum_gap=0.6)
        for index, peak in enumerate(peaks, 1):
            reasons = list(missing)
            start, end = peak - 0.45, peak + 0.75
            if start <= samples[0].timestamp_seconds:
                reasons.append("attempt-start-clipped")
            if end >= min(clip_duration_seconds, samples[-1].timestamp_seconds):
                reasons.append("attempt-end-clipped")
            attempts.append(_attempt(index, "kick" if drill in ("shooting-accuracy", "shooting-mechanics", "passing-accuracy", "first-touch-control") else "shot", start, end, 0.75, reasons, 0.5))
        if not peaks:
            overall_reasons.append("shot-action-not-detected")

    elif drill in ("baseball-pitch-velocity", "baseball-pitch-command", "baseball-throwing-mechanics", "baseball-swing-timing"):
        is_swing = drill == "baseball-swing-timing"
        required = ("bat", "ball") if is_swing else ("ball", "plate", "target") if drill == "baseball-throwing-mechanics" else ("ball",)
        missing = [f"{name}-track-not-detected" for name in required if not _object_available(objects, name)]
        peaks = _event_peaks(_speed(wrists), threshold=0.30, minimum_gap=0.7)
        for index, peak in enumerate(peaks, 1):
            reasons = list(missing)
            start, end = peak - (0.55 if is_swing else 0.75), peak + (0.55 if is_swing else 0.9)
            if start <= samples[0].timestamp_seconds:
                reasons.append("attempt-start-clipped")
            if end >= min(clip_duration_seconds, samples[-1].timestamp_seconds):
                reasons.append("attempt-end-clipped")
            action = "swing" if is_swing else "throw" if drill == "baseball-throwing-mechanics" else "pitch"
            attempts.append(_attempt(index, action, start, end, 0.75, reasons, 0.45))
        if not peaks:
            overall_reasons.append("swing-action-not-detected" if is_swing else "pitch-action-not-detected")
    else:
        return SegmentationResult(drill, (), 0, 0, False, ("unsupported-drill-segmentation",))

    if expected_repetitions is not None and expected_repetitions > 0 and len(attempts) < expected_repetitions:
        overall_reasons.append("expected-repetitions-incomplete")
    if expected_repetitions is not None and expected_repetitions > 0 and len(attempts) > expected_repetitions:
        overall_reasons.append("unexpected-extra-repetitions")
    valid = sum(1 for item in attempts if item.valid)
    invalid = len(attempts) - valid
    complete = bool(attempts) and invalid == 0 and not overall_reasons
    return SegmentationResult(drill, tuple(attempts), valid, invalid, complete, tuple(dict.fromkeys(overall_reasons)))
