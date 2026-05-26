"""
Pipeline orchestrator — drives the full analysis from video path to AnalysisResult.

Design philosophy:
  - Each stage is isolated in a try/except; failure in one stage never crashes the rest.
  - Every module records its status in result.module_status.
  - The pipeline passes accumulated data between stages via the growing AnalysisResult.
"""

from __future__ import annotations

import logging
import time
import uuid
from pathlib import Path
from typing import Optional, List, Tuple

from schemas import (
    AnalysisInput,
    AnalysisResult,
    ArtifactPaths,
    FrameDetection,
    FramePose,
)
from config import AnalysisConfig, DEFAULT_CONFIG

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Module imports — all wrapped so the pipeline runs even without heavy deps
# ---------------------------------------------------------------------------

def _import_video_ingest():
    from modules import video_ingest
    return video_ingest


def _import_preprocess():
    from modules import preprocess
    return preprocess


def _import_detectors():
    from modules import detectors
    return detectors


def _import_pose():
    from modules import pose
    return pose


def _import_tracking():
    from modules import tracking
    return tracking


def _import_events():
    from modules import events
    return events


def _import_metrics():
    from modules import metrics
    return metrics


def _import_pitching():
    from modules import pitching
    return pitching


def _import_scoring():
    from modules import scoring
    return scoring


def _import_llm_feedback():
    from modules import llm_feedback
    return llm_feedback


def _import_visualization():
    from modules import visualization
    return visualization


def _import_export():
    from modules import export
    return export


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _mark_ok(result: AnalysisResult, module: str) -> None:
    result.module_status[module] = "ok"


def _mark_failed(result: AnalysisResult, module: str, error: str) -> None:
    result.module_status[module] = "failed"
    result.module_errors[module] = error
    logger.error("[%s] FAILED: %s", module, error)


def _mark_partial(result: AnalysisResult, module: str, note: str) -> None:
    result.module_status[module] = "partial"
    result.module_errors[module] = note
    logger.warning("[%s] PARTIAL: %s", module, note)


def _mark_skipped(result: AnalysisResult, module: str, reason: str) -> None:
    result.module_status[module] = "skipped"
    result.module_errors[module] = reason
    logger.info("[%s] SKIPPED: %s", module, reason)


# ---------------------------------------------------------------------------
# Pipeline stages
# ---------------------------------------------------------------------------

def stage_video_ingest(
    result: AnalysisResult,
    config: AnalysisConfig,
) -> Optional[object]:  # returns cap-like handle or None
    """Stage 1: Load video and extract metadata."""
    logger.info("[video_ingest] Loading video: %s", result.input.video_path)
    try:
        vi = _import_video_ingest()
        meta = vi.load_video(result.input.video_path)
        result.video_metadata = meta
        _mark_ok(result, "video_ingest")
        logger.info(
            "[video_ingest] %dx%d @ %.1f fps, %.1f s (%d frames)",
            meta.width, meta.height, meta.fps, meta.duration_seconds, meta.total_frames,
        )
        return meta
    except Exception as exc:
        _mark_failed(result, "video_ingest", str(exc))
        return None


def stage_extract_frames(
    result: AnalysisResult,
    config: AnalysisConfig,
    debug_dir: Optional[Path],
) -> List[Tuple[int, float, object]]:
    """Stage 1b: Extract raw frames from video."""
    logger.info("[extract_frames] Extracting frames…")
    try:
        vi = _import_video_ingest()
        stride = 2 if config.fast_mode else 1
        frames = vi.extract_frames(
            result.input.video_path,
            output_dir=debug_dir / "raw_frames" if (debug_dir and config.debug) else None,
            stride=stride,
        )
        logger.info("[extract_frames] Extracted %d frames (stride=%d)", len(frames), stride)
        _mark_ok(result, "extract_frames")
        return frames
    except Exception as exc:
        _mark_failed(result, "extract_frames", str(exc))
        return []


