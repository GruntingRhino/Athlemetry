"""
export.py — Export pipeline results to JSON, CSV, and human-readable coach reports.

All ESTIMATE values are explicitly marked in every output format.
"""

from __future__ import annotations

import csv
import json
import logging
import textwrap
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Optional

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schema imports (graceful fallback)
# ---------------------------------------------------------------------------
try:
    from schemas import AnalysisResult, FormMetric
except ImportError:
    try:
        from schemas import AnalysisResult, FormMetric
    except ImportError:
        logger.warning("export.py: schema import failed; stub mode active.")
        AnalysisResult = Any  # type: ignore
        FormMetric = Any  # type: ignore


# ---------------------------------------------------------------------------
# JSON export
# ---------------------------------------------------------------------------

def export_json(result: "AnalysisResult", output_dir: Path) -> Path:
    """
    Write the full AnalysisResult as a JSON file.

    Uses Pydantic's ``model_dump(mode='json')`` to ensure datetime/enum
    serialisation is handled correctly.

    File is named ``{run_id}_analysis.json``.

    Parameters
    ----------
    result:
        Complete AnalysisResult from the pipeline.
    output_dir:
        Directory in which to write the file (created if absent).

    Returns
    -------
    Path to the written JSON file.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    filename = f"{result.run_id}_analysis.json"
    output_path = output_dir / filename

    data = result.model_dump(mode="json")

    # Inject a top-level disclaimer so downstream consumers cannot miss it
    data["_disclaimer"] = (
        "Speed, angle, and trajectory values marked as ESTIMATE are derived from "
        "computer-vision pixel analysis and are NOT certified measurements.  "
        "Do not use as substitutes for radar guns, bat sensors, or other "
        "calibrated instruments."
    )
    data["_exported_at"] = datetime.now(tz=timezone.utc).isoformat()

    output_path.write_text(json.dumps(data, indent=2, default=str), encoding="utf-8")
    logger.info("JSON report written to %s", output_path)
    return output_path


# ---------------------------------------------------------------------------
# CSV summary export
# ---------------------------------------------------------------------------

def export_csv_summary(result: "AnalysisResult", output_dir: Path) -> Path:
    """
    Write a one-row CSV with key metrics.

    Columns
    -------
    player_id, run_id, video_fps, video_duration_sec,
    peak_swing_speed_mph_ESTIMATE, avg_swing_speed_mph_ESTIMATE,
    swing_speed_confidence, swing_speed_calibration_mode,
    overall_form_score, overall_form_confidence,
    head_stability_score, head_stability_confidence,
    stance_balance_score, stance_balance_confidence,
    hip_rotation_timing_score, hip_rotation_timing_confidence,
    stride_control_score, stride_control_confidence,
    hand_path_efficiency_score, hand_path_efficiency_confidence,
    follow_through_balance_score, follow_through_balance_confidence,
    contact_frame, contact_time_sec,
    module_statuses

    File is named ``{run_id}_summary.csv``.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{result.run_id}_summary.csv"

    def _metric_pair(m: Optional[Any], prefix: str) -> dict:
        """Return {prefix_score, prefix_confidence} for a FormMetric or None."""
        if m is None:
            return {f"{prefix}_score": "", f"{prefix}_confidence": ""}
        return {
            f"{prefix}_score": m.score,
            f"{prefix}_confidence": m.confidence,
        }

    row: dict = {}

    # Identity
    row["player_id"] = result.input.player_id or ""
    row["run_id"]    = result.run_id

    # Video metadata
    if result.video_metadata:
        row["video_fps"]          = result.video_metadata.fps
        row["video_duration_sec"] = result.video_metadata.duration_seconds
    else:
        row["video_fps"] = row["video_duration_sec"] = ""

    # Swing speed (all speed values are explicitly labelled ESTIMATE)
    if result.swing_speed:
        ss = result.swing_speed
        row["peak_swing_speed_mph_ESTIMATE"] = ss.peak_speed_mph if ss.peak_speed_mph is not None else ""
        row["avg_swing_speed_mph_ESTIMATE"]  = ss.average_speed_mph if ss.average_speed_mph is not None else ""
        row["swing_speed_confidence"]        = ss.confidence
        row["swing_speed_calibration_mode"]  = ss.calibration_mode
    else:
        row["peak_swing_speed_mph_ESTIMATE"] = ""
        row["avg_swing_speed_mph_ESTIMATE"]  = ""
        row["swing_speed_confidence"]        = ""
        row["swing_speed_calibration_mode"]  = ""

    # Form scores
    if result.form_scores:
        fs = result.form_scores
        row["overall_form_score"]      = fs.overall_score if fs.overall_score is not None else ""
        row["overall_form_confidence"] = fs.overall_confidence
        row.update(_metric_pair(fs.head_stability,        "head_stability"))
        row.update(_metric_pair(fs.stance_balance,        "stance_balance"))
        row.update(_metric_pair(fs.hip_rotation_timing,   "hip_rotation_timing"))
        row.update(_metric_pair(fs.stride_control,        "stride_control"))
        row.update(_metric_pair(fs.hand_path_efficiency,  "hand_path_efficiency"))
        row.update(_metric_pair(fs.follow_through_balance, "follow_through_balance"))
    else:
        row["overall_form_score"]      = ""
        row["overall_form_confidence"] = ""
        for key in ["head_stability", "stance_balance", "hip_rotation_timing",
                    "stride_control", "hand_path_efficiency", "follow_through_balance"]:
            row[f"{key}_score"]      = ""
            row[f"{key}_confidence"] = ""

    # Contact event
    if result.swing_phases:
        row["contact_frame"]    = result.swing_phases.likely_contact_frame or ""
        row["contact_time_sec"] = result.swing_phases.likely_contact_time_sec or ""
    else:
        row["contact_frame"] = row["contact_time_sec"] = ""

    # Module statuses (semicolon-separated key=value pairs)
    row["module_statuses"] = "; ".join(
        f"{k}={v}" for k, v in result.module_status.items()
    )

    with output_path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=list(row.keys()))
        writer.writeheader()
        writer.writerow(row)

    logger.info("CSV summary written to %s", output_path)
    return output_path


