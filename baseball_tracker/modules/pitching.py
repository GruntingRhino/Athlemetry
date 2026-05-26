"""Pitch analysis helpers for smartphone-recorded baseball footage.

This module intentionally stays conservative: iPhone / smartphone footage often
has limited frame rate, motion blur, rolling shutter, and partial ball tracks.
The goal is to provide useful estimates and movement descriptors without
pretending the video is radar-quality instrumentation.
"""

from __future__ import annotations

import logging
import math
from typing import List, Optional, Tuple

try:
    from schemas import BallTrajectory, PitchAnalysis, TrackPoint, VideoMetadata
except ImportError:
    from schemas import BallTrajectory, PitchAnalysis, TrackPoint, VideoMetadata  # type: ignore

logger = logging.getLogger(__name__)


def _clamp(value: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, value))


def _points(ball_traj: BallTrajectory) -> List[TrackPoint]:
    pts = ball_traj.smoothed_points if ball_traj.smoothed_points else ball_traj.points
    return sorted(pts, key=lambda p: (p.frame_idx, p.timestamp_sec))


def _distance(a: TrackPoint, b: TrackPoint) -> float:
    return math.hypot(b.x - a.x, b.y - a.y)


def _mean(values: List[float]) -> Optional[float]:
    return sum(values) / len(values) if values else None


def _perpendicular_distance(
    point: TrackPoint,
    start: TrackPoint,
    end: TrackPoint,
) -> float:
    line_dx = end.x - start.x
    line_dy = end.y - start.y
    denom = math.hypot(line_dx, line_dy)
    if denom <= 1e-9:
        return 0.0
    numerator = abs(
        line_dy * point.x
        - line_dx * point.y
        + end.x * start.y
        - end.y * start.x
    )
    return numerator / denom


def _trajectory_speed_px_per_frame(points: List[TrackPoint]) -> Optional[float]:
    if len(points) < 2:
        return None
    speeds: List[float] = []
    for i in range(1, len(points)):
        dt = points[i].frame_idx - points[i - 1].frame_idx
        if dt <= 0:
            continue
        speeds.append(_distance(points[i - 1], points[i]) / dt)
    return _mean(speeds)


def _capture_assessment(meta: VideoMetadata, point_count: int, traj_confidence: float) -> Tuple[str, float, List[str], List[str]]:
    notes: List[str] = []
    limitations: List[str] = []
    score = 0.35

    fps = meta.fps if meta.fps > 0 else 30.0
    if fps >= 60.0:
        score += 0.20
    elif fps >= 30.0:
        score += 0.12
    else:
        score -= 0.08
        limitations.append("Low frame rate smartphone footage reduces movement precision")

    if point_count >= 10:
        score += 0.18
    elif point_count >= 6:
        score += 0.08
        notes.append("Trajectory coverage is moderate rather than dense")
    else:
        score -= 0.10
        limitations.append("Sparse ball trajectory points")

    if meta.width >= 1280 and meta.height >= 720:
        score += 0.12
    elif meta.width >= 960 and meta.height >= 540:
        score += 0.05
        notes.append("Phone-resolution footage is usable but not high detail")
    else:
        score -= 0.05
        limitations.append("Small frame size makes spin/movement estimates noisier")

    if traj_confidence >= 0.75:
        score += 0.10
    elif traj_confidence < 0.4:
        score -= 0.10
        limitations.append("Trajectory tracker confidence is low")

    score = _clamp(score, 0.0, 1.0)
    if score >= 0.70:
        assessment = "smartphone_good"
    elif score >= 0.50:
        assessment = "smartphone_moderate"
    else:
        assessment = "smartphone_low"
        if "Low frame rate smartphone footage reduces movement precision" not in limitations:
            limitations.append("Low frame rate smartphone footage reduces movement precision")

    return assessment, score, notes, limitations


