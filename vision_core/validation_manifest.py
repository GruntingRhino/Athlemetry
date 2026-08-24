"""Fail-closed validation for professional CV study corpus manifests.

Schema versions:
  athlemetry-cv-validation-v1  — base protocol (doppler radar / optical tracking).
  athlemetry-cv-validation-v2  — adds calibrated-high-speed-optical (two-phone study)
                                 with full provenance, reviewer, and calibration requirements.
"""
from __future__ import annotations

import re
from typing import Any, Mapping, Tuple
from urllib.parse import urlparse

_SHA256 = re.compile(r"^[0-9a-f]{64}$")
_ALLOWED_SPORTS = {"soccer", "basketball", "baseball"}
_ALLOWED_CAPABILITIES = {
    "object-detection",
    "object-tracking",
    "athlete-reid",
    "sport-drill-recognition",
    "repetition-segmentation",
    "invalid-attempt",
    "planar-calibration",
    "physical-metric",
    "technique-rubric",
}
_REQUIRED_MODELS = {"person", "pose", "object", "reid"}

_VALID_SCHEMA_VERSIONS = {
    "athlemetry-cv-validation-v1",
    "athlemetry-cv-validation-v2",
}

_ALLOWED_OPTICAL_METHODS = {"two-phone-study"}

# Public constant so tests / consumers can reference the canonical version string.
OPTICAL_REFERENCE_SCHEMA_VERSION = "athlemetry-cv-validation-v2"


def _https_uri(value: Any) -> bool:
    if not isinstance(value, str) or not value.strip():
        return False
    parsed = urlparse(value)
    return parsed.scheme == "https" and bool(parsed.netloc)


def _mapping(value: Any) -> Mapping[str, Any]:
    return value if isinstance(value, Mapping) else {}


def validate_optical_reference(
    reference: Mapping[str, Any],
    prefix: str = "groundTruth",
) -> Tuple[str, ...]:
    """Validate a calibrated-high-speed-optical reference block.

    Required fields (all must be present and type-valid):
        method                  — exact ``"two-phone-study"``
        referenceFrameRate      — exactly 240
        measuredPitchSpanMeters — positive finite float
        calibrationDate         — non-empty ISO-date string
        calibrationReportUri    — HTTPS URI
        calibrationMethod       — non-empty string
        phoneModels             — list of ≥1 non-empty strings
        reviewers               — list of ≥2 distinct non-empty strings
    """
    errors: list[str] = []

    # method
    method = reference.get("method")
    if method not in _ALLOWED_OPTICAL_METHODS:
        errors.append(
            f"{prefix}.opticalReference.method must be one of: "
            f"{', '.join(sorted(_ALLOWED_OPTICAL_METHODS))}"
        )

    # referenceFrameRate
    fps = reference.get("referenceFrameRate")
    if fps != 240:
        errors.append(f"{prefix}.opticalReference.referenceFrameRate must be exactly 240")

    # measuredPitchSpanMeters
    span = reference.get("measuredPitchSpanMeters")
    if not isinstance(span, (int, float)) or isinstance(span, bool) or span <= 0:
        errors.append(f"{prefix}.opticalReference.measuredPitchSpanMeters must be a positive number")

    # calibrationDate
    cal_date = reference.get("calibrationDate")
    if not isinstance(cal_date, str) or not cal_date.strip():
        errors.append(f"{prefix}.opticalReference.calibrationDate is required")

    # calibrationReportUri
    if not _https_uri(reference.get("calibrationReportUri")):
        errors.append(f"{prefix}.opticalReference.calibrationReportUri must be an HTTPS URI")

    # calibrationMethod
    cal_method = reference.get("calibrationMethod")
    if not isinstance(cal_method, str) or not cal_method.strip():
        errors.append(f"{prefix}.opticalReference.calibrationMethod is required")

    # phoneModels
    phone_models = reference.get("phoneModels")
    if (
        not isinstance(phone_models, list)
        or not phone_models
        or any(not isinstance(item, str) or not item.strip() for item in phone_models)
    ):
        errors.append(
            f"{prefix}.opticalReference.phoneModels must be a non-empty list of non-empty strings"
        )

    # reviewers
    reviewers = reference.get("reviewers")
    if (
        not isinstance(reviewers, list)
        or len(reviewers) < 2
        or any(not isinstance(item, str) or not item.strip() for item in reviewers)
        or len(set(reviewers)) != len(reviewers)
    ):
        errors.append(
            f"{prefix}.opticalReference.reviewers must contain at least two distinct reviewers"
        )

    return tuple(errors)


