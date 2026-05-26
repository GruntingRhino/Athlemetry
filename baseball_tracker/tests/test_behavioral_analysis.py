"""Behavioral tests for baseball_tracker analysis logic.

These tests validate the actual heuristics and derived outputs, not just that the
modules import or the CLI boots.
"""

from __future__ import annotations

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

from config import AnalysisConfig, MetricConfig, ScoringConfig
from schemas import BallTrajectory, BoundingBox, FrameDetection, FramePose, PoseLandmark, SwingPhase, TrackPoint, VideoMetadata


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_video_meta(fps: float = 60.0, width: int = 1920, height: int = 1080, frames: int = 180):
    return VideoMetadata(
        fps=fps,
        width=width,
        height=height,
        total_frames=frames,
        duration_seconds=frames / fps,
        source_path="/tmp/test.mp4",
    )


def make_pose(frame_idx: int, landmarks: dict[str, tuple[float, float]], confidence: float = 0.9):
    return FramePose(
        frame_idx=frame_idx,
        timestamp_sec=frame_idx / 60.0,
        landmarks={
            name: PoseLandmark(name=name, x=x, y=y, visibility=confidence)
            for name, (x, y) in landmarks.items()
        },
        overall_confidence=confidence,
    )


def base_landmarks(cx: float = 960.0, cy: float = 540.0, scale: float = 1.0):
    s = scale
    return {
        "nose": (cx, cy - 200 * s),
        "left_shoulder": (cx - 60 * s, cy - 150 * s),
        "right_shoulder": (cx + 60 * s, cy - 150 * s),
        "left_elbow": (cx - 80 * s, cy - 80 * s),
        "right_elbow": (cx + 80 * s, cy - 80 * s),
        "left_wrist": (cx - 30 * s, cy - 30 * s),
        "right_wrist": (cx + 30 * s, cy - 30 * s),
        "left_hip": (cx - 40 * s, cy + 30 * s),
        "right_hip": (cx + 40 * s, cy + 30 * s),
        "left_knee": (cx - 50 * s, cy + 130 * s),
        "right_knee": (cx + 50 * s, cy + 130 * s),
        "left_ankle": (cx - 55 * s, cy + 200 * s),
        "right_ankle": (cx + 55 * s, cy + 200 * s),
    }


def make_phases():
    return [
        SwingPhase(label="stance", start_frame=0, end_frame=19, start_time_sec=0.0, end_time_sec=0.32, confidence=0.9),
        SwingPhase(label="load", start_frame=20, end_frame=39, start_time_sec=0.33, end_time_sec=0.65, confidence=0.9),
        SwingPhase(label="stride", start_frame=40, end_frame=59, start_time_sec=0.67, end_time_sec=0.98, confidence=0.9),
        SwingPhase(label="initiation", start_frame=60, end_frame=79, start_time_sec=1.0, end_time_sec=1.32, confidence=0.9),
        SwingPhase(label="contact_zone", start_frame=80, end_frame=99, start_time_sec=1.33, end_time_sec=1.65, confidence=0.9),
        SwingPhase(label="follow_through", start_frame=100, end_frame=139, start_time_sec=1.67, end_time_sec=2.32, confidence=0.9),
        SwingPhase(label="finish", start_frame=140, end_frame=159, start_time_sec=2.33, end_time_sec=2.65, confidence=0.9),
    ]


def add_phase_rotation(landmarks: dict[str, tuple[float, float]], tilt: float, which: str):
    # Use y-differentials to induce measurable line-angle changes.
    if which == "hips":
        landmarks["left_hip"] = (landmarks["left_hip"][0], landmarks["left_hip"][1] + tilt)
        landmarks["right_hip"] = (landmarks["right_hip"][0], landmarks["right_hip"][1] - tilt)
    elif which == "shoulders":
        landmarks["left_shoulder"] = (landmarks["left_shoulder"][0], landmarks["left_shoulder"][1] + tilt)
        landmarks["right_shoulder"] = (landmarks["right_shoulder"][0], landmarks["right_shoulder"][1] - tilt)
    return landmarks


