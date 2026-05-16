"""
scoring.py — Rule-based baseball swing form scoring.

CRITICAL: All scores are derived from CV/pose math only.
Ollama / any LLM is NOT used here.

Each scorer returns a FormMetric with:
  - score     : float 0.0 (poor) → 1.0 (excellent)
  - confidence: float 0.0 → 1.0
  - rationale : human-readable explanation
  - issues    : list of observed problems
  - suggestions: actionable coaching tips
"""

from __future__ import annotations

import math
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schema / config imports with graceful fallback
# ---------------------------------------------------------------------------
try:
    from schemas import FormMetric, FormScores, FramePose, SwingPhase
    from config import ScoringConfig, AnalysisConfig
except ImportError:
    try:
        from schemas import FormMetric, FormScores, FramePose, SwingPhase
        from config import ScoringConfig, AnalysisConfig
    except ImportError:
        logger.warning("scoring.py: Could not import schemas/config; running in stub mode.")
        FormMetric = Any  # type: ignore
        FormScores = Any  # type: ignore
        FramePose = Any  # type: ignore
        SwingPhase = Any  # type: ignore
        ScoringConfig = Any  # type: ignore
        AnalysisConfig = Any  # type: ignore


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _lm_xy(pose: "FramePose", name: str) -> Optional[Tuple[float, float]]:
    """Return (x, y) for named landmark if visible; else None."""
    lm = pose.landmarks.get(name)
    if lm is None:
        return None
    if lm.visibility < 0.25:
        return None
    return (lm.x, lm.y)


def _midpoint(p1: Tuple[float, float], p2: Tuple[float, float]) -> Tuple[float, float]:
    return ((p1[0] + p2[0]) / 2.0, (p1[1] + p2[1]) / 2.0)


