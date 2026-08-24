"""Confidence-gated, sport-aware metric primitives for Athlemetry.

This module converts pose sequences into structured relative or calibrated metrics.
It deliberately returns unavailable values rather than inventing measurements when
pose coverage, timing, target outcomes, or scale calibration are missing.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot, isfinite
from statistics import mean, pstdev
from typing import Dict, List, Literal, Optional, Tuple

Point = Tuple[float, float]
Sport = Literal["soccer", "basketball", "baseball"]


@dataclass
class PoseSample:
    frame_index: int
    timestamp_seconds: float
    confidence: float
    landmarks: Dict[str, Point]


@dataclass
class Metric:
    value: Optional[float]
    unit: str
    confidence: float
    method: str
    limitations: List[str] = field(default_factory=list)
    measurement_type: Literal["direct", "derived", "proxy", "verified_outcome", "composite"] = "proxy"
    validation_status: Literal["requires_validation", "input_verified", "unavailable"] = "requires_validation"
    subject: Literal["athlete", "ball", "bat", "attempt"] = "athlete"


@dataclass
class Action:
    name: str
    start_seconds: float
    end_seconds: float
    confidence: float


@dataclass
class Reliability:
    status: Literal["unavailable", "relative-only", "verified-input"]
    score: float
    pose_coverage: float
    calibration_available: bool
    limitations: List[str] = field(default_factory=list)


@dataclass
class PerformanceAnalysis:
    sport: Sport
    drill: str
    metrics: Dict[str, Metric]
    actions: List[Action]
    weaknesses: List[str]
    recommendations: List[str]
    overall_score: Optional[float]
    reliability: Reliability


@dataclass(frozen=True)
class PhysicalObjectMeasurement:
    value: float
    unit: str
    confidence: float
    method: str
    subject: Literal["ball", "bat"]


def _round(value: float) -> float:
    return round(value, 3)


def _series(samples: List[PoseSample], landmark: str) -> List[Tuple[float, Point]]:
    return [
        (sample.timestamp_seconds, sample.landmarks[landmark])
        for sample in samples
        if landmark in sample.landmarks and isfinite(sample.timestamp_seconds)
    ]


def _velocities(series: List[Tuple[float, Point]]) -> List[Tuple[float, float, float]]:
    values: List[Tuple[float, float, float]] = []
    for (t0, p0), (t1, p1) in zip(series, series[1:]):
        dt = t1 - t0
        if dt <= 0:
            continue
        vx = (p1[0] - p0[0]) / dt
        vy = (p1[1] - p0[1]) / dt
        values.append((t1, vx, vy))
    return values


def _score(value: float) -> float:
    return _round(max(0.0, min(100.0, value)))


def _metric(
    value: Optional[float],
    unit: str,
    confidence: float,
    method: str,
    *limitations: str,
    measurement_type: Literal["direct", "derived", "proxy", "verified_outcome", "composite"] = "proxy",
    validation_status: Literal["requires_validation", "input_verified", "unavailable"] = "requires_validation",
    subject: Literal["athlete", "ball", "bat", "attempt"] = "athlete",
) -> Metric:
    return Metric(
        value=None if value is None else _round(value),
        unit=unit,
        confidence=_round(max(0.0, min(1.0, confidence))),
        method=method,
        limitations=[item for item in limitations if item],
        measurement_type=measurement_type,
        validation_status="unavailable" if value is None else validation_status,
        subject=subject,
    )


def _direction_changes(vxs: List[float]) -> int:
    signs = [1 if value > 0.02 else -1 if value < -0.02 else 0 for value in vxs]
    nonzero = [value for value in signs if value]
    return sum(1 for previous, current in zip(nonzero, nonzero[1:]) if previous != current)


def _coefficient_consistency(values: List[float]) -> float:
    positives = [value for value in values if value > 0]
    if len(positives) < 2 or mean(positives) == 0:
        return 50.0
    return _score(100.0 * (1.0 - min(1.0, pstdev(positives) / mean(positives))))


def _action(name: str, samples: List[PoseSample], confidence: float) -> Action:
    return Action(name, samples[0].timestamp_seconds, samples[-1].timestamp_seconds, _round(confidence))


def _soccer_metrics(
    samples: List[PoseSample],
    confidence: float,
    calibrated: bool,
    distance: Optional[float],
    calibration_elapsed_seconds: Optional[float],
    calibration_confidence: float,
):
    hips = _series(samples, "hip_center")
    ankles = _series(samples, "ankle_center")
    hip_velocity = _velocities(hips)
    ankle_velocity = _velocities(ankles)
    elapsed = hips[-1][0] - hips[0][0] if len(hips) > 1 else 0.0
    displacement = abs(hips[-1][1][0] - hips[0][1][0]) if len(hips) > 1 else 0.0
    relative_speeds = [hypot(vx, vy) for _, vx, vy in hip_velocity]
    changes = _direction_changes([vx for _, vx, _ in hip_velocity])
    actions: List[Action] = []
    if displacement > 0.1:
        actions.append(_action("sprint", samples, confidence))
    if changes:
        actions.append(_action("change_of_direction", samples, confidence * min(1.0, 0.55 + changes * 0.15)))
    if ankle_velocity and max(hypot(vx, vy) for _, vx, vy in ankle_velocity) > 0.8:
        actions.append(_action("kick_or_fast_foot_contact", samples, confidence * 0.7))

    measured_elapsed = calibration_elapsed_seconds or elapsed
    speed = distance / measured_elapsed if calibrated and distance and measured_elapsed > 0 else None

    relative_score = _score((mean(relative_speeds) if relative_speeds else 0.0) * 120)
    agility_score = _score(55 + changes * 12 - (pstdev(relative_speeds) * 8 if len(relative_speeds) > 1 else 0))
    consistency = _coefficient_consistency(relative_speeds)
    physical_confidence = min(confidence, calibration_confidence) if speed is not None else 0.0
    metrics = {
        "speed_mps": _metric(
            speed,
            "m/s",
            physical_confidence,
            "verified course distance / marker crossing time" if calibration_elapsed_seconds else "calibrated course distance / elapsed pose time",
            "Requires known course distance" if speed is None else "",
            measurement_type="derived",
        ),
        "acceleration_mps2": _metric(
            None,
            "m/s²",
            0.0,
            "requires per-frame metric ground-plane trajectory",
            "A scalar course-distance scale cannot certify instantaneous acceleration",
            measurement_type="derived",
        ),
        "relative_speed_score": _metric(relative_score, "score_0_100", confidence, "normalized hip-centroid motion"),
        "agility_score": _metric(agility_score, "score_0_100", confidence * 0.8, "direction changes and velocity control"),
        "technique_score": _metric(consistency, "score_0_100", confidence * 0.75, "lower-body motion consistency proxy"),
        "consistency_score": _metric(consistency, "score_0_100", confidence, "segment-speed coefficient of variation"),
        "accuracy_score": _metric(None, "score_0_100", 0.0, "requires goal/target outcome detection", "No verified target outcome supplied"),
        "power_proxy": _metric(_score(max([hypot(vx, vy) for _, vx, vy in ankle_velocity] or [0]) * 80), "score_0_100", confidence * 0.65, "normalized ankle peak velocity proxy"),
    }
    return metrics, actions


def _basketball_metrics(
    samples: List[PoseSample],
    confidence: float,
    physical: Optional[Dict[str, PhysicalObjectMeasurement]],
):
    wrists = _series(samples, "right_wrist") or _series(samples, "left_wrist")
    shoulders = _series(samples, "shoulder_center")
    wrist_velocity = _velocities(wrists)
    shot = bool(wrists and shoulders and min(point[1] for _, point in wrists) < mean(point[1] for _, point in shoulders))
    actions = [_action("shot_attempt", samples, confidence * 0.85)] if shot else []
    smoothness = _coefficient_consistency([hypot(vx, vy) for _, vx, vy in wrist_velocity])
    # Normalized landmark height changes with camera distance. Until a
    # validated court-plane/subject-scale protocol exists, keep this proxy to
    # scale-invariant wrist-path smoothness rather than inventing release height.
    technique = smoothness
    power = _score(max([hypot(vx, vy) for _, vx, vy in wrist_velocity] or [0]) * 55)
    ball_speed = physical.get("ball_speed_mps") if physical else None
    metrics = {
        "speed_mps": _metric(
            ball_speed.value if ball_speed else None,
            "m/s",
            ball_speed.confidence if ball_speed else 0.0,
            ball_speed.method if ball_speed else "requires ball track and court-plane calibration",
            "No reliable calibrated ball trajectory" if not ball_speed else "",
            measurement_type="derived",
            subject="ball",
        ),
        "acceleration_mps2": _metric(None, "m/s²", 0.0, "requires court-plane calibration", "No court homography supplied"),
        "agility_score": _metric(
            None,
            "score_0_100",
            0.0,
            "requires validated basketball agility protocol",
            "Basketball form capture does not establish agility",
        ),
        "technique_score": _metric(technique, "score_0_100", confidence * 0.8, "wrist-path smoothness proxy"),
        "consistency_score": _metric(smoothness, "score_0_100", confidence, "wrist-speed coefficient of variation"),
        "accuracy_score": _metric(None, "score_0_100", 0.0, "requires ball/hoop make-miss tracking", "Shot outcome not detected"),
        "power_proxy": _metric(power, "score_0_100", confidence * 0.6, "normalized wrist peak velocity proxy"),
    }
    return metrics, actions


def _baseball_metrics(
    samples: List[PoseSample],
    confidence: float,
    calibrated: bool,
    drill: str,
    physical: Optional[Dict[str, PhysicalObjectMeasurement]],
):
    wrists = _series(samples, "right_wrist") or _series(samples, "left_wrist")
    wrist_velocity = _velocities(wrists)
    peak = max([hypot(vx, vy) for _, vx, vy in wrist_velocity] or [0.0])
    swing = peak > 0.3
    actions = [_action("swing", samples, confidence * 0.85)] if swing else []
    consistency = _coefficient_consistency([hypot(vx, vy) for _, vx, vy in wrist_velocity])
    ball_speed = physical.get("ball_speed_mps") if physical else None
    bat_speed = physical.get("bat_speed_mps") if physical else None
    metrics = {
        "bat_speed_mph": _metric(
            bat_speed.value * 2.2369362921 if bat_speed else None,
            "mph",
            bat_speed.confidence if bat_speed else 0.0,
            bat_speed.method if bat_speed else "requires visible bat track and plate-plane calibration",
            "Pose-only wrist motion cannot certify bat speed" if not bat_speed else "",
            measurement_type="derived",
            subject="bat",
        ),
        "speed_mps": _metric(
            ball_speed.value if ball_speed and drill.startswith("baseball-pitch") else None,
            "m/s",
            ball_speed.confidence if ball_speed and drill.startswith("baseball-pitch") else 0.0,
            ball_speed.method if ball_speed and drill.startswith("baseball-pitch") else "requires calibrated ball trajectory",
            "No reliable calibrated ball trajectory" if not ball_speed else "",
            measurement_type="derived",
            subject="ball",
        ),
        "acceleration_mps2": _metric(None, "m/s²", 0.0, "requires calibrated trajectory", "No calibrated object trajectory"),
        "agility_score": _metric(
            None,
            "score_0_100",
            0.0,
            "requires validated baseball agility protocol",
            "Pitching and swing capture do not establish agility",
        ),
        "technique_score": _metric(consistency, "score_0_100", confidence * 0.75, "wrist-path consistency proxy"),
        "consistency_score": _metric(consistency, "score_0_100", confidence, "wrist-speed coefficient of variation"),
        "accuracy_score": _metric(None, "score_0_100", 0.0, "requires strike-zone or batted-ball outcome tracking", "Outcome target unavailable"),
        "power_proxy": _metric(_score(peak * 45), "score_0_100", confidence * 0.65, "normalized wrist peak velocity proxy"),
    }
    return metrics, actions


def _apply_verified_accuracy(
    metrics: Dict[str, Metric],
    verified_outcomes: Optional[Dict[str, int]],
) -> None:
    if verified_outcomes is None:
        return
    attempts = verified_outcomes.get("attempts")
    successes = verified_outcomes.get("successes")
    if (
        not isinstance(attempts, int)
        or isinstance(attempts, bool)
        or not isinstance(successes, int)
        or isinstance(successes, bool)
        or attempts <= 0
        or successes < 0
        or successes > attempts
    ):
        metrics["accuracy_score"] = _metric(
            None,
            "score_0_100",
            0.0,
            "verified target outcomes",
            "Invalid verified outcome counts",
        )
        return
    metrics["accuracy_score"] = _metric(
        successes / attempts * 100.0,
        "score_0_100",
        1.0,
        "verified successes / verified attempts",
        measurement_type="verified_outcome",
        validation_status="input_verified",
        subject="attempt",
    )


def _coaching(sport: Sport, metrics: Dict[str, Metric]) -> Tuple[List[str], List[str]]:
    weaknesses: List[str] = []
    recommendations: List[str] = []
    for key, label, recommendation in (
        ("relative_speed_score", "first-step and sprint velocity", "Prioritize resisted starts and 10–20 m acceleration mechanics."),
        ("agility_score", "deceleration and direction-change control", "Train lower center-of-mass braking and planned change-of-direction technique."),
        ("technique_score", "movement sequencing and technique", "Use slow, repeatable technique reps with side-view video feedback."),
        ("consistency_score", "rep-to-rep consistency", "Reduce intensity temporarily and repeat identical setup cues across reps."),
        ("power_proxy", "explosive movement output", "Add progressive lower-body and rotational power work with qualified coaching."),
    ):
        metric = metrics.get(key)
        if metric and metric.value is not None and metric.confidence >= 0.45 and metric.value < 60:
            weaknesses.append(label)
            recommendations.append(recommendation)
    accuracy = metrics.get("accuracy_score")
    if accuracy and accuracy.value is not None and accuracy.confidence >= 0.8 and accuracy.value < 60:
        weaknesses.append("target accuracy")
        sport_cue = {
            "soccer": "Lock the ankle, plant beside the ball, and hold the follow-through toward a marked target.",
            "basketball": "Square the shooting base and hold a repeatable wrist follow-through toward the center of the rim.",
            "baseball": "Stabilize the head through contact and repeat the hand path through a defined target zone.",
        }[sport]
        recommendations.append(sport_cue)
    if metrics.get("accuracy_score") and metrics["accuracy_score"].value is None:
        recommendations.append(f"Capture a clear target and outcome view before scoring {sport} accuracy.")
    return weaknesses, recommendations


def analyze_pose_sequence(
    sport: Sport,
    drill: str,
    samples: List[PoseSample],
    total_frames: int,
    calibration_distance_meters: Optional[float],
    calibration_elapsed_seconds: Optional[float] = None,
    calibration_confidence: float = 1.0,
    verified_outcomes: Optional[Dict[str, int]] = None,
    physical_object_measurements: Optional[Dict[str, PhysicalObjectMeasurement]] = None,
) -> PerformanceAnalysis:
    valid = sorted((sample for sample in samples if sample.confidence >= 0.35), key=lambda item: item.timestamp_seconds)
    coverage = len(valid) / total_frames if total_frames > 0 else 0.0
    average_confidence = mean([sample.confidence for sample in valid]) if valid else 0.0
    calibrated = calibration_distance_meters is not None and calibration_distance_meters > 0
    reliability_score = min(1.0, coverage * 0.65 + average_confidence * 0.35)
    limitations: List[str] = []
    if coverage < 0.6 or len(valid) < 4:
        limitations.append("Insufficient pose coverage for a reliable performance result")
        reliability = Reliability("unavailable", _round(reliability_score), _round(coverage), calibrated, limitations)
        empty = {
            "speed_mps": _metric(None, "m/s", 0.0, "unavailable", limitations[0]),
            "acceleration_mps2": _metric(None, "m/s²", 0.0, "unavailable", limitations[0]),
        }
        return PerformanceAnalysis(sport, drill, empty, [], [], [], None, reliability)

    status: Literal["relative-only", "verified-input"] = "verified-input" if calibrated else "relative-only"
    if not calibrated:
        limitations.append("No dimensional calibration; physical speed, acceleration, and power are unavailable")
    confidence = min(average_confidence, reliability_score)
    if sport == "soccer":
        metrics, actions = _soccer_metrics(
            valid,
            confidence,
            calibrated,
            calibration_distance_meters,
            calibration_elapsed_seconds,
            calibration_confidence,
        )
    elif sport == "basketball":
        metrics, actions = _basketball_metrics(valid, confidence, physical_object_measurements)
    elif sport == "baseball":
        metrics, actions = _baseball_metrics(valid, confidence, calibrated, drill, physical_object_measurements)
    else:
        raise ValueError(f"Unsupported sport: {sport}")

    _apply_verified_accuracy(metrics, verified_outcomes)
    weaknesses, recommendations = _coaching(sport, metrics)
    scored = [
        metric.value
        for metric in metrics.values()
        if metric.value is not None and metric.unit == "score_0_100" and metric.confidence >= 0.45
    ]
    overall = _score(mean(scored)) if scored else None
    reliability = Reliability(status, _round(reliability_score), _round(coverage), calibrated, limitations)
    return PerformanceAnalysis(sport, drill, metrics, actions, weaknesses, recommendations, overall, reliability)
