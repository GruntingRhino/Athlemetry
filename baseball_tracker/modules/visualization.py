"""
visualization.py — Frame annotation and chart generation for baseball swing analysis.

All drawing is done with OpenCV (cv2).  Matplotlib is used for static chart outputs.
Both are treated as optional dependencies with graceful degradation.
"""

from __future__ import annotations

import logging
import os
from pathlib import Path
from typing import Any, List, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Optional heavy imports
# ---------------------------------------------------------------------------
try:
    import cv2  # type: ignore
    import numpy as np
    _CV2_AVAILABLE = True
except ImportError:
    cv2 = None  # type: ignore
    np = None   # type: ignore
    _CV2_AVAILABLE = False
    logger.warning("OpenCV (cv2) not available; video annotation functions will be no-ops.")

try:
    import matplotlib  # type: ignore
    matplotlib.use("Agg")  # non-interactive backend
    import matplotlib.pyplot as plt  # type: ignore
    import matplotlib.patches as mpatches  # type: ignore
    _MPL_AVAILABLE = True
except ImportError:
    plt = None  # type: ignore
    mpatches = None  # type: ignore
    _MPL_AVAILABLE = False
    logger.warning("Matplotlib not available; chart functions will be no-ops.")

# ---------------------------------------------------------------------------
# Schema imports
# ---------------------------------------------------------------------------
try:
    from schemas import FramePose, TrackPoint, BallTrajectory, SwingSpeed, SwingPhase
except ImportError:
    try:
        from schemas import FramePose, TrackPoint, BallTrajectory, SwingSpeed, SwingPhase
    except ImportError:
        logger.warning("visualization.py: schema import failed.")
        FramePose = Any  # type: ignore
        TrackPoint = Any  # type: ignore
        BallTrajectory = Any  # type: ignore
        SwingSpeed = Any  # type: ignore
        SwingPhase = Any  # type: ignore


# ---------------------------------------------------------------------------
# Colour constants (BGR for OpenCV)
# ---------------------------------------------------------------------------
_BLUE   = (219, 152, 52)   # left side
_RED    = (60, 76, 231)    # right side
_GREEN  = (86, 201, 105)   # centre / midline
_WHITE  = (255, 255, 255)
_YELLOW = (0, 220, 220)
_CYAN   = (220, 200, 0)
_ORANGE = (30, 140, 230)
_GREY   = (140, 140, 140)

# MediaPipe landmark connection pairs (subset sufficient for swing analysis)
_POSE_CONNECTIONS = [
    # Spine / centre
    ("left_shoulder",  "right_shoulder"),
    ("left_hip",       "right_hip"),
    ("left_shoulder",  "left_hip"),
    ("right_shoulder", "right_hip"),
    # Left arm
    ("left_shoulder",  "left_elbow"),
    ("left_elbow",     "left_wrist"),
    # Right arm
    ("right_shoulder", "right_elbow"),
    ("right_elbow",    "right_wrist"),
    # Left leg
    ("left_hip",       "left_knee"),
    ("left_knee",      "left_ankle"),
    # Right leg
    ("right_hip",      "right_knee"),
    ("right_knee",     "right_ankle"),
]

# Side classification for colouring
_LEFT_LANDMARKS  = {"left_shoulder", "left_elbow", "left_wrist", "left_hip", "left_knee", "left_ankle"}
_RIGHT_LANDMARKS = {"right_shoulder", "right_elbow", "right_wrist", "right_hip", "right_knee", "right_ankle"}


def _lm_px(pose: "FramePose", name: str) -> Optional[tuple]:
    """Return integer (x, y) for a landmark if visible, else None."""
    lm = pose.landmarks.get(name)
    if lm is None or lm.visibility < 0.25:
        return None
    return (int(lm.x), int(lm.y))


def _connection_color(name_a: str, name_b: str) -> tuple:
    """Choose BGR colour based on which side the connection belongs to."""
    if name_a in _LEFT_LANDMARKS and name_b in _LEFT_LANDMARKS:
        return _BLUE
    if name_a in _RIGHT_LANDMARKS and name_b in _RIGHT_LANDMARKS:
        return _RED
    return _GREEN


