"""Tests for Pydantic schema validation and serialization."""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent))

import pytest
from schemas import (
    AnalysisInput,
    AnalysisResult,
    ArtifactPaths,
    BoundingBox,
    FrameDetection,
    DetectionSummary,
    TrackPoint,
    BallTrajectory,
    SwingPhase,
    SwingEventSegmentation,
    SwingSpeed,
    FormMetric,
    FormScores,
    OllamaFeedback,
    VideoMetadata,
)


# ---------------------------------------------------------------------------
# AnalysisInput
# ---------------------------------------------------------------------------

class TestAnalysisInput:
    def test_minimal_input(self):
        inp = AnalysisInput(video_path="/tmp/test.mp4")
        assert inp.video_path == "/tmp/test.mp4"
        assert inp.handedness is None
        assert inp.analysis_mode == "full"

    def test_full_input(self):
        inp = AnalysisInput(
            video_path="/tmp/swing.mp4",
            player_height_inches=72.0,
            bat_length_inches=33.5,
            handedness="right",
            camera_view="side",
            player_id="batter_001",
            analysis_mode="fast",
        )
        assert inp.player_height_inches == 72.0
        assert inp.handedness == "right"
        assert inp.camera_view == "side"

    def test_invalid_handedness(self):
        with pytest.raises(Exception):
            AnalysisInput(video_path="/tmp/test.mp4", handedness="ambidextrous")

    def test_invalid_camera_view(self):
        with pytest.raises(Exception):
            AnalysisInput(video_path="/tmp/test.mp4", camera_view="top_down")


# ---------------------------------------------------------------------------
# BoundingBox
# ---------------------------------------------------------------------------

class TestBoundingBox:
    def test_center(self):
        bb = BoundingBox(x1=10, y1=20, x2=30, y2=40, confidence=0.9)
        assert bb.center == (20.0, 30.0)

    def test_area(self):
        bb = BoundingBox(x1=0, y1=0, x2=100, y2=50, confidence=1.0)
        assert bb.area == 5000.0

    def test_zero_area(self):
        bb = BoundingBox(x1=10, y1=10, x2=10, y2=10, confidence=0.5)
        assert bb.area == 0.0

    def test_inverted_box_area_zero(self):
        # Inverted coords (x2 < x1) should clamp to zero
        bb = BoundingBox(x1=50, y1=50, x2=10, y2=10, confidence=0.5)
        assert bb.area == 0.0


# ---------------------------------------------------------------------------
# FrameDetection
# ---------------------------------------------------------------------------

class TestFrameDetection:
    def test_empty_detection(self):
        fd = FrameDetection(frame_idx=0, timestamp_sec=0.0)
        assert fd.baseball is None
        assert fd.batter is None
        assert fd.bat is None

    def test_partial_detection(self):
        bb = BoundingBox(x1=100, y1=100, x2=200, y2=200, confidence=0.8)
        fd = FrameDetection(frame_idx=5, timestamp_sec=0.167, baseball=bb)
        assert fd.baseball is not None
        assert fd.batter is None


# ---------------------------------------------------------------------------
# DetectionSummary
# ---------------------------------------------------------------------------

class TestDetectionSummary:
    def test_rates(self):
        ds = DetectionSummary(
            baseball_detected_frames=45,
            batter_detected_frames=60,
            bat_detected_frames=10,
            total_frames=60,
            baseball_detection_rate=0.75,
            batter_detection_rate=1.0,
            bat_detection_rate=0.167,
        )
        assert ds.batter_detection_rate == 1.0
        assert ds.bat_detection_rate == pytest.approx(0.167, abs=0.001)


# ---------------------------------------------------------------------------
# TrackPoint & BallTrajectory
# ---------------------------------------------------------------------------

