"""Behavioral tests for pitcher/pitch movement analysis.

These tests focus on smartphone-friendly footage: low-ish frame rate,
partial trajectories, and conservative estimates rather than advanced sensor
assumptions.
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest

from schemas import BallTrajectory, TrackPoint, VideoMetadata, AnalysisResult, AnalysisInput
from config import AnalysisConfig


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def make_video_meta(fps=30.0, width=1280, height=720, frames=120):
    return VideoMetadata(
        fps=fps,
        width=width,
        height=height,
        total_frames=frames,
        duration_seconds=frames / fps,
        source_path="/tmp/test_pitch.mp4",
    )


def make_traj(points):
    pts = [
        TrackPoint(
            frame_idx=frame_idx,
            timestamp_sec=frame_idx / 30.0,
            x=float(x),
            y=float(y),
            confidence=0.85,
        )
        for frame_idx, x, y in points
    ]
    return BallTrajectory(
        points=pts,
        smoothed_points=pts,
        tracking_method="yolo+kalman",
        confidence=0.8,
    )


def make_straight_pitch(start_x=220, start_y=320, dx=12, dy=1, n=12):
    return make_traj([(i, start_x + i * dx, start_y + i * dy) for i in range(n)])


def make_broken_pitch(start_x=220, start_y=320, n=12):
    """Pitch with visible movement that curves downward and arm-side."""
    pts = []
    for i in range(n):
        x = start_x + i * 12 + (i ** 2) * 0.6
        y = start_y + i * 1.5 + (i ** 2) * 0.9
        pts.append((i, x, y))
    return make_traj(pts)


# ---------------------------------------------------------------------------
# Pitch analysis behavior
# ---------------------------------------------------------------------------

class TestPitchAnalysis:
    def test_reports_movement_and_spin_proxy(self):
        from modules.pitching import analyze_pitch_trajectory

        meta = make_video_meta(fps=30.0, width=1280, height=720, frames=120)
        traj = make_broken_pitch(n=12)

        analysis = analyze_pitch_trajectory(traj, meta)

        assert analysis is not None
        assert analysis.confidence > 0.0
        assert analysis.horizontal_break_px is not None
        assert analysis.vertical_break_px is not None
        assert analysis.estimated_spin_rpm is not None
        assert analysis.spin_rpm_band is not None
        assert analysis.estimated_spin_rpm > 0
        assert analysis.estimated_spin_rpm >= analysis.spin_rpm_band[0]
        assert analysis.estimated_spin_rpm <= analysis.spin_rpm_band[1]
        assert analysis.capture_assessment in {"smartphone_low", "smartphone_moderate", "smartphone_good"}

    def test_curved_pitch_gets_higher_spin_proxy_than_straight_pitch(self):
        from modules.pitching import analyze_pitch_trajectory

        meta = make_video_meta(fps=30.0, width=1280, height=720, frames=120)
        straight = analyze_pitch_trajectory(make_straight_pitch(n=12), meta)
        curved = analyze_pitch_trajectory(make_broken_pitch(n=12), meta)

        assert straight.estimated_spin_rpm is not None
        assert curved.estimated_spin_rpm is not None
        assert curved.estimated_spin_rpm > straight.estimated_spin_rpm
        assert curved.max_curve_px is not None
        assert straight.max_curve_px is not None
        assert curved.max_curve_px > straight.max_curve_px

    def test_low_fps_sparse_footage_lowers_confidence(self):
        from modules.pitching import analyze_pitch_trajectory

        low_quality_meta = make_video_meta(fps=24.0, width=960, height=540, frames=48)
        sparse_traj = make_traj([
            (0, 220, 320),
            (4, 260, 324),
            (8, 304, 332),
            (12, 352, 344),
        ])

        analysis = analyze_pitch_trajectory(sparse_traj, low_quality_meta)

        assert analysis.confidence < 0.75
        assert analysis.limitations
        joined = " ".join(analysis.limitations + analysis.notes).lower()
        assert "low" in joined or "sparse" in joined or "smartphone" in joined

    def test_empty_trajectory_returns_safe_placeholder(self):
        from modules.pitching import analyze_pitch_trajectory

        meta = make_video_meta()
        empty = make_traj([])
        analysis = analyze_pitch_trajectory(empty, meta)

        assert analysis.confidence == 0.0
        assert analysis.estimated_spin_rpm is None
        assert analysis.notes


class TestPipelinePitchStage:
    def test_stage_populates_result(self):
        from modules.pipeline import stage_pitch_analysis

        result = AnalysisResult(
            run_id="pitch-001",
            input=AnalysisInput(video_path="/tmp/test_pitch.mp4"),
        )
        result.video_metadata = make_video_meta()
        result.ball_trajectory = make_broken_pitch(n=12)
        cfg = AnalysisConfig()

        stage_pitch_analysis(result, cfg)

        assert result.pitch_analysis is not None
        assert result.module_status.get("pitch_analysis") in {"ok", "partial"}
        assert result.pitch_analysis.estimated_spin_rpm is not None
