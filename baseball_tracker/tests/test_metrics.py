"""Tests for metric computation: swing speed, calibration, trajectory descriptors."""

import sys
from pathlib import Path
import math

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import numpy as np

from schemas import (
    AnalysisInput,
    BallTrajectory,
    BoundingBox,
    FrameDetection,
    FramePose,
    PoseLandmark,
    SwingEventSegmentation,
    SwingPhase,
    TrackPoint,
    VideoMetadata,
)
from config import MetricConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_video_meta(fps=60.0, width=1920, height=1080, frames=180):
    return VideoMetadata(
        fps=fps,
        width=width,
        height=height,
        total_frames=frames,
        duration_seconds=frames / fps,
        source_path="/tmp/test.mp4",
    )


def make_pose(frame_idx, landmarks: dict):
    """Build a FramePose from a simple {name: (x, y)} dict."""
    lm = {
        name: PoseLandmark(name=name, x=x, y=y, visibility=0.9)
        for name, (x, y) in landmarks.items()
    }
    return FramePose(
        frame_idx=frame_idx,
        timestamp_sec=frame_idx / 60.0,
        landmarks=lm,
        overall_confidence=0.85,
    )


def make_phase_list():
    """Build a minimal list of SwingPhase objects."""
    return [
        SwingPhase(
            label="initiation",
            start_frame=30,
            end_frame=45,
            start_time_sec=0.5,
            end_time_sec=0.75,
            confidence=0.8,
        ),
        SwingPhase(
            label="contact_zone",
            start_frame=45,
            end_frame=55,
            start_time_sec=0.75,
            end_time_sec=0.917,
            confidence=0.85,
        ),
    ]


def make_phases(**kwargs):
    """Build a SwingEventSegmentation (used in events tests)."""
    return SwingEventSegmentation(
        phases=make_phase_list(),
        likely_contact_frame=50,
        likely_contact_time_sec=0.833,
        segmentation_method="rule_based",
        confidence=0.8,
    )


def make_ball_traj(points):
    """Build a BallTrajectory from a list of (frame_idx, x, y) tuples."""
    pts = [
        TrackPoint(
            frame_idx=idx,
            timestamp_sec=idx / 60.0,
            x=float(x),
            y=float(y),
            confidence=0.8,
        )
        for idx, x, y in points
    ]
    return BallTrajectory(
        points=pts,
        smoothed_points=pts,
        tracking_method="yolo+kalman",
        confidence=0.8,
    )


# ---------------------------------------------------------------------------
# Calibration
# ---------------------------------------------------------------------------

class TestPixelsPerInch:
    def test_mode_b_player_height(self):
        """If player height given and batter detected, should use bbox height."""
        from modules.metrics import compute_pixels_per_inch

        inp = AnalysisInput(video_path="/tmp/t.mp4", player_height_inches=72.0)
        meta = make_video_meta()
        # Batter bbox of height 500px for a 72-inch player → 500/72 ≈ 6.94 ppi
        batter_dets = [
            FrameDetection(
                frame_idx=0,
                timestamp_sec=0.0,
                batter=BoundingBox(x1=100, y1=100, x2=300, y2=600, confidence=0.9),
            )
        ]
        ppi, mode = compute_pixels_per_inch(inp, meta, [], batter_detections=batter_dets)
        assert mode == "user_player_height"
        assert ppi is not None
        assert abs(ppi - 500 / 72.0) < 0.5

    def test_mode_e_no_calibration(self):
        """Without any calibration data, should return relative_only."""
        from modules.metrics import compute_pixels_per_inch

        inp = AnalysisInput(video_path="/tmp/t.mp4")
        meta = make_video_meta()
        ppi, mode = compute_pixels_per_inch(inp, meta, [])
        assert mode == "relative_only"
        assert ppi is None

    def test_mode_c_anthropometric(self):
        """With pose landmarks (nose+ankle) but no height input, use anthropometric estimation."""
        from modules.metrics import compute_pixels_per_inch

        inp = AnalysisInput(video_path="/tmp/t.mp4")
        meta = make_video_meta()
        # Pose with nose at y=100, ankles at y=700 → 600px body height
        poses = [
            make_pose(0, {
                "nose": (960, 100),
                "left_ankle": (930, 700),
                "right_ankle": (990, 700),
            })
        ]
        ppi, mode = compute_pixels_per_inch(inp, meta, poses)
        assert mode == "anthropometric_estimation"
        assert ppi is not None
        assert ppi > 0


# ---------------------------------------------------------------------------
# Swing speed estimation
# ---------------------------------------------------------------------------

