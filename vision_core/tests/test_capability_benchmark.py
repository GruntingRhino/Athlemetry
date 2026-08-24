from vision_core.capability_benchmark import (
    LabeledAttempt,
    LabeledRecognition,
    evaluate_invalid_attempt_detection,
    evaluate_repetition_segmentation,
    evaluate_sport_drill_recognition,
)


def test_recognition_benchmark_reports_accuracy_and_false_confirmation_rate():
    report = evaluate_sport_drill_recognition([
        LabeledRecognition("clip-1", "baseball-pitch-velocity", "baseball-pitch-velocity", True),
        LabeledRecognition("clip-2", "basketball-form-capture", "basketball-form-capture", True),
        LabeledRecognition("clip-3", "sprint-20m", "cone-dribble", True),
        LabeledRecognition("clip-4", "sprint-20m", None, False),
    ])

    assert report.clips == 4
    assert report.accuracy == 0.5
    assert report.false_confirmation_rate == 0.25


def test_segmentation_and_invalid_attempt_benchmarks_penalize_wrong_decisions():
    attempts = [
        LabeledAttempt("clip-1", 1, True, True),
        LabeledAttempt("clip-1", 2, True, False),
        LabeledAttempt("clip-1", 3, False, True),
    ]

    segmentation = evaluate_repetition_segmentation(attempts)
    invalid = evaluate_invalid_attempt_detection(attempts)

    assert segmentation.precision == 0.5
    assert segmentation.recall == 0.5
    assert invalid.sensitivity == 0.0
    assert invalid.specificity == 0.5
