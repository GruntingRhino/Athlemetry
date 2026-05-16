"""
llm_feedback.py — Ollama-backed coaching feedback generation.

Architecture
------------
1. ``build_ollama_prompt``  — serialise CV metrics → structured prompt
2. ``call_ollama``          — HTTP call to local Ollama instance
3. ``parse_ollama_response`` — JSON extraction with free-text fallback
4. ``generate_feedback``    — orchestrates 1-3, returns OllamaFeedback

The CV/math scoring pipeline runs BEFORE this module.  Ollama receives
structured metric data and is asked to provide textual coaching context
only — it does NOT compute any numeric scores.
"""

from __future__ import annotations

import json
import logging
import time
from typing import Any, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schema / config imports (graceful fallback)
# ---------------------------------------------------------------------------
try:
    from schemas import AnalysisResult, OllamaFeedback
    from config import OllamaConfig
except ImportError:
    try:
        from schemas import AnalysisResult, OllamaFeedback
        from config import OllamaConfig
    except ImportError:
        logger.warning("llm_feedback.py: schema/config import failed; stub mode active.")
        AnalysisResult = Any  # type: ignore
        OllamaFeedback = Any  # type: ignore
        OllamaConfig = Any  # type: ignore

# ---------------------------------------------------------------------------
# Ollama client import (optional dependency)
# ---------------------------------------------------------------------------
try:
    import ollama as _ollama_lib  # type: ignore
    _OLLAMA_AVAILABLE = True
except ImportError:
    _ollama_lib = None
    _OLLAMA_AVAILABLE = False
    logger.info("ollama Python package not installed; LLM feedback will be unavailable.")


# ---------------------------------------------------------------------------
# Prompt construction
# ---------------------------------------------------------------------------

_SYSTEM_INSTRUCTIONS = """\
You are an expert baseball hitting coach with deep knowledge of biomechanics.
You have received structured, computer-vision-derived metrics from a swing analysis.
Your task is to provide specific, actionable coaching feedback grounded in these metrics.

Rules:
- Base all feedback ONLY on the provided metrics — do not invent data.
- Be specific: reference actual numbers, not generic statements.
- Prioritise the most impactful issues first.
- Respond ONLY in valid JSON with exactly these keys:
    {
      "summary": "<2-3 sentence overview of this swing>",
      "mechanical_strengths": ["<strength 1>", "..."],
      "mechanical_weaknesses": ["<weakness 1>", "..."],
      "top_3_priorities": ["<most important fix>", "<second>", "<third>"],
      "suggested_drills": ["<drill 1>", "..."],
      "confidence_caveats": ["<caveat about estimate quality>", "..."]
    }
- Do NOT include any text outside the JSON object.
- The confidence_caveats must acknowledge that speed/angle values are ESTIMATES
  derived from video analysis and not certified measurements.
"""


def build_ollama_prompt(result: "AnalysisResult") -> str:
    """
    Serialise key CV metrics from *result* into a structured prompt.

    The prompt contains:
    - System instructions (role + output format)
    - A ``metrics_data`` JSON block with all available pipeline outputs
    - An explicit reminder that speed values are estimates

    Returns the full prompt string to pass to Ollama.
    """
    metrics: dict = {}

    # --- Video context ---
    if result.video_metadata:
        vm = result.video_metadata
        metrics["video"] = {
            "fps": vm.fps,
            "resolution": f"{vm.width}x{vm.height}",
            "duration_seconds": vm.duration_seconds,
        }

    # --- Swing speed ---
    if result.swing_speed:
        ss = result.swing_speed
        metrics["swing_speed_ESTIMATE"] = {
            "peak_speed_mph": ss.peak_speed_mph,
            "average_speed_mph": ss.average_speed_mph,
            "confidence": ss.confidence,
            "confidence_band_mph": (
                list(ss.confidence_band_mph) if ss.confidence_band_mph else None
            ),
            "calibration_mode": ss.calibration_mode,
            "estimation_method": ss.estimation_method,
            "is_estimate": True,
            "WARNING": "This speed is derived from pixel analysis, NOT a radar/sensor measurement.",
        }

    # --- Swing phases ---
    if result.swing_phases:
        sp = result.swing_phases
        metrics["swing_segmentation"] = {
            "contact_frame": sp.likely_contact_frame,
            "contact_time_sec": sp.likely_contact_time_sec,
            "segmentation_confidence": sp.confidence,
            "phases": [
                {
                    "label": p.label,
                    "start_frame": p.start_frame,
                    "end_frame": p.end_frame,
                    "duration_frames": p.end_frame - p.start_frame,
                    "confidence": p.confidence,
                }
                for p in sp.phases
            ],
        }

    # --- Form scores ---
    if result.form_scores:
        fs = result.form_scores

        def _metric_dict(m: Any) -> Optional[dict]:
            if m is None:
                return None
            return {
                "score": m.score,
                "confidence": m.confidence,
                "rationale": m.rationale,
                "issues": m.issues,
                "suggestions": m.suggestions,
            }

        metrics["form_scores"] = {
            "overall_score": fs.overall_score,
            "overall_confidence": fs.overall_confidence,
            "head_stability": _metric_dict(fs.head_stability),
            "stance_balance": _metric_dict(fs.stance_balance),
            "hip_rotation_timing": _metric_dict(fs.hip_rotation_timing),
            "stride_control": _metric_dict(fs.stride_control),
            "hand_path_efficiency": _metric_dict(fs.hand_path_efficiency),
            "follow_through_balance": _metric_dict(fs.follow_through_balance),
            "aggregated_issues": fs.issues,
            "aggregated_suggestions": fs.suggestions,
        }

    # --- Ball trajectory ---
    if result.ball_trajectory:
        bt = result.ball_trajectory
        metrics["ball_trajectory"] = {
            "tracking_method": bt.tracking_method,
            "tracking_confidence": bt.confidence,
            "total_points": len(bt.points),
            "notes": bt.notes,
        }

    # --- Player context ---
    inp = result.input
    metrics["player_context"] = {
        "player_id": inp.player_id,
        "handedness": inp.handedness,
        "camera_view": inp.camera_view,
        "player_height_inches": inp.player_height_inches,
        "bat_length_inches": inp.bat_length_inches,
    }

    metrics_json = json.dumps(metrics, indent=2, default=str)

    prompt = (
        f"{_SYSTEM_INSTRUCTIONS}\n\n"
        f"### SWING ANALYSIS METRICS\n\n"
        f"```json\n{metrics_json}\n```\n\n"
        f"### YOUR COACHING RESPONSE (JSON only):\n"
    )
    return prompt