class TestBallTrajectory:
    def _make_point(self, frame_idx, x, y, interp=False):
        return TrackPoint(
            frame_idx=frame_idx,
            timestamp_sec=frame_idx / 30.0,
            x=x,
            y=y,
            confidence=0.8,
            interpolated=interp,
        )

    def test_empty_trajectory(self):
        traj = BallTrajectory(
            points=[],
            smoothed_points=[],
            tracking_method="yolo+kalman",
            confidence=0.0,
        )
        assert len(traj.points) == 0

    def test_trajectory_with_points(self):
        pts = [self._make_point(i, float(i * 10), float(i * 2)) for i in range(10)]
        traj = BallTrajectory(
            points=pts,
            smoothed_points=pts,
            tracking_method="yolo+kalman",
            confidence=0.85,
        )
        assert len(traj.points) == 10
        assert traj.confidence == 0.85

    def test_interpolated_points_flagged(self):
        pts = [self._make_point(i, float(i), float(i), interp=(i % 3 == 0)) for i in range(9)]
        traj = BallTrajectory(
            points=pts,
            smoothed_points=pts,
            tracking_method="yolo+kalman",
            confidence=0.6,
        )
        interpolated_count = sum(1 for p in traj.points if p.interpolated)
        assert interpolated_count == 3  # frames 0, 3, 6


# ---------------------------------------------------------------------------
# SwingPhase & SwingEventSegmentation
# ---------------------------------------------------------------------------

class TestSwingPhases:
    def test_phase_creation(self):
        phase = SwingPhase(
            label="contact_zone",
            start_frame=45,
            end_frame=55,
            start_time_sec=1.5,
            end_time_sec=1.833,
            confidence=0.75,
        )
        assert phase.label == "contact_zone"
        assert phase.end_frame > phase.start_frame

    def test_full_segmentation(self):
        labels = ["stance", "load", "stride", "initiation", "contact_zone", "follow_through", "finish"]
        phases = [
            SwingPhase(
                label=label,
                start_frame=i * 10,
                end_frame=(i + 1) * 10,
                start_time_sec=i * 10 / 30.0,
                end_time_sec=(i + 1) * 10 / 30.0,
                confidence=0.8,
            )
            for i, label in enumerate(labels)
        ]
        seg = SwingEventSegmentation(
            phases=phases,
            likely_contact_frame=55,
            likely_contact_time_sec=1.833,
            segmentation_method="rule_based",
            confidence=0.8,
        )
        assert len(seg.phases) == 7
        assert seg.likely_contact_frame == 55


# ---------------------------------------------------------------------------
# SwingSpeed
# ---------------------------------------------------------------------------

class TestSwingSpeed:
    def test_always_marked_as_estimate(self):
        """SwingSpeed.is_estimate must always be True — spec requirement."""
        ss = SwingSpeed(
            peak_speed_mph=75.0,
            average_speed_mph=68.0,
            confidence=0.7,
            calibration_mode="user_bat_length",
            estimation_method="wrist_proxy",
        )
        assert ss.is_estimate is True

    def test_relative_only_no_mph(self):
        ss = SwingSpeed(
            peak_speed_mph=None,
            confidence=0.3,
            calibration_mode="relative_only",
            estimation_method="relative_wrist_velocity",
        )
        assert ss.peak_speed_mph is None
        assert ss.calibration_mode == "relative_only"

    def test_confidence_band(self):
        ss = SwingSpeed(
            peak_speed_mph=80.0,
            confidence=0.65,
            confidence_band_mph=(64.0, 96.0),
            calibration_mode="bat_prior",
            estimation_method="wrist_proxy_bat_prior",
        )
        assert ss.confidence_band_mph[0] < ss.peak_speed_mph
        assert ss.confidence_band_mph[1] > ss.peak_speed_mph


# ---------------------------------------------------------------------------
# FormScores
# ---------------------------------------------------------------------------

