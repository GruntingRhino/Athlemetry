"""
Ball tracking module for the Baseball Vision Tracker.

Provides a Kalman-filter-based ball tracker with a pure-NumPy fallback,
plus helpers to build a smooth ``BallTrajectory`` from per-frame detections.
"""

from __future__ import annotations

import logging
from typing import List, Optional, Tuple

import numpy as np

try:
    from config import TrackingConfig
except ImportError:
    from config import TrackingConfig  # type: ignore

try:
    from schemas import BallTrajectory, BoundingBox, FrameDetection, TrackPoint
except ImportError:
    from schemas import (  # type: ignore
        BallTrajectory,
        BoundingBox,
        FrameDetection,
        TrackPoint,
    )

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Pure-NumPy Kalman filter (fallback when filterpy is unavailable)
# ---------------------------------------------------------------------------

class SimpleKalman:
    """
    Constant-velocity 2-D Kalman filter implemented with NumPy only.

    State vector: ``[x, y, vx, vy]``
    Measurement vector: ``[x, y]``

    The filter follows the standard discrete-time predict / update cycle.

    Parameters
    ----------
    process_noise:
        Scalar that scales the process-noise covariance matrix Q.  Higher
        values make the filter more responsive to new measurements.
    measurement_noise:
        Scalar that scales the measurement-noise covariance matrix R.
        Higher values smooth more aggressively but lag behind real motion.
    """

    def __init__(
        self,
        process_noise: float = 1.0,
        measurement_noise: float = 5.0,
    ) -> None:
        # State transition matrix  (constant-velocity model, dt=1 frame)
        self.F = np.array(
            [[1, 0, 1, 0],
             [0, 1, 0, 1],
             [0, 0, 1, 0],
             [0, 0, 0, 1]],
            dtype=float,
        )
        # Measurement matrix  (observe x, y only)
        self.H = np.array(
            [[1, 0, 0, 0],
             [0, 1, 0, 0]],
            dtype=float,
        )
        # Process noise covariance
        self.Q = np.eye(4, dtype=float) * process_noise
        # Measurement noise covariance
        self.R = np.eye(2, dtype=float) * measurement_noise
        # State estimate and covariance
        self.x = np.zeros((4, 1), dtype=float)
        self.P = np.eye(4, dtype=float) * 500.0  # large initial uncertainty
        self._initialized = False

    def init(self, x0: float, y0: float) -> None:
        """Seed the filter with an initial position."""
        self.x = np.array([[x0], [y0], [0.0], [0.0]], dtype=float)
        self.P = np.eye(4, dtype=float) * 500.0
        self._initialized = True

    def predict(self) -> Tuple[float, float]:
        """
        Advance the state by one time step without a measurement.

        Returns the predicted (x, y) position.
        """
        self.x = self.F @ self.x
        self.P = self.F @ self.P @ self.F.T + self.Q
        return float(self.x[0, 0]), float(self.x[1, 0])

    def update(self, mx: float, my: float) -> Tuple[float, float]:
        """
        Incorporate a new measurement and return the updated (x, y) estimate.
        """
        z = np.array([[mx], [my]], dtype=float)
        y = z - self.H @ self.x                         # innovation
        S = self.H @ self.P @ self.H.T + self.R          # innovation covariance
        K = self.P @ self.H.T @ np.linalg.inv(S)         # Kalman gain
        self.x = self.x + K @ y
        self.P = (np.eye(4) - K @ self.H) @ self.P
        return float(self.x[0, 0]), float(self.x[1, 0])

    @property
    def initialized(self) -> bool:
        return self._initialized


# ---------------------------------------------------------------------------
# High-level Kalman ball tracker
# ---------------------------------------------------------------------------

