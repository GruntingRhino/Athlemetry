"""
Baseball Vision Tracker — CLI entry point.

Usage:
    python main.py analyze --video /path/to/swing.mp4 --output ./runs/run_001
    python main.py analyze --video /path/to/swing.mp4 --player-height 70 --bat-length 33
    python main.py analyze --video clip.mp4 --no-ollama --fast
    python main.py analyze --video clip.mp4 --model-config ./my_config.json --debug
"""

from __future__ import annotations

import json
import logging
import sys
from pathlib import Path
from typing import Optional

import click
from rich.console import Console
from rich.panel import Panel
from rich.progress import Progress, SpinnerColumn, TextColumn, TimeElapsedColumn
from rich.table import Table
from rich import print as rprint

console = Console()


def _setup_logging(debug: bool, output_dir: Path) -> None:
    level = logging.DEBUG if debug else logging.INFO
    fmt = "%(asctime)s  %(levelname)-7s  %(name)s — %(message)s"
    logging.basicConfig(level=level, format=fmt, stream=sys.stderr)
    # Also write to file
    fh = logging.FileHandler(output_dir / "pipeline.log")
    fh.setLevel(logging.DEBUG)
    fh.setFormatter(logging.Formatter(fmt))
    logging.getLogger().addHandler(fh)


def _print_result_summary(result) -> None:
    """Render a rich summary table to the console."""
    console.rule("[bold cyan]Analysis Complete[/bold cyan]")

    # Module status table
    tbl = Table(title="Module Status", show_header=True, header_style="bold magenta")
    tbl.add_column("Module", style="cyan")
    tbl.add_column("Status")
    tbl.add_column("Note", style="dim")

    status_styles = {"ok": "green", "partial": "yellow", "failed": "red", "skipped": "dim"}
    for mod, status in result.module_status.items():
        style = status_styles.get(status, "white")
        note = result.module_errors.get(mod, "")
        tbl.add_row(mod, f"[{style}]{status}[/{style}]", note[:80])

    console.print(tbl)

    # Key metrics panel
    lines = []

    if result.video_metadata:
        m = result.video_metadata
        lines.append(
            f"Video:        {m.width}×{m.height} @ {m.fps:.0f} fps | {m.duration_seconds:.1f}s"
        )

    if result.swing_speed:
        sp = result.swing_speed
        speed_str = f"{sp.peak_speed_mph:.1f} mph" if sp.peak_speed_mph else "N/A"
        band = (
            f" [{sp.confidence_band_mph[0]:.1f}–{sp.confidence_band_mph[1]:.1f}]"
            if sp.confidence_band_mph
            else ""
        )
        lines.append(
            f"Swing Speed:  {speed_str}{band}  "
            f"[confidence={sp.confidence:.2f}] [ESTIMATE] "
            f"[cal={sp.calibration_mode}]"
        )

    if result.form_scores:
        fs = result.form_scores
        score_str = f"{fs.overall_score:.2f}" if fs.overall_score is not None else "N/A"
        lines.append(f"Form Score:   {score_str} / 1.00  [confidence={fs.overall_confidence:.2f}]")
        if fs.issues:
            for issue in fs.issues[:3]:
                lines.append(f"  ⚠  {issue}")

    if result.swing_phases:
        phases = [p.label for p in result.swing_phases.phases]
        lines.append(f"Phases:       {' → '.join(phases)}")

    if result.ollama_feedback:
        lines.append("")
        lines.append("[bold]Coaching Summary:[/bold]")
        lines.append(result.ollama_feedback.summary)
        if result.ollama_feedback.top_3_priorities:
            lines.append("")
            lines.append("[bold]Top Priorities:[/bold]")
            for i, p in enumerate(result.ollama_feedback.top_3_priorities, 1):
                lines.append(f"  {i}. {p}")

    if lines:
        console.print(Panel("\n".join(lines), title="Results", border_style="cyan"))

    # Artifacts
    arts = result.artifacts
    artifact_lines = []
    if arts.json_report_path:
        artifact_lines.append(f"JSON report:      {arts.json_report_path}")
    if arts.csv_summary_path:
        artifact_lines.append(f"CSV summary:      {arts.csv_summary_path}")
    if arts.annotated_video_path:
        artifact_lines.append(f"Annotated video:  {arts.annotated_video_path}")
    if arts.trajectory_plot_path:
        artifact_lines.append(f"Ball trajectory:  {arts.trajectory_plot_path}")
    if arts.speed_chart_path:
        artifact_lines.append(f"Speed chart:      {arts.speed_chart_path}")

    if artifact_lines:
        console.print(Panel("\n".join(artifact_lines), title="Artifacts", border_style="green"))

    console.print(
        f"[dim]Pipeline completed in {result.pipeline_duration_sec:.1f}s[/dim]"
    )


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------

@click.group()
def cli():
    """Baseball Vision Tracker — local CV-based swing analysis."""
    pass


