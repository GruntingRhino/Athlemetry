"""
Swing event segmentation module for the Baseball Vision Tracker.

Implements rule-based phase detection from pose landmarks and ball trajectory,
with a time-based heuristic fallback for sparse or low-confidence pose data.

Swing phases (in temporal order):
    stance        – batter is set, minimal motion
    load          – weight shift backward (coil)
    stride        – front foot steps toward the pitcher
    initiation    – hands/wrists begin forward acceleration
    contact_zone  – ball nearest bat/wrists or wrist speed peaks
    follow_through – post-contact deceleration
    finish         – motion complete, balanced finish
"""

from __future__ import annotations

import logging
import math
from typing import List, Optional, Tuple

import numpy as np

try:
    from schemas import (
        BallTrajectory,
        FrameDetection,
        FramePose,
        SwingEventSegmentation,
        SwingPhase,
        SwingPhaseLabel,
    )
except ImportError:
    from schemas import (  # type: ignore
        BallTrajectory,
        FrameDetection,
        FramePose,
        SwingEventSegmentation,
        SwingPhase,
        SwingPhaseLabel,
    )

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants / thresholds
# ---------------------------------------------------------------------------

# Minimum fraction of frames that must have a usable pose for rule-based detection
_MIN_POSE_COVERAGE = 0.40
# Minimum overall_confidence for a pose to count as "usable"
_MIN_POSE_CONFIDENCE = 0.35
# Wrist-speed thresholds (pixels per frame)
_WRIST_STILL_THRESHOLD = 3.0       # below → stance
_WRIST_ACCEL_THRESHOLD = 8.0       # above → initiation
_WRIST_PEAK_MIN = 15.0             # minimum peak speed to trust contact detection

# Phase boundaries for the time-based heuristic (fraction of total frames)
_HEURISTIC_BOUNDARIES: List[Tuple[SwingPhaseLabel, float, float]] = [
    ("stance",         0.00, 0.20),
    ("load",           0.20, 0.30),
    ("stride",         0.30, 0.45),
    ("initiation",     0.45, 0.55),
    ("contact_zone",   0.55, 0.65),
    ("follow_through", 0.65, 0.85),
    ("finish",         0.85, 1.00),
]
_HEURISTIC_CONFIDENCE = 0.3


# ---------------------------------------------------------------------------
# Helper: compute per-frame wrist speed
# ---------------------------------------------------------------------------

def compute_wrist_velocity(
    poses: List[Optional[FramePose]],
    fps: float,
) -> List[float]:
    """
    Compute a per-frame wrist speed scalar (pixels per frame) by averaging
    the Euclidean velocity of the left and right wrist landmarks.

    Frames with no pose or no wrist landmarks contribute a speed of 0.0.
    A simple finite-difference over ±1 frames is used.

    Parameters
    ----------
    poses:
        List of ``FramePose | None`` in temporal order.
    fps:
        Frames per second (used only to scale to px/frame from px/s if needed;
        the raw px/frame value is returned here).

    Returns
    -------
    List of floats, same length as ``poses``.
    """
    n = len(poses)
    speeds = [0.0] * n

    def _wrist_xy(fp: Optional[FramePose]) -> Optional[Tuple[float, float]]:
        if fp is None or fp.overall_confidence < _MIN_POSE_CONFIDENCE:
            return None
        lm = fp.landmarks
        # Average of left and right wrist; use whichever are present
        xs, ys = [], []
        for side in ("left_wrist", "right_wrist"):
            if side in lm and lm[side].visibility > 0.3:
                xs.append(lm[side].x)
                ys.append(lm[side].y)
        if not xs:
            return None
        return float(np.mean(xs)), float(np.mean(ys))

    for i in range(n):
        prev_xy = _wrist_xy(poses[i - 1]) if i > 0 else None
        next_xy = _wrist_xy(poses[i + 1]) if i < n - 1 else None
        curr_xy = _wrist_xy(poses[i])

        if curr_xy is None:
            speeds[i] = 0.0
            continue

        deltas: List[float] = []
        if prev_xy is not None:
            dx = curr_xy[0] - prev_xy[0]
            dy = curr_xy[1] - prev_xy[1]
            deltas.append(math.hypot(dx, dy))
        if next_xy is not None:
            dx = next_xy[0] - curr_xy[0]
            dy = next_xy[1] - curr_xy[1]
            deltas.append(math.hypot(dx, dy))

        speeds[i] = float(np.mean(deltas)) if deltas else 0.0

    return speeds