def stage_preprocess(
    result: AnalysisResult,
    config: AnalysisConfig,
    raw_frames: List[Tuple[int, float, object]],
) -> list:
    """Stage 2: Preprocess frames (resize, CLAHE, stabilise)."""
    if not raw_frames:
        _mark_skipped(result, "preprocess", "No frames to preprocess")
        return []
    logger.info("[preprocess] Preprocessing %d frames…", len(raw_frames))
    try:
        pp = _import_preprocess()
        orientation = result.video_metadata.orientation if result.video_metadata else None
        preprocessed = pp.preprocess_frames(raw_frames, config, orientation=orientation)
        if not config.fast_mode and len(preprocessed) > 5:
            preprocessed = pp.stabilize_frames(preprocessed)
        _mark_ok(result, "preprocess")
        logger.info("[preprocess] Done (%d frames)", len(preprocessed))
        return preprocessed
    except Exception as exc:
        _mark_partial(result, "preprocess", str(exc))
        # Return raw frames wrapped in minimal PreprocessedFrame
        try:
            pp = _import_preprocess()
            import numpy as np
            fallback = []
            for idx, ts, frame in raw_frames:
                pf = pp.PreprocessedFrame(
                    frame_idx=idx,
                    timestamp_sec=ts,
                    frame=frame,
                    scale_factor=(1.0, 1.0),
                    original_size=(
                        frame.shape[1] if hasattr(frame, "shape") else 0,
                        frame.shape[0] if hasattr(frame, "shape") else 0,
                    ),
                )
                fallback.append(pf)
            return fallback
        except Exception:
            return []


def stage_detect(
    result: AnalysisResult,
    config: AnalysisConfig,
    preprocessed_frames: list,
) -> List[FrameDetection]:
    """Stage 3: Object detection (baseball, batter, bat)."""
    if not preprocessed_frames:
        _mark_skipped(result, "detect", "No frames for detection")
        return []
    logger.info("[detect] Running object detection on %d frames…", len(preprocessed_frames))
    try:
        det = _import_detectors()
        # Convert preprocessed frames to (idx, ts, np.ndarray) tuples expected by detector
        frame_tuples = [
            (pf.frame_idx, pf.timestamp_sec, pf.frame) for pf in preprocessed_frames
        ]
        detections, summary = det.detect_all_frames(frame_tuples, config)
        result.detections_summary = summary
        logger.info(
            "[detect] Ball detection rate: %.1f%%, Batter: %.1f%%",
            summary.baseball_detection_rate * 100,
            summary.batter_detection_rate * 100,
        )
        _mark_ok(result, "detect")
        return detections
    except Exception as exc:
        _mark_failed(result, "detect", str(exc))
        return []


def stage_pose(
    result: AnalysisResult,
    config: AnalysisConfig,
    preprocessed_frames: list,
) -> List[Optional[FramePose]]:
    """Stage 4: Pose estimation."""
    if not preprocessed_frames:
        _mark_skipped(result, "pose", "No frames for pose estimation")
        return []
    logger.info("[pose] Running pose estimation on %d frames…", len(preprocessed_frames))
    try:
        po = _import_pose()
        frame_tuples = [
            (pf.frame_idx, pf.timestamp_sec, pf.frame) for pf in preprocessed_frames
        ]
        poses = po.estimate_all_frames(frame_tuples, config)
        valid_poses = sum(1 for p in poses if p is not None)
        logger.info("[pose] Valid pose frames: %d/%d", valid_poses, len(poses))
        if valid_poses == 0:
            _mark_partial(result, "pose", "No valid poses detected in any frame")
        else:
            _mark_ok(result, "pose")
        return poses
    except Exception as exc:
        _mark_failed(result, "pose", str(exc))
        return []


def stage_track_ball(
    result: AnalysisResult,
    config: AnalysisConfig,
    detections: List[FrameDetection],
) -> None:
    """Stage 5: Ball tracking."""
    if not detections:
        _mark_skipped(result, "track_ball", "No detections to track")
        return
    logger.info("[track_ball] Building ball trajectory…")
    try:
        tr = _import_tracking()
        traj = tr.track_ball(detections, config)
        result.ball_trajectory = traj
        tracked_pts = sum(1 for p in traj.points if not p.interpolated)
        logger.info(
            "[track_ball] Trajectory: %d points (%d non-interpolated), confidence=%.2f",
            len(traj.points), tracked_pts, traj.confidence,
        )
        if traj.confidence < 0.2:
            _mark_partial(result, "track_ball", "Low overall tracking confidence")
        else:
            _mark_ok(result, "track_ball")
    except Exception as exc:
        _mark_failed(result, "track_ball", str(exc))


