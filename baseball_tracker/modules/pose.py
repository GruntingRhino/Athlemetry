"""
Pose estimation module for the Baseball Vision Tracker.

Provides an abstract PoseEstimator interface and a MediaPipe-backed
implementation that maps the 33-landmark MediaPipe model to a named-landmark
schema.  Also includes temporal smoothing utilities.
"""

from __future__ import annotations

import logging
import math
from abc import ABC, abstractmethod
from typing import Dict, List, Optional

import numpy as np

try:
    from config import PoseConfig
except ImportError:
    from config import PoseConfig  # type: ignore

try:
    from schemas import FramePose, PoseLandmark
except ImportError:
    from schemas import FramePose, PoseLandmark  # type: ignore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# MediaPipe landmark index → our schema name mapping
# Based on the MediaPipe 33-landmark pose model
# https://developers.google.com/mediapipe/solutions/vision/pose_landmarker
# ---------------------------------------------------------------------------

_MP_LANDMARK_MAP: Dict[int, str] = {
    0:  "nose",
    1:  "left_eye_inner",
    2:  "left_eye",
    3:  "left_eye_outer",
    4:  "right_eye_inner",
    5:  "right_eye",
    6:  "right_eye_outer",
    7:  "left_ear",
    8:  "right_ear",
    9:  "mouth_left",
    10: "mouth_right",
    11: "left_shoulder",
    12: "right_shoulder",
    13: "left_elbow",
    14: "right_elbow",
    15: "left_wrist",
    16: "right_wrist",
    17: "left_pinky",
    18: "right_pinky",
    19: "left_index",
    20: "right_index",
    21: "left_thumb",
    22: "right_thumb",
    23: "left_hip",
    24: "right_hip",
    25: "left_knee",
    26: "right_knee",
    27: "left_ankle",
    28: "right_ankle",
    29: "left_heel",
    30: "right_heel",
    31: "left_foot_index",
    32: "right_foot_index",
}

# Landmarks used to compute overall_confidence
_KEY_LANDMARK_NAMES = {
    "nose",
    "left_shoulder",
    "right_shoulder",
    "left_elbow",
    "right_elbow",
    "left_wrist",
    "right_wrist",
    "left_hip",
    "right_hip",
    "left_knee",
    "right_knee",
    "left_ankle",
    "right_ankle",
}


# ---------------------------------------------------------------------------
# Abstract base class
# ---------------------------------------------------------------------------

class PoseEstimator(ABC):
    """Abstract interface for a single-frame pose estimator."""

    @abstractmethod
    def estimate(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp: float,
    ) -> Optional[FramePose]:
        """
        Estimate pose landmarks for a single BGR frame.

        Parameters
        ----------
        frame:
            HxWx3 uint8 NumPy array in BGR colour order (OpenCV convention).
        frame_idx:
            Zero-based frame index within the clip.
        timestamp:
            Timestamp in seconds corresponding to this frame.

        Returns
        -------
        FramePose or None if estimation fails or the model is unavailable.
        """


# ---------------------------------------------------------------------------
# MediaPipe implementation
# ---------------------------------------------------------------------------

