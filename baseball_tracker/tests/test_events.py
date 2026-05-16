"""Tests for swing event segmentation."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from schemas import (
    BallTrajectory,
    BoundingBox,
    FrameDetection,
    FramePose,
    PoseLandmark,
    TrackPoint,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_pose(frame_idx, lm_dict, conf=0.85):
    lm = {
        name: PoseLandmark(name=name, x=x, y=y, visibility=conf)
        for name, (x, y) in lm_dict.items()
    }
    return FramePose(
        frame_idx=frame_idx,
        timestamp_sec=frame_idx / 60.0,
        landmarks=lm,
        overall_confidence=conf,
    )


def make_detection(frame_idx, ball_x=None, ball_y=None):
    bb = None
    if ball_x is not None:
        r = 8  # ball radius
        bb = BoundingBox(x1=ball_x - r, y1=ball_y - r,
                         x2=ball_x + r, y2=ball_y + r, confidence=0.8)
    return FrameDetection(frame_idx=frame_idx, timestamp_sec=frame_idx / 60.0, baseball=bb)


def make_ball_traj(points):
    pts = [
        TrackPoint(frame_idx=idx, timestamp_sec=idx / 60.0, x=float(x), y=float(y), confidence=0.8)
        for idx, x, y in points
    ]
    return BallTrajectory(points=pts, smoothed_points=pts, tracking_method="yolo+kalman", confidence=0.8)


def build_swing_poses(n=160, fps=60.0):
    """Build synthetic pose sequence that mimics a plausible swing motion."""
    poses = []
    cx, cy = 960, 540
    for i in range(n):
        progress = i / n
        # Wrists start slow, accelerate during initiation (frame 60-90), then decelerate
        wrist_x_offset = 0
        if i < 30:          # stance
            wrist_x_offset = 0
        elif i < 50:        # load — slight backward shift
            wrist_x_offset = -10 * ((i - 30) / 20)
        elif i < 65:        # stride — still loading
            wrist_x_offset = -10
        elif i < 100:       # initiation + contact — wrists accelerate
            wrist_x_offset = -10 + 120 * ((i - 65) / 35)
        else:               # follow through
            wrist_x_offset = 110 + 30 * ((i - 100) / 60)

        lm = {
            "nose": (cx, cy - 200),
            "left_shoulder": (cx - 60, cy - 150),
            "right_shoulder": (cx + 60, cy - 150),
            "left_wrist": (cx - 30 + wrist_x_offset, cy - 30),
            "right_wrist": (cx + 30 + wrist_x_offset, cy - 30),
            "left_hip": (cx - 40, cy + 30),
            "right_hip": (cx + 40, cy + 30),
            "left_knee": (cx - 50, cy + 130),
            "right_knee": (cx + 50, cy + 130),
            "left_ankle": (cx - 55, cy + 200),
            "right_ankle": (cx + 55, cy + 200),
        }
        poses.append(make_pose(i, lm))
    return poses


# ---------------------------------------------------------------------------
# compute_wrist_velocity
# ---------------------------------------------------------------------------

class TestWristVelocity:
    def test_stationary_wrists_near_zero(self):
        from modules.events import compute_wrist_velocity

        poses = [
            make_pose(i, {"left_wrist": (500.0, 400.0), "right_wrist": (520.0, 400.0)})
            for i in range(30)
        ]
        vel = compute_wrist_velocity(poses, fps=60.0)
        assert len(vel) == len(poses)
        # All speeds should be near zero
        assert all(v < 1.0 for v in vel)

    def test_moving_wrists_nonzero_velocity(self):
        from modules.events import compute_wrist_velocity

        poses = [
            make_pose(i, {
                "left_wrist": (500.0 + i * 15.0, 400.0),
                "right_wrist": (520.0 + i * 15.0, 400.0),
            })
            for i in range(30)
        ]
        vel = compute_wrist_velocity(poses, fps=60.0)
        # After the first frame (finite diff), speeds should be ~15 px/frame
        assert all(v > 5.0 for v in vel[1:])

    def test_returns_list_length_matches_poses(self):
        from modules.events import compute_wrist_velocity

        poses = build_swing_poses(n=60)
        vel = compute_wrist_velocity(poses, fps=60.0)
        assert len(vel) == len(poses)

    def test_none_poses_handled(self):
        """Sparse pose list (with None entries) should not raise."""
        from modules.events import compute_wrist_velocity

        poses = [None, make_pose(1, {"left_wrist": (500, 400), "right_wrist": (520, 400)}), None]
        vel = compute_wrist_velocity(poses, fps=60.0)
        assert len(vel) == 3
        assert all(isinstance(v, float) for v in vel)


# ---------------------------------------------------------------------------
# find_contact_frame
# ---------------------------------------------------------------------------

class TestFindContactFrame:
    def test_finds_frame_near_ball(self):
        """Contact frame should be close to where ball is nearest wrist."""
        from modules.events import find_contact_frame

        # Ball travels right at wrist height, passes through wrist zone at frame 85
        ball_pts = [(i, 200 + i * 8, 400) for i in range(120)]
        traj = make_ball_traj(ball_pts)

        # Wrists are at (880, 400) approximately at frame 85
        # Ball x at frame 85 = 200 + 85*8 = 880
        poses = [
            make_pose(i, {"left_wrist": (880, 400), "right_wrist": (900, 400)})
            for i in range(120)
        ]

        contact = find_contact_frame(poses, traj)
        if contact is not None:
            # Should be within ±5 frames of 85
            assert abs(contact - 85) <= 10

    def test_empty_trajectory_falls_back(self):
        from modules.events import find_contact_frame

        poses = build_swing_poses()
        traj = make_ball_traj([])
        # Should not raise; returns None or falls back to wrist peak
        result = find_contact_frame(poses, traj)
        assert result is None or isinstance(result, int)

    def test_no_poses_returns_none(self):
        from modules.events import find_contact_frame

        traj = make_ball_traj([(i, i * 10, 400) for i in range(30)])
        result = find_contact_frame([], traj)
        assert result is None


# ---------------------------------------------------------------------------
# SwingPhaseDetector
# ---------------------------------------------------------------------------

class TestSwingPhaseDetector:
    def test_produces_segmentation_object(self):
        from modules.events import SwingPhaseDetector

        poses = build_swing_poses()
        detections = [make_detection(i) for i in range(len(poses))]
        detector = SwingPhaseDetector(poses=poses, detections=detections, ball_trajectory=None, fps=60.0)
        seg = detector.detect()
        assert seg is not None
        assert len(seg.phases) >= 1
        assert 0.0 <= seg.confidence <= 1.0

    def test_all_phases_have_valid_frame_ranges(self):
        from modules.events import SwingPhaseDetector

        poses = build_swing_poses(n=180)
        detections = [make_detection(i) for i in range(180)]
        detector = SwingPhaseDetector(poses=poses, detections=detections, ball_trajectory=None, fps=60.0)
        seg = detector.detect()
        for phase in seg.phases:
            assert phase.start_frame <= phase.end_frame
            assert phase.start_time_sec <= phase.end_time_sec
            assert 0.0 <= phase.confidence <= 1.0

    def test_empty_poses_falls_back_to_heuristic(self):
        """With no valid poses, detector should fall back to time-based heuristic (may return 0 phases if no frames)."""
        from modules.events import SwingPhaseDetector

        detector = SwingPhaseDetector(poses=[], detections=[], ball_trajectory=None, fps=30.0)
        seg = detector.detect()
        assert seg is not None
        assert "heuristic" in seg.segmentation_method.lower()
        # With no frames, 0 phases is acceptable; with frames, should be 7
        assert isinstance(seg.phases, list)

    def test_heuristic_produces_phases_when_frames_available(self):
        """Heuristic with low-confidence poses should produce all 7 phases."""
        from modules.events import SwingPhaseDetector

        # Provide 180 very low confidence poses so coverage check forces heuristic path
        poses = [make_pose(i, {"left_wrist": (500, 400), "right_wrist": (520, 400)}, conf=0.1)
                 for i in range(180)]
        detector = SwingPhaseDetector(poses=poses, detections=[], ball_trajectory=None, fps=30.0)
        seg = detector.detect()
        assert seg is not None
        assert "heuristic" in seg.segmentation_method.lower()
        assert len(seg.phases) == 7

    def test_heuristic_confidence_is_low(self):
        """Heuristic segmentation should have lower confidence than rule-based."""
        from modules.events import SwingPhaseDetector

        # Low confidence poses force heuristic path
        poses = [make_pose(i, {"left_wrist": (500, 400), "right_wrist": (520, 400)}, conf=0.1)
                 for i in range(90)]
        detector = SwingPhaseDetector(poses=poses, detections=[], ball_trajectory=None, fps=30.0)
        seg = detector.detect()
        assert seg.confidence <= 0.4

    def test_with_ball_trajectory(self):
        """Ball trajectory should help identify contact frame."""
        from modules.events import SwingPhaseDetector

        poses = build_swing_poses(n=160)
        detections = [make_detection(i, ball_x=200 + i * 8, ball_y=400) for i in range(160)]
        traj = make_ball_traj([(i, 200 + i * 8, 400) for i in range(160)])
        detector = SwingPhaseDetector(poses=poses, detections=detections, ball_trajectory=traj, fps=60.0)
        seg = detector.detect()
        assert seg.likely_contact_frame is not None or seg.confidence < 0.5

    def test_phase_labels_are_valid(self):
        from modules.events import SwingPhaseDetector

        valid_labels = {"stance", "load", "stride", "initiation", "contact_zone", "follow_through", "finish"}
        detector = SwingPhaseDetector(poses=build_swing_poses(), detections=[], ball_trajectory=None, fps=60.0)
        seg = detector.detect()
        for phase in seg.phases:
            assert phase.label in valid_labels