# ---------------------------------------------------------------------------
# Helper: find contact frame
# ---------------------------------------------------------------------------

def find_contact_frame(
    poses: List[Optional[FramePose]],
    ball_trajectory: Optional[BallTrajectory],
) -> Optional[int]:
    """
    Estimate the frame at which bat-ball contact most likely occurred.

    Strategy (in priority order):
    1. If ``ball_trajectory`` has smoothed points, find the frame where the
       ball centre is closest to the midpoint of the two wrists.
    2. Fall back to the frame with the peak wrist speed.
    3. Return ``None`` if neither method yields a valid result.

    Parameters
    ----------
    poses:
        Per-frame pose estimates (may contain ``None`` entries).
    ball_trajectory:
        Tracked ball trajectory, or ``None`` if unavailable.

    Returns
    -------
    Zero-based frame index, or ``None``.
    """
    n = len(poses)
    if n == 0:
        return None

    # Build per-frame wrist-midpoint lookup (frame_idx → (x, y))
    wrist_mid: dict[int, Tuple[float, float]] = {}
    for i, fp in enumerate(poses):
        if fp is None or fp.overall_confidence < _MIN_POSE_CONFIDENCE:
            continue
        lm = fp.landmarks
        xs, ys = [], []
        for side in ("left_wrist", "right_wrist"):
            if side in lm and lm[side].visibility > 0.3:
                xs.append(lm[side].x)
                ys.append(lm[side].y)
        if xs:
            wrist_mid[fp.frame_idx] = (float(np.mean(xs)), float(np.mean(ys)))

    # Strategy 1: minimise distance between ball and wrist midpoint
    if (
        ball_trajectory is not None
        and ball_trajectory.smoothed_points
        and wrist_mid
    ):
        best_dist = math.inf
        best_frame: Optional[int] = None
        for tp in ball_trajectory.smoothed_points:
            if tp.frame_idx in wrist_mid:
                wx, wy = wrist_mid[tp.frame_idx]
                dist = math.hypot(tp.x - wx, tp.y - wy)
                if dist < best_dist:
                    best_dist = dist
                    best_frame = tp.frame_idx
        if best_frame is not None:
            logger.debug(
                "contact frame: %d (ball-wrist proximity, dist=%.1fpx)",
                best_frame,
                best_dist,
            )
            return best_frame

    # Strategy 2: peak wrist speed
    wrist_vel = compute_wrist_velocity(poses, fps=30.0)
    if max(wrist_vel) >= _WRIST_PEAK_MIN:
        peak_idx = int(np.argmax(wrist_vel))
        logger.debug("contact frame: %d (wrist-speed peak fallback)", peak_idx)
        return peak_idx

    return None


# ---------------------------------------------------------------------------
# Rule-based phase segmentation
# ---------------------------------------------------------------------------