def _dist(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


def _clamp(v: float, lo: float, hi: float) -> float:
    return max(lo, min(hi, v))


def _angle_deg(p_center: Tuple[float, float],
               p_a: Tuple[float, float],
               p_b: Tuple[float, float]) -> float:
    """Angle at p_center in the triangle p_a–p_center–p_b (degrees)."""
    v1 = (p_a[0] - p_center[0], p_a[1] - p_center[1])
    v2 = (p_b[0] - p_center[0], p_b[1] - p_center[1])
    dot = v1[0] * v2[0] + v1[1] * v2[1]
    mag1 = math.hypot(*v1)
    mag2 = math.hypot(*v2)
    if mag1 < 1e-9 or mag2 < 1e-9:
        return 0.0
    cos_a = _clamp(dot / (mag1 * mag2), -1.0, 1.0)
    return math.degrees(math.acos(cos_a))


def _poses_in_phases(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    labels: List[str],
) -> List["FramePose"]:
    """Filter poses to those falling within any of the named phase ranges."""
    ranges = [(p.start_frame, p.end_frame) for p in phases if p.label in labels]
    if not ranges:
        return []
    out = []
    for pose in poses:
        for s, e in ranges:
            if s <= pose.frame_idx <= e:
                out.append(pose)
                break
    return out


def _first_pose_in_phases(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    labels: List[str],
) -> Optional["FramePose"]:
    subset = _poses_in_phases(poses, phases, labels)
    return subset[0] if subset else None


def _last_pose_in_phases(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    labels: List[str],
) -> Optional["FramePose"]:
    subset = _poses_in_phases(poses, phases, labels)
    return subset[-1] if subset else None


def _skipped_metric(name: str, reason: str) -> "FormMetric":
    """Produce a zero-confidence placeholder when a scorer cannot run."""
    return FormMetric(
        name=name,
        score=0.5,  # neutral rather than implying failure
        confidence=0.0,
        rationale=f"Skipped: {reason}",
        issues=[],
        suggestions=["Improve video quality or coverage for this metric"],
    )


# ---------------------------------------------------------------------------
# Individual scorers
# ---------------------------------------------------------------------------

def score_head_stability(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    video_meta: Any,
    config: "ScoringConfig",
) -> "FormMetric":
    """
    Measure how still the batter's head remains from stance to contact.

    Head displacement > ``config.head_drift_threshold_pct`` of frame height
    incurs a penalty.  Both forward (x) and vertical (y) drift are evaluated.
    """
    name = "head_stability"
    frame_h = getattr(video_meta, "height", 720)

    stance_pose = _first_pose_in_phases(poses, phases, ["stance"])
    contact_pose = _last_pose_in_phases(poses, phases, ["contact_zone"])

    if stance_pose is None or contact_pose is None:
        return _skipped_metric(name, "stance or contact_zone phase not found in pose data")

    # Use nose as head proxy (most reliably tracked by MediaPipe)
    head_stance = _lm_xy(stance_pose, "nose")
    head_contact = _lm_xy(contact_pose, "nose")

    if head_stance is None or head_contact is None:
        return _skipped_metric(name, "nose landmark not visible in stance or contact frame")

    dx = abs(head_contact[0] - head_stance[0])
    dy = abs(head_contact[1] - head_stance[1])
    total_drift = math.hypot(dx, dy)
    drift_pct = total_drift / frame_h if frame_h > 0 else 0.0
    threshold = config.head_drift_threshold_pct

    issues: List[str] = []
    suggestions: List[str] = []

    if dy / frame_h > threshold:
        if head_contact[1] > head_stance[1]:
            issues.append("Excessive head drop during swing")
            suggestions.append("Keep eyes level; focus on a fixed target through the zone")
        else:
            issues.append("Head rises excessively during swing")
            suggestions.append("Stay tall through the ball; avoid lunging upward")

    if dx / frame_h > threshold:
        if head_contact[0] > head_stance[0]:
            issues.append("Head drifts forward (toward pitcher) during swing")
        else:
            issues.append("Head pulls away during swing")
        suggestions.append("Keep head still; let your eyes track the ball to the bat")

    score = 1.0 - _clamp(drift_pct / (threshold * 2.0), 0.0, 1.0)
    confidence = 0.70

    return FormMetric(
        name=name,
        score=round(score, 3),
        confidence=confidence,
        rationale=(
            f"Head displacement {total_drift:.1f} px "
            f"({drift_pct * 100:.1f}% of frame height) "
            f"from stance to contact; threshold {threshold * 100:.1f}%"
        ),
        issues=issues,
        suggestions=suggestions,
    )


def score_stance_balance(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
) -> "FormMetric":
    """
    Evaluate weight distribution at stance by comparing hip midpoint to ankle midpoint.

    A balanced stance has the hip center of mass (CoM proxy) positioned
    between the feet in the horizontal axis.
    """
    name = "stance_balance"
    stance_pose = _first_pose_in_phases(poses, phases, ["stance"])
    if stance_pose is None:
        return _skipped_metric(name, "stance phase not found")

    l_hip = _lm_xy(stance_pose, "left_hip")
    r_hip = _lm_xy(stance_pose, "right_hip")
    l_ankle = _lm_xy(stance_pose, "left_ankle")
    r_ankle = _lm_xy(stance_pose, "right_ankle")

    if not all([l_hip, r_hip, l_ankle, r_ankle]):
        return _skipped_metric(name, "hip or ankle landmarks not visible in stance")

    hip_mid = _midpoint(l_hip, r_hip)  # type: ignore[arg-type]
    ankle_mid = _midpoint(l_ankle, r_ankle)  # type: ignore[arg-type]

    # Foot spread (half-width of stance)
    foot_spread = abs(l_ankle[0] - r_ankle[0]) / 2.0  # type: ignore[index]
    if foot_spread < 1.0:
        return _skipped_metric(name, "foot spread too small to measure balance")

    # How far is the hip center from the ankle midpoint (horizontal offset)?
    lateral_offset = abs(hip_mid[0] - ankle_mid[0])
    offset_pct = lateral_offset / foot_spread  # 0 = perfect, 1 = hip over one foot

    issues: List[str] = []
    suggestions: List[str] = []

    if offset_pct > 0.40:
        issues.append("Weight appears unevenly distributed at stance")
        suggestions.append("Start with weight centred; distribute 50/50 or slightly back-weighted")

    score = 1.0 - _clamp(offset_pct / 0.60, 0.0, 1.0)

    return FormMetric(
        name=name,
        score=round(score, 3),
        confidence=0.65,
        rationale=(
            f"Hip CoM proxy offset from ankle midpoint: "
            f"{lateral_offset:.1f} px ({offset_pct * 100:.1f}% of half-stance width)"
        ),
        issues=issues,
        suggestions=suggestions,
    )


def score_hip_rotation_timing(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    fps: float,
    config: "ScoringConfig",
) -> "FormMetric":
    """
    Assess kinetic sequencing: hips should rotate before shoulders.

    Uses angular velocity of the hip-line and shoulder-line (in image plane)
    across consecutive frames.  Identifies the frame of peak angular velocity
    for each; good sequencing has hips peaking BEFORE shoulders by at least
    ``config.hip_lead_min_degrees`` degrees of cumulative rotation.
    """
    name = "hip_rotation_timing"
    swing_poses = _poses_in_phases(poses, phases, ["initiation", "contact_zone"])

    if len(swing_poses) < 4:
        return _skipped_metric(name, "fewer than 4 swing-phase frames available")

    # Compute hip-line and shoulder-line angles for each pose
    hip_angles: List[Tuple[int, float]] = []      # (frame_idx, angle_deg)
    shoulder_angles: List[Tuple[int, float]] = []

    for pose in sorted(swing_poses, key=lambda p: p.frame_idx):
        l_hip = _lm_xy(pose, "left_hip")
        r_hip = _lm_xy(pose, "right_hip")
        l_sh = _lm_xy(pose, "left_shoulder")
        r_sh = _lm_xy(pose, "right_shoulder")

        if l_hip and r_hip:
            angle = math.degrees(math.atan2(r_hip[1] - l_hip[1], r_hip[0] - l_hip[0]))
            hip_angles.append((pose.frame_idx, angle))
        if l_sh and r_sh:
            angle = math.degrees(math.atan2(r_sh[1] - l_sh[1], r_sh[0] - l_sh[0]))
            shoulder_angles.append((pose.frame_idx, angle))

    if len(hip_angles) < 3 or len(shoulder_angles) < 3:
        return _skipped_metric(name, "insufficient hip/shoulder landmarks across swing frames")

    # Angular velocity = Δangle / Δframes
    def _peak_angular_velocity_frame(angles: List[Tuple[int, float]]) -> Tuple[int, float]:
        """Return (frame_idx, peak_angular_velocity) for the highest Δangle/Δframe."""
        best_frame, best_av = angles[0][0], 0.0
        for i in range(1, len(angles)):
            dt = angles[i][0] - angles[i - 1][0]
            if dt <= 0:
                continue
            av = abs(angles[i][1] - angles[i - 1][1]) / dt
            if av > best_av:
                best_av = av
                best_frame = angles[i][0]
        return best_frame, best_av

    hip_peak_frame, hip_peak_av = _peak_angular_velocity_frame(hip_angles)
    sh_peak_frame, sh_peak_av = _peak_angular_velocity_frame(shoulder_angles)

    frame_diff = sh_peak_frame - hip_peak_frame  # positive = hips lead

    # Cumulative hip rotation before shoulder peak
    hip_rotation_at_sh_peak = 0.0
    for i in range(1, len(hip_angles)):
        if hip_angles[i][0] <= sh_peak_frame:
            hip_rotation_at_sh_peak += abs(hip_angles[i][1] - hip_angles[i - 1][1])

    issues: List[str] = []
    suggestions: List[str] = []

    if frame_diff < 0:
        issues.append("Shoulders appear to rotate before hips (reverse sequencing)")
        suggestions.append("Initiate the swing by driving hips toward the pitcher first")
        suggestions.append("Drill: 'hip first' tee work, focusing on hip-fire cue before hands move")
    elif hip_rotation_at_sh_peak < config.hip_lead_min_degrees:
        issues.append(
            f"Hips lead shoulders by only "
            f"~{hip_rotation_at_sh_peak:.1f}° (target ≥ {config.hip_lead_min_degrees}°)"
        )
        suggestions.append("Work on widening the hip-shoulder separation (X-factor) at load")

    # Score based on frame lead and cumulative rotation lead
    frame_lead_score = _clamp((frame_diff + 3) / 6.0, 0.0, 1.0)  # 0 lead → 0.5, 3+ frames → 1.0
    rotation_lead_score = _clamp(
        hip_rotation_at_sh_peak / (config.hip_lead_min_degrees * 2.0), 0.0, 1.0
    )
    score = (frame_lead_score * 0.5) + (rotation_lead_score * 0.5)

    return FormMetric(
        name=name,
        score=round(score, 3),
        confidence=0.60,
        rationale=(
            f"Hip peak angular velocity at frame {hip_peak_frame}; "
            f"shoulder peak at frame {sh_peak_frame} "
            f"(lead = {frame_diff} frames). "
            f"Cumulative hip rotation before shoulder peak: "
            f"{hip_rotation_at_sh_peak:.1f}° "
            f"(target ≥ {config.hip_lead_min_degrees}°)"
        ),
        issues=issues,
        suggestions=suggestions,
    )


def score_stride_control(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    video_meta: Any,
    config: "ScoringConfig",
) -> "FormMetric":
    """
    Measure stride length and stability during the stride phase.

    Front-ankle displacement during stride is normalised by estimated leg
    length (hip-to-ankle distance).  Target: 70–100 % of leg length.
    """
    name = "stride_control"
    stride_poses = _poses_in_phases(poses, phases, ["stride"])
    if len(stride_poses) < 2:
        return _skipped_metric(name, "stride phase has fewer than 2 pose frames")

    first_pose = stride_poses[0]
    last_pose = stride_poses[-1]

    # Use front ankle as the striding foot (approximate: left ankle for right-handers)
    # Without handedness info, try both and use whichever has more displacement
    candidates = []
    for side in [("left_ankle", "left_hip"), ("right_ankle", "right_hip")]:
        ankle_name, hip_name = side
        a_start = _lm_xy(first_pose, ankle_name)
        a_end = _lm_xy(last_pose, ankle_name)
        if a_start and a_end:
            disp = _dist(a_start, a_end)
            # Estimate leg length from first pose
            hip_pt = _lm_xy(first_pose, hip_name)
            leg_len = _dist(hip_pt, a_start) if hip_pt and a_start else None
            candidates.append((disp, leg_len, side))

    if not candidates:
        return _skipped_metric(name, "ankle landmarks not visible during stride phase")

    # Pick the candidate with larger displacement (that is the striding foot)
    candidates.sort(key=lambda c: c[0], reverse=True)
    stride_disp, leg_len, _ = candidates[0]

    issues: List[str] = []
    suggestions: List[str] = []

    if leg_len is None or leg_len < 10.0:
        return _skipped_metric(name, "could not estimate leg length from hip-to-ankle distance")

    stride_pct = stride_disp / leg_len
    target_min = config.stride_length_target_min_pct
    target_max = config.stride_length_target_max_pct

    if stride_pct < target_min:
        issues.append(
            f"Stride is short ({stride_pct * 100:.0f}% of leg length; "
            f"target {target_min * 100:.0f}–{target_max * 100:.0f}%)"
        )
        suggestions.append("Take a longer, more controlled stride toward the pitcher")
    elif stride_pct > target_max * 1.20:
        issues.append(
            f"Stride is excessively long ({stride_pct * 100:.0f}% of leg length)"
        )
        suggestions.append(
            "Shorten stride to maintain hip height and rotational power"
        )

    # Score: 1.0 at target range, degrades outside
    if target_min <= stride_pct <= target_max:
        score = 1.0
    elif stride_pct < target_min:
        score = _clamp(stride_pct / target_min, 0.0, 1.0)
    else:
        excess = (stride_pct - target_max) / target_max
        score = _clamp(1.0 - excess, 0.0, 1.0)

    return FormMetric(
        name=name,
        score=round(score, 3),
        confidence=0.60,
        rationale=(
            f"Front ankle displacement: {stride_disp:.1f} px "
            f"({stride_pct * 100:.1f}% of leg length {leg_len:.1f} px); "
            f"target {target_min * 100:.0f}–{target_max * 100:.0f}%"
        ),
        issues=issues,
        suggestions=suggestions,
    )


def score_hand_path(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
) -> "FormMetric":
    """
    Evaluate wrist path efficiency (casting vs. compact path).

    During initiation the wrists should travel in a tight arc close to the body.
    An excessively outward (casting) path is penalised.  We measure the max
    lateral distance of the wrist from the torso centre (mid-hip line) relative
    to shoulder width.
    """
    name = "hand_path_efficiency"
    init_poses = _poses_in_phases(poses, phases, ["initiation"])
    if len(init_poses) < 2:
        return _skipped_metric(name, "initiation phase has fewer than 2 pose frames")

    # Reference: mid-torso x = midpoint of hips
    cast_ratios: List[float] = []
    shoulder_widths: List[float] = []

    for pose in init_poses:
        l_hip = _lm_xy(pose, "left_hip")
        r_hip = _lm_xy(pose, "right_hip")
        l_sh = _lm_xy(pose, "left_shoulder")
        r_sh = _lm_xy(pose, "right_shoulder")
        l_wrist = _lm_xy(pose, "left_wrist")
        r_wrist = _lm_xy(pose, "right_wrist")

        if not (l_hip and r_hip):
            continue
        torso_x = (l_hip[0] + r_hip[0]) / 2.0

        shoulder_width = _dist(l_sh, r_sh) if l_sh and r_sh else None
        if shoulder_width and shoulder_width > 0:
            shoulder_widths.append(shoulder_width)
            ref_w = shoulder_width
        elif shoulder_widths:
            ref_w = sum(shoulder_widths) / len(shoulder_widths)
        else:
            continue  # Can't normalise without a reference

        for wrist in [lw for lw in [l_wrist, r_wrist] if lw is not None]:
            lateral_dist = abs(wrist[0] - torso_x)
            cast_ratios.append(lateral_dist / ref_w)

    if not cast_ratios:
        return _skipped_metric(name, "wrist or hip landmarks not visible during initiation")

    max_cast_ratio = max(cast_ratios)
    avg_cast_ratio = sum(cast_ratios) / len(cast_ratios)

    issues: List[str] = []
    suggestions: List[str] = []

    if max_cast_ratio > 1.5:
        issues.append("Hands cast excessively away from body during initiation")
        suggestions.append("Keep hands close to the body on the path to the ball")
        suggestions.append("Drill: towel drill or 'knob to the ball' cue to prevent casting")
    elif max_cast_ratio > 1.0:
        issues.append("Slight hand extension (mild casting) detected during initiation")
        suggestions.append("Work on a more direct bat path; try inside-out tee drills")

    # Score: 1.0 for tight path, penalty for casting
    score = 1.0 - _clamp((max_cast_ratio - 0.5) / 1.5, 0.0, 1.0)

    return FormMetric(
        name=name,
        score=round(score, 3),
        confidence=0.60,
        rationale=(
            f"Max wrist lateral extension from torso: "
            f"{max_cast_ratio:.2f}× shoulder width "
            f"(avg {avg_cast_ratio:.2f}×)"
        ),
        issues=issues,
        suggestions=suggestions,
    )


def score_follow_through(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
) -> "FormMetric":
    """
    Assess balance and body alignment during the follow-through and finish phases.

    A proper finish has:
      - Hips and shoulders roughly aligned (not collapsed)
      - Weight on the front foot (front hip higher than rear hip in image coords
        is a rough proxy)
      - No excessive lateral lean
    """
    name = "follow_through_balance"
    ft_poses = _poses_in_phases(poses, phases, ["follow_through", "finish"])
    if not ft_poses:
        return _skipped_metric(name, "follow_through/finish phase not found")

    finish_pose = ft_poses[-1]

    l_hip = _lm_xy(finish_pose, "left_hip")
    r_hip = _lm_xy(finish_pose, "right_hip")
    l_sh = _lm_xy(finish_pose, "left_shoulder")
    r_sh = _lm_xy(finish_pose, "right_shoulder")

    if not (l_hip and r_hip):
        return _skipped_metric(name, "hip landmarks not visible at finish")

    hip_level_diff = abs(l_hip[1] - r_hip[1])  # pixel difference
    hip_spread = abs(l_hip[0] - r_hip[0])
    if hip_spread < 1.0:
        return _skipped_metric(name, "hips too close together to measure tilt")

    hip_tilt_ratio = hip_level_diff / hip_spread

    issues: List[str] = []
    suggestions: List[str] = []

    shoulder_tilt_ratio: Optional[float] = None
    if l_sh and r_sh:
        sh_level_diff = abs(l_sh[1] - r_sh[1])
        sh_spread = abs(l_sh[0] - r_sh[0])
        if sh_spread > 0:
            shoulder_tilt_ratio = sh_level_diff / sh_spread
            if shoulder_tilt_ratio > 0.45:
                issues.append("Shoulders drop significantly at finish (poor follow-through balance)")
                suggestions.append("Finish with shoulders more level; extend through the ball")

    if hip_tilt_ratio > 0.45:
        issues.append("Hips are not level at finish; possible loss of rotational balance")
        suggestions.append("Work on a tall, balanced finish; use a wall/mirror for feedback")

    combined_tilt = hip_tilt_ratio
    if shoulder_tilt_ratio is not None:
        combined_tilt = (hip_tilt_ratio + shoulder_tilt_ratio) / 2.0

    score = 1.0 - _clamp(combined_tilt / 0.60, 0.0, 1.0)

    return FormMetric(
        name=name,
        score=round(score, 3),
        confidence=0.65,
        rationale=(
            f"Hip tilt ratio at finish: {hip_tilt_ratio:.3f}; "
            + (
                f"shoulder tilt ratio: {shoulder_tilt_ratio:.3f}"
                if shoulder_tilt_ratio is not None
                else "shoulder data unavailable"
            )
        ),
        issues=issues,
        suggestions=suggestions,
    )


# ---------------------------------------------------------------------------
# Top-level evaluator
# ---------------------------------------------------------------------------

# Scoring weights (must sum to 1.0)
_WEIGHTS: Dict[str, float] = {
    "head_stability":        0.15,
    "stance_balance":        0.15,
    "hip_rotation_timing":   0.20,
    "stride_control":        0.15,
    "hand_path_efficiency":  0.15,
    "follow_through_balance": 0.20,
}


def evaluate_form(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    video_meta: Any,
    config: "AnalysisConfig",
) -> "FormScores":
    """
    Run all form scorers and aggregate results into a :class:`FormScores` object.

    Partial results are returned when individual scorers fail; skipped metrics
    are marked with ``confidence=0.0`` and an explanatory rationale.

    Weighted average:
        head 0.15 | balance 0.15 | hip_timing 0.20 |
        stride 0.15 | hand 0.15 | follow 0.20

    Parameters
    ----------
    poses:
        All FramePose objects from the pipeline.
    phases:
        Segmented swing phases.
    video_meta:
        VideoMetadata (used by head stability for frame-height normalisation).
    config:
        AnalysisConfig containing ScoringConfig and fps info.
    """
    fps = getattr(video_meta, "fps", 30.0)
    scoring_cfg = config.scoring

    # Run each scorer, swallowing exceptions to allow partial results
    def _safe(fn, *args, name="unknown"):
        try:
            return fn(*args)
        except Exception as exc:
            logger.exception("Scorer %s raised an exception: %s", name, exc)
            return _skipped_metric(name, f"scorer raised exception: {exc}")

    head = _safe(score_head_stability, poses, phases, video_meta, scoring_cfg, name="head_stability")
    balance = _safe(score_stance_balance, poses, phases, name="stance_balance")
    hip = _safe(score_hip_rotation_timing, poses, phases, fps, scoring_cfg, name="hip_rotation_timing")
    stride = _safe(score_stride_control, poses, phases, video_meta, scoring_cfg, name="stride_control")
    hand = _safe(score_hand_path, poses, phases, name="hand_path_efficiency")
    follow = _safe(score_follow_through, poses, phases, name="follow_through_balance")

    metric_map: Dict[str, "FormMetric"] = {
        "head_stability": head,
        "stance_balance": balance,
        "hip_rotation_timing": hip,
        "stride_control": stride,
        "hand_path_efficiency": hand,
        "follow_through_balance": follow,
    }

    # Weighted overall score (skip metrics with zero confidence)
    total_weight = 0.0
    weighted_sum = 0.0
    confidences: List[float] = []

    for metric_key, metric in metric_map.items():
        w = _WEIGHTS.get(metric_key, 0.0)
        if metric.confidence > 0.0:
            weighted_sum += metric.score * w
            total_weight += w
            confidences.append(metric.confidence)

    overall_score = (weighted_sum / total_weight) if total_weight > 0 else None
    overall_confidence = (sum(confidences) / len(confidences)) if confidences else 0.0

    # Aggregate all issues and suggestions (deduplicated)
    all_issues: List[str] = []
    all_suggestions: List[str] = []
    seen_issues: set = set()
    seen_suggestions: set = set()

    for metric in metric_map.values():
        for issue in metric.issues:
            if issue not in seen_issues:
                all_issues.append(issue)
                seen_issues.add(issue)
        for sug in metric.suggestions:
            if sug not in seen_suggestions:
                all_suggestions.append(sug)
                seen_suggestions.add(sug)

    return FormScores(
        head_stability=head,
        stance_balance=balance,
        hip_rotation_timing=hip,
        stride_control=stride,
        hand_path_efficiency=hand,
        follow_through_balance=follow,
        overall_score=round(overall_score, 3) if overall_score is not None else None,
        overall_confidence=round(overall_confidence, 3),
        issues=all_issues,
        suggestions=all_suggestions,
    )
