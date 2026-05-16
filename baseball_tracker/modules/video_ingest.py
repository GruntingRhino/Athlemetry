"""
video_ingest.py — Video loading and frame extraction for the baseball tracker pipeline.

Responsibilities:
  - load_video: open a video file and extract metadata (fps, resolution, frame count,
    duration, codec) into a VideoMetadata schema.
  - extract_frames: iterate frames, optionally saving PNGs, returning
    (frame_idx, timestamp_sec, frame_bgr) tuples.
  - build_frame_map: lightweight pass that builds a dict mapping frame_idx → timestamp_sec
    without retaining frame data in memory.

All functions handle missing/corrupt files and OpenCV import errors gracefully.
Partial results are always returned rather than crashing silently.
"""

from __future__ import annotations

import logging
import struct
from pathlib import Path
from typing import Dict, List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Optional OpenCV import
# ---------------------------------------------------------------------------
try:
    import cv2  # type: ignore

    _CV2_AVAILABLE = True
except ImportError:
    _CV2_AVAILABLE = False
    cv2 = None  # type: ignore

logger = logging.getLogger(__name__)

# Schema import – guaranteed to be present (same package)
from schemas import VideoMetadata  # noqa: E402


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _fourcc_to_str(fourcc_int: int) -> str:
    """Convert an OpenCV fourcc integer to a human-readable codec string."""
    try:
        return "".join(chr((fourcc_int >> (8 * i)) & 0xFF) for i in range(4)).strip("\x00")
    except Exception:
        return "unknown"


def _assert_cv2(context: str) -> None:
    """Raise a clear ImportError if OpenCV is not installed."""
    if not _CV2_AVAILABLE:
        raise ImportError(
            f"{context}: OpenCV (cv2) is not installed. "
            "Install it with:  pip install opencv-python-headless"
        )


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def load_video(path: str) -> VideoMetadata:
    """Open a video file with OpenCV and return its metadata.

    Parameters
    ----------
    path:
        Absolute or relative path to the video file.

    Returns
    -------
    VideoMetadata
        Populated schema object.  On any error the function still returns a
        best-effort object (zeros/None for fields it could not extract) rather
        than raising.

    Raises
    ------
    ImportError
        If OpenCV is not installed.
    FileNotFoundError
        If *path* does not point to an existing file.
    """
    _assert_cv2("load_video")

    video_path = Path(path)
    if not video_path.exists():
        raise FileNotFoundError(f"Video file not found: {path}")

    cap = cv2.VideoCapture(str(video_path))
    try:
        if not cap.isOpened():
            logger.error("OpenCV could not open video: %s", path)
            # Return a minimal skeleton so callers can continue with partial info
            return VideoMetadata(
                fps=0.0,
                width=0,
                height=0,
                total_frames=0,
                duration_seconds=0.0,
                codec=None,
                orientation=None,
                source_path=str(video_path.resolve()),
            )

        fps: float = cap.get(cv2.CAP_PROP_FPS) or 0.0
        width: int = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height: int = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        total_frames: int = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        # Some containers report −1 or 0 frame count; count manually if needed
        if total_frames <= 0:
            logger.warning(
                "CAP_PROP_FRAME_COUNT returned %d for %s — counting manually.",
                total_frames,
                path,
            )
            total_frames = _count_frames_manually(cap)

        duration_seconds: float = (total_frames / fps) if fps > 0 else 0.0

        fourcc_int = int(cap.get(cv2.CAP_PROP_FOURCC))
        codec = _fourcc_to_str(fourcc_int) if fourcc_int else None

        # Try to detect orientation from EXIF (best-effort via file bytes)
        orientation = _read_exif_orientation(video_path)

    finally:
        cap.release()

    return VideoMetadata(
        fps=fps,
        width=width,
        height=height,
        total_frames=total_frames,
        duration_seconds=duration_seconds,
        codec=codec,
        orientation=orientation,
        source_path=str(video_path.resolve()),
    )


def extract_frames(
    video_path: str,
    output_dir: Optional[Path] = None,
    stride: int = 1,
) -> List[Tuple[int, float, np.ndarray]]:
    """Iterate through a video file and return selected frames.

    Parameters
    ----------
    video_path:
        Path to the video file.
    output_dir:
        If provided, each extracted frame is saved as a zero-padded PNG
        (``frame_000042.png``) inside this directory.  The directory is created
        if it does not exist.
    stride:
        Extract every *stride*-th frame.  ``stride=1`` (default) extracts all
        frames; ``stride=3`` extracts frames 0, 3, 6, …

    Returns
    -------
    List[Tuple[int, float, np.ndarray]]
        Each element is ``(frame_idx, timestamp_sec, frame_bgr)`` where
        ``frame_bgr`` is a uint8 NumPy array in BGR colour order as returned
        by OpenCV.  Partial results are returned on read errors.

    Raises
    ------
    ImportError
        If OpenCV is not installed.
    FileNotFoundError
        If *video_path* does not point to an existing file.
    """
    _assert_cv2("extract_frames")

    p = Path(video_path)
    if not p.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    if stride < 1:
        logger.warning("stride must be >= 1; clamping to 1 (got %d).", stride)
        stride = 1

    if output_dir is not None:
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)

    results: List[Tuple[int, float, np.ndarray]] = []
    cap = cv2.VideoCapture(str(p))
    try:
        if not cap.isOpened():
            logger.error("extract_frames: could not open %s", video_path)
            return results

        fps: float = cap.get(cv2.CAP_PROP_FPS) or 30.0
        frame_idx: int = 0

        while True:
            ret, frame = cap.read()
            if not ret:
                break  # end of stream or read error

            if frame is None:
                logger.warning("Null frame at index %d — skipping.", frame_idx)
                frame_idx += 1
                continue

            if frame_idx % stride == 0:
                timestamp_sec = frame_idx / fps

                if output_dir is not None:
                    out_path = output_dir / f"frame_{frame_idx:06d}.png"
                    try:
                        cv2.imwrite(str(out_path), frame)
                    except Exception as exc:
                        logger.warning(
                            "Could not save frame %d to %s: %s", frame_idx, out_path, exc
                        )

                results.append((frame_idx, timestamp_sec, frame))

            frame_idx += 1

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "extract_frames: unexpected error at frame %d: %s — returning partial results.",
            frame_idx,
            exc,
        )
    finally:
        cap.release()

    logger.info(
        "extract_frames: extracted %d frames from %s (stride=%d).",
        len(results),
        video_path,
        stride,
    )
    return results