# ---------------------------------------------------------------------------
# Per-frame drawing primitives
# ---------------------------------------------------------------------------

def draw_skeleton(frame: Any, pose: "FramePose") -> Any:
    """
    Draw pose keypoints and bone connections onto *frame*.

    Colour coding:
        Blue  — left-side connections
        Red   — right-side connections
        Green — cross-body / centre connections

    Returns the annotated frame (in-place modification).
    """
    if not _CV2_AVAILABLE or frame is None or pose is None:
        return frame

    # Draw connections
    for (a, b) in _POSE_CONNECTIONS:
        pa = _lm_px(pose, a)
        pb = _lm_px(pose, b)
        if pa and pb:
            color = _connection_color(a, b)
            cv2.line(frame, pa, pb, color, 2, lineType=cv2.LINE_AA)

    # Draw keypoints
    for name, lm in pose.landmarks.items():
        if lm.visibility < 0.25:
            continue
        pt = (int(lm.x), int(lm.y))
        color = _BLUE if name in _LEFT_LANDMARKS else (_RED if name in _RIGHT_LANDMARKS else _GREEN)
        cv2.circle(frame, pt, 4, color, -1, lineType=cv2.LINE_AA)
        cv2.circle(frame, pt, 5, _WHITE, 1, lineType=cv2.LINE_AA)

    return frame


def draw_ball_path(
    frame: Any,
    trajectory_points: List["TrackPoint"],
    current_frame_idx: int,
) -> Any:
    """
    Draw the ball trajectory up to *current_frame_idx* as a fading polyline.

    Older points are rendered more transparently (simulated with darkening).
    Interpolated points are drawn as hollow circles.

    Returns the annotated frame.
    """
    if not _CV2_AVAILABLE or frame is None or not trajectory_points:
        return frame

    relevant = [p for p in trajectory_points if p.frame_idx <= current_frame_idx]
    if len(relevant) < 2:
        return frame

    max_trail = 30  # maximum number of past frames to show
    relevant = relevant[-max_trail:]
    n = len(relevant)

    for i in range(1, n):
        alpha = i / n  # 0 = oldest, 1 = newest
        raw_color = _YELLOW
        color = tuple(int(c * alpha) for c in raw_color)

        p_prev = relevant[i - 1]
        p_curr = relevant[i]
        pt1 = (int(p_prev.x), int(p_prev.y))
        pt2 = (int(p_curr.x), int(p_curr.y))
        cv2.line(frame, pt1, pt2, color, 2, lineType=cv2.LINE_AA)

    # Mark the most recent point
    last = relevant[-1]
    lpt = (int(last.x), int(last.y))
    if last.interpolated:
        # Hollow circle for interpolated
        cv2.circle(frame, lpt, 6, _YELLOW, 1, lineType=cv2.LINE_AA)
    else:
        cv2.circle(frame, lpt, 5, _YELLOW, -1, lineType=cv2.LINE_AA)

    return frame


def draw_bat_proxy(frame: Any, pose: "FramePose") -> Any:
    """
    Draw a bat-path proxy line from the rear shoulder through both wrists.

    When the bat is not directly detected, this gives a visual representation
    of the swing plane.

    Returns the annotated frame.
    """
    if not _CV2_AVAILABLE or frame is None or pose is None:
        return frame

    # Use both wrists as the bat path; rear shoulder as origin
    l_wrist = _lm_px(pose, "left_wrist")
    r_wrist = _lm_px(pose, "right_wrist")
    l_sh = _lm_px(pose, "left_shoulder")
    r_sh = _lm_px(pose, "right_shoulder")

    # Pick the "rear" shoulder (further from center of frame)
    frame_cx = frame.shape[1] / 2 if frame is not None else 640
    rear_sh = None
    if l_sh and r_sh:
        rear_sh = l_sh if abs(l_sh[0] - frame_cx) > abs(r_sh[0] - frame_cx) else r_sh
    elif l_sh:
        rear_sh = l_sh
    elif r_sh:
        rear_sh = r_sh

    if rear_sh is None:
        return frame

    # Draw line from rear shoulder through each wrist, then extend
    for wrist in [p for p in [l_wrist, r_wrist] if p is not None]:
        dx = wrist[0] - rear_sh[0]
        dy = wrist[1] - rear_sh[1]
        # Extend by 50 % beyond the wrist
        ext_pt = (int(wrist[0] + dx * 0.5), int(wrist[1] + dy * 0.5))
        cv2.line(frame, rear_sh, wrist, _ORANGE, 2, lineType=cv2.LINE_AA)
        cv2.line(frame, wrist, ext_pt, _ORANGE, 1, cv2.LINE_AA)

    return frame


