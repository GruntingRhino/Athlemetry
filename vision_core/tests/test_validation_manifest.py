from vision_core.validation_manifest import (
    OPTICAL_REFERENCE_SCHEMA_VERSION,
    validate_optical_reference,
    validate_validation_manifest,
)


def valid_manifest(schema_version="athlemetry-cv-validation-v1"):
    return {
        "schemaVersion": schema_version,
        "studyId": "study-2026-001",
        "analyzerVersion": "vision-v3",
        "independentlyReviewed": True,
        "modelArtifacts": {
            name: {"sha256": character * 64, "sourceUri": f"https://models.example.test/{name}"}
            for name, character in (("person", "1"), ("pose", "2"), ("object", "3"), ("reid", "4"))
        },
        "protocolVersions": {"baseball-pitch-velocity": "1.0.0"},
        "clips": [{
            "clipId": "clip-001",
            "sport": "baseball",
            "drill": "baseball-pitch-velocity",
            "mediaSha256": "a" * 64,
            "annotationSha256": "b" * 64,
            "participantRelease": {
                "status": "SIGNED",
                "ageCategory": "adult",
                "releaseUri": "https://evidence.example.test/releases/clip-001",
            },
            "capture": {
                "deviceModel": "phone-model-a",
                "fps": 120,
                "cameraAngle": "behind-catcher",
                "environment": "outdoor-daylight",
            },
            "groundTruth": {
                "annotationUri": "https://evidence.example.test/annotations/clip-001.json",
                "reviewedBy": ["reviewer-1", "reviewer-2"],
                "synchronized": True,
                "equipment": ["calibrated-doppler-radar", "high-speed-reference-camera"],
            },
            "capabilities": ["object-tracking", "athlete-reid", "repetition-segmentation", "invalid-attempt", "physical-metric"],
        }],
    }


def _optical_equipment_ground_truth(**overrides):
    """Build a groundTruth block with calibrated-high-speed-optical equipment."""
    gt = {
        "annotationUri": "https://evidence.example.test/annotations/clip-001.json",
        "reviewedBy": ["reviewer-1", "reviewer-2"],
        "synchronized": True,
        "equipment": ["calibrated-high-speed-optical"],
        "opticalReference": {
            "method": "two-phone-study",
            "referenceFrameRate": 240,
            "measuredPitchSpanMeters": 18.44,
            "calibrationDate": "2026-06-15",
            "calibrationReportUri": "https://evidence.example.test/calibration/report.pdf",
            "calibrationMethod": "known-distance-markers",
            "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
            "reviewers": ["reviewer-1", "reviewer-2"],
        },
    }
    gt.update(overrides)
    return gt


def v2_optical_manifest(**gt_overrides):
    """Build a v2 manifest with calibrated-high-speed-optical reference."""
    m = valid_manifest(schema_version="athlemetry-cv-validation-v2")
    m["clips"][0]["groundTruth"] = _optical_equipment_ground_truth(**gt_overrides)
    return m


def test_validation_manifest_accepts_permissioned_independently_reviewed_ground_truth():
    assert validate_validation_manifest(valid_manifest()) == ()


def test_validation_manifest_rejects_missing_consent_and_independent_reviewers():
    manifest = valid_manifest()
    manifest["clips"][0]["participantRelease"]["status"] = "MISSING"
    manifest["clips"][0]["groundTruth"]["reviewedBy"] = ["reviewer-1", "reviewer-1"]
    errors = validate_validation_manifest(manifest)
    assert "clips[0].participantRelease.status must be SIGNED" in errors
    assert "clips[0].groundTruth.reviewedBy must contain at least two distinct reviewers" in errors


def test_validation_manifest_requires_guardian_release_for_minors_and_equipment_for_physical_metrics():
    manifest = valid_manifest()
    release = manifest["clips"][0]["participantRelease"]
    release["ageCategory"] = "minor"
    manifest["clips"][0]["groundTruth"]["equipment"] = []
    errors = validate_validation_manifest(manifest)
    assert "clips[0].participantRelease.guardianReleaseUri must be an HTTPS URI for minors" in errors
    assert "clips[0].groundTruth requires synchronized equipment for physical-metric validation" in errors


# ── calibrated-high-speed-optical (two-phone study) ─────────────────────────


def test_validation_manifest_accepts_calibrated_high_speed_optical_v2():
    """A v2 manifest with valid calibrated-high-speed-optical equipment must pass."""
    manifest = v2_optical_manifest()
    assert validate_validation_manifest(manifest) == ()


def test_validation_manifest_rejects_optical_reference_in_v1():
    """A v1 manifest must not silently accept a v2-only reference source."""
    manifest = v2_optical_manifest()
    manifest["schemaVersion"] = "athlemetry-cv-validation-v1"
    errors = validate_validation_manifest(manifest)
    assert any("requires athlemetry-cv-validation-v2" in error for error in errors)


