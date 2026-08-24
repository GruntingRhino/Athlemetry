"""Ground-truth metrics for athlete re-identification validation studies."""
from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable, Dict, Optional, Sequence, Tuple

import cv2
import numpy as np

from .reid import AthleteReIdentifier, extract_appearance


@dataclass(frozen=True)
class ReIDAnnotation:
    frame_index: int
    image_path: str
    ground_truth_identity: str
    box: Optional[Tuple[float, float, float, float]]


@dataclass(frozen=True)
class ReIDObservation:
    frame_index: int
    ground_truth_identity: str
    predicted_track_id: Optional[int]


@dataclass(frozen=True)
class ReIDBenchmarkResult:
    ground_truth_detections: int
    matched_detections: int
    identity_true_positives: int
    identity_false_positives: int
    identity_false_negatives: int
    idf1: float
    id_switches: int
    occlusion_recoveries: int
    correct_occlusion_recoveries: int

    @property
    def occlusion_recovery_rate(self) -> float:
        if self.occlusion_recoveries == 0:
            return 0.0
        return self.correct_occlusion_recoveries / self.occlusion_recoveries


def _maximum_assignment_weight(weights: Sequence[Sequence[int]]) -> int:
    """Return the exact maximum rectangular assignment weight in O(n^3)."""
    if not weights or not weights[0]:
        return 0
    rows = len(weights)
    columns = len(weights[0])
    size = max(rows, columns)
    maximum = max(max(row) for row in weights)
    cost = [
        [maximum - (weights[row][column] if row < rows and column < columns else 0) for column in range(size)]
        for row in range(size)
    ]
    potentials_rows = [0] * (size + 1)
    potentials_columns = [0] * (size + 1)
    matched_row = [0] * (size + 1)
    predecessor = [0] * (size + 1)
    for row in range(1, size + 1):
        matched_row[0] = row
        column = 0
        minimum = [float("inf")] * (size + 1)
        used = [False] * (size + 1)
        while True:
            used[column] = True
            current_row = matched_row[column]
            delta = float("inf")
            next_column = 0
            for candidate in range(1, size + 1):
                if used[candidate]:
                    continue
                reduced = cost[current_row - 1][candidate - 1] - potentials_rows[current_row] - potentials_columns[candidate]
                if reduced < minimum[candidate]:
                    minimum[candidate] = reduced
                    predecessor[candidate] = column
                if minimum[candidate] < delta:
                    delta = minimum[candidate]
                    next_column = candidate
            for candidate in range(size + 1):
                if used[candidate]:
                    potentials_rows[matched_row[candidate]] += int(delta)
                    potentials_columns[candidate] -= int(delta)
                else:
                    minimum[candidate] -= delta
            column = next_column
            if matched_row[column] == 0:
                break
        while True:
            previous = predecessor[column]
            matched_row[column] = matched_row[previous]
            column = previous
            if column == 0:
                break
    assignment = [0] * (size + 1)
    for column in range(1, size + 1):
        assignment[matched_row[column]] = column
    return sum(
        weights[row - 1][assignment[row] - 1]
        for row in range(1, rows + 1)
        if 1 <= assignment[row] <= columns
    )


