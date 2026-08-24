from vision_core.object_tracking_benchmark import (
    MIN_OBSERVATIONS_PER_CLASS,
    MIN_PRECISION_PER_CLASS,
    MIN_RECALL_PER_CLASS,
    ObjectTrackAnnotation,
    ObjectTrackPrediction,
    evaluate_object_tracking,
)
from vision_core.objects import SportObjectClass


def annotation(object_class: SportObjectClass, frame: int) -> ObjectTrackAnnotation:
    return ObjectTrackAnnotation("clip-1", frame, object_class, f"{object_class.value}-1", (0.1, 0.1, 0.2, 0.2))


def prediction(object_class: SportObjectClass, frame: int) -> ObjectTrackPrediction:
    return ObjectTrackPrediction("clip-1", frame, object_class, f"{object_class.value}-1", (0.1, 0.1, 0.2, 0.2), 0.95)


def test_object_tracking_release_requires_95_percent_for_each_canonical_class():
    assert MIN_OBSERVATIONS_PER_CLASS == 500
    assert MIN_PRECISION_PER_CLASS == 0.95
    assert MIN_RECALL_PER_CLASS == 0.95

    annotations = [annotation(object_class, index) for index, object_class in enumerate(SportObjectClass)]
    report = evaluate_object_tracking(annotations, [prediction(item.object_class, item.frame_index) for item in annotations])

    assert not report.released
    assert set(report.by_class) == set(SportObjectClass)
    assert all("corpus-insufficient" in metrics.release_reasons for metrics in report.by_class.values())


def test_object_tracking_release_penalizes_false_positive_for_affected_class_only():
    annotations = [annotation(SportObjectClass.BALL, 0)]
    predictions = [
        prediction(SportObjectClass.BALL, 0),
        prediction(SportObjectClass.BALL, 1),
    ]

    report = evaluate_object_tracking(annotations, predictions)

    assert report.by_class[SportObjectClass.BALL].precision == 0.5
    assert "precision-below-threshold" in report.by_class[SportObjectClass.BALL].release_reasons
    assert report.by_class[SportObjectClass.BAT].precision == 0.0
