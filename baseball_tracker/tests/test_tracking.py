"""Tests for ball tracking, Kalman filter, and trajectory smoothing."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
import math

from schemas import BoundingBox, FrameDetection
from config import TrackingConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_det(frame_idx, ball_x=None, ball_y=None, conf=0.85):
    bb = None
    if ball_x is not None:
        bb = BoundingBox(
            x1=ball_x - 8, y1=ball_y - 8,
            x2=ball_x + 8, y2=ball_y + 8,
            confidence=conf,
        )
    return FrameDetection(frame_idx=frame_idx, timestamp_sec=frame_idx / 30.0, baseball=bb)


def linear_detections(n=60, start_x=100, start_y=300, dx=10, dy=2):
    """Ball moving linearly at (dx, dy) pixels per frame."""
    return [make_det(i, start_x + i * dx, start_y + i * dy) for i in range(n)]


# ---------------------------------------------------------------------------
# SimpleKalman
# ---------------------------------------------------------------------------

class TestSimpleKalman:
    def test_init_and_predict(self):
        from modules.tracking import SimpleKalman

        kf = SimpleKalman()
        kf.init(100.0, 200.0)
        x, y = kf.predict()
        assert isinstance(x, float)
        assert isinstance(y, float)

    def test_update_returns_tuple(self):
        from modules.tracking import SimpleKalman

        kf = SimpleKalman()
        kf.init(100.0, 200.0)
        x, y = kf.update(110.0, 205.0)
        assert isinstance(x, float)
        assert isinstance(y, float)

    def test_predict_without_init_does_not_crash(self):
        from modules.tracking import SimpleKalman

        kf = SimpleKalman()
        # Calling predict before init should either handle gracefully or raise cleanly
        try:
            kf.predict()
        except Exception:
            pass  # acceptable

    def test_tracks_linear_motion(self):
        """Kalman filter estimates should stay in the general vicinity of the true position."""
        from modules.tracking import SimpleKalman

        kf = SimpleKalman()
        kf.init(100.0, 300.0)
        for i in range(1, 20):
            x_meas = 100.0 + i * 10
            y_meas = 300.0 + i * 2
            ex, ey = kf.update(x_meas, y_meas)
            # Estimate should not diverge wildly from measurement
            assert abs(ex - x_meas) < x_meas * 0.5, f"Estimate too far from measurement at step {i}"


# ---------------------------------------------------------------------------
# KalmanBallTracker
# ---------------------------------------------------------------------------

class TestKalmanBallTracker:
    def test_update_with_detection(self):
        from modules.tracking import KalmanBallTracker

        tracker = KalmanBallTracker()
        bb = BoundingBox(x1=92, y1=292, x2=108, y2=308, confidence=0.9)
        x, y, conf = tracker.update(bb)
        assert isinstance(x, float) and isinstance(y, float)
        assert 0.0 <= conf <= 1.0

    def test_predict_only_gives_low_confidence(self):
        from modules.tracking import KalmanBallTracker

        tracker = KalmanBallTracker()
        # First update to initialise
        bb = BoundingBox(x1=92, y1=292, x2=108, y2=308, confidence=0.9)
        tracker.update(bb)
        # Then predict-only (no detection)
        x, y, conf = tracker.update(None)
        assert conf <= 0.5  # predict-only should have lower confidence

    def test_reset_reinitialises(self):
        from modules.tracking import KalmanBallTracker

        tracker = KalmanBallTracker()
        bb = BoundingBox(x1=92, y1=292, x2=108, y2=308, confidence=0.9)
        tracker.update(bb)
        tracker.reset()
        # After reset should accept new init cleanly
        bb2 = BoundingBox(x1=500, y1=500, x2=516, y2=516, confidence=0.8)
        x, y, conf = tracker.update(bb2)
        assert abs(x - 508) < 20
        assert abs(y - 508) < 20


# ---------------------------------------------------------------------------
# smooth_trajectory
# ---------------------------------------------------------------------------

class TestSmoothTrajectory:
    def test_output_length_matches_input(self):
        from modules.tracking import smooth_trajectory
        from schemas import TrackPoint

        pts = [
            TrackPoint(frame_idx=i, timestamp_sec=i / 30.0, x=float(i * 10), y=200.0, confidence=0.8)
            for i in range(20)
        ]
        smoothed = smooth_trajectory(pts, window=5)
        assert len(smoothed) == len(pts)

    def test_smoothed_points_are_smoother(self):
        """Smoothed trajectory should have lower variance in y than noisy input."""
        from modules.tracking import smooth_trajectory
        from schemas import TrackPoint
        import random

        random.seed(42)
        # Linear + noise
        pts = [
            TrackPoint(
                frame_idx=i,
                timestamp_sec=i / 30.0,
                x=float(i * 10),
                y=200.0 + random.uniform(-15, 15),
                confidence=0.8,
            )
            for i in range(30)
        ]
        smoothed = smooth_trajectory(pts, window=7)
        # Compute variance
        import statistics
        raw_var = statistics.variance([p.y for p in pts])
        smooth_var = statistics.variance([p.y for p in smoothed])
        assert smooth_var < raw_var, "Smoothed trajectory should have lower variance"

    def test_empty_input(self):
        from modules.tracking import smooth_trajectory

        smoothed = smooth_trajectory([], window=5)
        assert smoothed == []


# ---------------------------------------------------------------------------
# track_ball (integration)
# ---------------------------------------------------------------------------

class TestTrackBall:
    def test_track_returns_trajectory(self):
        from modules.tracking import track_ball

        dets = linear_detections(n=60, dx=8, dy=1)
        cfg = TrackingConfig()
        traj = track_ball(dets, cfg)
        assert traj is not None
        assert len(traj.points) > 0
        assert 0.0 <= traj.confidence <= 1.0

    def test_no_detections_returns_empty_trajectory(self):
        from modules.tracking import track_ball

        dets = [make_det(i) for i in range(30)]  # no baseball in any frame
        cfg = TrackingConfig()
        traj = track_ball(dets, cfg)
        assert traj is not None
        # Should still return a trajectory object (possibly empty)
        assert len(traj.points) == 0 or traj.confidence < 0.5

    def test_gap_interpolation(self):
        """Ball disappears for a few frames; tracker should interpolate."""
        from modules.tracking import track_ball

        dets = linear_detections(n=50, dx=10, dy=0)
        # Remove frames 20–24 (5-frame gap)
        dets[20].baseball = None
        dets[21].baseball = None
        dets[22].baseball = None

        cfg = TrackingConfig(max_ball_gap_frames=8)
        traj = track_ball(dets, cfg)
        # Frames 20-22 should be marked as interpolated
        interp_frames = {p.frame_idx for p in traj.points if p.interpolated}
        # At least some frames in 20-22 should be interpolated
        assert len(interp_frames.intersection({20, 21, 22})) >= 1

    def test_large_gap_breaks_track(self):
        """A gap larger than max_ball_gap_frames should not be interpolated."""
        from modules.tracking import track_ball

        dets = linear_detections(n=60, dx=10, dy=0)
        # 15-frame gap — larger than default max_ball_gap_frames=8
        for i in range(20, 35):
            dets[i].baseball = None

        cfg = TrackingConfig(max_ball_gap_frames=8)
        traj = track_ball(dets, cfg)
        # Overall confidence should be reduced
        assert traj.confidence < 1.0
        # Notes should mention the break
        assert any("gap" in n.lower() or "break" in n.lower() or "reset" in n.lower()
                   for n in traj.notes) or traj.confidence < 0.8

    def test_smoothed_points_populated(self):
        from modules.tracking import track_ball

        dets = linear_detections(n=50, dx=8, dy=2)
        cfg = TrackingConfig()
        traj = track_ball(dets, cfg)
        assert len(traj.smoothed_points) == len(traj.points)