class KalmanBallTracker:
    """
    Stateful ball tracker wrapping either *filterpy* (preferred) or
    :class:`SimpleKalman` (pure-NumPy fallback).

    Parameters
    ----------
    process_noise:
        Process noise scalar forwarded to the underlying filter.
    measurement_noise:
        Measurement noise scalar forwarded to the underlying filter.
    """

    def __init__(
        self,
        process_noise: float = 1.0,
        measurement_noise: float = 5.0,
    ) -> None:
        self._process_noise = process_noise
        self._measurement_noise = measurement_noise
        self._filter: Optional[object] = None  # filterpy or SimpleKalman
        self._use_filterpy = False
        self._init_filter()

    # ------------------------------------------------------------------
    # Initialisation / reset
    # ------------------------------------------------------------------

    def _init_filter(self) -> None:
        """Try filterpy first; fall back to SimpleKalman."""
        try:
            from filterpy.kalman import KalmanFilter  # type: ignore

            kf = KalmanFilter(dim_x=4, dim_z=2)
            kf.F = np.array(
                [[1, 0, 1, 0],
                 [0, 1, 0, 1],
                 [0, 0, 1, 0],
                 [0, 0, 0, 1]],
                dtype=float,
            )
            kf.H = np.array(
                [[1, 0, 0, 0],
                 [0, 1, 0, 0]],
                dtype=float,
            )
            kf.R *= self._measurement_noise
            kf.Q *= self._process_noise
            kf.P *= 500.0
            self._filter = kf
            self._use_filterpy = True
            logger.debug("KalmanBallTracker: using filterpy backend.")
        except ImportError:
            self._filter = SimpleKalman(
                process_noise=self._process_noise,
                measurement_noise=self._measurement_noise,
            )
            self._use_filterpy = False
            logger.debug("filterpy not found – using pure-NumPy Kalman fallback.")

    def reset(self) -> None:
        """Re-initialise the filter to its prior (uninitialised) state."""
        self._init_filter()

    # ------------------------------------------------------------------
    # Core predict / update step
    # ------------------------------------------------------------------

    def update(
        self,
        detection: Optional[BoundingBox],
    ) -> Tuple[float, float, float]:
        """
        Advance the tracker by one frame.

        Parameters
        ----------
        detection:
            Detected bounding box for this frame, or ``None`` if the ball was
            not detected.

        Returns
        -------
        (x, y, confidence)
            Estimated ball centre in pixel coordinates and a confidence value
            (0–1).  When predicting without a detection the confidence is
            reduced proportionally.
        """
        if detection is not None:
            cx, cy = detection.center
            det_conf = float(detection.confidence)

            if self._use_filterpy:
                kf = self._filter  # type: ignore[assignment]
                if not getattr(kf, "_initialized_custom", False):
                    kf.x = np.array([[cx], [cy], [0.0], [0.0]], dtype=float)
                    kf._initialized_custom = True  # type: ignore[attr-defined]
                kf.predict()
                kf.update(np.array([[cx], [cy]]))
                x_est = float(kf.x[0, 0])
                y_est = float(kf.x[1, 0])
            else:
                sk: SimpleKalman = self._filter  # type: ignore[assignment]
                if not sk.initialized:
                    sk.init(cx, cy)
                else:
                    sk.predict()
                sk.update(cx, cy)
                x_est, y_est = float(sk.x[0, 0]), float(sk.x[1, 0])

            return x_est, y_est, det_conf

        else:
            # No detection – predict only
            if self._use_filterpy:
                kf = self._filter  # type: ignore[assignment]
                if not getattr(kf, "_initialized_custom", False):
                    # Filter was never seeded; nothing to predict
                    return 0.0, 0.0, 0.0
                kf.predict()
                x_est = float(kf.x[0, 0])
                y_est = float(kf.x[1, 0])
            else:
                sk: SimpleKalman = self._filter  # type: ignore[assignment]
                if not sk.initialized:
                    return 0.0, 0.0, 0.0
                x_est, y_est = sk.predict()

            # Confidence decays when predicting without measurement
            return x_est, y_est, 0.2


# ---------------------------------------------------------------------------
# Trajectory smoothing
# ---------------------------------------------------------------------------

def smooth_trajectory(
    points: List[TrackPoint],
    window: int = 5,
) -> List[TrackPoint]:
    """
    Apply a rolling-mean (or Savitzky-Golay when scipy is available) smoothing
    to the (x, y) coordinates of a ball trajectory.

    Parameters
    ----------
    points:
        Temporally ordered ``TrackPoint`` list.
    window:
        Smoothing window size in frames.  Must be odd; incremented if even.

    Returns
    -------
    A new list of ``TrackPoint`` objects.  Points that were already
    ``interpolated=True`` retain the flag; smoothed gap-fill points are also
    marked ``interpolated=True``.
    """
    if not points or window <= 1:
        return list(points)

    if window % 2 == 0:
        window += 1

    n = len(points)
    xs = np.array([p.x for p in points], dtype=float)
    ys = np.array([p.y for p in points], dtype=float)

    smoothed_x = xs.copy()
    smoothed_y = ys.copy()

    # Try scipy Savitzky-Golay first for better derivative preservation
    try:
        from scipy.signal import savgol_filter  # type: ignore

        poly_order = min(3, window - 1)
        if window >= poly_order + 1 and n >= window:
            smoothed_x = savgol_filter(xs, window_length=window, polyorder=poly_order)
            smoothed_y = savgol_filter(ys, window_length=window, polyorder=poly_order)
            logger.debug("smooth_trajectory: using Savitzky-Golay filter (window=%d).", window)
        # else fall through to rolling mean
    except ImportError:
        # Rolling mean fallback
        half = window // 2
        for i in range(n):
            lo = max(0, i - half)
            hi = min(n, i + half + 1)
            smoothed_x[i] = float(np.mean(xs[lo:hi]))
            smoothed_y[i] = float(np.mean(ys[lo:hi]))
        logger.debug("smooth_trajectory: using rolling-mean filter (window=%d).", window)

    result: List[TrackPoint] = []
    for i, pt in enumerate(points):
        result.append(
            TrackPoint(
                frame_idx=pt.frame_idx,
                timestamp_sec=pt.timestamp_sec,
                x=float(smoothed_x[i]),
                y=float(smoothed_y[i]),
                confidence=pt.confidence,
                interpolated=pt.interpolated,
            )
        )
    return result