def build_frame_map(video_path: str, stride: int = 1) -> Dict[int, float]:
    """Build a mapping of frame index → timestamp without holding frames in memory.

    This is a lightweight alternative to ``extract_frames`` for callers that
    only need temporal positions (e.g., to generate a seek table).

    Parameters
    ----------
    video_path:
        Path to the video file.
    stride:
        Include every *stride*-th frame in the map.

    Returns
    -------
    Dict[int, float]
        ``{frame_idx: timestamp_sec}`` for the selected frames.  Returns an
        empty dict if the file cannot be opened.

    Raises
    ------
    ImportError
        If OpenCV is not installed.
    FileNotFoundError
        If *video_path* does not point to an existing file.
    """
    _assert_cv2("build_frame_map")

    p = Path(video_path)
    if not p.exists():
        raise FileNotFoundError(f"Video file not found: {video_path}")

    if stride < 1:
        logger.warning("build_frame_map: stride must be >= 1; clamping to 1 (got %d).", stride)
        stride = 1

    frame_map: Dict[int, float] = {}
    cap = cv2.VideoCapture(str(p))
    try:
        if not cap.isOpened():
            logger.error("build_frame_map: could not open %s", video_path)
            return frame_map

        fps: float = cap.get(cv2.CAP_PROP_FPS) or 30.0
        total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))

        if total > 0:
            # Fast path: compute timestamps from metadata without reading frames
            for idx in range(0, total, stride):
                frame_map[idx] = idx / fps
        else:
            # Slow path: must iterate
            frame_idx = 0
            while True:
                ret = cap.grab()  # grab without decode — much faster
                if not ret:
                    break
                if frame_idx % stride == 0:
                    frame_map[frame_idx] = frame_idx / fps
                frame_idx += 1

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "build_frame_map: unexpected error — returning partial map: %s", exc
        )
    finally:
        cap.release()

    logger.debug("build_frame_map: mapped %d frames from %s.", len(frame_map), video_path)
    return frame_map


# ---------------------------------------------------------------------------
# Private helpers
# ---------------------------------------------------------------------------

def _count_frames_manually(cap: "cv2.VideoCapture") -> int:  # type: ignore[name-defined]
    """Count frames by seeking to the end of the capture.

    Resets the capture position to frame 0 before returning.
    This is used as a fallback when CAP_PROP_FRAME_COUNT is unreliable.
    """
    cap.set(cv2.CAP_PROP_POS_AVI_RATIO, 1)
    count = int(cap.get(cv2.CAP_PROP_POS_FRAMES))
    cap.set(cv2.CAP_PROP_POS_FRAMES, 0)
    return max(count, 0)


def _read_exif_orientation(path: Path) -> Optional[str]:
    """Attempt to read EXIF orientation tag from the file bytes.

    Returns a human-readable string such as ``"rotate_90"`` or ``None`` if the
    tag cannot be found or parsed.  This is a lightweight best-effort reader
    that avoids a hard dependency on Pillow/exifread.
    """
    _ORIENTATIONS = {
        1: "normal",
        2: "flip_horizontal",
        3: "rotate_180",
        4: "flip_vertical",
        5: "transpose",
        6: "rotate_90",
        7: "transverse",
        8: "rotate_270",
    }
    try:
        data = path.read_bytes()
        # Look for EXIF marker (0xFFE1) in the first 64 KB
        marker = b"\xff\xe1"
        pos = data.find(marker, 0, 65536)
        if pos == -1:
            return None
        # EXIF header starts at pos+4; look for "Exif\x00\x00"
        exif_start = data.find(b"Exif\x00\x00", pos, pos + 20)
        if exif_start == -1:
            return None
        tiff_start = exif_start + 6
        byte_order = data[tiff_start : tiff_start + 2]
        big_endian = byte_order == b"MM"
        fmt = ">" if big_endian else "<"

        ifd_offset = struct.unpack_from(f"{fmt}I", data, tiff_start + 4)[0]
        ifd_abs = tiff_start + ifd_offset
        entry_count = struct.unpack_from(f"{fmt}H", data, ifd_abs)[0]

        for i in range(min(entry_count, 64)):
            entry_pos = ifd_abs + 2 + i * 12
            tag = struct.unpack_from(f"{fmt}H", data, entry_pos)[0]
            if tag == 0x0112:  # Orientation tag
                value = struct.unpack_from(f"{fmt}H", data, entry_pos + 8)[0]
                return _ORIENTATIONS.get(value)
    except Exception:  # noqa: BLE001
        pass
    return None
