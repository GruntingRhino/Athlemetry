"""Independent sport/drill verification from visual evidence."""
from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Dict, Optional, Sequence, Tuple

from .metrics import PoseSample
from .objects import ObjectEvidence
from .segmentation import SegmentationResult


class RecognitionStatus(str, Enum):
    CONFIRMED = "confirmed"
    MISMATCH = "mismatch"
    INCONCLUSIVE = "inconclusive"


@dataclass(frozen=True)
class DrillSignature:
    sport: str
    required_objects: Tuple[str, ...]
    accepted_actions: Tuple[str, ...]
    minimum_attempts: int
    duration_range_seconds: Tuple[float, float]


SIGNATURES: Dict[str, DrillSignature] = {
    "sprint-20m": DrillSignature("soccer", (), ("sprint",), 1, (1.0, 20.0)),
    "agility-5-10-5": DrillSignature("soccer", (), ("course-leg",), 3, (2.0, 30.0)),
    "shooting-accuracy": DrillSignature("soccer", ("ball", "goal", "target"), ("kick",), 1, (1.0, 180.0)),
    "shooting-mechanics": DrillSignature("soccer", ("ball", "goal", "target", "cone"), ("kick",), 1, (1.0, 300.0)),
    "movement-efficiency": DrillSignature("soccer", ("cone", "target"), ("course-leg",), 2, (2.0, 120.0)),
    "passing-accuracy": DrillSignature("soccer", ("ball", "target"), ("kick",), 1, (1.0, 300.0)),
    "first-touch-control": DrillSignature("soccer", ("ball", "target", "cone"), ("kick",), 1, (1.0, 300.0)),
    "cone-dribble": DrillSignature("soccer", ("ball", "cone"), ("course-leg",), 2, (2.0, 90.0)),
    "shuttle-endurance": DrillSignature("soccer", (), ("course-leg",), 2, (10.0, 1800.0)),
    "basketball-form-capture": DrillSignature("basketball", ("ball", "hoop"), ("shot",), 1, (1.0, 300.0)),
    "basketball-free-throw": DrillSignature("basketball", ("ball", "hoop", "court-line"), ("shot",), 10, (10.0, 600.0)),
    "basketball-spot-shooting": DrillSignature("basketball", ("ball", "hoop", "court-line"), ("shot",), 5, (10.0, 900.0)),
    "basketball-lane-agility": DrillSignature("basketball", ("court-line",), ("course-leg",), 3, (4.0, 120.0)),
    "baseball-pitch-velocity": DrillSignature("baseball", ("ball",), ("pitch",), 1, (0.5, 60.0)),
    "baseball-pitch-command": DrillSignature("baseball", ("ball", "plate", "target"), ("pitch",), 2, (2.0, 600.0)),
    "baseball-throwing-mechanics": DrillSignature("baseball", ("ball", "plate", "target"), ("throw",), 1, (1.0, 300.0)),
    "baseball-swing-timing": DrillSignature("baseball", ("ball", "bat"), ("swing",), 1, (0.3, 120.0)),
}


@dataclass(frozen=True)
class RecognitionResult:
    declared_sport: str
    declared_drill: str
    inferred_sport: Optional[str]
    inferred_drill: Optional[str]
    status: RecognitionStatus
    confidence: float
    reasons: Tuple[str, ...]
    candidate_drills: Tuple[str, ...]

    @property
    def accepted(self) -> bool:
        return self.status is RecognitionStatus.CONFIRMED


def _reliable_objects(objects: Dict[str, ObjectEvidence]) -> set[str]:
    return {name for name, evidence in objects.items() if evidence.is_reliable}


def infer_sport(objects: Dict[str, ObjectEvidence]) -> Tuple[Optional[str], float, Tuple[str, ...]]:
    detected = _reliable_objects(objects)
    votes = {
        "soccer": len(detected & {"goal", "cone"}),
        "basketball": len(detected & {"hoop"}),
        "baseball": len(detected & {"bat", "plate"}),
    }
    best_score = max(votes.values(), default=0)
    winners = [sport for sport, score in votes.items() if score == best_score and score > 0]
    if len(winners) != 1:
        return None, 0.0, ("sport-specific-object-evidence-insufficient",)
    confidence = min(1.0, 0.55 + best_score * 0.2)
    return winners[0], confidence, ()