def build_swing_poses(hips_first: bool = True):
    poses = []
    for frame_idx in range(0, 160):
        lm = base_landmarks()

        # Stable head unless we intentionally change it in a test.
        if 60 <= frame_idx <= 70:
            if hips_first:
                add_phase_rotation(lm, (frame_idx - 60) * 2.0, "hips")
            else:
                add_phase_rotation(lm, (frame_idx - 60) * 2.0, "shoulders")
        if 80 <= frame_idx <= 90:
            if hips_first:
                add_phase_rotation(lm, (frame_idx - 80) * 2.0, "shoulders")
            else:
                add_phase_rotation(lm, (frame_idx - 80) * 2.0, "hips")

        poses.append(make_pose(frame_idx, lm))
    return poses


def build_stride_poses(stride_px: float):
    poses = []
    for frame_idx in range(40, 60):
        lm = base_landmarks()
        # Move the left ankle forward in the stride phase while keeping the hip constant.
        fraction = (frame_idx - 40) / 19.0
        lm["left_ankle"] = (lm["left_ankle"][0] + stride_px * fraction, lm["left_ankle"][1])
        poses.append(make_pose(frame_idx, lm))
    return poses


def build_wrist_motion_poses(px_per_frame: float):
    poses = []
    for frame_idx in range(0, 100):
        lm = base_landmarks()
        if 60 <= frame_idx <= 80:
            fraction = frame_idx - 60
            lm["right_wrist"] = (lm["right_wrist"][0] + px_per_frame * fraction, lm["right_wrist"][1])
            lm["left_wrist"] = (lm["left_wrist"][0] + px_per_frame * fraction, lm["left_wrist"][1])
        poses.append(make_pose(frame_idx, lm))
    return poses


# ---------------------------------------------------------------------------
# Form scoring behavior
# ---------------------------------------------------------------------------

def test_head_stability_reacts_to_drift():
    from modules.scoring import score_head_stability

    stable = build_swing_poses(hips_first=True)
    drifted = build_swing_poses(hips_first=True)
    for pose in drifted:
        if pose.frame_idx == 99:
            pose.landmarks["nose"] = PoseLandmark(name="nose", x=pose.landmarks["nose"].x + 80, y=pose.landmarks["nose"].y + 50, visibility=0.9)

    metric_stable = score_head_stability(stable, make_phases(), make_video_meta(), ScoringConfig())
    metric_drifted = score_head_stability(drifted, make_phases(), make_video_meta(), ScoringConfig())

    assert metric_stable.score > metric_drifted.score
    assert metric_drifted.issues


def test_stride_control_scores_good_stride_higher_than_short_stride():
    from modules.scoring import score_stride_control

    good_poses = build_stride_poses(stride_px=140.0)  # lands inside the 70–100% target band
    short_poses = build_stride_poses(stride_px=40.0)  # clearly short

    good_metric = score_stride_control(good_poses, make_phases(), make_video_meta(), ScoringConfig())
    short_metric = score_stride_control(short_poses, make_phases(), make_video_meta(), ScoringConfig())

    assert good_metric.score > short_metric.score
    assert good_metric.score == 1.0
    assert short_metric.issues
    assert any("short" in issue.lower() for issue in short_metric.issues)


def test_hip_rotation_timing_rewards_hips_leading_shoulders():
    from modules.scoring import score_hip_rotation_timing

    good_metric = score_hip_rotation_timing(build_swing_poses(hips_first=True), make_phases(), 60.0, ScoringConfig())
    bad_metric = score_hip_rotation_timing(build_swing_poses(hips_first=False), make_phases(), 60.0, ScoringConfig())

    assert good_metric.score > bad_metric.score
    assert bad_metric.issues
    assert any("reverse sequencing" in issue.lower() for issue in bad_metric.issues)