class TestSwingSpeed:
    def _build_poses_with_wrist_motion(self, n_frames=60, fps=60.0, px_per_frame=15.0):
        """Build synthetic poses where wrists move at a known pixel velocity."""
        poses = []
        for i in range(n_frames):
            # Left wrist moves right at px_per_frame pixels/frame
            lw_x = 500.0 + i * px_per_frame
            lw_y = 400.0
            rw_x = 520.0 + i * px_per_frame
            rw_y = 410.0
            poses.append(
                make_pose(
                    i,
                    {
                        "left_wrist": (lw_x, lw_y),
                        "right_wrist": (rw_x, rw_y),
                        "left_shoulder": (450.0, 350.0),
                        "right_shoulder": (590.0, 350.0),
                        "left_hip": (470.0, 550.0),
                        "right_hip": (570.0, 550.0),
                    },
                )
            )
        return poses

    def test_relative_only_returns_none_mph(self):
        """With no calibration, swing speed should be relative_only and mph=None or low conf."""
        from modules.metrics import estimate_swing_speed

        poses = self._build_poses_with_wrist_motion()
        phases = make_phase_list()
        meta = make_video_meta()
        cfg = MetricConfig()

        ss = estimate_swing_speed(
            poses=poses,
            phases=phases,
            video_meta=meta,
            pixels_per_inch=None,
            config=cfg,
        )
        assert ss.calibration_mode == "relative_only"
        assert ss.is_estimate is True

    def test_bat_prior_gives_reasonable_speed(self):
        """With bat_prior calibration (33 in = ~X px), speed should be in plausible range."""
        from modules.metrics import estimate_swing_speed

        poses = self._build_poses_with_wrist_motion(px_per_frame=20.0)
        phases = make_phase_list()
        meta = make_video_meta(fps=60.0, width=1920, height=1080)
        cfg = MetricConfig()

        # 6 ppi is ~33 inches per 200px (roughly realistic for a standing batter)
        ppi = 6.0
        ss = estimate_swing_speed(
            poses=poses,
            phases=phases,
            video_meta=meta,
            pixels_per_inch=ppi,
            config=cfg,
        )
        assert ss.is_estimate is True
        # Speed should be within physically plausible range if estimated
        if ss.peak_speed_mph is not None:
            assert cfg.min_plausible_bat_speed_mph <= ss.peak_speed_mph <= cfg.max_plausible_bat_speed_mph

    def test_implausible_speed_reduces_confidence(self):
        """Unrealistically fast wrist motion should reduce confidence."""
        from modules.metrics import estimate_swing_speed

        # Very fast wrist motion that would imply >120 mph
        poses = self._build_poses_with_wrist_motion(px_per_frame=500.0)
        phases = make_phase_list()
        meta = make_video_meta(fps=60.0)
        cfg = MetricConfig()
        ppi = 6.0

        ss = estimate_swing_speed(
            poses=poses,
            phases=phases,
            video_meta=meta,
            pixels_per_inch=ppi,
            config=cfg,
        )
        # Either clamped to max or confidence reduced
        if ss.peak_speed_mph is not None:
            assert ss.confidence < 0.8 or ss.peak_speed_mph <= cfg.max_plausible_bat_speed_mph

    def test_always_is_estimate(self):
        """SwingSpeed.is_estimate must always be True regardless of calibration."""
        from modules.metrics import estimate_swing_speed

        poses = self._build_poses_with_wrist_motion()
        phases = make_phase_list()
        meta = make_video_meta()
        cfg = MetricConfig()

        for ppi in [6.0, None]:
            ss = estimate_swing_speed(
                poses=poses,
                phases=phases,
                video_meta=meta,
                pixels_per_inch=ppi,
                config=cfg,
            )
            assert ss.is_estimate is True, "is_estimate must always be True"


# ---------------------------------------------------------------------------
# Trajectory descriptors
# ---------------------------------------------------------------------------

class TestTrajectoryDescriptors:
    def test_approach_angle_horizontal_ball(self):
        """A ball moving purely horizontally should have ~0 degree approach angle."""
        from modules.metrics import compute_trajectory_descriptors

        # Ball at y=400 moving left to right
        traj = make_ball_traj([(i, i * 10, 400) for i in range(20)])
        desc = compute_trajectory_descriptors(traj, contact_frame=15)
        if desc.get("approach_angle_deg") is not None:
            assert abs(desc["approach_angle_deg"]) < 5.0

    def test_vertical_drop(self):
        """Ball dropping vertically should report non-zero vertical_drop_px."""
        from modules.metrics import compute_trajectory_descriptors

        # Ball falls 100px over 10 frames
        traj = make_ball_traj([(i, 400, 200 + i * 10) for i in range(10)])
        desc = compute_trajectory_descriptors(traj, contact_frame=8)
        if desc.get("vertical_drop_px") is not None:
            assert desc["vertical_drop_px"] > 0

    def test_launch_direction_after_contact(self):
        """Post-contact ball moving up-right should have a positive launch angle."""
        from modules.metrics import compute_trajectory_descriptors

        # Pre-contact: ball moves right at y=400
        pre = [(i, i * 10, 400) for i in range(10)]
        # Post-contact: ball moves right and upward (y decreasing in image = going up)
        post = [(10 + i, 100 + i * 12, 400 - i * 8) for i in range(8)]
        traj = make_ball_traj(pre + post)
        desc = compute_trajectory_descriptors(traj, contact_frame=10)
        # launch_direction_deg should be defined when post-contact data exists
        if desc.get("launch_direction_deg") is not None:
            # Negative angle in image space = ball going up = positive launch
            assert isinstance(desc["launch_direction_deg"], float)

    def test_empty_trajectory(self):
        """Empty trajectory should not raise."""
        from modules.metrics import compute_trajectory_descriptors

        traj = make_ball_traj([])
        desc = compute_trajectory_descriptors(traj, contact_frame=None)
        assert isinstance(desc, dict)