# ---------------------------------------------------------------------------
# Human-readable coach report
# ---------------------------------------------------------------------------

_SEPARATOR = "=" * 72
_THIN_SEP  = "-" * 72


def _fmt_score(score: Optional[float]) -> str:
    if score is None:
        return "N/A"
    return f"{score:.3f} / 1.000  ({score * 100:.1f}%)"


def _fmt_confidence(conf: Optional[float]) -> str:
    if conf is None:
        return "N/A"
    label = "HIGH" if conf >= 0.70 else ("MEDIUM" if conf >= 0.40 else "LOW")
    return f"{conf:.0%}  [{label}]"


def _fmt_metric_section(metric: Optional[Any], title: str) -> str:
    """Format a single FormMetric as a report sub-section."""
    if metric is None:
        return f"  {title}: NOT COMPUTED\n"

    lines = [
        f"  {title}",
        f"    Score      : {_fmt_score(metric.score)}",
        f"    Confidence : {_fmt_confidence(metric.confidence)}",
        f"    Rationale  : {metric.rationale}",
    ]
    if metric.issues:
        lines.append("    Issues     :")
        for issue in metric.issues:
            lines.append(f"      • {issue}")
    if metric.suggestions:
        lines.append("    Suggestions:")
        for sug in metric.suggestions:
            lines.append(f"      → {sug}")
    return "\n".join(lines) + "\n"


def _wrap(text: str, width: int = 68, indent: str = "  ") -> str:
    """Wrap long text to *width* with *indent*."""
    return textwrap.fill(text, width=width, initial_indent=indent, subsequent_indent=indent)