class TestFormScores:
    def _make_metric(self, name, score, conf=0.8):
        return FormMetric(
            name=name,
            score=score,
            confidence=conf,
            rationale=f"Test rationale for {name}",
        )

    def test_partial_form_scores(self):
        """Some metrics can be None when pose data is insufficient."""
        fs = FormScores(
            head_stability=self._make_metric("head_stability", 0.85),
            overall_score=0.85,
            overall_confidence=0.8,
        )
        assert fs.stance_balance is None  # not computed
        assert fs.head_stability.score == 0.85

    def test_overall_score_range(self):
        metrics = {
            "head_stability": self._make_metric("head_stability", 0.9),
            "stance_balance": self._make_metric("stance_balance", 0.7),
            "hip_rotation_timing": self._make_metric("hip_rotation_timing", 0.6),
        }
        fs = FormScores(**metrics, overall_score=0.73, overall_confidence=0.78)
        assert 0.0 <= fs.overall_score <= 1.0

    def test_issues_list(self):
        fs = FormScores(
            overall_confidence=0.5,
            issues=["Early head drift", "Front side opens early"],
        )
        assert len(fs.issues) == 2


# ---------------------------------------------------------------------------
# OllamaFeedback
# ---------------------------------------------------------------------------

class TestOllamaFeedback:
    def test_structured_feedback(self):
        fb = OllamaFeedback(
            summary="Solid contact with room to improve hip timing.",
            mechanical_strengths=["Good head stability", "Strong follow-through"],
            mechanical_weaknesses=["Hip rotation slightly late"],
            top_3_priorities=["Hip-shoulder separation", "Stride timing", "Hand path efficiency"],
            suggested_drills=["Hip rotation wall drill", "Tee work focusing on hip lead"],
            confidence_caveats=["Speed estimates are approximate"],
        )
        assert len(fb.top_3_priorities) == 3
        assert len(fb.mechanical_strengths) >= 1

    def test_minimal_feedback(self):
        fb = OllamaFeedback(
            summary="Could not generate full analysis.",
            mechanical_strengths=[],
            mechanical_weaknesses=[],
            top_3_priorities=[],
            suggested_drills=[],
            confidence_caveats=["Ollama not available"],
        )
        assert fb.summary != ""


# ---------------------------------------------------------------------------
# AnalysisResult
# ---------------------------------------------------------------------------

class TestAnalysisResult:
    def test_empty_result_serialization(self):
        inp = AnalysisInput(video_path="/tmp/test.mp4")
        result = AnalysisResult(run_id="test_001", input=inp)
        data = result.model_dump(mode="json")
        assert data["run_id"] == "test_001"
        assert data["video_metadata"] is None
        assert data["swing_speed"] is None
        assert data["form_scores"] is None

    def test_module_status_tracking(self):
        inp = AnalysisInput(video_path="/tmp/test.mp4")
        result = AnalysisResult(run_id="test_002", input=inp)
        result.module_status["video_ingest"] = "ok"
        result.module_status["pose"] = "failed"
        result.module_errors["pose"] = "mediapipe not installed"
        assert result.module_status["video_ingest"] == "ok"
        assert result.module_status["pose"] == "failed"
        assert "mediapipe" in result.module_errors["pose"]

    def test_full_result_round_trip(self):
        """Ensure a populated result serializes and deserializes cleanly."""
        inp = AnalysisInput(video_path="/tmp/swing.mp4", handedness="right")
        ss = SwingSpeed(
            peak_speed_mph=72.5,
            confidence=0.68,
            calibration_mode="bat_prior",
            estimation_method="wrist_proxy",
        )
        result = AnalysisResult(
            run_id="rt_001",
            input=inp,
            swing_speed=ss,
            pipeline_duration_sec=45.3,
        )
        json_str = result.model_dump_json()
        result2 = AnalysisResult.model_validate_json(json_str)
        assert result2.run_id == "rt_001"
        assert result2.swing_speed.peak_speed_mph == 72.5
        assert result2.swing_speed.is_estimate is True
