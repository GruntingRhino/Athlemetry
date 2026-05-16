"""
metrics.py — Swing speed estimation and trajectory descriptors.

All speed values are ESTIMATES derived from video pixel analysis.
They are NOT certified measurements and should not be used as substitutes
for dedicated hardware (radar guns, bat sensors, etc.).
"""

from __future__ import annotations

import math
import logging
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schema imports (graceful fallback if run outside package context)
# ---------------------------------------------------------------------------
try:
    from schemas import (
        AnalysisInput,
        VideoMetadata,
        FramePose,
        SwingPhase,
        BallTrajectory,
        SwingSpeed,
        TrackPoint,
    )
    from config import MetricConfig
except ImportError:
    try:
        from schemas import (
            AnalysisInput,
            VideoMetadata,
            FramePose,
            SwingPhase,
            BallTrajectory,
            SwingSpeed,
            TrackPoint,
        )
        from config import MetricConfig
    except ImportError:
        logger.warning("Could not import schemas/config; type hints will be strings.")
        AnalysisInput = Any  # type: ignore
        VideoMetadata = Any  # type: ignore
        FramePose = Any  # type: ignore
        SwingPhase = Any  # type: ignore
        BallTrajectory = Any  # type: ignore
        SwingSpeed = Any  # type: ignore
        TrackPoint = Any  # type: ignore
        MetricConfig = Any  # type: ignore

# CalibrationMode is a Literal alias — re-declare locally for safety
CalibrationMode = str

# Inches-to-feet, mph conversion constants
_INCHES_PER_FOOT = 12.0
_FEET_PER_MILE = 5280.0
_SECONDS_PER_HOUR = 3600.0

# Anthropometric constant: head height ≈ 12 % of total body height
_HEAD_HEIGHT_FRACTION = 0.12

# Default bat prior in inches (from MetricConfig.default_bat_length_inches)
_BAT_PRIOR_INCHES = 33.0


# ---------------------------------------------------------------------------
# Helper utilities
# ---------------------------------------------------------------------------

def _clamp(value: float, lo: float, hi: float) -> float:
    """Clamp *value* to [lo, hi]."""
    return max(lo, min(hi, value))


def _landmark_xy(pose: "FramePose", name: str) -> Optional[Tuple[float, float]]:
    """Return (x, y) for a named landmark, or None if absent/invisible."""
    lm = pose.landmarks.get(name)
    if lm is None:
        return None
    if lm.visibility < 0.3:
        return None
    return (lm.x, lm.y)


def _euclidean(p1: Tuple[float, float], p2: Tuple[float, float]) -> float:
    """Euclidean distance between two 2-D points."""
    return math.hypot(p2[0] - p1[0], p2[1] - p1[1])


def _frames_in_phases(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    phase_labels: List[str],
) -> List["FramePose"]:
    """Return the subset of *poses* whose frame index falls within any of the named phases."""
    ranges: List[Tuple[int, int]] = [
        (p.start_frame, p.end_frame)
        for p in phases
        if p.label in phase_labels
    ]
    if not ranges:
        return []
    result = []
    for pose in poses:
        for start, end in ranges:
            if start <= pose.frame_idx <= end:
                result.append(pose)
                break
    return result


# ---------------------------------------------------------------------------
# Pixels-per-inch calibration
# ---------------------------------------------------------------------------