def recognize_sport_and_drill(
    declared_sport: str,
    declared_drill: str,
    samples: Sequence[PoseSample],
    objects: Dict[str, ObjectEvidence],
    segmentation: SegmentationResult,
    duration_seconds: float,
    calibration_method: Optional[str] = None,
) -> RecognitionResult:
    signature = SIGNATURES.get(declared_drill)
    if signature is None:
        return RecognitionResult(declared_sport, declared_drill, None, None, RecognitionStatus.MISMATCH, 0.0, ("declared-drill-unsupported",), ())
    if signature.sport != declared_sport:
        return RecognitionResult(declared_sport, declared_drill, signature.sport, None, RecognitionStatus.MISMATCH, 1.0, ("declared-sport-drill-inconsistent",), ())

    inferred_sport, sport_confidence, _sport_reasons = infer_sport(objects)
    if inferred_sport is not None and inferred_sport != declared_sport:
        return RecognitionResult(declared_sport, declared_drill, inferred_sport, None, RecognitionStatus.MISMATCH, sport_confidence, ("visual-sport-mismatch",), ())

    detected = _reliable_objects(objects)
    candidate_drills = []
    for slug, candidate in SIGNATURES.items():
        if inferred_sport and candidate.sport != inferred_sport:
            continue
        object_match = all(required in detected for required in candidate.required_objects)
        action_match = any(item.action in candidate.accepted_actions for item in segmentation.attempts)
        attempts_match = sum(1 for item in segmentation.attempts if item.action in candidate.accepted_actions) >= candidate.minimum_attempts
        duration_match = candidate.duration_range_seconds[0] <= duration_seconds <= candidate.duration_range_seconds[1]
        geometry_match = True
        if slug in ("agility-5-10-5", "movement-efficiency", "shuttle-endurance"):
            geometry_match = calibration_method == f"verified-planar-homography:{slug}"
        if object_match and action_match and attempts_match and duration_match and geometry_match:
            candidate_drills.append(slug)

    if candidate_drills:
        specificity = max(len(SIGNATURES[slug].required_objects) for slug in candidate_drills)
        candidate_drills = [slug for slug in candidate_drills if len(SIGNATURES[slug].required_objects) == specificity]

    # Missing sport-specific objects is not itself a mismatch. A unique,
    # protocol-calibrated action signature (for example the ArUco sprint course)
    # may still independently identify the declared drill.
    reasons = []
    missing = [name for name in signature.required_objects if name not in detected]
    reasons.extend(f"required-object-missing:{name}" for name in missing)
    matching_attempts = [item for item in segmentation.attempts if item.action in signature.accepted_actions]
    if len(matching_attempts) < signature.minimum_attempts:
        reasons.append("drill-action-pattern-insufficient")
    if not signature.duration_range_seconds[0] <= duration_seconds <= signature.duration_range_seconds[1]:
        reasons.append("clip-duration-outside-drill-range")
    if not segmentation.complete:
        reasons.append("drill-execution-incomplete")

    # A sprint has no sport-specific object in the current protocol. Stable course
    # markers are therefore mandatory before treating its exact identity as confirmed.
    if declared_drill == "sprint-20m" and calibration_method != "aruco-course-markers":
        reasons.append("sprint-course-markers-unavailable")
    if declared_drill in ("agility-5-10-5", "movement-efficiency", "shuttle-endurance") and calibration_method != f"verified-planar-homography:{declared_drill}":
        reasons.append("course-geometry-unverified")
    if len(candidate_drills) > 1:
        reasons.append("visual-drill-evidence-ambiguous")
    if not samples:
        reasons.append("pose-evidence-unavailable")

    alternative = candidate_drills[0] if len(candidate_drills) == 1 and candidate_drills[0] != declared_drill else None
    if alternative:
        return RecognitionResult(
            declared_sport, declared_drill, inferred_sport, alternative, RecognitionStatus.MISMATCH,
            max(0.5, sport_confidence), tuple(dict.fromkeys(reasons + ["visual-drill-mismatch"])), tuple(candidate_drills),
        )

    if not reasons:
        confidence_components = [sport_confidence or 0.65, 0.8, min(1.0, len(matching_attempts) / signature.minimum_attempts)]
        return RecognitionResult(
            declared_sport, declared_drill, inferred_sport or declared_sport, declared_drill,
            RecognitionStatus.CONFIRMED, sum(confidence_components) / len(confidence_components), (), tuple(candidate_drills),
        )

    return RecognitionResult(
        declared_sport, declared_drill, inferred_sport, None, RecognitionStatus.INCONCLUSIVE,
        min(0.49, sport_confidence), tuple(dict.fromkeys(reasons)), tuple(candidate_drills),
    )
