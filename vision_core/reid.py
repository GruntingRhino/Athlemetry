"""Athlete re-identification across short occlusions.

This module fuses motion and color-histogram appearance cues. Ambiguous matches
are rejected rather than silently switching athlete identity.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from math import hypot
from typing import Any, Dict, List, Optional, Sequence, Tuple

import cv2
import numpy as np


class OnnxAppearanceEmbedder:
    """CPU ONNX person-appearance embedding adapter with explicit health evidence."""

    def __init__(self, model_path: Optional[str] = None, *, net: Any = None, model_name: Optional[str] = None):
        if net is None and not model_path:
            raise ValueError("model_path is required when net is not supplied")
        self.model_path = model_path
        self.model_name = model_name or (model_path if model_path else "injected-reid-model")
        self.inference_failures = 0
        self.last_error: Optional[str] = None
        if net is None:
            assert model_path is not None
            self.net = cv2.dnn.readNetFromONNX(model_path)
            self.net.setPreferableBackend(cv2.dnn.DNN_BACKEND_OPENCV)
            self.net.setPreferableTarget(cv2.dnn.DNN_TARGET_CPU)
        else:
            self.net = net

    @staticmethod
    def _person_blob(frame: np.ndarray, box: Tuple[float, float, float, float]) -> Optional[np.ndarray]:
        height, width = frame.shape[:2]
        x1, y1, x2, y2 = box
        left, top = max(0, int(x1 * width)), max(0, int(y1 * height))
        right, bottom = min(width, int(x2 * width)), min(height, int(y2 * height))
        patch = frame[top:bottom, left:right]
        if patch.size == 0:
            return None
        patch = cv2.resize(patch, (128, 256), interpolation=cv2.INTER_AREA)
        rgb = cv2.cvtColor(patch, cv2.COLOR_BGR2RGB).astype(np.float32) / 255.0
        rgb = (rgb - np.asarray((0.485, 0.456, 0.406), dtype=np.float32)) / np.asarray(
            (0.229, 0.224, 0.225), dtype=np.float32
        )
        return np.transpose(rgb, (2, 0, 1))[None, ...].astype(np.float32)

    def embed(self, frame: np.ndarray, box: Tuple[float, float, float, float]) -> Optional[np.ndarray]:
        blob = self._person_blob(frame, box)
        if blob is None:
            return None
        try:
            self.net.setInput(blob)
            output = np.asarray(self.net.forward(), dtype=np.float32).reshape(-1)
            norm = float(np.linalg.norm(output))
            if output.size == 0 or not np.isfinite(output).all() or norm <= 1e-8:
                raise ValueError("embedding output is empty, non-finite, or zero norm")
            self.last_error = None
            return output / norm
        except Exception as exc:
            self.inference_failures += 1
            self.last_error = f"{type(exc).__name__}: {exc}"
            return None


@dataclass(frozen=True)
class AthleteAppearance:
    box: Tuple[float, float, float, float]
    histogram: np.ndarray
    pose_embedding: Optional[np.ndarray] = None
    detection_confidence: float = 1.0

    def similarity(self, other: "AthleteAppearance") -> float:
        histogram_score = float(np.minimum(self.histogram, other.histogram).sum())
        if self.pose_embedding is None or other.pose_embedding is None or self.pose_embedding.shape != other.pose_embedding.shape:
            return max(0.0, min(1.0, histogram_score))
        denominator = float(np.linalg.norm(self.pose_embedding) * np.linalg.norm(other.pose_embedding))
        embedding_score = float(np.dot(self.pose_embedding, other.pose_embedding) / denominator) if denominator > 1e-8 else 0.0
        return max(0.0, min(1.0, 0.15 * histogram_score + 0.85 * max(0.0, embedding_score)))

    def embedding_similarity(self, other: "AthleteAppearance") -> Optional[float]:
        if self.pose_embedding is None or other.pose_embedding is None or self.pose_embedding.shape != other.pose_embedding.shape:
            return None
        denominator = float(np.linalg.norm(self.pose_embedding) * np.linalg.norm(other.pose_embedding))
        if denominator <= 1e-8:
            return None
        return max(0.0, min(1.0, float(np.dot(self.pose_embedding, other.pose_embedding) / denominator)))


@dataclass
class AthleteState:
    frame_index: int
    position: Tuple[float, float]
    velocity_per_frame: Tuple[float, float]
    appearance: AthleteAppearance
    match_confidence: float


@dataclass
class AthleteTrack:
    track_id: int
    states: List[AthleteState] = field(default_factory=list)
    missing_frames: int = 0
    identity_ambiguous: bool = False

    @property
    def current(self) -> Optional[AthleteState]:
        return self.states[-1] if self.states else None

    def predict(self, frame_index: int) -> Tuple[float, float]:
        if self.current is None:
            return (0.0, 0.0)
        delta = max(0, frame_index - self.current.frame_index)
        return (
            self.current.position[0] + self.current.velocity_per_frame[0] * delta,
            self.current.position[1] + self.current.velocity_per_frame[1] * delta,
        )


@dataclass(frozen=True)
class ReIDEvidence:
    track_id: int
    detection_index: Optional[int]
    motion_score: float
    appearance_score: float
    combined_score: float
    accepted: bool
    ambiguous: bool
    reason: Optional[str]


class AthleteReIdentifier:
    def __init__(
        self,
        max_missing_frames: int = 30,
        max_motion_distance: float = 0.20,
        min_match_score: float = 0.48,
        ambiguity_margin: float = 0.08,
        max_tracks: int = 10,
        max_reid_frames: int = 300,
        min_deep_reid_score: float = 0.85,
    ):
        self.max_missing_frames = max_missing_frames
        self.max_motion_distance = max_motion_distance
        self.min_match_score = min_match_score
        self.ambiguity_margin = ambiguity_margin
        self.max_tracks = max_tracks
        self.max_reid_frames = max(max_missing_frames, max_reid_frames)
        self.min_deep_reid_score = min_deep_reid_score
        self.tracks: Dict[int, AthleteTrack] = {}
        self.dormant_tracks: Dict[int, AthleteTrack] = {}
        self._next_id = 1

    def _score(self, track: AthleteTrack, appearance: AthleteAppearance, frame_index: int) -> Tuple[float, float, float]:
        predicted = track.predict(frame_index)
        x1, y1, x2, y2 = appearance.box
        center = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
        distance = hypot(predicted[0] - center[0], predicted[1] - center[1])
        motion = max(0.0, 1.0 - distance / self.max_motion_distance) if distance <= self.max_motion_distance else 0.0
        visual = track.current.appearance.similarity(appearance) if track.current else 0.0
        missing_penalty = max(0.55, 1.0 - track.missing_frames / max(1, self.max_missing_frames) * 0.35)
        combined = (0.55 * visual + 0.45 * motion) * missing_penalty
        return motion, visual, combined

    def update(self, appearances: Sequence[AthleteAppearance], frame_index: int) -> List[ReIDEvidence]:
        self.dormant_tracks = {
            key: track for key, track in self.dormant_tracks.items()
            if track.current is not None and frame_index - track.current.frame_index <= self.max_reid_frames
        }
        self.tracks = {
            key: track for key, track in self.tracks.items()
            if track.missing_frames <= self.max_missing_frames
        }
        for track in self.tracks.values():
            track.identity_ambiguous = False

        candidates: List[Tuple[float, int, int, float, float]] = []
        for track_id, track in self.tracks.items():
            if track.missing_frames > self.max_missing_frames:
                continue
            for detection_index, appearance in enumerate(appearances):
                motion, visual, combined = self._score(track, appearance, frame_index)
                if combined >= self.min_match_score:
                    candidates.append((combined, track_id, detection_index, motion, visual))
        candidates.sort(reverse=True)

        assigned_tracks: set[int] = set()
        assigned_detections: set[int] = set()
        ambiguous_detections: set[int] = set()
        evidence: List[ReIDEvidence] = []
        for combined, track_id, detection_index, motion, visual in candidates:
            if track_id in assigned_tracks or detection_index in assigned_detections or detection_index in ambiguous_detections:
                continue
            competing_tracks = [item for item in candidates if item[2] == detection_index and item[1] != track_id and item[1] not in assigned_tracks]
            competing_detections = [item for item in candidates if item[1] == track_id and item[2] != detection_index and item[2] not in assigned_detections]
            runner_up = max([item[0] for item in competing_tracks + competing_detections], default=-1.0)
            if runner_up >= combined - self.ambiguity_margin:
                self.tracks[track_id].identity_ambiguous = True
                ambiguous_detections.add(detection_index)
                evidence.append(ReIDEvidence(track_id, detection_index, motion, visual, combined, False, True, "identity-match-ambiguous"))
                continue
            track = self.tracks[track_id]
            appearance = appearances[detection_index]
            x1, y1, x2, y2 = appearance.box
            position = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
            previous = track.current
            delta = max(1, frame_index - previous.frame_index) if previous else 1
            velocity = (
                (position[0] - previous.position[0]) / delta,
                (position[1] - previous.position[1]) / delta,
            ) if previous else (0.0, 0.0)
            track.states.append(AthleteState(frame_index, position, velocity, appearance, combined))
            track.missing_frames = 0
            assigned_tracks.add(track_id)
            assigned_detections.add(detection_index)
            evidence.append(ReIDEvidence(track_id, detection_index, motion, visual, combined, True, False, None))

        expiring_track_ids = {
            track_id for track_id, track in self.tracks.items()
            if track_id not in assigned_tracks and track.missing_frames >= self.max_missing_frames
        }
        for track_id in expiring_track_ids:
            track = self.tracks.pop(track_id)
            if track.current is not None and track.current.appearance.pose_embedding is not None:
                self.dormant_tracks[track_id] = track

        dormant_candidates: List[Tuple[float, int, int]] = []
        for track_id, track in self.dormant_tracks.items():
            if track.current is None:
                continue
            for detection_index, appearance in enumerate(appearances):
                if detection_index in assigned_detections:
                    continue
                score = track.current.appearance.embedding_similarity(appearance)
                if score is not None and score >= self.min_deep_reid_score:
                    dormant_candidates.append((score, track_id, detection_index))
        dormant_candidates.sort(reverse=True)
        restored_tracks: set[int] = set()
        for score, track_id, detection_index in dormant_candidates:
            if (
                track_id in restored_tracks
                or detection_index in assigned_detections
                or detection_index in ambiguous_detections
                or len(self.tracks) >= self.max_tracks
            ):
                continue
            runners_up = [
                item[0] for item in dormant_candidates
                if item[2] == detection_index and item[1] != track_id and item[1] not in restored_tracks
            ]
            if runners_up and max(runners_up) >= score - self.ambiguity_margin:
                ambiguous_detections.add(detection_index)
                evidence.append(ReIDEvidence(track_id, detection_index, 0.0, score, score, False, True, "long-occlusion-identity-ambiguous"))
                continue
            track = self.dormant_tracks.pop(track_id)
            appearance = appearances[detection_index]
            x1, y1, x2, y2 = appearance.box
            position = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
            track.states.append(AthleteState(frame_index, position, (0.0, 0.0), appearance, score))
            track.missing_frames = 0
            track.identity_ambiguous = False
            self.tracks[track_id] = track
            restored_tracks.add(track_id)
            assigned_tracks.add(track_id)
            assigned_detections.add(detection_index)
            evidence.append(ReIDEvidence(track_id, detection_index, 0.0, score, score, True, False, "long-occlusion-reidentified"))

        for index, appearance in enumerate(appearances):
            if index in assigned_detections or index in ambiguous_detections or len(self.tracks) >= self.max_tracks:
                continue
            x1, y1, x2, y2 = appearance.box
            position = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)
            track = AthleteTrack(self._next_id, [AthleteState(frame_index, position, (0.0, 0.0), appearance, appearance_match_seed_confidence(appearance))])
            self.tracks[track.track_id] = track
            evidence.append(ReIDEvidence(track.track_id, index, 1.0, 1.0, 1.0, True, False, "new-track"))
            self._next_id += 1

        for track_id, track in self.tracks.items():
            if track_id not in assigned_tracks and (track.current is None or track.current.frame_index != frame_index):
                track.missing_frames += 1
        self.tracks = {
            key: track for key, track in self.tracks.items()
            if track.missing_frames <= self.max_missing_frames
        }
        return evidence

    def select_primary_track(self) -> Optional[AthleteTrack]:
        eligible = [track for track in self.tracks.values() if track.current and not track.identity_ambiguous]
        if not eligible:
            return None
        def prominence(track: AthleteTrack) -> Tuple[int, float, float, int]:
            assert track.current is not None
            x1, y1, x2, y2 = track.current.appearance.box
            return (
                len(track.states),
                track.current.appearance.detection_confidence,
                max(0.0, x2 - x1) * max(0.0, y2 - y1),
                -track.missing_frames,
            )
        eligible.sort(key=prominence, reverse=True)
        if len(eligible) > 1:
            first, second = prominence(eligible[0]), prominence(eligible[1])
            if first[0] == second[0] and abs(first[1] - second[1]) < 0.05 and abs(first[2] - second[2]) < 0.02:
                return None
        return eligible[0]


def appearance_match_seed_confidence(appearance: AthleteAppearance) -> float:
    return max(0.0, min(1.0, appearance.detection_confidence))


def extract_appearance(
    frame: np.ndarray,
    box: Tuple[float, float, float, float],
    pose_landmarks: Optional[Dict[str, Tuple[float, float]]] = None,
    detection_confidence: float = 1.0,
    learned_embedding: Optional[np.ndarray] = None,
) -> AthleteAppearance:
    height, width = frame.shape[:2]
    x1, y1, x2, y2 = box
    left, top = max(0, int(x1 * width)), max(0, int(y1 * height))
    right, bottom = min(width, int(x2 * width)), min(height, int(y2 * height))
    patch = frame[top:bottom, left:right]
    if patch.size == 0:
        patch = np.zeros((32, 32, 3), dtype=np.uint8)
    patch = cv2.resize(patch, (48, 96), interpolation=cv2.INTER_AREA)
    hsv = cv2.cvtColor(patch, cv2.COLOR_BGR2HSV)
    histogram = cv2.calcHist([hsv], [0, 1], None, [24, 16], [0, 180, 0, 256]).flatten().astype(np.float32)
    histogram /= float(histogram.sum()) + 1e-8

    embedding = learned_embedding
    if embedding is None and pose_landmarks:
        keys = ("left_shoulder", "right_shoulder", "left_hip", "right_hip", "left_knee", "right_knee")
        values = [pose_landmarks[key] for key in keys if key in pose_landmarks]
        if len(values) == len(keys):
            raw = np.asarray(values, dtype=np.float32).flatten()
            raw -= raw.mean()
            norm = float(np.linalg.norm(raw))
            embedding = raw / norm if norm > 1e-8 else None
    return AthleteAppearance(box, histogram, embedding, max(0.0, min(1.0, detection_confidence)))
