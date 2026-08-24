"""Ground-truth evaluators for recognition, segmentation, and invalid attempts.

These functions consume independent labels from a held-out corpus. They never
turn heuristic confidence into validation evidence.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional, Sequence


@dataclass(frozen=True)
class LabeledRecognition:
    clip_id: str
    declared_drill: str
    predicted_drill: Optional[str]
    confirmed: bool


@dataclass(frozen=True)
class RecognitionBenchmark:
    clips: int
    accuracy: float
    false_confirmation_rate: float


@dataclass(frozen=True)
class LabeledAttempt:
    clip_id: str
    attempt_index: int
    is_valid: bool
    predicted_valid: bool


@dataclass(frozen=True)
class BinaryBenchmark:
    attempts: int
    precision: float
    recall: float
    sensitivity: float
    specificity: float


def evaluate_sport_drill_recognition(labels: Sequence[LabeledRecognition]) -> RecognitionBenchmark:
    clips = len(labels)
    correct = sum(item.confirmed and item.predicted_drill == item.declared_drill for item in labels)
    false_confirmations = sum(
        item.confirmed and item.predicted_drill is not None and item.predicted_drill != item.declared_drill
        for item in labels
    )
    return RecognitionBenchmark(
        clips=clips,
        accuracy=correct / clips if clips else 0.0,
        false_confirmation_rate=false_confirmations / clips if clips else 0.0,
    )


def _binary(labels: Sequence[LabeledAttempt], positive_is_valid: bool) -> BinaryBenchmark:
    actual = [item.is_valid is positive_is_valid for item in labels]
    predicted = [item.predicted_valid is positive_is_valid for item in labels]
    true_positive = sum(a and p for a, p in zip(actual, predicted))
    false_positive = sum(not a and p for a, p in zip(actual, predicted))
    false_negative = sum(a and not p for a, p in zip(actual, predicted))
    true_negative = sum(not a and not p for a, p in zip(actual, predicted))
    precision = true_positive / (true_positive + false_positive) if true_positive + false_positive else 0.0
    recall = true_positive / (true_positive + false_negative) if true_positive + false_negative else 0.0
    specificity = true_negative / (true_negative + false_positive) if true_negative + false_positive else 0.0
    return BinaryBenchmark(len(labels), precision, recall, recall, specificity)


def evaluate_repetition_segmentation(labels: Sequence[LabeledAttempt]) -> BinaryBenchmark:
    """Treat a correctly accepted complete repetition as the positive class."""
    return _binary(labels, positive_is_valid=True)


def evaluate_invalid_attempt_detection(labels: Sequence[LabeledAttempt]) -> BinaryBenchmark:
    """Treat a correctly rejected incomplete/invalid attempt as the positive class."""
    return _binary(labels, positive_is_valid=False)