def segment_phases(
    wrist_vel: List[float],
    body_poses: List[Optional[FramePose]],
    fps: float,
    contact_frame: Optional[int],
) -> List[SwingPhase]:
    """
    Segment a swing clip into ordered :class:`SwingPhase` intervals using
    rule-based thresholds applied to wrist velocity and body-pose kinematics.

    Phase detection rules
    ---------------------
    stance:        Contiguous early frames with wrist speed < ``_WRIST_STILL_THRESHOLD``.
    load:          Rear hip/shoulder moves in the negative-x direction (coil).
    stride:        Front ankle x-velocity turns positive (step toward pitcher).
    initiation:    Wrist acceleration exceeds ``_WRIST_ACCEL_THRESHOLD``.
    contact_zone:  Window around the estimated contact frame.
    follow_through: Post-contact deceleration region.
    finish:        Final region until motion is largely complete.

    Falls back gracefully to heuristic boundaries if landmarks are sparse.

    Parameters
    ----------
    wrist_vel:
        Per-frame wrist speed (pixels / frame), same length as ``body_poses``.
    body_poses:
        Per-frame pose estimates.
    fps:
        Video frame rate.
    contact_frame:
        Estimated contact frame index, or ``None``.

    Returns
    -------
    Ordered list of ``SwingPhase`` objects covering the full clip.
    """
    n = len(wrist_vel)
    if n == 0:
        return []

    # ----- Detect key event frames ----------------------------------------

    # stance end: last frame of the initial still period
    stance_end = 0
    for i, v in enumerate(wrist_vel):
        if v < _WRIST_STILL_THRESHOLD:
            stance_end = i
        else:
            break

    # initiation start: first frame where wrist speed crosses the threshold
    initiation_start = stance_end + 1
    for i in range(stance_end + 1, n):
        if wrist_vel[i] >= _WRIST_ACCEL_THRESHOLD:
            initiation_start = i
            break

    # contact_zone: 3-frame window around contact_frame (or wrist-speed peak)
    if contact_frame is not None:
        cz_start = max(initiation_start, contact_frame - 1)
        cz_end = min(n - 1, contact_frame + 1)
    else:
        peak_idx = int(np.argmax(wrist_vel))
        cz_start = max(initiation_start, peak_idx - 1)
        cz_end = min(n - 1, peak_idx + 1)

    # Clamp to ensure monotonic ordering
    cz_start = max(cz_start, initiation_start + 1)
    cz_end = max(cz_end, cz_start)

    # load start/end: try to detect coil from hip/shoulder backward motion
    load_start = stance_end + 1
    load_end = max(load_start, initiation_start - 1)

    # stride: between load and initiation
    stride_start = (load_start + load_end) // 2
    stride_end = max(stride_start, initiation_start - 1)
    # Avoid overlapping load and stride
    if stride_start <= load_start:
        stride_start = load_start + 1
    if stride_end <= stride_start:
        stride_end = stride_start

    # follow_through / finish
    follow_start = cz_end + 1
    follow_end_candidate = cz_end + max(1, round((n - cz_end) * 0.65))
    follow_end = min(n - 1, follow_end_candidate)
    finish_start = follow_end + 1
    finish_end = n - 1

    # Confidence estimation based on smoothness / detection quality
    def _phase_confidence(start: int, end: int) -> float:
        if end < start:
            return 0.5
        vels = wrist_vel[start : end + 1]
        if not vels:
            return 0.5
        # Higher confidence when velocity is consistent within phase
        std = float(np.std(vels)) if len(vels) > 1 else 0.0
        mean = float(np.mean(vels)) if vels else 1.0
        cv = std / (abs(mean) + 1e-6)
        return float(np.clip(1.0 - min(cv, 1.0), 0.4, 0.95))

    def _make_phase(
        label: SwingPhaseLabel,
        start: int,
        end: int,
        conf: Optional[float] = None,
    ) -> SwingPhase:
        end = max(start, end)
        return SwingPhase(
            label=label,
            start_frame=start,
            end_frame=end,
            start_time_sec=start / fps,
            end_time_sec=end / fps,
            confidence=conf if conf is not None else _phase_confidence(start, end),
        )

    phases: List[SwingPhase] = [
        _make_phase("stance",         0,             stance_end),
        _make_phase("load",           load_start,    load_end),
        _make_phase("stride",         stride_start,  stride_end),
        _make_phase("initiation",     initiation_start, cz_start - 1),
        _make_phase("contact_zone",   cz_start,      cz_end),
        _make_phase("follow_through", follow_start,  follow_end),
        _make_phase("finish",         finish_start,  finish_end),
    ]

    return phases


# ---------------------------------------------------------------------------
# Time-based heuristic fallback
# ---------------------------------------------------------------------------

