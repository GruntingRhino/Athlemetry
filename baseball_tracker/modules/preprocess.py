"""
preprocess.py — Frame pre-processing for the baseball tracker pipeline.

Responsibilities:
  - PreprocessedFrame dataclass: augments raw frame data with scale factor
    and original size so downstream modules can map pixel coords back to the
    original resolution.
  - preprocess_frames: applies a configurable pipeline of
      1. EXIF / CAP_PROP orientation correction
      2. Resize to target resolution (preserving aspect ratio; letterbox padding)
      3. CLAHE contrast enhancement (skipped in fast_mode)
      4. Gaussian denoising (skipped in fast_mode)
  - stabilize_frames: reduces camera shake via background-subtractor-assisted
    optical-flow stabilisation.  Degrades gracefully when MOG2 or optical-flow
    APIs are absent.

All functions import OpenCV inside try/except blocks and return input frames
unchanged (with a logged warning) when OpenCV is unavailable.
"""

from __future__ import annotations

import dataclasses
import logging
from typing import List, Optional, Tuple

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

# Local imports
from config import AnalysisConfig  # noqa: E402


# ---------------------------------------------------------------------------
# Data container
# ---------------------------------------------------------------------------

@dataclasses.dataclass
class PreprocessedFrame:
    """A single pre-processed video frame with coordinate-mapping metadata.

    Attributes
    ----------
    frame_idx:
        Zero-based index of the frame in the source video.
    timestamp_sec:
        Timestamp in seconds from the start of the video.
    frame:
        The processed frame as a uint8 BGR NumPy array.
    scale_factor:
        ``(sx, sy)`` — multiply preprocessed pixel coordinates by these values
        to recover the corresponding position in the *original* (pre-resize)
        frame.  For example, if the frame was scaled down by 2× in both axes,
        ``scale_factor = (2.0, 2.0)``.
    original_size:
        ``(width, height)`` of the frame before any preprocessing was applied.
    """

    frame_idx: int
    timestamp_sec: float
    frame: np.ndarray
    scale_factor: Tuple[float, float]   # (sx, sy) — preprocessed → original
    original_size: Tuple[int, int]       # (width, height) before preprocessing


# ---------------------------------------------------------------------------
# Orientation helpers
# ---------------------------------------------------------------------------

# Map VideoMetadata.orientation strings to OpenCV rotation codes
_ORIENTATION_TO_ROTATION = {
    "rotate_90": (True, cv2.ROTATE_90_CLOCKWISE) if _CV2_AVAILABLE else (True, 0),
    "rotate_180": (True, cv2.ROTATE_180) if _CV2_AVAILABLE else (True, 1),
    "rotate_270": (True, cv2.ROTATE_90_COUNTERCLOCKWISE) if _CV2_AVAILABLE else (True, 2),
    "transpose": (True, cv2.ROTATE_90_COUNTERCLOCKWISE) if _CV2_AVAILABLE else (True, 2),
    "transverse": (True, cv2.ROTATE_90_CLOCKWISE) if _CV2_AVAILABLE else (True, 0),
    "flip_horizontal": None,
    "flip_vertical": None,
    "normal": None,
}


def _apply_orientation(
    frame: np.ndarray, orientation: Optional[str]
) -> np.ndarray:
    """Rotate/flip *frame* based on the EXIF orientation string.

    Returns the corrected frame, or the original if orientation is None / unknown.
    """
    if not _CV2_AVAILABLE or orientation is None:
        return frame

    mapping = _ORIENTATION_TO_ROTATION.get(orientation)
    if mapping is None:
        return frame  # "normal" or unrecognised

    should_rotate, code = mapping  # type: ignore[misc]

    if orientation == "flip_horizontal":
        return cv2.flip(frame, 1)
    if orientation == "flip_vertical":
        return cv2.flip(frame, 0)

    if should_rotate:
        return cv2.rotate(frame, code)

    return frame


# ---------------------------------------------------------------------------
# Resize with letterbox padding
# ---------------------------------------------------------------------------

def _resize_letterbox(
    frame: np.ndarray,
    target_w: int,
    target_h: int,
) -> Tuple[np.ndarray, float, float]:
    """Resize *frame* to fit inside (target_w, target_h) with black letterbox padding.

    Returns
    -------
    resized_frame:
        The padded output frame of exactly (target_h, target_w, C).
    sx, sy:
        Scale factors to map output pixel → original pixel.
    """
    orig_h, orig_w = frame.shape[:2]
    scale = min(target_w / orig_w, target_h / orig_h)
    new_w = int(round(orig_w * scale))
    new_h = int(round(orig_h * scale))

    resized = cv2.resize(frame, (new_w, new_h), interpolation=cv2.INTER_LINEAR)

    # Centre the image on a black canvas
    canvas = np.zeros((target_h, target_w, frame.shape[2] if frame.ndim == 3 else 1),
                      dtype=frame.dtype)
    if frame.ndim == 2:
        canvas = np.zeros((target_h, target_w), dtype=frame.dtype)

    pad_top = (target_h - new_h) // 2
    pad_left = (target_w - new_w) // 2
    canvas[pad_top : pad_top + new_h, pad_left : pad_left + new_w] = resized

    # sx/sy: multiply canvas-pixel coords by these to get original-pixel coords
    sx = orig_w / new_w  # = 1 / scale
    sy = orig_h / new_h
    return canvas, sx, sy


