from vision_core.metrics import PoseSample, analyze_pose_sequence


def sample(frame, t, hip_x, ankle_x, wrist_y=0.5, shoulder_y=0.4, confidence=0.95):
    return PoseSample(
        frame_index=frame,
        timestamp_seconds=t,
        confidence=confidence,
        landmarks={
            "hip_center": (hip_x, 0.55),
            "ankle_center": (ankle_x, 0.9),
            "left_wrist": (hip_x - 0.05, wrist_y),
            "right_wrist": (hip_x + 0.05, wrist_y),
            "shoulder_center": (hip_x, shoulder_y),
            "left_knee": (hip_x - 0.03, 0.72),
            "right_knee": (hip_x + 0.03, 0.72),
        },
    )


def test_low_pose_coverage_suppresses_performance_scores():
    result = analyze_pose_sequence(
        sport="soccer",
        drill="sprint-20m",
        samples=[sample(0, 0.0, 0.1, 0.1)],
        total_frames=100,
        calibration_distance_meters=20.0,
    )
    assert result.reliability.status == "unavailable"
    assert result.overall_score is None
    assert result.metrics["speed_mps"].value is None


def test_calibrated_soccer_sprint_reports_speed_but_withholds_uncertified_acceleration():
    samples = [sample(i, i / 10, 0.1 + i * 0.08, 0.1 + i * 0.08) for i in range(10)]
    result = analyze_pose_sequence(
        sport="soccer",
        drill="sprint-20m",
        samples=samples,
        total_frames=10,
        calibration_distance_meters=20.0,
    )
    assert result.reliability.status == "verified-input"
    assert result.metrics["speed_mps"].value is not None
    assert result.metrics["acceleration_mps2"].value is None
    assert "scalar course-distance scale" in result.metrics["acceleration_mps2"].limitations[0]
    assert result.overall_score is not None


def test_marker_crossing_elapsed_time_controls_physical_speed():
    samples = [sample(i, float(i), i / 4, i / 4) for i in range(5)]
    result = analyze_pose_sequence(
        sport="soccer",
        drill="sprint-20m",
        samples=samples,
        total_frames=5,
        calibration_distance_meters=20.0,
        calibration_elapsed_seconds=2.0,
        calibration_confidence=0.4,
    )

    assert result.metrics["speed_mps"].value == 10.0
    assert result.metrics["speed_mps"].confidence == 0.4
    assert result.metrics["speed_mps"].method == "verified course distance / marker crossing time"


def test_uncalibrated_motion_never_claims_physical_speed():
    samples = [sample(i, i / 10, 0.1 + i * 0.05, 0.1 + i * 0.05) for i in range(10)]
    result = analyze_pose_sequence(
        sport="soccer",
        drill="sprint-20m",
        samples=samples,
        total_frames=10,
        calibration_distance_meters=None,
    )
    assert result.metrics["speed_mps"].value is None
    assert result.metrics["relative_speed_score"].value is not None


def test_basketball_shot_action_and_mechanics_recommendation():
    samples = [sample(i, i / 10, 0.5, 0.5, wrist_y=0.55 - i * 0.04) for i in range(8)]
    result = analyze_pose_sequence(
        sport="basketball",
        drill="basketball-form-capture",
        samples=samples,
        total_frames=8,
        calibration_distance_meters=None,
    )
    assert any(action.name == "shot_attempt" for action in result.actions)
    assert "technique_score" in result.metrics
    assert result.recommendations


def test_baseball_swing_detects_fast_wrist_motion_but_gates_power_without_scale():
    samples = [sample(i, i / 30, 0.5, 0.5, wrist_y=0.5 - i * 0.01) for i in range(12)]
    for i, pose in enumerate(samples):
        pose.landmarks["right_wrist"] = (0.2 + i * 0.06, 0.5)
    result = analyze_pose_sequence(
        sport="baseball",
        drill="baseball-swing-timing",
        samples=samples,
        total_frames=12,
        calibration_distance_meters=None,
    )
    assert any(action.name == "swing" for action in result.actions)
    assert result.metrics["power_proxy"].value is not None
    assert result.metrics["bat_speed_mph"].value is None


def test_basketball_and_baseball_withhold_unsupported_agility_scores():
    samples = [sample(i, i / 10, 0.5, 0.5) for i in range(8)]
    basketball = analyze_pose_sequence("basketball", "basketball-form-capture", samples, 8, None)
    baseball = analyze_pose_sequence("baseball", "baseball-swing-timing", samples, 8, None)

    assert basketball.metrics["agility_score"].value is None
    assert baseball.metrics["agility_score"].value is None


def test_basketball_technique_proxy_is_invariant_to_apparent_athlete_scale():
    near = [sample(i, i / 10, 0.5, 0.5, wrist_y=0.55 - i * 0.03, shoulder_y=0.45) for i in range(8)]
    far = [sample(i, i / 10, 0.5, 0.5, wrist_y=0.525 - i * 0.015, shoulder_y=0.475) for i in range(8)]

    near_result = analyze_pose_sequence("basketball", "basketball-form-capture", near, 8, None)
    far_result = analyze_pose_sequence("basketball", "basketball-form-capture", far, 8, None)

    assert near_result.metrics["technique_score"].value == far_result.metrics["technique_score"].value


def test_verified_target_outcomes_produce_accuracy_and_specific_coaching():
    samples = [sample(i, i / 10, 0.5, 0.5, wrist_y=0.55 - i * 0.04) for i in range(8)]
    result = analyze_pose_sequence(
        sport="basketball",
        drill="basketball-form-capture",
        samples=samples,
        total_frames=8,
        calibration_distance_meters=None,
        verified_outcomes={"attempts": 10, "successes": 4},
    )
    assert result.metrics["accuracy_score"].value == 40.0
    assert result.metrics["accuracy_score"].confidence == 1.0
    assert "target accuracy" in result.weaknesses
    assert any("follow-through" in item.lower() for item in result.recommendations)


def test_invalid_outcome_counts_are_rejected_instead_of_scored():
    samples = [sample(i, i / 10, 0.1 + i * 0.05, 0.1 + i * 0.05) for i in range(10)]
    result = analyze_pose_sequence(
        sport="soccer",
        drill="shooting-accuracy",
        samples=samples,
        total_frames=10,
        calibration_distance_meters=None,
        verified_outcomes={"attempts": 3, "successes": 4},
    )
    assert result.metrics["accuracy_score"].value is None
    assert "Invalid verified outcome counts" in result.metrics["accuracy_score"].limitations