def draw_phase_label(
    frame: Any,
    phase_label: str,
    confidence: float,
) -> Any:
    """
    Overlay current swing phase name and confidence in the top-left corner.

    Returns the annotated frame.
    """
    if not _CV2_AVAILABLE or frame is None:
        return frame

    h, w = frame.shape[:2]
    label = f"Phase: {phase_label.upper()}  (conf {confidence:.0%})"
    font = cv2.FONT_HERSHEY_SIMPLEX
    font_scale = 0.6
    thickness = 1

    # Semi-transparent background
    text_size, _ = cv2.getTextSize(label, font, font_scale, thickness)
    bg_tl = (8, 8)
    bg_br = (8 + text_size[0] + 8, 8 + text_size[1] + 10)

    overlay = frame.copy()
    cv2.rectangle(overlay, bg_tl, bg_br, (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)
    cv2.putText(frame, label, (12, 8 + text_size[1] + 2), font, font_scale, _WHITE, thickness, cv2.LINE_AA)

    return frame


def draw_speed_readout(
    frame: Any,
    speed: Optional["SwingSpeed"],
) -> Any:
    """
    Draw swing speed estimate in the bottom-right corner with a confidence indicator.

    Returns the annotated frame.
    """
    if not _CV2_AVAILABLE or frame is None:
        return frame

    h, w = frame.shape[:2]
    font = cv2.FONT_HERSHEY_SIMPLEX

    if speed is None or speed.peak_speed_mph is None:
        label = "Speed: N/A (ESTIMATE)"
        sub_label = "No calibration"
        color = _GREY
    else:
        label = f"~{speed.peak_speed_mph:.1f} mph (ESTIMATE)"
        sub_label = f"Conf: {speed.confidence:.0%}  [{speed.calibration_mode}]"
        # Colour code by confidence
        if speed.confidence >= 0.60:
            color = _GREEN
        elif speed.confidence >= 0.35:
            color = _YELLOW
        else:
            color = _RED

    # Bottom-right anchor
    margin = 12
    ts_main, _ = cv2.getTextSize(label, font, 0.55, 1)
    ts_sub, _  = cv2.getTextSize(sub_label, font, 0.40, 1)
    y_main = h - margin - ts_sub[1] - 6
    y_sub  = h - margin

    x_main = w - ts_main[0] - margin
    x_sub  = w - ts_sub[0] - margin

    # Background box
    bx1 = min(x_main, x_sub) - 6
    by1 = y_main - ts_main[1] - 4
    overlay = frame.copy()
    cv2.rectangle(overlay, (bx1, by1), (w - margin + 4, h - margin + 4), (0, 0, 0), -1)
    cv2.addWeighted(overlay, 0.5, frame, 0.5, 0, frame)

    cv2.putText(frame, label,     (x_main, y_main), font, 0.55, color, 1, cv2.LINE_AA)
    cv2.putText(frame, sub_label, (x_sub,  y_sub),  font, 0.40, _GREY, 1, cv2.LINE_AA)

    return frame


def annotate_frame(
    frame: Any,
    frame_idx: int,
    pose: Optional["FramePose"],
    trajectory_points: List["TrackPoint"],
    swing_speed: Optional["SwingSpeed"],
    current_phase: Optional["SwingPhase"],
) -> Any:
    """
    Apply all visual overlays to a single frame.

    Order of drawing (back to front):
      1. Skeleton
      2. Bat proxy (if pose available)
      3. Ball trajectory
      4. Phase label
      5. Speed readout

    Returns the annotated frame.
    """
    if not _CV2_AVAILABLE or frame is None:
        return frame

    if pose is not None:
        frame = draw_skeleton(frame, pose)
        frame = draw_bat_proxy(frame, pose)

    if trajectory_points:
        frame = draw_ball_path(frame, trajectory_points, frame_idx)

    if current_phase is not None:
        frame = draw_phase_label(frame, current_phase.label, current_phase.confidence)

    if swing_speed is not None:
        frame = draw_speed_readout(frame, swing_speed)

    # Frame index watermark (bottom-left, small)
    if _CV2_AVAILABLE:
        cv2.putText(
            frame,
            f"#{frame_idx}",
            (8, frame.shape[0] - 8),
            cv2.FONT_HERSHEY_SIMPLEX,
            0.35,
            _GREY,
            1,
            cv2.LINE_AA,
        )

    return frame


# ---------------------------------------------------------------------------
# Video rendering
# ---------------------------------------------------------------------------

def render_annotated_video(
    video_path: str,
    output_path: str,
    poses: List["FramePose"],
    ball_traj: Optional["BallTrajectory"],
    swing_phases: Optional[Any],  # SwingEventSegmentation
    swing_speed: Optional["SwingSpeed"],
) -> str:
    """
    Read the original video frame by frame, apply annotations, write to *output_path*.

    Parameters
    ----------
    video_path:
        Path to the source video.
    output_path:
        Path to write the annotated video (mp4).
    poses:
        List of FramePose objects (sparse OK; unmatched frames skip skeleton).
    ball_traj:
        Ball trajectory (smoothed_points used when available).
    swing_phases:
        SwingEventSegmentation containing phase list; used for phase label overlay.
    swing_speed:
        SwingSpeed estimate drawn on every frame.

    Returns
    -------
    output_path on success; raises RuntimeError if CV2 unavailable.
    """
    if not _CV2_AVAILABLE:
        raise RuntimeError("OpenCV (cv2) is required for video rendering.")

    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise RuntimeError(f"Cannot open video: {video_path}")

    fps    = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width  = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)
    fourcc = cv2.VideoWriter_fourcc(*"mp4v")
    writer = cv2.VideoWriter(output_path, fourcc, fps, (width, height))

    # Build lookup structures for O(1) per-frame access
    pose_by_frame = {p.frame_idx: p for p in (poses or [])}
    traj_points = []
    if ball_traj:
        traj_points = ball_traj.smoothed_points if ball_traj.smoothed_points else ball_traj.points

    phases_list = []
    if swing_phases and hasattr(swing_phases, "phases"):
        phases_list = swing_phases.phases

    frame_idx = 0
    while True:
        ret, frame = cap.read()
        if not ret:
            break

        # Find current phase
        current_phase = None
        for phase in phases_list:
            if phase.start_frame <= frame_idx <= phase.end_frame:
                current_phase = phase
                break

        annotated = annotate_frame(
            frame=frame,
            frame_idx=frame_idx,
            pose=pose_by_frame.get(frame_idx),
            trajectory_points=traj_points,
            swing_speed=swing_speed,
            current_phase=current_phase,
        )
        writer.write(annotated)
        frame_idx += 1

    cap.release()
    writer.release()
    logger.info("Annotated video written to %s (%d frames)", output_path, frame_idx)
    return output_path