# ---------------------------------------------------------------------------
# CLAHE helper
# ---------------------------------------------------------------------------

def _apply_clahe(frame: np.ndarray) -> np.ndarray:
    """Apply CLAHE (Contrast Limited Adaptive Histogram Equalization) to a BGR frame.

    Converts to LAB colour space, applies CLAHE to the L channel, and converts
    back.  Returns the original frame if conversion fails.
    """
    try:
        lab = cv2.cvtColor(frame, cv2.COLOR_BGR2LAB)
        l_ch, a_ch, b_ch = cv2.split(lab)
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l_eq = clahe.apply(l_ch)
        lab_eq = cv2.merge((l_eq, a_ch, b_ch))
        return cv2.cvtColor(lab_eq, cv2.COLOR_LAB2BGR)
    except Exception as exc:
        logger.debug("CLAHE failed: %s — returning frame unchanged.", exc)
        return frame


# ---------------------------------------------------------------------------
# Public API
# ---------------------------------------------------------------------------

def preprocess_frames(
    frames: List[Tuple[int, float, np.ndarray]],
    config: AnalysisConfig,
    orientation: Optional[str] = None,
    target_size: Optional[Tuple[int, int]] = None,
) -> List[PreprocessedFrame]:
    """Apply a configurable preprocessing pipeline to a list of raw frames.

    Pipeline steps (in order):
      1. Orientation correction — rotate/flip based on EXIF orientation tag.
      2. Resize — letterbox-resize to *target_size* if provided.
      3. CLAHE contrast enhancement — skipped when ``config.fast_mode`` is True.
      4. Gaussian denoising — skipped when ``config.fast_mode`` is True.

    Parameters
    ----------
    frames:
        Raw frames as returned by ``video_ingest.extract_frames``:
        ``[(frame_idx, timestamp_sec, frame_bgr), ...]``.
    config:
        Top-level ``AnalysisConfig`` — used for ``fast_mode`` and resolution
        hints from ``config.detector``.
    orientation:
        EXIF orientation string as returned by ``video_ingest.load_video``
        (``VideoMetadata.orientation``).  Pass ``None`` to skip rotation.
    target_size:
        ``(width, height)`` to resize frames to.  If ``None`` no resize is
        performed.

    Returns
    -------
    List[PreprocessedFrame]
        One ``PreprocessedFrame`` per input frame.  On any per-frame error the
        frame is returned unchanged with ``scale_factor=(1.0, 1.0)``.
    """
    if not _CV2_AVAILABLE:
        logger.warning(
            "preprocess_frames: OpenCV is not installed — returning raw frames unchanged."
        )
        return [
            PreprocessedFrame(
                frame_idx=idx,
                timestamp_sec=ts,
                frame=f,
                scale_factor=(1.0, 1.0),
                original_size=(f.shape[1], f.shape[0]),
            )
            for idx, ts, f in frames
        ]

    results: List[PreprocessedFrame] = []

    for frame_idx, timestamp_sec, raw_frame in frames:
        try:
            orig_h, orig_w = raw_frame.shape[:2]
            original_size: Tuple[int, int] = (orig_w, orig_h)
            frame = raw_frame.copy()

            # Step 1: orientation correction
            if orientation and orientation != "normal":
                frame = _apply_orientation(frame, orientation)

            # Step 2: resize
            sx, sy = 1.0, 1.0
            if target_size is not None:
                tw, th = target_size
                frame, sx, sy = _resize_letterbox(frame, tw, th)

            # Step 3: CLAHE (skipped in fast mode)
            if not config.fast_mode:
                frame = _apply_clahe(frame)

            # Step 4: Gaussian denoising (skipped in fast mode)
            if not config.fast_mode:
                try:
                    frame = cv2.GaussianBlur(frame, (3, 3), sigmaX=0.8)
                except Exception as exc:
                    logger.debug(
                        "GaussianBlur failed on frame %d: %s — skipping.", frame_idx, exc
                    )

            results.append(
                PreprocessedFrame(
                    frame_idx=frame_idx,
                    timestamp_sec=timestamp_sec,
                    frame=frame,
                    scale_factor=(sx, sy),
                    original_size=original_size,
                )
            )

        except Exception as exc:  # noqa: BLE001
            logger.error(
                "preprocess_frames: error on frame %d (%s) — using raw frame.",
                frame_idx,
                exc,
            )
            results.append(
                PreprocessedFrame(
                    frame_idx=frame_idx,
                    timestamp_sec=timestamp_sec,
                    frame=raw_frame,
                    scale_factor=(1.0, 1.0),
                    original_size=(raw_frame.shape[1], raw_frame.shape[0]),
                )
            )

    logger.debug("preprocess_frames: processed %d frames.", len(results))
    return results