@cli.command()
@click.option("--video", required=True, type=click.Path(exists=True), help="Path to swing video")
@click.option("--output", default=None, type=click.Path(), help="Output directory (default: auto-generated under ./runs/)")
@click.option("--player-height", default=None, type=float, help="Player height in inches (improves speed calibration)")
@click.option("--bat-length", default=None, type=float, help="Bat length in inches (improves speed calibration)")
@click.option("--handedness", default=None, type=click.Choice(["left", "right"]))
@click.option("--camera-view", default="unknown", type=click.Choice(["side", "front", "angled", "unknown"]))
@click.option("--player-id", default=None, help="Optional player identifier")
@click.option("--fast", is_flag=True, default=False, help="Fast mode: skip slow modules (CLAHE, stabilization, Ollama)")
@click.option("--no-ollama", is_flag=True, default=False, help="Disable LLM feedback generation")
@click.option("--no-video", is_flag=True, default=False, help="Skip annotated video rendering")
@click.option("--model-config", default=None, type=click.Path(exists=True), help="JSON config file for model overrides")
@click.option("--debug", is_flag=True, default=False, help="Save intermediate outputs for debugging")
def analyze(
    video: str,
    output: Optional[str],
    player_height: Optional[float],
    bat_length: Optional[float],
    handedness: Optional[str],
    camera_view: str,
    player_id: Optional[str],
    fast: bool,
    no_ollama: bool,
    no_video: bool,
    model_config: Optional[str],
    debug: bool,
) -> None:
    """Analyze a baseball swing video and produce structured metrics and coaching feedback."""

    # ------------------------------------------------------------------ #
    # Resolve output directory
    # ------------------------------------------------------------------ #
    if output is None:
        import uuid, datetime
        ts = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
        rid = (player_id or str(uuid.uuid4())[:6])
        output = str(Path("runs") / f"{ts}_{rid}")
    out_path = Path(output)
    out_path.mkdir(parents=True, exist_ok=True)

    _setup_logging(debug, out_path)

    # ------------------------------------------------------------------ #
    # Load config
    # ------------------------------------------------------------------ #
    try:
        from config import AnalysisConfig
        if model_config:
            cfg = AnalysisConfig.from_file(model_config)
        else:
            cfg = AnalysisConfig.from_env()
    except Exception as exc:
        console.print(f"[red]Config error:[/red] {exc}")
        sys.exit(1)

    # Apply CLI overrides
    cfg.fast_mode = fast
    cfg.enable_ollama = not no_ollama
    cfg.export_video = not no_video
    cfg.debug = debug

    # ------------------------------------------------------------------ #
    # Build input
    # ------------------------------------------------------------------ #
    from schemas import AnalysisInput
    inp = AnalysisInput(
        video_path=str(Path(video).resolve()),
        player_height_inches=player_height,
        bat_length_inches=bat_length,
        handedness=handedness,
        camera_view=camera_view,
        player_id=player_id,
        analysis_mode="fast" if fast else "full",
    )

    # ------------------------------------------------------------------ #
    # Run pipeline
    # ------------------------------------------------------------------ #
    console.print(
        Panel(
            f"[bold]Video:[/bold] {video}\n"
            f"[bold]Output:[/bold] {out_path}\n"
            f"[bold]Mode:[/bold] {'fast' if fast else 'full'}"
            + (" [no-ollama]" if no_ollama else ""),
            title="[bold cyan]Baseball Vision Tracker[/bold cyan]",
            border_style="cyan",
        )
    )

    with Progress(
        SpinnerColumn(),
        TextColumn("[progress.description]{task.description}"),
        TimeElapsedColumn(),
        console=console,
        transient=False,
    ) as progress:
        task = progress.add_task("Running analysis pipeline…", total=None)

        try:
            from modules.pipeline import run_analysis
            result = run_analysis(inp, out_path, cfg)
        except KeyboardInterrupt:
            console.print("\n[yellow]Interrupted by user.[/yellow]")
            sys.exit(130)
        except Exception as exc:
            progress.stop()
            console.print(f"[red]Pipeline error:[/red] {exc}")
            import traceback
            if debug:
                traceback.print_exc()
            sys.exit(1)

        progress.update(task, completed=True, description="Done")

    # ------------------------------------------------------------------ #
    # Print summary
    # ------------------------------------------------------------------ #
    _print_result_summary(result)

    # Exit code: 0 if any module succeeded, 1 if all failed
    all_failed = all(v == "failed" for v in result.module_status.values())
    sys.exit(1 if all_failed else 0)


@cli.command("serve")
@click.option("--host", default="127.0.0.1", show_default=True)
@click.option("--port", default=8000, show_default=True)
@click.option("--reload", is_flag=True, default=False)
def serve(host: str, port: int, reload: bool) -> None:
    """Start the local FastAPI server (optional API layer)."""
    try:
        import uvicorn
    except ImportError:
        console.print(
            "[red]uvicorn is not installed.[/red] Run: pip install uvicorn fastapi"
        )
        sys.exit(1)
    console.print(f"[cyan]Starting API server at http://{host}:{port}[/cyan]")
    uvicorn.run("api:app", host=host, port=port, reload=reload)


@cli.command("check-deps")
def check_deps() -> None:
    """Check which optional dependencies are available."""
    deps = {
        "cv2 (opencv)": "cv2",
        "mediapipe": "mediapipe",
        "ultralytics (YOLO)": "ultralytics",
        "filterpy (Kalman)": "filterpy",
        "scipy": "scipy",
        "ollama": "ollama",
        "numpy": "numpy",
        "pydantic": "pydantic",
        "matplotlib": "matplotlib",
        "PIL (Pillow)": "PIL",
        "fastapi": "fastapi",
        "uvicorn": "uvicorn",
        "rich": "rich",
        "click": "click",
    }
    tbl = Table(title="Dependency Check", show_header=True)
    tbl.add_column("Package", style="cyan")
    tbl.add_column("Status")
    tbl.add_column("Version", style="dim")
    for label, mod in deps.items():
        try:
            m = __import__(mod)
            version = getattr(m, "__version__", "?")
            tbl.add_row(label, "[green]✓ installed[/green]", version)
        except ImportError:
            tbl.add_row(label, "[red]✗ missing[/red]", "—")
    console.print(tbl)


if __name__ == "__main__":
    cli()