def test_validation_manifest_rejects_missing_optical_reference_block():
    """calibrated-high-speed-optical without an opticalReference block must fail."""
    manifest = v2_optical_manifest()
    del manifest["clips"][0]["groundTruth"]["opticalReference"]
    errors = validate_validation_manifest(manifest)
    assert any("opticalReference" in e or "missing" in e.lower() for e in errors)


def test_validation_manifest_rejects_optical_reference_wrong_frame_rate():
    """opticalReference.referenceFrameRate must be exactly 240."""
    manifest = v2_optical_manifest(opticalReference={
        "method": "two-phone-study",
        "referenceFrameRate": 120,
        "measuredPitchSpanMeters": 18.44,
        "calibrationDate": "2026-06-15",
        "calibrationReportUri": "https://evidence.example.test/calibration/report.pdf",
        "calibrationMethod": "known-distance-markers",
        "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
        "reviewers": ["reviewer-1", "reviewer-2"],
    })
    errors = validate_validation_manifest(manifest)
    assert any("referenceFrameRate" in e for e in errors)


def test_validation_manifest_rejects_optical_reference_missing_calibration_uri():
    """opticalReference.calibrationReportUri must be an HTTPS URI."""
    manifest = v2_optical_manifest(opticalReference={
        "method": "two-phone-study",
        "referenceFrameRate": 240,
        "measuredPitchSpanMeters": 18.44,
        "calibrationDate": "2026-06-15",
        "calibrationReportUri": "/local/path/report.pdf",
        "calibrationMethod": "known-distance-markers",
        "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
        "reviewers": ["reviewer-1", "reviewer-2"],
    })
    errors = validate_validation_manifest(manifest)
    assert any("calibrationReportUri" in e for e in errors)


def test_validation_manifest_rejects_optical_reference_insufficient_reviewers():
    """opticalReference.reviewers must have at least 2 distinct reviewers."""
    manifest = v2_optical_manifest(opticalReference={
        "method": "two-phone-study",
        "referenceFrameRate": 240,
        "measuredPitchSpanMeters": 18.44,
        "calibrationDate": "2026-06-15",
        "calibrationReportUri": "https://evidence.example.test/calibration/report.pdf",
        "calibrationMethod": "known-distance-markers",
        "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
        "reviewers": ["reviewer-1"],
    })
    errors = validate_validation_manifest(manifest)
    assert any("reviewers" in e for e in errors)


def test_validation_manifest_rejects_optical_reference_missing_pitch_span():
    """opticalReference.measuredPitchSpanMeters is required and must be a positive float."""
    manifest = v2_optical_manifest(opticalReference={
        "method": "two-phone-study",
        "referenceFrameRate": 240,
        "calibrationDate": "2026-06-15",
        "calibrationReportUri": "https://evidence.example.test/calibration/report.pdf",
        "calibrationMethod": "known-distance-markers",
        "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
        "reviewers": ["reviewer-1", "reviewer-2"],
    })
    errors = validate_validation_manifest(manifest)
    assert any("measuredPitchSpanMeters" in e for e in errors)


def test_validation_manifest_rejects_optical_reference_invalid_method():
    """opticalReference.method must be 'two-phone-study'."""
    manifest = v2_optical_manifest(opticalReference={
        "method": "single-phone-estimate",
        "referenceFrameRate": 240,
        "measuredPitchSpanMeters": 18.44,
        "calibrationDate": "2026-06-15",
        "calibrationReportUri": "https://evidence.example.test/calibration/report.pdf",
        "calibrationMethod": "known-distance-markers",
        "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
        "reviewers": ["reviewer-1", "reviewer-2"],
    })
    errors = validate_validation_manifest(manifest)
    assert any("method" in e for e in errors)


def test_validation_manifest_rejects_optical_reference_negative_pitch_span():
    """measuredPitchSpanMeters must be positive."""
    manifest = v2_optical_manifest(opticalReference={
        "method": "two-phone-study",
        "referenceFrameRate": 240,
        "measuredPitchSpanMeters": -1.0,
        "calibrationDate": "2026-06-15",
        "calibrationReportUri": "https://evidence.example.test/calibration/report.pdf",
        "calibrationMethod": "known-distance-markers",
        "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
        "reviewers": ["reviewer-1", "reviewer-2"],
    })
    errors = validate_validation_manifest(manifest)
    assert any("measuredPitchSpanMeters" in e for e in errors)


def test_validate_optical_reference_unit():
    """Direct unit test of validate_optical_reference with known good and bad inputs."""
    good = {
        "method": "two-phone-study",
        "referenceFrameRate": 240,
        "measuredPitchSpanMeters": 18.44,
        "calibrationDate": "2026-06-15",
        "calibrationReportUri": "https://evidence.example.test/calibration/report.pdf",
        "calibrationMethod": "known-distance-markers",
        "phoneModels": ["iPhone-15-Pro", "iPhone-15-Pro"],
        "reviewers": ["reviewer-1", "reviewer-2"],
    }
    assert validate_optical_reference(good, "clips[0].groundTruth") == ()

    bad = {}
    errors = validate_optical_reference(bad, "clips[0].groundTruth")
    assert len(errors) >= 4  # several required fields absent