def validate_validation_manifest(manifest: Mapping[str, Any]) -> Tuple[str, ...]:
    errors: list[str] = []
    version = manifest.get("schemaVersion")

    # ── schema version dispatch ──────────────────────────────────────────────
    if version not in _VALID_SCHEMA_VERSIONS:
        errors.append(
            f"schemaVersion must be one of: {', '.join(sorted(_VALID_SCHEMA_VERSIONS))}"
        )
        # Fail fast: without a known version we cannot reason about required fields.
        return tuple(errors)

    # ── common study-level validation (all versions) ─────────────────────────
    if not isinstance(manifest.get("studyId"), str) or not manifest["studyId"].strip():
        errors.append("studyId is required")
    if not isinstance(manifest.get("analyzerVersion"), str) or not manifest["analyzerVersion"].strip():
        errors.append("analyzerVersion is required")
    if manifest.get("independentlyReviewed") is not True:
        errors.append("independentlyReviewed must be true")

    model_artifacts = _mapping(manifest.get("modelArtifacts"))
    if set(model_artifacts) != _REQUIRED_MODELS:
        errors.append("modelArtifacts must contain exactly person, pose, object, and reid")
    for name in sorted(_REQUIRED_MODELS & set(model_artifacts)):
        artifact = _mapping(model_artifacts[name])
        if not isinstance(artifact.get("sha256"), str) or not _SHA256.fullmatch(artifact["sha256"]):
            errors.append(f"modelArtifacts.{name}.sha256 must be a lowercase SHA-256")
        if not _https_uri(artifact.get("sourceUri")):
            errors.append(f"modelArtifacts.{name}.sourceUri must be an HTTPS URI")

    protocol_versions = _mapping(manifest.get("protocolVersions"))
    clips = manifest.get("clips")
    if not isinstance(clips, list) or not clips:
        return tuple(errors + ["clips must be a non-empty array"])

    for index, raw_clip in enumerate(clips):
        prefix = f"clips[{index}]"
        clip = _mapping(raw_clip)
        sport = clip.get("sport")
        drill = clip.get("drill")
        if sport not in _ALLOWED_SPORTS:
            errors.append(f"{prefix}.sport is unsupported")
        if not isinstance(drill, str) or not drill.strip():
            errors.append(f"{prefix}.drill is required")
        elif not isinstance(protocol_versions.get(drill), str) or not protocol_versions[drill].strip():
            errors.append(f"{prefix}.drill must have an exact protocolVersions entry")
        for field in ("mediaSha256", "annotationSha256"):
            value = clip.get(field)
            if not isinstance(value, str) or not _SHA256.fullmatch(value):
                errors.append(f"{prefix}.{field} must be a lowercase SHA-256")

        release = _mapping(clip.get("participantRelease"))
        if release.get("status") != "SIGNED":
            errors.append(f"{prefix}.participantRelease.status must be SIGNED")
        age_category = release.get("ageCategory")
        if age_category not in {"adult", "minor"}:
            errors.append(f"{prefix}.participantRelease.ageCategory must be adult or minor")
        if not _https_uri(release.get("releaseUri")):
            errors.append(f"{prefix}.participantRelease.releaseUri must be an HTTPS URI")
        if age_category == "minor" and not _https_uri(release.get("guardianReleaseUri")):
            errors.append(f"{prefix}.participantRelease.guardianReleaseUri must be an HTTPS URI for minors")

        capture = _mapping(clip.get("capture"))
        if not isinstance(capture.get("deviceModel"), str) or not capture["deviceModel"].strip():
            errors.append(f"{prefix}.capture.deviceModel is required")
        fps = capture.get("fps")
        if not isinstance(fps, (int, float)) or isinstance(fps, bool) or fps <= 0 or fps > 1000:
            errors.append(f"{prefix}.capture.fps must be finite and positive")
        if not isinstance(capture.get("cameraAngle"), str) or not capture["cameraAngle"].strip():
            errors.append(f"{prefix}.capture.cameraAngle is required")
        if not isinstance(capture.get("environment"), str) or not capture["environment"].strip():
            errors.append(f"{prefix}.capture.environment is required")

        ground_truth = _mapping(clip.get("groundTruth"))
        if not _https_uri(ground_truth.get("annotationUri")):
            errors.append(f"{prefix}.groundTruth.annotationUri must be an HTTPS URI")
        reviewers = ground_truth.get("reviewedBy")
        if (
            not isinstance(reviewers, list)
            or len(reviewers) < 2
            or any(not isinstance(item, str) or not item.strip() for item in reviewers)
            or len(set(reviewers)) != len(reviewers)
        ):
            errors.append(f"{prefix}.groundTruth.reviewedBy must contain at least two distinct reviewers")

        capabilities = clip.get("capabilities")
        if not isinstance(capabilities, list) or not capabilities:
            errors.append(f"{prefix}.capabilities must be a non-empty array")
            capabilities = []
        elif len(set(capabilities)) != len(capabilities) or any(item not in _ALLOWED_CAPABILITIES for item in capabilities):
            errors.append(f"{prefix}.capabilities contains duplicates or unsupported values")
        if "physical-metric" in capabilities:
            equipment = ground_truth.get("equipment")
            if ground_truth.get("synchronized") is not True or not isinstance(equipment, list) or not equipment:
                errors.append(f"{prefix}.groundTruth requires synchronized equipment for physical-metric validation")

        # ── version-specific: calibrated-high-speed-optical (v2 only) ──────
        equipment = ground_truth.get("equipment")
        if version == "athlemetry-cv-validation-v1":
            if isinstance(equipment, list) and "calibrated-high-speed-optical" in equipment:
                errors.append(
                    f"{prefix}.groundTruth.equipment calibrated-high-speed-optical "
                    "requires athlemetry-cv-validation-v2"
                )
        else:
            if isinstance(equipment, list) and "calibrated-high-speed-optical" in equipment:
                optical_ref = _mapping(ground_truth.get("opticalReference"))
                if not optical_ref:
                    errors.append(
                        f"{prefix}.groundTruth.opticalReference is required "
                        "when equipment includes calibrated-high-speed-optical"
                    )
                else:
                    errors.extend(validate_optical_reference(optical_ref, prefix))

    return tuple(errors)