def compute_pixels_per_inch(
    input: "AnalysisInput",
    video_meta: "VideoMetadata",
    poses: List["FramePose"],
    bat_detections: Optional[List[Any]] = None,  # List[FrameDetection]
    batter_detections: Optional[List[Any]] = None,
) -> Tuple[Optional[float], CalibrationMode]:
    """
    Estimate a pixel-to-inch scale factor using the best available signal.

    Priority order:
        Mode A — user-supplied bat_length_inches + bat bounding box width
        Mode B — user-supplied player_height_inches + batter bounding box height
        Mode C — batter pose available → anthropometric head-height proportion
        Mode D — bat bounding box available → default bat prior (33 in)
        Mode E — no calibration possible → return (None, "relative_only")

    Parameters
    ----------
    input:
        AnalysisInput containing optional calibration hints.
    video_meta:
        VideoMetadata (frame dimensions used for fallback pose proportion).
    poses:
        Detected poses; used for Mode C.
    bat_detections:
        Optional list of FrameDetection objects with .bat BoundingBox.
    batter_detections:
        Optional list of FrameDetection objects with .batter BoundingBox.

    Returns
    -------
    (pixels_per_inch, calibration_mode)
    """

    bat_detections = bat_detections or []
    batter_detections = batter_detections or []

    # ------------------------------------------------------------------
    # Mode A: user supplied bat_length_inches + we have bat bbox widths
    # ------------------------------------------------------------------
    if input.bat_length_inches and input.bat_length_inches > 0:
        bat_widths = [
            fd.bat.x2 - fd.bat.x1
            for fd in bat_detections
            if getattr(fd, "bat", None) is not None
        ]
        if bat_widths:
            median_width_px = sorted(bat_widths)[len(bat_widths) // 2]
            if median_width_px > 0:
                ppi = median_width_px / input.bat_length_inches
                logger.debug("Calibration Mode A: bat bbox %.1f px / %.1f in = %.3f px/in",
                             median_width_px, input.bat_length_inches, ppi)
                return ppi, "user_bat_length"

    # ------------------------------------------------------------------
    # Mode B: user supplied player_height_inches + batter bbox height
    # ------------------------------------------------------------------
    if input.player_height_inches and input.player_height_inches > 0:
        batter_heights = [
            fd.batter.y2 - fd.batter.y1
            for fd in batter_detections
            if getattr(fd, "batter", None) is not None
        ]
        if batter_heights:
            median_height_px = sorted(batter_heights)[len(batter_heights) // 2]
            if median_height_px > 0:
                ppi = median_height_px / input.player_height_inches
                logger.debug("Calibration Mode B: batter bbox %.1f px / %.1f in = %.3f px/in",
                             median_height_px, input.player_height_inches, ppi)
                return ppi, "user_player_height"

    # ------------------------------------------------------------------
    # Mode C: anthropometric estimation from head keypoints in pose
    # ------------------------------------------------------------------
    # MediaPipe landmarks: "nose", "left_eye_inner" / "right_eye_inner",
    # and "left_hip"/"right_hip" can bracket head-to-hip distance.
    # Approximation: head height ≈ 12 % of total height, and we infer
    # total height from the visible nose-to-mid-ankle distance.
    if poses:
        head_heights: List[float] = []
        for pose in poses:
            nose = _landmark_xy(pose, "nose")
            l_ankle = _landmark_xy(pose, "left_ankle")
            r_ankle = _landmark_xy(pose, "right_ankle")

            if nose is None:
                continue

            ankle_y: Optional[float] = None
            if l_ankle and r_ankle:
                ankle_y = (l_ankle[1] + r_ankle[1]) / 2.0
            elif l_ankle:
                ankle_y = l_ankle[1]
            elif r_ankle:
                ankle_y = r_ankle[1]

            if ankle_y is None:
                # Fall back: use frame height as proxy for total body height
                ankle_y = video_meta.height

            body_height_px = abs(ankle_y - nose[1])
            if body_height_px > 50:  # sanity: at least 50 px tall
                head_h = body_height_px * _HEAD_HEIGHT_FRACTION
                head_heights.append(head_h)

        if head_heights and input.player_height_inches and input.player_height_inches > 0:
            # We know total height → derive ppi from full body proportion
            median_body_px = sorted(
                [h / _HEAD_HEIGHT_FRACTION for h in head_heights]
            )[len(head_heights) // 2]
            ppi = median_body_px / input.player_height_inches
            logger.debug("Calibration Mode C (anthropometric+height): %.3f px/in", ppi)
            return ppi, "anthropometric_estimation"

        if head_heights:
            # No height supplied — use head proportion alone with average adult height (70 in)
            _assumed_height_in = 70.0
            median_body_px = sorted(
                [h / _HEAD_HEIGHT_FRACTION for h in head_heights]
            )[len(head_heights) // 2]
            ppi = median_body_px / _assumed_height_in
            logger.debug("Calibration Mode C (anthropometric, assumed 70 in): %.3f px/in", ppi)
            return ppi, "anthropometric_estimation"

    # ------------------------------------------------------------------
    # Mode D: bat bbox available → use default bat prior
    # ------------------------------------------------------------------
    bat_widths = [
        fd.bat.x2 - fd.bat.x1
        for fd in bat_detections
        if getattr(fd, "bat", None) is not None
    ]
    if bat_widths:
        median_width_px = sorted(bat_widths)[len(bat_widths) // 2]
        if median_width_px > 0:
            ppi = median_width_px / _BAT_PRIOR_INCHES
            logger.debug("Calibration Mode D (bat prior): %.3f px/in", ppi)
            return ppi, "bat_prior"

    # ------------------------------------------------------------------
    # Mode E: no calibration possible
    # ------------------------------------------------------------------
    logger.debug("Calibration Mode E: relative_only")
    return None, "relative_only"


# ---------------------------------------------------------------------------
# Swing speed estimation
# ---------------------------------------------------------------------------

def estimate_swing_speed(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    video_meta: "VideoMetadata",
    pixels_per_inch: Optional[float],
    config: "MetricConfig",
) -> "SwingSpeed":
    """
    Estimate bat/swing speed from wrist displacement during the active swing window.

    The wrist is used as a proxy for bat barrel speed because the barrel tip
    moves similarly to — but slightly faster than — the wrists during the
    contact-zone phase.  All values are ESTIMATES.

    Strategy
    --------
    1. Collect wrist positions for frames in ``initiation`` and ``contact_zone``
       phases (the active swing window).
    2. Compute per-frame displacement (pixels) for both wrists; take the maximum
       (dominant hand drives the swing).
    3. Convert px/frame → inches/frame → mph using fps and pixels_per_inch.
    4. Apply implausibility clamping and adjust confidence accordingly.

    Returns a :class:`SwingSpeed` with ``is_estimate=True`` always.
    """
    fps = video_meta.fps if video_meta.fps > 0 else config.fallback_fps

    # Gather poses in the swing window
    swing_poses = _frames_in_phases(poses, phases, ["initiation", "contact_zone"])
    if not swing_poses:
        # Widen search to all phases if segmentation is coarse
        swing_poses = poses

    # Prefer dominant-wrist landmarks; fall back to either wrist
    wrist_names = ["right_wrist", "left_wrist"]

    # Build per-frame wrist position lists
    frame_wrist_positions: Dict[int, List[Tuple[float, float]]] = {}
    for pose in sorted(swing_poses, key=lambda p: p.frame_idx):
        pts = []
        for name in wrist_names:
            pt = _landmark_xy(pose, name)
            if pt:
                pts.append(pt)
        if pts:
            frame_wrist_positions[pose.frame_idx] = pts

    if len(frame_wrist_positions) < 2:
        # Not enough data for speed computation
        return SwingSpeed(
            peak_speed_mph=None,
            average_speed_mph=None,
            confidence=0.0,
            confidence_band_mph=None,
            calibration_mode="relative_only",
            pixels_per_inch=None,
            estimation_method="insufficient_pose_data",
            is_estimate=True,
        )

    # Compute per-frame speeds (pixels/frame → mph)
    sorted_frames = sorted(frame_wrist_positions.keys())
    frame_speeds_px: List[float] = []

    for i in range(1, len(sorted_frames)):
        prev_idx = sorted_frames[i - 1]
        curr_idx = sorted_frames[i]
        dt_frames = curr_idx - prev_idx
        if dt_frames <= 0:
            continue

        prev_pts = frame_wrist_positions[prev_idx]
        curr_pts = frame_wrist_positions[curr_idx]

        # Match closest wrist pair (same landmark if possible)
        max_disp = 0.0
        for cp in curr_pts:
            for pp in prev_pts:
                d = _euclidean(cp, pp) / dt_frames
                max_disp = max(max_disp, d)

        frame_speeds_px.append(max_disp)

    if not frame_speeds_px:
        return SwingSpeed(
            peak_speed_mph=None,
            average_speed_mph=None,
            confidence=0.0,
            confidence_band_mph=None,
            calibration_mode="relative_only",
            pixels_per_inch=None,
            estimation_method="no_frame_transitions",
            is_estimate=True,
        )

    peak_px_per_frame = max(frame_speeds_px)
    avg_px_per_frame = sum(frame_speeds_px) / len(frame_speeds_px)

    # Determine calibration mode
    if pixels_per_inch is None:
        # Return relative-only score (px/frame, no unit conversion)
        calibration_mode: CalibrationMode = "relative_only"
        # Normalise to a 0–100 "relative score" where 100 ≈ typical MLB swing
        # Typical MLB swing wrist speed in our pixel space varies widely; use
        # a relative presentation only.
        return SwingSpeed(
            peak_speed_mph=None,
            average_speed_mph=None,
            confidence=0.3,
            confidence_band_mph=None,
            calibration_mode=calibration_mode,
            pixels_per_inch=None,
            estimation_method=(
                "wrist_displacement_px_per_frame_no_calibration; "
                "values are relative only"
            ),
            is_estimate=True,
        )

    # Convert px/frame → mph
    # px/frame × (1 in / ppi) × (1 ft / 12 in) × fps × (3600 s/hr / 5280 ft/mi)
    def _px_frame_to_mph(px_per_frame: float) -> float:
        inches_per_frame = px_per_frame / pixels_per_inch
        feet_per_second = (inches_per_frame / _INCHES_PER_FOOT) * fps
        return feet_per_second * (_SECONDS_PER_HOUR / _FEET_PER_MILE)

    peak_mph = _px_frame_to_mph(peak_px_per_frame)
    avg_mph = _px_frame_to_mph(avg_px_per_frame)

    # Plausibility check
    base_confidence = 0.55
    implausibility_penalty = 0.0

    if peak_mph < config.min_plausible_bat_speed_mph:
        logger.warning("Estimated peak speed %.1f mph is below plausible minimum %.1f mph",
                       peak_mph, config.min_plausible_bat_speed_mph)
        implausibility_penalty += 0.25
        peak_mph = max(peak_mph, config.min_plausible_bat_speed_mph)
        avg_mph = max(avg_mph, config.min_plausible_bat_speed_mph)

    if peak_mph > config.max_plausible_bat_speed_mph:
        logger.warning("Estimated peak speed %.1f mph exceeds plausible maximum %.1f mph",
                       peak_mph, config.max_plausible_bat_speed_mph)
        implausibility_penalty += 0.30
        peak_mph = min(peak_mph, config.max_plausible_bat_speed_mph)
        avg_mph = min(avg_mph, config.max_plausible_bat_speed_mph)

    confidence = _clamp(base_confidence - implausibility_penalty, 0.05, 0.85)

    # Confidence band: ±20 % around peak
    band_low = round(peak_mph * 0.80, 1)
    band_high = round(peak_mph * 1.20, 1)

    # Determine which CalibrationMode was used (passed in via pixels_per_inch existence)
    # We can't recover the exact mode here, so accept it as "bat_prior" as a conservative
    # default when the caller didn't distinguish — callers should pass the mode directly.
    cal_mode: CalibrationMode = "bat_prior"

    return SwingSpeed(
        peak_speed_mph=round(peak_mph, 1),
        average_speed_mph=round(avg_mph, 1),
        confidence=round(confidence, 3),
        confidence_band_mph=(band_low, band_high),
        calibration_mode=cal_mode,
        pixels_per_inch=round(pixels_per_inch, 4),
        estimation_method=(
            "wrist_displacement_proxy; "
            "peak speed derived from max per-frame wrist displacement "
            "during initiation/contact_zone phases; ESTIMATE ONLY"
        ),
        is_estimate=True,
    )


def estimate_swing_speed_with_mode(
    poses: List["FramePose"],
    phases: List["SwingPhase"],
    video_meta: "VideoMetadata",
    pixels_per_inch: Optional[float],
    calibration_mode: CalibrationMode,
    config: "MetricConfig",
) -> "SwingSpeed":
    """
    Thin wrapper that sets the correct calibration_mode on the returned SwingSpeed.

    Prefer calling this over ``estimate_swing_speed`` directly when you have
    the CalibrationMode from ``compute_pixels_per_inch``.
    """
    result = estimate_swing_speed(poses, phases, video_meta, pixels_per_inch, config)
    # Patch the calibration mode
    return result.model_copy(update={"calibration_mode": calibration_mode})


# ---------------------------------------------------------------------------
# Trajectory descriptors
# ---------------------------------------------------------------------------

def compute_trajectory_descriptors(
    ball_traj: "BallTrajectory",
    contact_frame: Optional[int],
) -> Dict[str, Any]:
    """
    Derive geometric descriptors from the ball trajectory.

    Parameters
    ----------
    ball_traj:
        Full ball trajectory; uses ``smoothed_points`` when available.
    contact_frame:
        Frame index of estimated bat-ball contact (from SwingEventSegmentation).

    Returns
    -------
    Dictionary with keys:
        ``approach_angle_deg``   — pitch descent angle before contact (degrees, +down)
        ``vertical_drop_px``     — total vertical drop from first detected frame to contact
        ``launch_direction_deg`` — launch angle after contact (degrees, +up relative to horizontal)
        ``pre_contact_speed_px_per_frame`` — mean ball speed before contact
        ``post_contact_speed_px_per_frame`` — mean ball speed after contact
        ``notes``                — list of human-readable caveats
    """
    points = ball_traj.smoothed_points if ball_traj.smoothed_points else ball_traj.points
    if not points:
        return {
            "approach_angle_deg": None,
            "vertical_drop_px": None,
            "launch_direction_deg": None,
            "pre_contact_speed_px_per_frame": None,
            "post_contact_speed_px_per_frame": None,
            "notes": ["No trajectory points available"],
        }

    notes: List[str] = []

    # Split into pre- and post-contact
    if contact_frame is not None:
        pre_pts = [p for p in points if p.frame_idx <= contact_frame]
        post_pts = [p for p in points if p.frame_idx > contact_frame]
    else:
        pre_pts = points
        post_pts = []
        notes.append("contact_frame not provided; treating all points as pre-contact")

    # ------------------------------------------------------------------
    # Approach angle: angle of the line from first-detected to contact
    # Uses image coordinates (y increases downward).
    # A descending pitch → positive angle (pitch drops below horizontal).
    # ------------------------------------------------------------------
    approach_angle_deg: Optional[float] = None
    if len(pre_pts) >= 2:
        p_first = pre_pts[0]
        p_last = pre_pts[-1]
        dx = p_last.x - p_first.x
        dy = p_last.y - p_first.y  # positive = downward in image coords
        if abs(dx) > 1e-6:
            # atan2: angle from +x axis; invert dy sign so positive = descending
            approach_angle_deg = round(math.degrees(math.atan2(dy, abs(dx))), 2)
        else:
            approach_angle_deg = 90.0 if dy > 0 else -90.0
            notes.append("Ball moved nearly vertically pre-contact")

    # ------------------------------------------------------------------
    # Vertical drop: y displacement from first point to contact point
    # (positive = ball dropped in image space)
    # ------------------------------------------------------------------
    vertical_drop_px: Optional[float] = None
    if len(pre_pts) >= 2:
        vertical_drop_px = round(pre_pts[-1].y - pre_pts[0].y, 2)

    # ------------------------------------------------------------------
    # Launch direction: angle of ball path immediately after contact
    # Positive = upward (negative dy in image space)
    # ------------------------------------------------------------------
    launch_direction_deg: Optional[float] = None
    if len(post_pts) >= 2:
        p_first = post_pts[0]
        p_last = post_pts[-1]
        dx = p_last.x - p_first.x
        dy = p_last.y - p_first.y
        if abs(dx) > 1e-6:
            # Negate dy so positive angle = upward trajectory
            launch_direction_deg = round(math.degrees(math.atan2(-dy, abs(dx))), 2)
        else:
            launch_direction_deg = 90.0 if dy < 0 else -90.0
            notes.append("Ball moved nearly vertically post-contact")
    elif post_pts:
        notes.append("Only one post-contact frame; launch direction not computed")
    else:
        notes.append("No post-contact trajectory data")

    # ------------------------------------------------------------------
    # Mean speeds (px/frame) pre- and post-contact
    # ------------------------------------------------------------------
    def _mean_speed(pts: List["TrackPoint"]) -> Optional[float]:
        if len(pts) < 2:
            return None
        speeds = []
        for i in range(1, len(pts)):
            dt = pts[i].frame_idx - pts[i - 1].frame_idx
            if dt <= 0:
                continue
            d = _euclidean((pts[i].x, pts[i].y), (pts[i - 1].x, pts[i - 1].y))
            speeds.append(d / dt)
        return round(sum(speeds) / len(speeds), 3) if speeds else None

    pre_speed = _mean_speed(pre_pts)
    post_speed = _mean_speed(post_pts)

    return {
        "approach_angle_deg": approach_angle_deg,
        "vertical_drop_px": vertical_drop_px,
        "launch_direction_deg": launch_direction_deg,
        "pre_contact_speed_px_per_frame": pre_speed,
        "post_contact_speed_px_per_frame": post_speed,
        "notes": notes,
    }