def test_evaluate_form_prefers_cleaner_mechanics():
    from modules.scoring import evaluate_form

    clean = build_swing_poses(hips_first=True)
    messy = build_swing_poses(hips_first=False)
    # Add visible drift to the messy swing's finish.
    for pose in messy:
        if pose.frame_idx == 99:
            pose.landmarks["nose"] = PoseLandmark(name="nose", x=pose.landmarks["nose"].x + 100, y=pose.landmarks["nose"].y + 70, visibility=0.9)

    config = AnalysisConfig()
    clean_scores = evaluate_form(clean, make_phases(), make_video_meta(), config)
    messy_scores = evaluate_form(messy, make_phases(), make_video_meta(), config)

    assert clean_scores.overall_score is not None
    assert messy_scores.overall_score is not None
    assert clean_scores.overall_score > messy_scores.overall_score
    assert clean_scores.overall_confidence >= messy_scores.overall_confidence - 0.05


# ---------------------------------------------------------------------------
# Swing speed and trajectory behavior
# ---------------------------------------------------------------------------

def test_calibrated_swing_speed_returns_mph_and_mode():
    from modules.metrics import compute_pixels_per_inch, estimate_swing_speed_with_mode

    poses = build_wrist_motion_poses(px_per_frame=70.0)
    phases = make_phases()
    meta = make_video_meta()
    inp = __import__("schemas").AnalysisInput(video_path="/tmp/test.mp4", bat_length_inches=33.0)
    bat_detections = [FrameDetection(frame_idx=0, timestamp_sec=0.0, bat=BoundingBox(x1=0, y1=0, x2=330, y2=20, confidence=0.9))]

    pixels_per_inch, mode = compute_pixels_per_inch(inp, meta, poses, bat_detections=bat_detections)
    result = estimate_swing_speed_with_mode(poses, phases, meta, pixels_per_inch, mode, MetricConfig())

    assert mode == "user_bat_length"
    assert result.calibration_mode == "user_bat_length"
    assert result.peak_speed_mph is not None
    assert result.peak_speed_mph >= 20.0
    assert result.is_estimate is True


def test_trajectory_descriptors_capture_vertical_and_horizontal_movement():
    from modules.metrics import compute_trajectory_descriptors

    points = [
        TrackPoint(frame_idx=0, timestamp_sec=0.0, x=100.0, y=50.0, confidence=0.9),
        TrackPoint(frame_idx=1, timestamp_sec=1 / 60.0, x=105.0, y=60.0, confidence=0.9),
        TrackPoint(frame_idx=2, timestamp_sec=2 / 60.0, x=110.0, y=70.0, confidence=0.9),
        TrackPoint(frame_idx=3, timestamp_sec=3 / 60.0, x=115.0, y=80.0, confidence=0.9),
        TrackPoint(frame_idx=4, timestamp_sec=4 / 60.0, x=120.0, y=90.0, confidence=0.9),
        TrackPoint(frame_idx=5, timestamp_sec=5 / 60.0, x=125.0, y=100.0, confidence=0.9),
        TrackPoint(frame_idx=6, timestamp_sec=6 / 60.0, x=130.0, y=90.0, confidence=0.9),
        TrackPoint(frame_idx=7, timestamp_sec=7 / 60.0, x=135.0, y=80.0, confidence=0.9),
        TrackPoint(frame_idx=8, timestamp_sec=8 / 60.0, x=140.0, y=70.0, confidence=0.9),
    ]
    traj = BallTrajectory(points=points, smoothed_points=points, tracking_method="yolo+kalman", confidence=0.9)

    desc = compute_trajectory_descriptors(traj, contact_frame=5)

    assert desc["approach_angle_deg"] is not None and desc["approach_angle_deg"] > 0
    assert desc["vertical_drop_px"] == 50.0
    assert desc["launch_direction_deg"] is not None and desc["launch_direction_deg"] > 0
    assert desc["pre_contact_speed_px_per_frame"] is not None
    assert desc["post_contact_speed_px_per_frame"] is not None
    assert desc["post_contact_speed_px_per_frame"] == desc["pre_contact_speed_px_per_frame"]