def stage_segment_events(
    result: AnalysisResult,
    config: AnalysisConfig,
    poses: List[Optional[FramePose]],
    detections: List[FrameDetection],
) -> None:
    """Stage 6: Swing phase segmentation."""
    fps = result.video_metadata.fps if result.video_metadata else config.metrics.fallback_fps
    logger.info("[events] Segmenting swing phases…")
    try:
        ev = _import_events()
        detector = ev.SwingPhaseDetector(
            poses=poses,
            detections=detections,
            ball_trajectory=result.ball_trajectory,
            fps=fps,
        )
        segmentation = detector.detect()
        result.swing_phases = segmentation
        phase_count = len(segmentation.phases)
        logger.info(
            "[events] Detected %d swing phases (confidence=%.2f, method=%s)",
            phase_count, segmentation.confidence, segmentation.segmentation_method,
        )
        _mark_ok(result, "events")
    except Exception as exc:
        _mark_failed(result, "events", str(exc))


def stage_metrics(
    result: AnalysisResult,
    config: AnalysisConfig,
    poses: List[Optional[FramePose]],
    detections: List[FrameDetection],
) -> None:
    """Stage 7: Metric computation (swing speed, trajectory descriptors)."""
    if not poses or all(p is None for p in poses):
        _mark_skipped(result, "metrics", "No pose data available for metric computation")
        return
    fps = result.video_metadata.fps if result.video_metadata else config.metrics.fallback_fps
    logger.info("[metrics] Computing swing speed and trajectory metrics…")
    try:
        met = _import_metrics()

        # Calibration
        bat_dets = [d for d in detections if d.bat is not None]
        batter_dets = [d for d in detections if d.batter is not None]
        ppi, cal_mode = met.compute_pixels_per_inch(
            result.input,
            result.video_metadata,
            [p for p in poses if p is not None],
            bat_detections=bat_dets if bat_dets else None,
            batter_detections=batter_dets if batter_dets else None,
        )
        logger.info("[metrics] Calibration: mode=%s, ppi=%s", cal_mode, ppi)

        # Swing speed — extract phase list from segmentation
        phase_list = result.swing_phases.phases if result.swing_phases else []
        swing_speed = met.estimate_swing_speed(
            poses=poses,
            phases=phase_list,
            video_meta=result.video_metadata,
            pixels_per_inch=ppi,
            config=config.metrics,
        )
        # Apply calibration mode to result
        swing_speed = swing_speed.model_copy(update={"calibration_mode": cal_mode})
        result.swing_speed = swing_speed
        logger.info(
            "[metrics] Swing speed: %s mph (confidence=%.2f, method=%s)",
            f"{swing_speed.peak_speed_mph:.1f}" if swing_speed.peak_speed_mph else "N/A",
            swing_speed.confidence,
            swing_speed.estimation_method,
        )
        _mark_ok(result, "metrics")
    except Exception as exc:
        _mark_failed(result, "metrics", str(exc))


def stage_pitch_analysis(
    result: AnalysisResult,
    config: AnalysisConfig,
) -> None:
    """Stage 7b: Pitch movement analysis from ball trajectory."""
    if not result.ball_trajectory:
        _mark_skipped(result, "pitch_analysis", "No ball trajectory available for pitch analysis")
        return
    if not result.video_metadata:
        _mark_skipped(result, "pitch_analysis", "No video metadata available for pitch analysis")
        return
    logger.info("[pitch_analysis] Estimating pitch movement and spin proxy…")
    try:
        pitch = _import_pitching()
        analysis = pitch.analyze_pitch_trajectory(result.ball_trajectory, result.video_metadata)
        result.pitch_analysis = analysis
        logger.info(
            "[pitch_analysis] Spin proxy: %s rpm (confidence=%.2f, assessment=%s)",
            f"{analysis.estimated_spin_rpm:.1f}" if analysis.estimated_spin_rpm is not None else "N/A",
            analysis.confidence,
            analysis.capture_assessment,
        )
        if analysis.confidence < 0.2:
            _mark_partial(result, "pitch_analysis", "Low trajectory confidence — pitch estimates are approximate")
        else:
            _mark_ok(result, "pitch_analysis")
    except Exception as exc:
        _mark_failed(result, "pitch_analysis", str(exc))