def analyze_pitch_trajectory(
    ball_traj: BallTrajectory,
    video_meta: VideoMetadata,
) -> PitchAnalysis:
    """Estimate pitch movement from a tracked ball trajectory.

    The return values are deliberately conservative and should be treated as
    approximate movement descriptors for smartphone footage, not ground-truth
    hardware measurements.
    """
    points = _points(ball_traj)
    if not points:
        return PitchAnalysis(
            confidence=0.0,
            capture_assessment="unknown",
            notes=["No ball trajectory points available for pitch analysis"],
            limitations=["Cannot infer pitch movement without ball tracking"],
        )

    first = points[0]
    last = points[-1]
    horizontal_break_px = last.x - first.x
    vertical_break_px = last.y - first.y
    total_movement_px = math.hypot(horizontal_break_px, vertical_break_px)
    approach_angle_deg = None
    if abs(horizontal_break_px) > 1e-9:
        approach_angle_deg = round(math.degrees(math.atan2(vertical_break_px, abs(horizontal_break_px))), 2)
    elif total_movement_px > 0:
        approach_angle_deg = 90.0 if vertical_break_px > 0 else -90.0

    release_speed_px_per_frame = _trajectory_speed_px_per_frame(points[: max(3, min(5, len(points)))])
    max_curve_px = 0.0
    if len(points) >= 3 and total_movement_px > 0:
        max_curve_px = max(_perpendicular_distance(p, first, last) for p in points)

    # A curvature-based proxy for apparent spin. The value is deliberately
    # bounded and should be read as an estimate with a wide confidence band.
    curvature_ratio = 0.0 if total_movement_px <= 1e-9 else max_curve_px / total_movement_px
    movement_ratio = 0.0 if total_movement_px <= 1e-9 else abs(vertical_break_px) / total_movement_px
    speed_factor = 0.0 if release_speed_px_per_frame is None else _clamp(release_speed_px_per_frame / 25.0, 0.0, 1.0)

    rpm_seed = 1450.0
    rpm_seed += 1750.0 * _clamp(curvature_ratio * 2.8, 0.0, 1.0)
    rpm_seed += 250.0 * _clamp(movement_ratio, 0.0, 1.0)
    rpm_seed += 300.0 * speed_factor

    assessment, capture_score, notes, limitations = _capture_assessment(
        video_meta,
        len(points),
        ball_traj.confidence,
    )

    # Wider bands for low-quality footage.
    uncertainty = 0.18
    if assessment == "smartphone_moderate":
        uncertainty = 0.14
    elif assessment == "smartphone_low":
        uncertainty = 0.22

    estimated_spin_rpm = round(_clamp(rpm_seed, 1200.0, 3200.0), 1)
    spin_band = (
        round(estimated_spin_rpm * (1.0 - uncertainty), 1),
        round(estimated_spin_rpm * (1.0 + uncertainty), 1),
    )

    # Combine capture quality and trajectory richness into a single confidence.
    confidence = 0.30 + (capture_score * 0.45)
    confidence += _clamp(curvature_ratio * 0.20, 0.0, 0.20)
    if len(points) < 6:
        confidence -= 0.08
    if ball_traj.confidence < 0.5:
        confidence -= 0.08
    confidence = _clamp(confidence, 0.0, 0.95)

    if video_meta.fps < 30.0:
        notes.append("Treat RPM and break as smartphone estimates; low frame rate can understate sharp movement")
    if len(points) < 6:
        notes.append("Sparse tracking makes curve and spin estimates approximate")
    if max_curve_px > 0:
        notes.append(f"Maximum visible curvature: {max_curve_px:.1f}px")

    pitch_type_hint: Optional[str] = None
    if total_movement_px < 20:
        pitch_type_hint = "straight_fastball_like"
    elif abs(horizontal_break_px) > abs(vertical_break_px) * 1.25:
        pitch_type_hint = "arm_side_break"
    elif abs(vertical_break_px) > abs(horizontal_break_px) * 1.25:
        pitch_type_hint = "vertical_drop"
    else:
        pitch_type_hint = "mixed_break"

    return PitchAnalysis(
        estimated_release_frame=first.frame_idx,
        estimated_release_point=first.model_copy(),
        release_speed_px_per_frame=round(release_speed_px_per_frame, 3) if release_speed_px_per_frame is not None else None,
        horizontal_break_px=round(horizontal_break_px, 2),
        vertical_break_px=round(vertical_break_px, 2),
        total_movement_px=round(total_movement_px, 2),
        max_curve_px=round(max_curve_px, 2),
        approach_angle_deg=approach_angle_deg,
        estimated_spin_rpm=estimated_spin_rpm,
        spin_rpm_band=spin_band,
        capture_assessment=assessment,
        confidence=round(confidence, 3),
        pitch_type_hint=pitch_type_hint,
        notes=notes,
        limitations=limitations,
    )