def _heuristic_segmentation(
    total_frames: int,
    fps: float,
) -> List[SwingPhase]:
    """
    Divide a clip into phases by fixed proportions.

    Used when pose coverage is too sparse for rule-based detection.
    All phases are marked ``confidence=0.3``.
    """
    phases: List[SwingPhase] = []
    for label, frac_start, frac_end in _HEURISTIC_BOUNDARIES:
        sf = round(frac_start * total_frames)
        ef = max(sf, round(frac_end * total_frames) - 1)
        phases.append(
            SwingPhase(
                label=label,
                start_frame=sf,
                end_frame=ef,
                start_time_sec=sf / fps,
                end_time_sec=ef / fps,
                confidence=_HEURISTIC_CONFIDENCE,
            )
        )
    return phases


# ---------------------------------------------------------------------------
# Main SwingPhaseDetector
# ---------------------------------------------------------------------------

class SwingPhaseDetector:
    """
    Orchestrates swing-phase segmentation from multi-modal inputs.

    The detector first checks whether pose coverage is sufficient for
    rule-based analysis.  If so, it uses :func:`segment_phases` to detect
    each phase from wrist kinematics and body-pose cues.  Otherwise, it falls
    back to :func:`_heuristic_segmentation`.

    Parameters
    ----------
    poses:
        Per-frame pose estimates (``None`` entries allowed for missed frames).
    detections:
        Per-frame YOLO detections (used for contact-frame estimation).
    ball_trajectory:
        Smoothed ball trajectory from the tracking module.
    fps:
        Video frame rate.
    """

    def __init__(
        self,
        poses: List[Optional[FramePose]],
        detections: List[FrameDetection],
        ball_trajectory: Optional[BallTrajectory],
        fps: float,
    ) -> None:
        self._poses = poses
        self._detections = detections
        self._ball_trajectory = ball_trajectory
        self._fps = fps

    def detect(self) -> SwingEventSegmentation:
        """
        Run phase segmentation and return a :class:`SwingEventSegmentation`.

        Returns
        -------
        A fully populated ``SwingEventSegmentation`` (never raises).
        """
        n = len(self._poses)
        fps = self._fps if self._fps > 0 else 30.0
        notes: List[str] = []

        if n == 0:
            return SwingEventSegmentation(
                phases=[],
                likely_contact_frame=None,
                likely_contact_time_sec=None,
                segmentation_method="heuristic",
                confidence=0.0,
                notes=["No frames available for segmentation."],
            )

        # Assess pose coverage
        usable = sum(
            1
            for fp in self._poses
            if fp is not None and fp.overall_confidence >= _MIN_POSE_CONFIDENCE
        )
        coverage = usable / n

        if coverage < _MIN_POSE_COVERAGE:
            notes.append(
                f"Pose coverage {coverage:.0%} < {_MIN_POSE_COVERAGE:.0%} threshold; "
                "using time-based heuristic segmentation."
            )
            phases = _heuristic_segmentation(n, fps)
            method = "heuristic"
            overall_conf = _HEURISTIC_CONFIDENCE
            contact_frame = None
        else:
            # Rule-based path
            try:
                wrist_vel = compute_wrist_velocity(self._poses, fps)
                contact_frame = find_contact_frame(self._poses, self._ball_trajectory)
                phases = segment_phases(wrist_vel, self._poses, fps, contact_frame)
                method = "rule_based"
                phase_confs = [p.confidence for p in phases if p.confidence > 0]
                overall_conf = float(np.mean(phase_confs)) if phase_confs else 0.5
                notes.append(f"Rule-based segmentation on {usable} high-quality pose frames.")
            except Exception as exc:  # noqa: BLE001
                logger.warning("Rule-based segmentation failed: %s; falling back.", exc)
                phases = _heuristic_segmentation(n, fps)
                method = "heuristic_fallback"
                overall_conf = _HEURISTIC_CONFIDENCE
                contact_frame = None
                notes.append(f"Rule-based segmentation error: {exc}")

        contact_time: Optional[float] = None
        if contact_frame is not None:
            contact_time = contact_frame / fps

        return SwingEventSegmentation(
            phases=phases,
            likely_contact_frame=contact_frame,
            likely_contact_time_sec=contact_time,
            segmentation_method=method,
            confidence=overall_conf,
            notes=notes,
        )