# ---------------------------------------------------------------------------
# Ollama API call
# ---------------------------------------------------------------------------

def call_ollama(prompt: str, config: "OllamaConfig") -> Tuple[str, float]:
    """
    Send *prompt* to the local Ollama instance and return the response text.

    Parameters
    ----------
    prompt:
        The full prompt string (system instructions + data).
    config:
        OllamaConfig with host, model, timeout_seconds, temperature, max_tokens.

    Returns
    -------
    (response_text, duration_sec)
        response_text is the raw string returned by the model.
        duration_sec is wall-clock time for the API call.

    Raises
    ------
    Does NOT raise — all errors are caught and re-raised as RuntimeError
    with a descriptive message that the caller can log.
    """
    if not _OLLAMA_AVAILABLE:
        raise RuntimeError(
            "The 'ollama' Python package is not installed. "
            "Install it with: pip install ollama"
        )

    t_start = time.monotonic()

    try:
        client = _ollama_lib.Client(host=config.host)
        response = client.generate(
            model=config.model,
            prompt=prompt,
            options={
                "temperature": config.temperature,
                "num_predict": config.max_tokens,
            },
        )
        raw_text: str = response.get("response", "") if isinstance(response, dict) else str(response)
        duration = time.monotonic() - t_start
        logger.debug("Ollama call completed in %.2f s (%d chars)", duration, len(raw_text))
        return raw_text, duration

    except ConnectionRefusedError as exc:
        raise RuntimeError(
            f"Cannot connect to Ollama at {config.host}. "
            "Ensure Ollama is running (ollama serve)."
        ) from exc
    except TimeoutError as exc:
        raise RuntimeError(
            f"Ollama request timed out after {config.timeout_seconds}s."
        ) from exc
    except Exception as exc:
        # Catch-all: surface a clean error rather than crashing the pipeline
        raise RuntimeError(f"Ollama call failed: {exc}") from exc


# ---------------------------------------------------------------------------
# Response parsing
# ---------------------------------------------------------------------------

_REQUIRED_KEYS = [
    "summary",
    "mechanical_strengths",
    "mechanical_weaknesses",
    "top_3_priorities",
    "suggested_drills",
    "confidence_caveats",
]


def parse_ollama_response(raw: str) -> "OllamaFeedback":
    """
    Parse the raw Ollama response string into an :class:`OllamaFeedback` object.

    Strategy
    --------
    1. Try direct JSON parse of the full string.
    2. Extract the first ``{...}`` block and try again.
    3. Fall back to section-heading heuristic extraction from free text.
    4. Return a best-effort OllamaFeedback — never raises.

    Parameters
    ----------
    raw:
        Raw string returned by ``call_ollama``.

    Returns
    -------
    OllamaFeedback with raw_response preserved.
    """
    # Attempt 1: direct JSON
    data = _try_json_parse(raw)

    # Attempt 2: extract first {...} block
    if data is None:
        data = _extract_json_block(raw)

    # Attempt 3: free-text extraction
    if data is None:
        logger.warning("Ollama response is not valid JSON; using free-text fallback parser.")
        data = _free_text_extract(raw)

    return OllamaFeedback(
        summary=data.get("summary", "No summary available."),
        mechanical_strengths=_ensure_list(data.get("mechanical_strengths")),
        mechanical_weaknesses=_ensure_list(data.get("mechanical_weaknesses")),
        top_3_priorities=_ensure_list(data.get("top_3_priorities")),
        suggested_drills=_ensure_list(data.get("suggested_drills")),
        confidence_caveats=_ensure_list(
            data.get(
                "confidence_caveats",
                ["Speed and angle values are ESTIMATES from video analysis only."],
            )
        ),
        raw_response=raw,
    )