def stage_scoring(
    result: AnalysisResult,
    config: AnalysisConfig,
    poses: List[Optional[FramePose]],
) -> None:
    """Stage 8: Form evaluation."""
    if all(p is None for p in poses):
        _mark_skipped(result, "scoring", "No pose data available for form scoring")
        return
    logger.info("[scoring] Evaluating swing form…")
    try:
        sc = _import_scoring()
        phase_list = result.swing_phases.phases if result.swing_phases else []
        form = sc.evaluate_form(
            poses=poses,
            phases=phase_list,
            video_meta=result.video_metadata,
            config=config,  # evaluate_form takes full AnalysisConfig
        )
        result.form_scores = form
        overall = form.overall_score
        logger.info(
            "[scoring] Overall form score: %s (confidence=%.2f)",
            f"{overall:.2f}" if overall is not None else "N/A",
            form.overall_confidence,
        )
        if form.overall_confidence < 0.2:
            _mark_partial(result, "scoring", "Low pose coverage — form scores are approximate")
        else:
            _mark_ok(result, "scoring")
    except Exception as exc:
        _mark_failed(result, "scoring", str(exc))


def stage_llm_feedback(
    result: AnalysisResult,
    config: AnalysisConfig,
) -> None:
    """Stage 9: Ollama coaching feedback."""
    if not config.enable_ollama:
        _mark_skipped(result, "llm_feedback", "Ollama disabled via --no-ollama flag")
        return
    if config.fast_mode:
        _mark_skipped(result, "llm_feedback", "Skipped in fast mode")
        return
    logger.info("[llm_feedback] Generating coaching feedback via Ollama…")
    try:
        llm = _import_llm_feedback()
        feedback = llm.generate_feedback(result, config.ollama)
        result.ollama_feedback = feedback
        logger.info(
            "[llm_feedback] Feedback generated (model=%s, %.1fs)",
            feedback.model_used, feedback.generation_time_sec or 0,
        )
        _mark_ok(result, "llm_feedback")
    except Exception as exc:
        _mark_failed(result, "llm_feedback", str(exc))


def stage_visualize(
    result: AnalysisResult,
    config: AnalysisConfig,
    preprocessed_frames: list,
    poses: List[Optional[FramePose]],
    output_dir: Path,
) -> None:
    """Stage 10a: Render annotated video and charts."""
    if not config.export_video:
        _mark_skipped(result, "visualization", "Video export disabled")
        return
    if not preprocessed_frames:
        _mark_skipped(result, "visualization", "No frames to visualize")
        return
    logger.info("[visualization] Rendering annotated video and charts…")
    try:
        viz = _import_visualization()

        # Annotated video
        ann_path = output_dir / "annotated.mp4"
        rendered = viz.render_annotated_video(
            video_path=result.input.video_path,
            output_path=str(ann_path),
            poses=poses,
            ball_traj=result.ball_trajectory,
            swing_phases=result.swing_phases,
            swing_speed=result.swing_speed,
        )
        result.artifacts.annotated_video_path = rendered

        # Speed chart
        if result.swing_speed:
            speed_path = str(output_dir / "speed_chart.png")
            # Compute wrist speeds for chart
            fps = result.video_metadata.fps if result.video_metadata else 30.0
            try:
                ev = _import_events()
                wrist_speeds = ev.compute_wrist_velocity(poses, fps)
                times = [i / fps for i in range(len(wrist_speeds))]
                viz.plot_speed_chart(times, wrist_speeds, speed_path)
                result.artifacts.speed_chart_path = speed_path
            except Exception as chart_exc:
                logger.warning("[visualization] Speed chart failed: %s", chart_exc)

        # Ball trajectory plot
        if result.ball_trajectory and result.video_metadata:
            traj_path = str(output_dir / "ball_trajectory.png")
            try:
                viz.plot_trajectory(result.ball_trajectory, result.video_metadata, traj_path)
                result.artifacts.trajectory_plot_path = traj_path
            except Exception as traj_exc:
                logger.warning("[visualization] Trajectory plot failed: %s", traj_exc)

        _mark_ok(result, "visualization")
    except Exception as exc:
        _mark_failed(result, "visualization", str(exc))