def stabilize_frames(frames: List[PreprocessedFrame]) -> List[PreprocessedFrame]:
    """Apply basic camera-shake stabilization using optical flow.

    Algorithm overview:
      - Estimate per-frame motion relative to the previous frame via
        ``cv2.calcOpticalFlowPyrLK`` on background-subtracted foreground masks.
      - Accumulate the cumulative warp and apply an affine translation to each
        frame.
      - Falls back gracefully (returns frames unchanged) if:
          * OpenCV is not installed.
          * ``cv2.createBackgroundSubtractorMOG2`` is unavailable.
          * The frame list is shorter than 2 frames.
          * Any internal cv2 call raises an exception.

    The ``scale_factor`` and ``original_size`` fields of each returned
    ``PreprocessedFrame`` are preserved unchanged — stabilization does not
    affect the pixel→original coordinate mapping.

    Parameters
    ----------
    frames:
        List of preprocessed frames (output of ``preprocess_frames``).

    Returns
    -------
    List[PreprocessedFrame]
        Stabilized frames.  On failure the original list is returned intact.
    """
    if not _CV2_AVAILABLE:
        logger.warning(
            "stabilize_frames: OpenCV is not installed — skipping stabilization."
        )
        return frames

    if len(frames) < 2:
        logger.debug("stabilize_frames: need at least 2 frames; skipping.")
        return frames

    # Check for MOG2 availability (it's part of the optional contrib on some builds)
    try:
        bg_subtractor = cv2.createBackgroundSubtractorMOG2(
            history=50, varThreshold=40, detectShadows=False
        )
    except AttributeError:
        logger.warning(
            "stabilize_frames: cv2.createBackgroundSubtractorMOG2 unavailable — "
            "skipping stabilization."
        )
        return frames

    # Optical flow feature parameters
    lk_params = dict(
        winSize=(15, 15),
        maxLevel=2,
        criteria=(cv2.TERM_CRITERIA_EPS | cv2.TERM_CRITERIA_COUNT, 10, 0.03),
    )
    feature_params = dict(maxCorners=200, qualityLevel=0.01, minDistance=30, blockSize=3)

    try:
        stabilized: List[PreprocessedFrame] = []
        cumulative_dx = 0.0
        cumulative_dy = 0.0

        prev_gray = cv2.cvtColor(frames[0].frame, cv2.COLOR_BGR2GRAY)
        # Warm up the background subtractor on the first frame
        bg_subtractor.apply(frames[0].frame)
        stabilized.append(frames[0])  # First frame is the reference — no warp

        for prev_pf, curr_pf in zip(frames[:-1], frames[1:]):
            curr_frame = curr_pf.frame
            curr_gray = cv2.cvtColor(curr_frame, cv2.COLOR_BGR2GRAY)

            # Apply background subtraction to get the foreground mask
            _ = bg_subtractor.apply(curr_frame)
            # Build background (static) mask — we want to track background features
            # Use the previous background model's kernel (invert fg mask)
            fg_mask = bg_subtractor.apply(prev_pf.frame)
            bg_mask = cv2.bitwise_not(fg_mask)

            # Detect features on the background region of the previous frame
            pts = cv2.goodFeaturesToTrack(prev_gray, mask=bg_mask, **feature_params)

            dx, dy = 0.0, 0.0
            if pts is not None and len(pts) >= 4:
                next_pts, status, _ = cv2.calcOpticalFlowPyrLK(
                    prev_gray, curr_gray, pts, None, **lk_params
                )
                if next_pts is not None and status is not None:
                    good_prev = pts[status.ravel() == 1]
                    good_next = next_pts[status.ravel() == 1]
                    if len(good_prev) >= 4 and len(good_next) >= 4:
                        # Estimate pure translation (rigid body assumption)
                        M, _ = cv2.estimateAffinePartial2D(
                            good_prev, good_next, method=cv2.RANSAC,
                            ransacReprojThreshold=3.0,
                        )
                        if M is not None:
                            dx = float(M[0, 2])
                            dy = float(M[1, 2])

            cumulative_dx += dx
            cumulative_dy += dy

            # Build inverse warp to cancel the cumulative camera drift
            M_inv = np.array(
                [[1.0, 0.0, -cumulative_dx], [0.0, 1.0, -cumulative_dy]],
                dtype=np.float32,
            )
            h, w = curr_frame.shape[:2]
            stabilized_frame = cv2.warpAffine(
                curr_frame,
                M_inv,
                (w, h),
                flags=cv2.INTER_LINEAR,
                borderMode=cv2.BORDER_REPLICATE,
            )

            stabilized.append(
                dataclasses.replace(curr_pf, frame=stabilized_frame)
            )
            prev_gray = curr_gray

        logger.info("stabilize_frames: stabilized %d frames.", len(stabilized))
        return stabilized

    except Exception as exc:  # noqa: BLE001
        logger.error(
            "stabilize_frames: unexpected error (%s) — returning original frames.", exc
        )
        return frames