class MediaPipePoseEstimator(PoseEstimator):
    """
    Pose estimator backed by MediaPipe's BlazePose (33-landmark model).

    If ``mediapipe`` is not installed the estimator degrades gracefully:
    ``estimate()`` always returns ``None`` and a warning is emitted once.
    """

    def __init__(self, config: Optional[PoseConfig] = None) -> None:
        """
        Parameters
        ----------
        config:
            ``PoseConfig`` instance.  Defaults to ``PoseConfig()`` if omitted.
        """
        self._config = config or PoseConfig()
        self._mp_pose = None          # lazy-loaded mediapipe Pose object
        self._mp_available: Optional[bool] = None  # None = not yet checked
        self._warned_missing = False

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _ensure_mediapipe(self) -> bool:
        """Try to import mediapipe and initialise the Pose solution once."""
        if self._mp_available is not None:
            return self._mp_available

        try:
            import mediapipe as mp  # noqa: F401 – checked here, stored below
            pose_solution = mp.solutions.pose.Pose(
                static_image_mode=False,
                model_complexity=1,
                smooth_landmarks=True,
                min_detection_confidence=self._config.min_detection_confidence,
                min_tracking_confidence=self._config.min_tracking_confidence,
            )
            self._mp_pose = pose_solution
            self._mp_available = True
            logger.debug("MediaPipe Pose initialised successfully.")
        except ImportError:
            self._mp_available = False
            if not self._warned_missing:
                logger.warning(
                    "mediapipe is not installed – pose estimation is disabled. "
                    "Install it with: pip install mediapipe"
                )
                self._warned_missing = True

        return self._mp_available  # type: ignore[return-value]

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def estimate(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp: float,
    ) -> Optional[FramePose]:
        """
        Run MediaPipe pose estimation on a single BGR frame.

        Returns ``None`` if mediapipe is unavailable, if the frame has no
        detectable person, or if an unexpected error occurs.
        """
        if not self._ensure_mediapipe():
            return None

        try:
            import cv2  # noqa: F401 – used for colour conversion below

            h, w = frame.shape[:2]

            # MediaPipe expects RGB
            rgb = frame[:, :, ::-1].copy()
            results = self._mp_pose.process(rgb)  # type: ignore[union-attr]

            if results.pose_landmarks is None:
                return None

            landmarks: Dict[str, PoseLandmark] = {}
            for idx, lm in enumerate(results.pose_landmarks.landmark):
                name = _MP_LANDMARK_MAP.get(idx)
                if name is None:
                    continue
                landmarks[name] = PoseLandmark(
                    name=name,
                    x=lm.x * w,
                    y=lm.y * h,
                    z=lm.z,           # depth relative to hip midpoint (approx.)
                    visibility=float(lm.visibility),
                )

            # overall_confidence = mean visibility of key landmarks present
            key_vis = [
                landmarks[n].visibility
                for n in _KEY_LANDMARK_NAMES
                if n in landmarks
            ]
            overall_confidence = float(np.mean(key_vis)) if key_vis else 0.0

            return FramePose(
                frame_idx=frame_idx,
                timestamp_sec=timestamp,
                landmarks=landmarks,
                overall_confidence=overall_confidence,
            )

        except Exception as exc:  # noqa: BLE001
            logger.warning("Pose estimation failed on frame %d: %s", frame_idx, exc)
            return None

    def close(self) -> None:
        """Release MediaPipe resources."""
        if self._mp_pose is not None:
            try:
                self._mp_pose.close()
            except Exception:  # noqa: BLE001
                pass
            self._mp_pose = None


# ---------------------------------------------------------------------------
# Temporal smoothing
# ---------------------------------------------------------------------------

