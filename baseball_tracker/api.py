"""
Optional local FastAPI layer.

Endpoints:
  POST /analyze        — submit a video file for analysis
  GET  /runs/{id}      — retrieve a completed analysis result
  GET  /runs/{id}/artifacts — list artifact file paths
  GET  /runs           — list all runs

All endpoints are local-only by default (no CORS, no cloud).
"""

from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path
from typing import Optional

try:
    from fastapi import FastAPI, UploadFile, File, HTTPException, Form, BackgroundTasks
    from fastapi.responses import JSONResponse, FileResponse
    _FASTAPI_AVAILABLE = True
except ImportError:
    _FASTAPI_AVAILABLE = False

from schemas import AnalysisInput, AnalysisResult

RUNS_DIR = Path("runs")
RUNS_DIR.mkdir(exist_ok=True)

if _FASTAPI_AVAILABLE:
    app = FastAPI(
        title="Baseball Vision Tracker API",
        description="Local-only baseball swing analysis API.",
        version="1.0.0",
    )

    # In-memory run registry (replace with SQLite for persistence)
    _runs: dict[str, AnalysisResult] = {}

    def _run_dir(run_id: str) -> Path:
        return RUNS_DIR / run_id

    def _background_analyze(run_id: str, video_path: Path, input_data: AnalysisInput) -> None:
        """Background task that drives the pipeline and stores the result."""
        from modules.pipeline import run_analysis
        from config import AnalysisConfig
        cfg = AnalysisConfig.from_env()
        result = run_analysis(input_data, _run_dir(run_id), cfg)
        _runs[run_id] = result

    @app.post("/analyze", summary="Submit a video for analysis")
    async def submit_analysis(
        background_tasks: BackgroundTasks,
        video: UploadFile = File(..., description="Swing video file"),
        player_height_inches: Optional[float] = Form(None),
        bat_length_inches: Optional[float] = Form(None),
        handedness: Optional[str] = Form(None),
        camera_view: str = Form("unknown"),
        player_id: Optional[str] = Form(None),
    ):
        """
        Upload a swing video to trigger analysis.

        Returns immediately with a run_id.
        Poll GET /runs/{run_id} for results.
        """
        run_id = player_id or str(uuid.uuid4())[:8]
        run_dir = _run_dir(run_id)
        run_dir.mkdir(parents=True, exist_ok=True)

        # Save uploaded file locally
        video_path = run_dir / video.filename
        with open(video_path, "wb") as f:
            shutil.copyfileobj(video.file, f)

        inp = AnalysisInput(
            video_path=str(video_path.resolve()),
            player_height_inches=player_height_inches,
            bat_length_inches=bat_length_inches,
            handedness=handedness,
            camera_view=camera_view,
            player_id=run_id,
        )

        # Mark run as queued
        _runs[run_id] = None  # type: ignore[assignment]

        background_tasks.add_task(_background_analyze, run_id, video_path, inp)

        return {"run_id": run_id, "status": "queued", "poll_url": f"/runs/{run_id}"}

    @app.get("/runs/{run_id}", summary="Get analysis result")
    async def get_run(run_id: str):
        """Return the analysis result for a completed run, or status if still processing."""
        if run_id not in _runs:
            raise HTTPException(status_code=404, detail="Run not found")
        result = _runs[run_id]
        if result is None:
            return {"run_id": run_id, "status": "processing"}
        return result.model_dump(mode="json")

    @app.get("/runs/{run_id}/artifacts", summary="List artifact paths for a run")
    async def get_artifacts(run_id: str):
        """Return the artifact paths for a completed run."""
        if run_id not in _runs or _runs[run_id] is None:
            raise HTTPException(status_code=404, detail="Run not found or still processing")
        arts = _runs[run_id].artifacts
        return arts.model_dump(mode="json")

    @app.get("/runs", summary="List all runs")
    async def list_runs():
        """Return a list of all run IDs and their status."""
        return [
            {
                "run_id": rid,
                "status": "processing" if result is None else "complete",
                "pipeline_duration_sec": result.pipeline_duration_sec if result else None,
            }
            for rid, result in _runs.items()
        ]

    @app.get("/health")
    async def health():
        """Health check — verify Ollama connectivity."""
        ollama_ok = False
        try:
            import ollama
            ollama.list()
            ollama_ok = True
        except Exception:
            pass
        return {"status": "ok", "ollama_reachable": ollama_ok}

else:
    # Stub so the module can be imported without fastapi
    class _StubApp:
        def post(self, *a, **kw):
            return lambda f: f
        def get(self, *a, **kw):
            return lambda f: f

    app = _StubApp()  # type: ignore[assignment]