# ---------------------------------------------------------------------------
# Chart generation
# ---------------------------------------------------------------------------

def plot_speed_chart(
    frame_times: List[float],
    wrist_speeds: List[float],
    output_path: str,
    phases: Optional[List["SwingPhase"]] = None,
) -> str:
    """
    Generate a Matplotlib chart of wrist speed over time with phase shading.

    Parameters
    ----------
    frame_times:
        List of timestamps (seconds) corresponding to each speed sample.
    wrist_speeds:
        Per-frame wrist speed values (px/frame or mph — label adapts).
    output_path:
        Path to save the PNG chart.
    phases:
        Optional list of SwingPhase for background shading.

    Returns
    -------
    output_path on success.
    """
    if not _MPL_AVAILABLE:
        raise RuntimeError("Matplotlib is required for chart generation.")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    fig, ax = plt.subplots(figsize=(10, 4))

    # Phase shading
    _phase_colors = {
        "stance":         "#d4e6f1",
        "load":           "#d5f5e3",
        "stride":         "#fef9e7",
        "initiation":     "#fdebd0",
        "contact_zone":   "#fdedec",
        "follow_through": "#f4ecf7",
        "finish":         "#eaf2ff",
    }

    if phases:
        for phase in phases:
            if frame_times:
                t_start = phase.start_time_sec
                t_end   = phase.end_time_sec
                color   = _phase_colors.get(phase.label, "#f0f0f0")
                ax.axvspan(t_start, t_end, alpha=0.35, color=color, label=phase.label)

    ax.plot(frame_times, wrist_speeds, color="#2c7bb6", linewidth=1.8, label="Wrist speed")
    ax.fill_between(frame_times, wrist_speeds, alpha=0.15, color="#2c7bb6")

    ax.set_xlabel("Time (seconds)")
    ax.set_ylabel("Wrist Speed")
    ax.set_title("Wrist Speed Over Time  [ESTIMATE — not a certified measurement]", fontsize=10)
    ax.legend(loc="upper right", fontsize=7, ncol=2)
    ax.grid(True, alpha=0.3)

    fig.tight_layout()
    fig.savefig(output_path, dpi=120, bbox_inches="tight")
    plt.close(fig)

    logger.info("Speed chart saved to %s", output_path)
    return output_path