def stage_export(
    result: AnalysisResult,
    config: AnalysisConfig,
    output_dir: Path,
) -> None:
    """Stage 10b: Export JSON, CSV, and coach report."""
    logger.info("[export] Writing reports…")
    try:
        exp = _import_export()

        json_path = exp.export_json(result, output_dir)
        result.artifacts.json_report_path = str(json_path)

        csv_path = exp.export_csv_summary(result, output_dir)
        result.artifacts.csv_summary_path = str(csv_path)

        exp.export_coach_report(result, output_dir)

        _mark_ok(result, "export")
        logger.info("[export] Reports saved to %s", output_dir)
    except Exception as exc:
        _mark_failed(result, "export", str(exc))


# ---------------------------------------------------------------------------
# Main entry point
# ---------------------------------------------------------------------------

def run_analysis(
    input_data: AnalysisInput,
    output_dir: Path,
    config: Optional[AnalysisConfig] = None,
) -> AnalysisResult:
    """
    Run the full analysis pipeline on a single video.

    Parameters
    ----------
    input_data : AnalysisInput
        User-supplied input (video path, optional calibration parameters).
    output_dir : Path
        Directory where all output artifacts are saved.
    config : AnalysisConfig, optional
        Pipeline configuration. Defaults to DEFAULT_CONFIG.

    Returns
    -------
    AnalysisResult
        Fully populated result with all available metrics, partial results
        clearly flagged in module_status and module_errors.
    """
    if config is None:
        config = DEFAULT_CONFIG

    run_id = input_data.player_id or str(uuid.uuid4())[:8]
    output_dir = Path(output_dir)
    output_dir.mkdir(parents=True, exist_ok=True)

    debug_dir = output_dir / "debug" if config.debug else None
    if debug_dir:
        debug_dir.mkdir(parents=True, exist_ok=True)

    result = AnalysisResult(
        run_id=run_id,
        input=input_data,
        artifacts=ArtifactPaths(debug_dir=str(debug_dir) if debug_dir else None),
    )

    t0 = time.time()

    # ------------------------------------------------------------------ #
    # Stage 1: Video ingestion + frame extraction
    # ------------------------------------------------------------------ #
    stage_video_ingest(result, config)
    raw_frames = stage_extract_frames(result, config, debug_dir)

    # ------------------------------------------------------------------ #
    # Stage 2: Preprocessing
    # ------------------------------------------------------------------ #
    preprocessed = stage_preprocess(result, config, raw_frames)

    # ------------------------------------------------------------------ #
    # Stage 3: Object detection
    # ------------------------------------------------------------------ #
    detections = stage_detect(result, config, preprocessed)

    # ------------------------------------------------------------------ #
    # Stage 4: Pose estimation
    # ------------------------------------------------------------------ #
    poses = stage_pose(result, config, preprocessed)

    # ------------------------------------------------------------------ #
    # Stage 5: Ball tracking
    # ------------------------------------------------------------------ #
    stage_track_ball(result, config, detections)

    # ------------------------------------------------------------------ #
    # Stage 6: Event segmentation
    # ------------------------------------------------------------------ #
    stage_segment_events(result, config, poses, detections)

    # ------------------------------------------------------------------ #
    # Stage 7: Metric computation
    # ------------------------------------------------------------------ #
    stage_metrics(result, config, poses, detections)

    # ------------------------------------------------------------------ #
    # Stage 7b: Pitch movement analysis
    # ------------------------------------------------------------------ #
    stage_pitch_analysis(result, config)

    # ------------------------------------------------------------------ #
    # Stage 8: Form scoring
    # ------------------------------------------------------------------ #
    stage_scoring(result, config, poses)

    # ------------------------------------------------------------------ #
    # Stage 9: LLM feedback
    # ------------------------------------------------------------------ #
    stage_llm_feedback(result, config)

    # ------------------------------------------------------------------ #
    # Stage 10: Visualization + export
    # ------------------------------------------------------------------ #
    stage_visualize(result, config, preprocessed, poses, output_dir)
    stage_export(result, config, output_dir)

    result.pipeline_duration_sec = round(time.time() - t0, 2)
    logger.info(
        "Pipeline complete in %.1f s — run_id=%s",
        result.pipeline_duration_sec, run_id,
    )

    return result