# ---------------------------------------------------------------------------
# Main tracking pipeline
# ---------------------------------------------------------------------------

def track_ball(
    detections: List[FrameDetection],
    config: Optional[TrackingConfig] = None,
) -> BallTrajectory:
    """
    Build a smoothed :class:`BallTrajectory` from per-frame YOLO detections.

    Algorithm
    ---------
    1. Run :class:`KalmanBallTracker` over every ``FrameDetection``.
    2. When the ball is missing for ≤ ``max_ball_gap_frames`` consecutive
       frames, the Kalman prediction is used and those points are marked
       ``interpolated=True``.
    3. Gaps larger than ``max_ball_gap_frames`` reset the tracker (segment
       boundary) and those frames are skipped.
    4. The raw trajectory is smoothed with :func:`smooth_trajectory`.
    5. Overall confidence = mean confidence of non-interpolated points.

    Parameters
    ----------
    detections:
        One ``FrameDetection`` per frame, in temporal order.
    config:
        Tracking configuration.  Defaults to ``TrackingConfig()``.

    Returns
    -------
    A populated ``BallTrajectory``.
    """
    cfg = config or TrackingConfig()
    tracker = KalmanBallTracker(
        process_noise=cfg.ball_process_noise,
        measurement_noise=cfg.ball_measurement_noise,
    )
    max_gap = cfg.max_ball_gap_frames
    notes: List[str] = []

    raw_points: List[TrackPoint] = []
    consecutive_misses = 0
    any_detection = False

    for fd in detections:
        detection = fd.baseball
        timestamp = fd.timestamp_sec
        fidx = fd.frame_idx

        if detection is not None:
            any_detection = True
            consecutive_misses = 0
            x_est, y_est, conf = tracker.update(detection)
            raw_points.append(
                TrackPoint(
                    frame_idx=fidx,
                    timestamp_sec=timestamp,
                    x=x_est,
                    y=y_est,
                    confidence=conf,
                    interpolated=False,
                )
            )
        else:
            consecutive_misses += 1
            if consecutive_misses <= max_gap:
                # Predict / interpolate
                x_est, y_est, _ = tracker.update(None)
                if x_est != 0.0 or y_est != 0.0:
                    raw_points.append(
                        TrackPoint(
                            frame_idx=fidx,
                            timestamp_sec=timestamp,
                            x=x_est,
                            y=y_est,
                            confidence=0.2,
                            interpolated=True,
                        )
                    )
            else:
                # Gap too large – reset tracker, start fresh segment
                if consecutive_misses == max_gap + 1:
                    notes.append(
                        f"Track segment break at frame {fidx} "
                        f"(gap > {max_gap} frames)."
                    )
                tracker.reset()

    if not raw_points:
        return BallTrajectory(
            points=[],
            smoothed_points=[],
            tracking_method="fallback",
            confidence=0.0,
            notes=["No ball detections found; trajectory is empty."],
        )

    # Smooth
    smooth_window = min(5, len(raw_points))
    smoothed = smooth_trajectory(raw_points, window=smooth_window)

    # Overall confidence = mean of non-interpolated points
    real_confs = [p.confidence for p in raw_points if not p.interpolated]
    overall_conf = float(np.mean(real_confs)) if real_confs else 0.0

    tracking_method = "yolo+kalman" if any_detection else "fallback"

    return BallTrajectory(
        points=raw_points,
        smoothed_points=smoothed,
        tracking_method=tracking_method,
        confidence=overall_conf,
        notes=notes,
    )