def smooth_landmarks(
    poses: List[FramePose],
    window: int = 5,
) -> List[FramePose]:
    """
    Apply a rolling-mean smoothing to landmark (x, y) positions across frames.

    Only landmarks that exist in *all* frames within a window are smoothed;
    frames with ``overall_confidence`` below 0.3 are left unchanged so that
    low-quality estimates do not pollute surrounding frames.

    Parameters
    ----------
    poses:
        Temporally ordered list of ``FramePose`` objects (may contain gaps).
    window:
        Number of frames over which the rolling mean is computed.  Must be
        an odd integer ≥ 1; if even, it is incremented by 1.

    Returns
    -------
    A new list of ``FramePose`` objects with smoothed landmark coordinates.
    The original ``poses`` list is not mutated.
    """
    if not poses or window <= 1:
        return list(poses)

    # Ensure odd window for symmetric centring
    if window % 2 == 0:
        window += 1
    half = window // 2

    # Collect all landmark names across all poses
    all_names: set[str] = set()
    for fp in poses:
        all_names.update(fp.landmarks.keys())

    n = len(poses)
    confidence_threshold = 0.3

    # Build per-landmark arrays: shape (n,) for x and y
    # Use NaN where the landmark or the pose is missing / low-confidence
    x_arr: Dict[str, np.ndarray] = {name: np.full(n, np.nan) for name in all_names}
    y_arr: Dict[str, np.ndarray] = {name: np.full(n, np.nan) for name in all_names}

    for i, fp in enumerate(poses):
        if fp.overall_confidence < confidence_threshold:
            continue  # leave as NaN – will not be smoothed
        for name, lm in fp.landmarks.items():
            x_arr[name][i] = lm.x
            y_arr[name][i] = lm.y

    # Compute smoothed values via a sliding window nanmean
    x_smooth: Dict[str, np.ndarray] = {}
    y_smooth: Dict[str, np.ndarray] = {}
    for name in all_names:
        xs = np.full(n, np.nan)
        ys = np.full(n, np.nan)
        for i in range(n):
            lo = max(0, i - half)
            hi = min(n, i + half + 1)
            window_x = x_arr[name][lo:hi]
            window_y = y_arr[name][lo:hi]
            if not np.all(np.isnan(window_x)):
                xs[i] = float(np.nanmean(window_x))
                ys[i] = float(np.nanmean(window_y))
        x_smooth[name] = xs
        y_smooth[name] = ys

    # Build output poses, replacing coords where smoothed value is available
    smoothed_poses: List[FramePose] = []
    for i, fp in enumerate(poses):
        new_landmarks: Dict[str, PoseLandmark] = {}
        for name, lm in fp.landmarks.items():
            sx = x_smooth.get(name, x_arr[name])[i]
            sy = y_smooth.get(name, y_arr[name])[i]
            if not (math.isnan(sx) or math.isnan(sy)):
                new_landmarks[name] = PoseLandmark(
                    name=lm.name,
                    x=sx,
                    y=sy,
                    z=lm.z,
                    visibility=lm.visibility,
                )
            else:
                # Keep original if smoothing yielded NaN
                new_landmarks[name] = lm

        smoothed_poses.append(
            FramePose(
                frame_idx=fp.frame_idx,
                timestamp_sec=fp.timestamp_sec,
                landmarks=new_landmarks,
                overall_confidence=fp.overall_confidence,
            )
        )

    return smoothed_poses


# ---------------------------------------------------------------------------
# Batch estimation helper
# ---------------------------------------------------------------------------

def estimate_all_frames(
    frames: List[np.ndarray],
    config: Optional[PoseConfig] = None,
) -> List[Optional[FramePose]]:
    """
    Run pose estimation on every frame in ``frames``.

    Parameters
    ----------
    frames:
        List of BGR frames (NumPy arrays) in temporal order.
    config:
        ``PoseConfig`` to pass to the estimator.  Defaults to ``PoseConfig()``.

    Returns
    -------
    A list of the same length as ``frames`` where each element is either a
    ``FramePose`` or ``None`` (if estimation failed for that frame).
    Progress is logged every 50 frames.
    """
    cfg = config or PoseConfig()
    estimator = MediaPipePoseEstimator(cfg)
    results: List[Optional[FramePose]] = []
    total = len(frames)

    try:
        for idx, frame in enumerate(frames):
            # Derive timestamp assuming constant fps when not provided; callers
            # that know the true timestamp should post-process as needed.
            timestamp = float(idx)
            pose = estimator.estimate(frame, frame_idx=idx, timestamp=timestamp)
            results.append(pose)

            if (idx + 1) % 50 == 0:
                detected = sum(1 for r in results if r is not None)
                logger.info(
                    "Pose estimation progress: %d / %d frames processed "
                    "(%d with detections)",
                    idx + 1,
                    total,
                    detected,
                )
    finally:
        estimator.close()

    logger.info(
        "Pose estimation complete: %d / %d frames had pose detections.",
        sum(1 for r in results if r is not None),
        total,
    )
    return results
