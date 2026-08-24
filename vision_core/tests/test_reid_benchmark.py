import numpy as np

from vision_core.reid_benchmark import (
    ReIDAnnotation,
    ReIDObservation,
    benchmark_annotated_reid,
    evaluate_reid_observations,
)


def test_reid_benchmark_scores_correct_post_occlusion_recovery():
    observations = [
        ReIDObservation(0, "athlete-a", 1),
        ReIDObservation(0, "athlete-b", 2),
        ReIDObservation(1, "athlete-a", 1),
        ReIDObservation(1, "athlete-b", 2),
        ReIDObservation(2, "athlete-a", None),
        ReIDObservation(2, "athlete-b", 2),
        ReIDObservation(3, "athlete-a", 1),
        ReIDObservation(3, "athlete-b", 2),
    ]
    result = evaluate_reid_observations(observations, max_missing_frames=0)
    assert result.ground_truth_detections == 8
    assert result.matched_detections == 7
    assert result.id_switches == 0
    assert result.occlusion_recoveries == 1
    assert result.correct_occlusion_recoveries == 1
    assert result.idf1 == 14 / 15


def test_reid_benchmark_penalizes_identity_switch_after_occlusion():
    observations = [
        ReIDObservation(0, "athlete-a", 1),
        ReIDObservation(0, "athlete-b", 2),
        ReIDObservation(1, "athlete-a", 1),
        ReIDObservation(1, "athlete-b", 2),
        ReIDObservation(2, "athlete-a", None),
        ReIDObservation(2, "athlete-b", 2),
        ReIDObservation(3, "athlete-a", 3),
        ReIDObservation(3, "athlete-b", 2),
    ]
    result = evaluate_reid_observations(observations, max_missing_frames=0)
    assert result.id_switches == 1
    assert result.occlusion_recoveries == 1
    assert result.correct_occlusion_recoveries == 0
    assert result.idf1 == 0.8


def test_annotated_reid_benchmark_runs_embedder_and_recovers_identity():
    class Embedder:
        def embed(self, _frame, _box):
            return np.asarray([1.0, 0.0], dtype=np.float32)

    annotations = [
        ReIDAnnotation(0, "frame-0.png", "athlete-a", (0.05, 0.1, 0.25, 0.9)),
        ReIDAnnotation(1, "frame-1.png", "athlete-a", None),
        ReIDAnnotation(2, "frame-2.png", "athlete-a", None),
        ReIDAnnotation(3, "frame-3.png", "athlete-a", (0.75, 0.1, 0.95, 0.9)),
    ]
    result = benchmark_annotated_reid(
        annotations,
        Embedder(),
        max_missing_frames=0,
        max_reid_frames=10,
        image_loader=lambda _path: np.zeros((100, 100, 3), dtype=np.uint8),
    )
    assert result.id_switches == 0
    assert result.correct_occlusion_recoveries == 1
    assert result.occlusion_recovery_rate == 1.0