def plot_trajectory(
    ball_traj: "BallTrajectory",
    video_meta: Any,
    output_path: str,
) -> str:
    """
    Generate a 2-D scatter/line plot of the ball trajectory.

    The coordinate system matches the video frame (y increases downward).
    A dashed horizontal line indicates the mid-frame reference.

    Parameters
    ----------
    ball_traj:
        BallTrajectory; smoothed_points used when available.
    video_meta:
        VideoMetadata for frame dimensions.
    output_path:
        Path to save the PNG plot.

    Returns
    -------
    output_path on success.
    """
    if not _MPL_AVAILABLE:
        raise RuntimeError("Matplotlib is required for trajectory plots.")

    points = ball_traj.smoothed_points if ball_traj.smoothed_points else ball_traj.points
    if not points:
        raise ValueError("No trajectory points to plot.")

    Path(output_path).parent.mkdir(parents=True, exist_ok=True)

    xs = [p.x for p in points]
    ys = [p.y for p in points]
    confs = [p.confidence for p in points]
    interp = [p.interpolated for p in points]

    frame_h = getattr(video_meta, "height", max(ys) if ys else 720)
    frame_w = getattr(video_meta, "width",  max(xs) if xs else 1280)

    fig, ax = plt.subplots(figsize=(10, 5))

    # Invert y so that "up" in the plot = up in the scene
    detected_x  = [x for x, iv in zip(xs, interp) if not iv]
    detected_y  = [y for y, iv in zip(ys, interp) if not iv]
    interp_x    = [x for x, iv in zip(xs, interp) if iv]
    interp_y    = [y for y, iv in zip(ys, interp) if iv]

    ax.plot(xs, [-y for y in ys], color="#2c7bb6", linewidth=1.5, alpha=0.7, label="Trajectory")
    ax.scatter(detected_x, [-y for y in detected_y], c="#2c7bb6", s=15, zorder=5,
               label="Detected")
    if interp_x:
        ax.scatter(interp_x, [-y for y in interp_y], c="#f0a500", s=10, zorder=4,
                   marker="^", label="Interpolated")

    # Frame boundary reference
    ax.set_xlim(0, frame_w)
    ax.set_ylim(-frame_h, 0)
    ax.axhline(-frame_h / 2, color="#cccccc", linestyle="--", linewidth=0.8, label="Frame mid")

    ax.set_xlabel("X (pixels, left→right)")
    ax.set_ylabel("Y (pixels, bottom→top)")
    ax.set_title(f"Ball Trajectory  [method: {ball_traj.tracking_method}]", fontsize=10)
    ax.legend(fontsize=8)
    ax.grid(True, alpha=0.25)

    fig.tight_layout()
    fig.savefig(output_path, dpi=120, bbox_inches="tight")
    plt.close(fig)

    logger.info("Trajectory plot saved to %s", output_path)
    return output_path