def _try_json_parse(text: str) -> Optional[dict]:
    try:
        obj = json.loads(text.strip())
        if isinstance(obj, dict):
            return obj
    except (json.JSONDecodeError, ValueError):
        pass
    return None


def _extract_json_block(text: str) -> Optional[dict]:
    """Find the first {...} block in text and attempt JSON parse."""
    start = text.find("{")
    end = text.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = text[start : end + 1]
        try:
            obj = json.loads(candidate)
            if isinstance(obj, dict):
                return obj
        except (json.JSONDecodeError, ValueError):
            pass
    return None


def _free_text_extract(text: str) -> dict:
    """
    Best-effort extraction from free-form text when JSON is not parseable.

    Looks for section headings matching the required keys and captures
    bullet points beneath them.
    """
    data: dict = {}

    # Summary: first non-empty paragraph
    lines = [ln.strip() for ln in text.splitlines()]
    non_empty = [ln for ln in lines if ln]
    data["summary"] = non_empty[0] if non_empty else "See raw response."

    # Section matching
    _section_aliases = {
        "mechanical_strengths": ["strengths", "mechanical_strengths"],
        "mechanical_weaknesses": ["weaknesses", "mechanical_weaknesses", "areas for improvement"],
        "top_3_priorities": ["top_3_priorities", "priorities", "top priorities"],
        "suggested_drills": ["suggested_drills", "drills"],
        "confidence_caveats": ["confidence_caveats", "caveats", "disclaimers"],
    }

    current_section: Optional[str] = None
    for line in lines:
        lower = line.lower().strip(":#- ")
        for key, aliases in _section_aliases.items():
            if any(alias in lower for alias in aliases):
                current_section = key
                data.setdefault(key, [])
                break
        else:
            if current_section and line.startswith(("-", "*", "•", "1", "2", "3", "4", "5")):
                cleaned = line.lstrip("-*•0123456789.) ").strip()
                if cleaned:
                    data[current_section].append(cleaned)

    # Ensure all required keys exist
    for key in _REQUIRED_KEYS:
        if key not in data:
            data[key] = [] if key != "summary" else "No structured summary extracted."

    return data


def _ensure_list(value: Any) -> list:
    """Coerce value to a list; return empty list for None/empty."""
    if value is None:
        return []
    if isinstance(value, list):
        return [str(v) for v in value]
    if isinstance(value, str) and value:
        return [value]
    return []


# ---------------------------------------------------------------------------
# Top-level orchestrator
# ---------------------------------------------------------------------------

def generate_feedback(
    result: "AnalysisResult",
    config: "OllamaConfig",
) -> "OllamaFeedback":
    """
    Generate structured coaching feedback using the local Ollama model.

    Pipeline
    --------
    1. ``build_ollama_prompt``  — build structured prompt from CV results
    2. ``call_ollama``          — send to Ollama, receive raw response
    3. ``parse_ollama_response`` — extract structured data from response

    On any error (Ollama not running, timeout, parse failure), a degraded
    OllamaFeedback is returned with an error note rather than raising.

    Parameters
    ----------
    result:
        The AnalysisResult from the CV pipeline.
    config:
        OllamaConfig specifying host, model, timeout, etc.

    Returns
    -------
    OllamaFeedback populated with model_used and generation_time_sec.
    """
    prompt = build_ollama_prompt(result)

    try:
        raw_response, duration_sec = call_ollama(prompt, config)
    except RuntimeError as exc:
        logger.error("Ollama feedback generation failed: %s", exc)
        return OllamaFeedback(
            summary="LLM feedback unavailable.",
            mechanical_strengths=[],
            mechanical_weaknesses=[],
            top_3_priorities=[],
            suggested_drills=[],
            confidence_caveats=[
                "Ollama feedback could not be generated.",
                str(exc),
                "Speed and form scores are still available from CV analysis.",
            ],
            raw_response=None,
            model_used=config.model,
            generation_time_sec=None,
        )

    feedback = parse_ollama_response(raw_response)

    # Inject generation metadata
    return feedback.model_copy(
        update={
            "model_used": config.model,
            "generation_time_sec": round(duration_sec, 3),
            "raw_response": raw_response,
        }
    )
