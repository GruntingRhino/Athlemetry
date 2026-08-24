import pytest

from vision_core.pitch_benchmark import (
    MIN_PHASE_RECALL,
    MIN_TRACKING_PRECISION,
    MIN_TRACKING_RECALL,
    PitchBallAnnotation,
    PitchBallPrediction,
    PitchPhase,
    PitchSpeedReference,
    evaluate_pitch_tracking,
)


def test_professional_pitch_tracking_thresholds_require_95_percent_detection_and_phase_recall():
    assert MIN_TRACKING_PRECISION == 0.95
    assert MIN_TRACKING_RECALL == 0.95
    assert MIN_PHASE_RECALL == 0.95


def annotation(frame: int, phase: PitchPhase, box=(0.1, 0.1, 0.2, 0.2)) -> PitchBallAnnotation:
    return PitchBallAnnotation("pitch-1", frame, phase, "baseball-1", box)


def prediction(frame: int, track_id="track-1", box=(0.1, 0.1, 0.2, 0.2)) -> PitchBallPrediction:
    return PitchBallPrediction("pitch-1", frame, track_id, box, 0.95)


def test_pitch_benchmark_reports_phase_recall_hota_and_radar_speed_error():
    annotations = [
        annotation(0, "release"),
        annotation(1, "flight"),
        annotation(2, "plate"),
        annotation(3, "catcher_glove"),
    ]
    report = evaluate_pitch_tracking(
        annotations,
        [prediction(frame) for frame in range(4)],
        [PitchSpeedReference("pitch-1", 40.0, "calibrated-doppler-radar")],
        {"pitch-1": 40.4},
    )

    assert report.precision == 1.0
    assert report.recall == 1.0
    assert report.hota == 1.0
    assert report.phase_recall == {
        "release": 1.0,
        "flight": 1.0,
        "plate": 1.0,
        "catcher_glove": 1.0,
    }
    assert report.pitch_speed_p90_error_mps == pytest.approx(0.4)


def test_pitch_benchmark_fails_release_when_any_phase_or_radar_reference_is_missing():
    annotations = [
        annotation(0, "release"),
        annotation(1, "flight"),
        annotation(2, "plate"),
        annotation(3, "catcher_glove"),
    ]
    report = evaluate_pitch_tracking(
        annotations,
        [prediction(0), prediction(1), prediction(2)],
        [],
        {},
    )

    assert report.phase_recall["catcher_glove"] == 0.0
    assert report.pitch_speed_p90_error_mps is None
    assert not report.released
    assert "pitch-speed-reference-insufficient" in report.release_reasons
    assert "catcher_glove-recall-below-threshold" in report.release_reasons


def test_pitch_benchmark_penalizes_track_identity_switches_in_hota():
    annotations = [annotation(0, "release"), annotation(1, "flight")]
    report = evaluate_pitch_tracking(
        annotations,
        [prediction(0, "track-a"), prediction(1, "track-b")],
        [PitchSpeedReference("pitch-1", 40.0, "optical-pitch-tracking")],
        {"pitch-1": 40.0},
    )

    assert report.recall == 1.0
    assert report.hota < 1.0


# ── calibrated-high-speed-optical source (two-phone study) ──────────────────


def test_pitch_benchmark_accepts_calibrated_high_speed_optical_source():
    """PitchSpeedReference must accept calibrated-high-speed-optical as source type."""
    ref = PitchSpeedReference("pitch-1", 40.0, "calibrated-high-speed-optical")
    assert ref.clip_id == "pitch-1"
    assert ref.speed_mps == 40.0
    assert ref.source == "calibrated-high-speed-optical"


def test_pitch_benchmark_high_speed_optical_speed_error_is_identical_logic():
    """The benchmark speed-error logic is source-agnostic; any Literal source works identically."""
    annotations = [
        annotation(0, "release"),
        annotation(1, "flight"),
        annotation(2, "plate"),
        annotation(3, "catcher_glove"),
    ]
    report = evaluate_pitch_tracking(
        annotations,
        [prediction(frame) for frame in range(4)],
        [PitchSpeedReference("pitch-1", 40.0, "calibrated-high-speed-optical")],
        {"pitch-1": 40.4},
    )
    assert report.precision == 1.0
    assert report.recall == 1.0
    assert report.hota == 1.0
    assert report.pitch_speed_p90_error_mps == pytest.approx(0.4)