def evaluate_reid_observations(
    observations: Sequence[ReIDObservation],
    *,
    max_missing_frames: int,
) -> ReIDBenchmarkResult:
    if max_missing_frames < 0:
        raise ValueError("max_missing_frames must be non-negative")
    identities = sorted({item.ground_truth_identity for item in observations})
    track_ids = sorted({item.predicted_track_id for item in observations if item.predicted_track_id is not None})
    identity_index = {identity: index for index, identity in enumerate(identities)}
    track_index = {track_id: index for index, track_id in enumerate(track_ids)}
    contingency = [[0 for _ in track_ids] for _ in identities]
    matched_detections = 0
    for item in observations:
        if item.predicted_track_id is None:
            continue
        matched_detections += 1
        contingency[identity_index[item.ground_truth_identity]][track_index[item.predicted_track_id]] += 1
    identity_true_positives = _maximum_assignment_weight(contingency)
    ground_truth_detections = len(observations)
    identity_false_positives = matched_detections - identity_true_positives
    identity_false_negatives = ground_truth_detections - identity_true_positives
    denominator = 2 * identity_true_positives + identity_false_positives + identity_false_negatives
    idf1 = (2 * identity_true_positives / denominator) if denominator else 0.0

    by_identity: Dict[str, list[ReIDObservation]] = {}
    for item in observations:
        by_identity.setdefault(item.ground_truth_identity, []).append(item)
    id_switches = 0
    occlusion_recoveries = 0
    correct_occlusion_recoveries = 0
    for identity_observations in by_identity.values():
        ordered = sorted(identity_observations, key=lambda item: item.frame_index)
        previous_track: Optional[int] = None
        missing_run = 0
        for item in ordered:
            if item.predicted_track_id is None:
                if previous_track is not None:
                    missing_run += 1
                continue
            if previous_track is not None and item.predicted_track_id != previous_track:
                id_switches += 1
            if previous_track is not None and missing_run > max_missing_frames:
                occlusion_recoveries += 1
                if item.predicted_track_id == previous_track:
                    correct_occlusion_recoveries += 1
            previous_track = item.predicted_track_id
            missing_run = 0

    return ReIDBenchmarkResult(
        ground_truth_detections=ground_truth_detections,
        matched_detections=matched_detections,
        identity_true_positives=identity_true_positives,
        identity_false_positives=identity_false_positives,
        identity_false_negatives=identity_false_negatives,
        idf1=idf1,
        id_switches=id_switches,
        occlusion_recoveries=occlusion_recoveries,
        correct_occlusion_recoveries=correct_occlusion_recoveries,
    )


def benchmark_annotated_reid(
    annotations: Sequence[ReIDAnnotation],
    embedder: Any,
    *,
    max_missing_frames: int,
    max_reid_frames: int,
    image_loader: Callable[[str], Optional[np.ndarray]] = cv2.imread,
) -> ReIDBenchmarkResult:
    if not annotations:
        return evaluate_reid_observations((), max_missing_frames=max_missing_frames)
    grouped: Dict[int, list[ReIDAnnotation]] = {}
    for annotation in annotations:
        grouped.setdefault(annotation.frame_index, []).append(annotation)
    tracker = AthleteReIdentifier(
        max_missing_frames=max_missing_frames,
        max_reid_frames=max_reid_frames,
    )
    observations: list[ReIDObservation] = []
    for frame_index in sorted(grouped):
        frame_annotations = grouped[frame_index]
        image_paths = {item.image_path for item in frame_annotations}
        if len(image_paths) != 1:
            raise ValueError("all annotations in one frame must reference the same image")
        image_path = next(iter(image_paths))
        frame = image_loader(image_path)
        if frame is None or frame.size == 0:
            raise ValueError(f"unable to load annotated frame: {image_path}")
        visible = [item for item in frame_annotations if item.box is not None]
        appearances = []
        for annotation in visible:
            assert annotation.box is not None
            embedding = embedder.embed(frame, annotation.box)
            appearances.append(extract_appearance(frame, annotation.box, learned_embedding=embedding))
        evidence = tracker.update(appearances, frame_index)
        accepted_tracks = {
            item.detection_index: item.track_id
            for item in evidence
            if item.accepted and item.detection_index is not None
        }
        visible_index = {id(annotation): index for index, annotation in enumerate(visible)}
        for annotation in frame_annotations:
            detection_index = visible_index.get(id(annotation))
            observations.append(ReIDObservation(
                frame_index=frame_index,
                ground_truth_identity=annotation.ground_truth_identity,
                predicted_track_id=accepted_tracks.get(detection_index) if detection_index is not None else None,
            ))
    return evaluate_reid_observations(observations, max_missing_frames=max_missing_frames)