def export_coach_report(result: "AnalysisResult", output_dir: Path) -> Path:
    """
    Write a human-readable plain-text coaching report.

    Sections
    --------
    1. Header & Disclaimer
    2. Video Information
    3. Swing Metrics  (with explicit ESTIMATE labels)
    4. Form Analysis  (per-metric breakdown)
    5. LLM Coaching Feedback  (if available)
    6. Module Status

    File is named ``{run_id}_coach_report.txt``.

    Parameters
    ----------
    result:
        Complete AnalysisResult.
    output_dir:
        Output directory (created if absent).

    Returns
    -------
    Path to the written report file.
    """
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)
    output_path = output_dir / f"{result.run_id}_coach_report.txt"

    lines: list[str] = []

    def _h1(text: str) -> None:
        lines.extend([_SEPARATOR, f"  {text}", _SEPARATOR, ""])

    def _h2(text: str) -> None:
        lines.extend([_THIN_SEP, f"  {text}", ""])

    def _p(text: str, prefix: str = "  ") -> None:
        lines.append(f"{prefix}{text}")

    def _blank() -> None:
        lines.append("")

    # -----------------------------------------------------------------------
    # Header
    # -----------------------------------------------------------------------
    _h1("ATHLEMETRY — BASEBALL SWING ANALYSIS REPORT")
    _p(f"Run ID    : {result.run_id}")
    _p(f"Player ID : {result.input.player_id or 'N/A'}")
    _p(f"Generated : {datetime.now(tz=timezone.utc).strftime('%Y-%m-%d %H:%M:%S UTC')}")
    _p(f"Video     : {result.input.video_path}")
    _blank()

    # Disclaimer
    lines.append("  *** IMPORTANT DISCLAIMER ***")
    lines.append(
        _wrap(
            "All speed, angle, and trajectory values marked [ESTIMATE] are derived "
            "from computer-vision pixel analysis.  They are NOT certified measurements "
            "and should NOT be used as substitutes for radar guns, bat sensors, or "
            "other calibrated instruments.  Treat all numeric estimates as approximate "
            "guides only.",
            indent="  ",
        )
    )
    _blank()

    # -----------------------------------------------------------------------
    # Section 1: Video Information
    # -----------------------------------------------------------------------
    _h2("1. VIDEO INFORMATION")
    if result.video_metadata:
        vm = result.video_metadata
        _p(f"Resolution  : {vm.width} × {vm.height} px")
        _p(f"Frame Rate  : {vm.fps:.2f} fps")
        _p(f"Duration    : {vm.duration_seconds:.2f} sec  ({vm.total_frames} frames)")
        _p(f"Codec       : {vm.codec or 'unknown'}")
    else:
        _p("Video metadata not available.")

    _blank()
    _p(f"Camera View  : {result.input.camera_view or 'unknown'}")
    _p(f"Handedness   : {result.input.handedness or 'not specified'}")
    _p(f"Player Height: {result.input.player_height_inches or 'not provided'} inches")
    _p(f"Bat Length   : {result.input.bat_length_inches or 'not provided'} inches")
    _blank()

    # -----------------------------------------------------------------------
    # Section 2: Swing Metrics
    # -----------------------------------------------------------------------
    _h2("2. SWING METRICS")

    # Swing speed (always labelled ESTIMATE)
    _p("[ SWING SPEED — ALL VALUES ARE ESTIMATES ]")
    if result.swing_speed:
        ss = result.swing_speed
        peak = f"{ss.peak_speed_mph:.1f} mph" if ss.peak_speed_mph is not None else "N/A"
        avg  = f"{ss.average_speed_mph:.1f} mph" if ss.average_speed_mph is not None else "N/A"
        band = (
            f"[{ss.confidence_band_mph[0]:.1f} – {ss.confidence_band_mph[1]:.1f} mph]"
            if ss.confidence_band_mph
            else "N/A"
        )
        _p(f"  Peak Speed [ESTIMATE]   : {peak}")
        _p(f"  Average Speed [ESTIMATE]: {avg}")
        _p(f"  Confidence Band         : {band}")
        _p(f"  Confidence              : {_fmt_confidence(ss.confidence)}")
        _p(f"  Calibration Mode        : {ss.calibration_mode}")
        _p(f"  Pixels per Inch         : {ss.pixels_per_inch or 'N/A'}")
        _blank()
        _p(
            _wrap(
                f"Estimation method: {ss.estimation_method}",
                indent="  ",
            )
        )
    else:
        _p("  Swing speed not computed.")
    _blank()

    # Ball trajectory descriptors
    _p("[ BALL TRAJECTORY ]")
    if result.ball_trajectory:
        bt = result.ball_trajectory
        _p(f"  Tracking Method : {bt.tracking_method}")
        _p(f"  Confidence      : {_fmt_confidence(bt.confidence)}")
        _p(f"  Points Detected : {len(bt.points)}")
        if bt.notes:
            _p("  Notes           :")
            for note in bt.notes:
                _p(f"    • {note}")
    else:
        _p("  Ball trajectory not available.")
    _blank()

    # Swing phase timing
    _p("[ SWING PHASE TIMING ]")
    if result.swing_phases:
        sp = result.swing_phases
        _p(f"  Contact Frame   : {sp.likely_contact_frame or 'N/A'}")
        _p(f"  Contact Time    : {sp.likely_contact_time_sec or 'N/A'} sec")
        _p(f"  Method          : {sp.segmentation_method}")
        _p(f"  Confidence      : {_fmt_confidence(sp.confidence)}")
        _blank()
        _p("  Phase breakdown:")
        for phase in sp.phases:
            duration_ms = (phase.end_time_sec - phase.start_time_sec) * 1000.0
            _p(
                f"    {phase.label:<20}  "
                f"frames {phase.start_frame:>4}–{phase.end_frame:<4}  "
                f"({duration_ms:.0f} ms)  "
                f"conf {phase.confidence:.0%}"
            )
    else:
        _p("  Swing phase segmentation not available.")
    _blank()

    # -----------------------------------------------------------------------
    # Section 3: Form Analysis
    # -----------------------------------------------------------------------
    _h2("3. FORM ANALYSIS  [CV-derived, rule-based — no LLM]")

    if result.form_scores:
        fs = result.form_scores
        _p(f"Overall Score      : {_fmt_score(fs.overall_score)}")
        _p(f"Overall Confidence : {_fmt_confidence(fs.overall_confidence)}")
        _blank()

        for metric, title in [
            (fs.head_stability,        "Head Stability"),
            (fs.stance_balance,        "Stance Balance"),
            (fs.hip_rotation_timing,   "Hip Rotation Timing"),
            (fs.stride_control,        "Stride Control"),
            (fs.hand_path_efficiency,  "Hand Path Efficiency"),
            (fs.follow_through_balance,"Follow-Through Balance"),
        ]:
            lines.append(_fmt_metric_section(metric, title))

        if fs.issues:
            _p("Key Issues (aggregated):")
            for issue in fs.issues:
                _p(f"  • {issue}")
            _blank()

        if fs.suggestions:
            _p("Coaching Suggestions (aggregated):")
            for sug in fs.suggestions:
                _p(f"  → {sug}")
    else:
        _p("Form scores not available.")
    _blank()

    # -----------------------------------------------------------------------
    # Section 4: LLM Coaching Feedback
    # -----------------------------------------------------------------------
    _h2("4. LLM COACHING FEEDBACK  (Ollama)")

    if result.ollama_feedback:
        fb = result.ollama_feedback
        _p(f"Model             : {fb.model_used or 'unknown'}")
        _p(f"Generation Time   : {fb.generation_time_sec:.2f} sec" if fb.generation_time_sec else "  Generation Time   : N/A")
        _blank()

        _p("Summary:")
        _p(_wrap(fb.summary, indent="  "))
        _blank()

        _p("Mechanical Strengths:")
        for s in fb.mechanical_strengths:
            _p(f"  + {s}")
        _blank()

        _p("Mechanical Weaknesses:")
        for w in fb.mechanical_weaknesses:
            _p(f"  - {w}")
        _blank()

        _p("Top 3 Priorities:")
        for i, pri in enumerate(fb.top_3_priorities, 1):
            _p(f"  {i}. {pri}")
        _blank()

        _p("Suggested Drills:")
        for d in fb.suggested_drills:
            _p(f"  • {d}")
        _blank()

        _p("Confidence Caveats:")
        for c in fb.confidence_caveats:
            _p(f"  ! {c}")
    else:
        _p("LLM feedback not generated (Ollama disabled or unavailable).")
    _blank()

    # -----------------------------------------------------------------------
    # Section 5: Module Status
    # -----------------------------------------------------------------------
    _h2("5. MODULE STATUS")
    if result.module_status:
        for module, status in result.module_status.items():
            error = result.module_errors.get(module, "")
            status_str = status.upper()
            line = f"  {module:<35} {status_str}"
            if error:
                line += f"  [{error[:60]}]"
            _p(line)
    else:
        _p("  No module status information recorded.")

    if result.pipeline_duration_sec is not None:
        _blank()
        _p(f"Total Pipeline Duration: {result.pipeline_duration_sec:.2f} seconds")

    _blank()
    lines.append(_SEPARATOR)
    lines.append("  End of Report")
    lines.append(_SEPARATOR)

    report_text = "\n".join(lines)
    output_path.write_text(report_text, encoding="utf-8")
    logger.info("Coach report written to %s", output_path)
    return output_path
