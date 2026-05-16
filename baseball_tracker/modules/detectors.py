"""
detectors.py — Object detection for the baseball tracker pipeline.

Provides:
  - DetectionResult: thin typed wrapper around FrameDetection for internal use.
  - BaseDetector: abstract interface that all detectors implement.
  - YOLODetector: ultralytics-backed detector; loaded lazily on first call.
      Maps COCO classes → baseball / batter / bat.
      Gracefully degrades to FallbackDetector when ultralytics is absent.
  - FallbackDetector: pure-OpenCV detector that uses colour/shape analysis for
      the baseball, a full-frame proxy for the batter, and None for the bat.
  - detect_all_frames: run the chosen detector over a list of preprocessed
      frames and aggregate a DetectionSummary.

All imports are wrapped in try/except so the module works even when neither
OpenCV nor ultralytics are installed (results will have low/zero confidence).
"""

from __future__ import annotations

import abc
import dataclasses
import logging
from typing import List, Optional, Tuple

import numpy as np

# ---------------------------------------------------------------------------
# Optional dependency imports
# ---------------------------------------------------------------------------
try:
    import cv2  # type: ignore

    _CV2_AVAILABLE = True
except ImportError:
    _CV2_AVAILABLE = False
    cv2 = None  # type: ignore

try:
    from ultralytics import YOLO  # type: ignore

    _YOLO_AVAILABLE = True
except ImportError:
    _YOLO_AVAILABLE = False
    YOLO = None  # type: ignore

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Schema / config imports
# ---------------------------------------------------------------------------
from schemas import BoundingBox, DetectionSummary, FrameDetection  # noqa: E402
from config import AnalysisConfig, DetectorConfig  # noqa: E402
from modules.preprocess import PreprocessedFrame  # noqa: E402


# ---------------------------------------------------------------------------
# COCO class constants
# ---------------------------------------------------------------------------
_COCO_PERSON = 0        # used as proxy for batter
_COCO_SPORTS_BALL = 32  # used for baseball
_COCO_BASEBALL_BAT = 34


# ---------------------------------------------------------------------------
# DetectionResult
# ---------------------------------------------------------------------------

@dataclasses.dataclass
class DetectionResult:
    """Internal per-frame result wrapper used within the detector pipeline.

    Wraps a :class:`~baseball_tracker.schemas.FrameDetection` and carries
    additional context not exposed in the public schema (e.g. which detector
    produced the result).

    Attributes
    ----------
    detection:
        The public ``FrameDetection`` schema object.
    detector_name:
        Human-readable name of the detector that produced this result.
    raw_output:
        Unstructured raw output from the underlying model (YOLO result object,
        contour list, etc.) for debugging.  Not serialised.
    """

    detection: FrameDetection
    detector_name: str
    raw_output: Optional[object] = dataclasses.field(default=None, repr=False)


# ---------------------------------------------------------------------------
# Abstract base
# ---------------------------------------------------------------------------

class BaseDetector(abc.ABC):
    """Abstract base class for all baseball-tracker detectors.

    Subclasses must implement :meth:`detect`.  All other pipeline helpers
    delegate through this interface so detectors are interchangeable.
    """

    @abc.abstractmethod
    def detect(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp_sec: float,
    ) -> FrameDetection:
        """Run detection on a single frame.

        Parameters
        ----------
        frame:
            BGR uint8 NumPy array (as returned by OpenCV / ``PreprocessedFrame``).
        frame_idx:
            Zero-based index of the frame in the video.
        timestamp_sec:
            Timestamp in seconds corresponding to *frame_idx*.

        Returns
        -------
        FrameDetection
            Detected bounding boxes (or ``None`` fields where not found).
        """

    @property
    def name(self) -> str:
        """Short human-readable detector name."""
        return self.__class__.__name__


# ---------------------------------------------------------------------------
# YOLO detector
# ---------------------------------------------------------------------------

class YOLODetector(BaseDetector):
    """Ultralytics YOLO-based detector.

    The YOLO model is loaded lazily on the first call to :meth:`detect` so
    that instantiation does not incur the loading cost.

    Parameters
    ----------
    config:
        ``DetectorConfig`` supplying the model path and confidence threshold.

    Notes
    -----
    COCO class mapping used:
      - ``person`` (0) → batter bounding box
      - ``sports_ball`` (32) → baseball bounding box
      - ``baseball_bat`` (34) → bat bounding box
    """

    def __init__(self, config: DetectorConfig) -> None:
        self._config = config
        self._model: Optional[object] = None  # loaded lazily
        self._model_loaded = False
        self._load_error: Optional[str] = None

    # ------------------------------------------------------------------
    # Lazy model loading
    # ------------------------------------------------------------------

    def _ensure_model(self) -> bool:
        """Load the YOLO model if not already loaded.

        Returns
        -------
        bool
            ``True`` if the model is available and ready, ``False`` otherwise.
        """
        if self._model_loaded:
            return self._model is not None

        self._model_loaded = True  # mark attempted regardless of outcome

        if not _YOLO_AVAILABLE:
            self._load_error = (
                "ultralytics is not installed.  "
                "Install it with:  pip install ultralytics"
            )
            logger.warning("YOLODetector: %s", self._load_error)
            return False

        model_path = self._config.yolo_model
        try:
            logger.info("YOLODetector: loading model '%s' ...", model_path)
            self._model = YOLO(model_path)
            logger.info("YOLODetector: model loaded successfully.")
            return True
        except Exception as exc:
            self._load_error = str(exc)
            logger.error("YOLODetector: failed to load model '%s': %s", model_path, exc)
            return False

    # ------------------------------------------------------------------
    # Internal result parsing
    # ------------------------------------------------------------------

    @staticmethod
    def _best_box_for_class(
        result: object,  # ultralytics Results object
        class_id: int,
        conf_threshold: float,
    ) -> Optional[BoundingBox]:
        """Extract the highest-confidence detection for *class_id* from a YOLO result.

        Returns ``None`` if no box meets the threshold.
        """
        try:
            boxes = result.boxes  # type: ignore[attr-defined]
            if boxes is None or len(boxes) == 0:
                return None

            best_conf = -1.0
            best_box: Optional[BoundingBox] = None

            for box in boxes:
                cls = int(box.cls.item())
                conf = float(box.conf.item())
                if cls != class_id or conf < conf_threshold:
                    continue
                xyxy = box.xyxy[0].tolist()
                if conf > best_conf:
                    best_conf = conf
                    best_box = BoundingBox(
                        x1=float(xyxy[0]),
                        y1=float(xyxy[1]),
                        x2=float(xyxy[2]),
                        y2=float(xyxy[3]),
                        confidence=conf,
                    )
            return best_box
        except Exception as exc:
            logger.debug("_best_box_for_class: parse error: %s", exc)
            return None

    # ------------------------------------------------------------------
    # Public detect
    # ------------------------------------------------------------------

    def detect(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp_sec: float,
    ) -> FrameDetection:
        """Run YOLO inference on *frame* and return per-class bounding boxes.

        If the model is unavailable (ultralytics not installed or model load
        error), returns a ``FrameDetection`` with all fields set to ``None``.
        """
        if not self._ensure_model() or self._model is None:
            return FrameDetection(
                frame_idx=frame_idx,
                timestamp_sec=timestamp_sec,
            )

        try:
            results = self._model(  # type: ignore[call-arg]
                frame,
                conf=self._config.detection_confidence,
                iou=self._config.iou_threshold,
                verbose=False,
            )
            result = results[0]
        except Exception as exc:
            logger.warning(
                "YOLODetector.detect: inference error on frame %d: %s", frame_idx, exc
            )
            return FrameDetection(frame_idx=frame_idx, timestamp_sec=timestamp_sec)

        conf_thresh = self._config.detection_confidence

        baseball = self._best_box_for_class(result, _COCO_SPORTS_BALL, conf_thresh)
        batter = self._best_box_for_class(result, _COCO_PERSON, conf_thresh)
        bat = self._best_box_for_class(result, _COCO_BASEBALL_BAT, conf_thresh)

        # Optional: if a specialised baseball model is configured, use it
        if baseball is None and self._config.baseball_model:
            baseball = self._detect_with_baseball_model(frame, conf_thresh)

        return FrameDetection(
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            baseball=baseball,
            batter=batter,
            bat=bat,
        )

    def _detect_with_baseball_model(
        self, frame: np.ndarray, conf_thresh: float
    ) -> Optional[BoundingBox]:
        """Run the specialised small-object baseball model if configured."""
        try:
            spec_model = YOLO(self._config.baseball_model)  # type: ignore[misc]
            results = spec_model(frame, conf=conf_thresh, verbose=False)
            result = results[0]
            # Assume class 0 in the specialised model is the baseball
            return self._best_box_for_class(result, 0, conf_thresh)
        except Exception as exc:
            logger.debug("baseball_model inference failed: %s", exc)
            return None


# ---------------------------------------------------------------------------
# Fallback detector
# ---------------------------------------------------------------------------

class FallbackDetector(BaseDetector):
    """Pure-OpenCV fallback detector used when YOLO is unavailable.

    Detection strategy:
      - **Baseball**: colour-based detection targeting bright-white circular
        blobs.  First attempts ``cv2.HoughCircles``; falls back to contour
        analysis if no circles are found.
      - **Batter**: returns the full-frame bounding box at 0.3 confidence as a
        last-resort proxy.
      - **Bat**: always returns ``None`` (bat detection requires a learned model).
    """

    def detect(
        self,
        frame: np.ndarray,
        frame_idx: int,
        timestamp_sec: float,
    ) -> FrameDetection:
        """Run fallback detection on *frame*.

        Returns
        -------
        FrameDetection
            Baseball detection via colour/shape analysis;
            batter as full-frame box;
            bat as None.
        """
        baseball = self._detect_baseball(frame)
        batter = self._detect_batter_fallback(frame)
        return FrameDetection(
            frame_idx=frame_idx,
            timestamp_sec=timestamp_sec,
            baseball=baseball,
            batter=batter,
            bat=None,  # cannot detect bat without a learned model
        )

    # ------------------------------------------------------------------
    # Baseball detection helpers
    # ------------------------------------------------------------------

    def _detect_baseball(self, frame: np.ndarray) -> Optional[BoundingBox]:
        """Detect a bright-white circular object (the baseball) in *frame*.

        Tries HoughCircles first; falls back to contour analysis on the
        white-region mask.  Returns ``None`` if OpenCV is unavailable or no
        candidate is found.
        """
        if not _CV2_AVAILABLE or frame is None:
            return None

        try:
            return self._hough_baseball(frame) or self._contour_baseball(frame)
        except Exception as exc:
            logger.debug("FallbackDetector._detect_baseball error: %s", exc)
            return None

    def _hough_baseball(self, frame: np.ndarray) -> Optional[BoundingBox]:
        """Use HoughCircles to find the baseball."""
        gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
        h, w = gray.shape

        # Blur first to reduce noise
        blurred = cv2.GaussianBlur(gray, (9, 9), 2)

        # Radius bounds: baseball occupies ~1–5% of the shorter frame dimension
        min_radius = max(3, int(min(h, w) * 0.005))
        max_radius = max(min_radius + 1, int(min(h, w) * 0.05))

        circles = cv2.HoughCircles(
            blurred,
            cv2.HOUGH_GRADIENT,
            dp=1,
            minDist=min(h, w) * 0.05,
            param1=60,
            param2=25,
            minRadius=min_radius,
            maxRadius=max_radius,
        )
        if circles is None:
            return None

        circles = np.round(circles[0, :]).astype(int)

        # Score each circle by how white/bright the region is
        best_score = -1.0
        best_circle = None
        for cx, cy, r in circles:
            mask = np.zeros(gray.shape, dtype=np.uint8)
            cv2.circle(mask, (cx, cy), r, 255, -1)
            mean_val = cv2.mean(gray, mask=mask)[0]
            # Score: normalised brightness; prefer circles with bright interiors
            score = mean_val / 255.0
            if score > best_score and mean_val > 180:
                best_score = score
                best_circle = (cx, cy, r)

        if best_circle is None:
            return None

        cx, cy, r = best_circle
        return BoundingBox(
            x1=float(cx - r),
            y1=float(cy - r),
            x2=float(cx + r),
            y2=float(cy + r),
            confidence=min(0.6, best_score),  # cap at 0.6 — fallback is not reliable
        )

    def _contour_baseball(self, frame: np.ndarray) -> Optional[BoundingBox]:
        """Find a near-circular white region via contour analysis."""
        # Isolate bright-white pixels
        hsv = cv2.cvtColor(frame, cv2.COLOR_BGR2HSV)
        # White: low saturation, high value
        lower_white = np.array([0, 0, 200], dtype=np.uint8)
        upper_white = np.array([180, 40, 255], dtype=np.uint8)
        mask = cv2.inRange(hsv, lower_white, upper_white)

        # Morphological close to fill small gaps
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)

        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours:
            return None

        h, w = frame.shape[:2]
        frame_area = h * w
        best_box: Optional[BoundingBox] = None
        best_circularity = 0.0

        for cnt in contours:
            area = cv2.contourArea(cnt)
            if area < 20 or area > frame_area * 0.02:
                continue  # too small or too large to be a baseball
            perimeter = cv2.arcLength(cnt, True)
            if perimeter == 0:
                continue
            circularity = (4 * np.pi * area) / (perimeter ** 2)
            if circularity > 0.65 and circularity > best_circularity:
                best_circularity = circularity
                x, y, bw, bh = cv2.boundingRect(cnt)
                best_box = BoundingBox(
                    x1=float(x),
                    y1=float(y),
                    x2=float(x + bw),
                    y2=float(y + bh),
                    confidence=min(0.5, circularity * 0.5),
                )

        return best_box

    # ------------------------------------------------------------------
    # Batter fallback
    # ------------------------------------------------------------------

    def _detect_batter_fallback(self, frame: np.ndarray) -> Optional[BoundingBox]:
        """Return the full frame as a low-confidence batter bounding box."""
        if frame is None:
            return None
        h, w = frame.shape[:2]
        return BoundingBox(
            x1=0.0,
            y1=0.0,
            x2=float(w),
            y2=float(h),
            confidence=0.3,
        )


# ---------------------------------------------------------------------------
# detect_all_frames
# ---------------------------------------------------------------------------

def detect_all_frames(
    frames: List[PreprocessedFrame],
    config: AnalysisConfig,
) -> Tuple[List[FrameDetection], DetectionSummary]:
    """Run object detection on every frame in *frames*.

    Detector selection:
      1. ``YOLODetector`` if ultralytics is installed and the model can be loaded.
      2. ``FallbackDetector`` otherwise.

    Parameters
    ----------
    frames:
        Preprocessed frames (output of ``preprocess.preprocess_frames``).
    config:
        Top-level ``AnalysisConfig``.

    Returns
    -------
    detections : List[FrameDetection]
        One ``FrameDetection`` per input frame (in the same order).
    summary : DetectionSummary
        Aggregate detection quality statistics.
    """
    detector_cfg = config.detector

    # Choose detector
    detector: BaseDetector
    if _YOLO_AVAILABLE:
        yolo_det = YOLODetector(detector_cfg)
        # Probe model availability — if load fails, fall back
        if yolo_det._ensure_model():
            detector = yolo_det
            logger.info("detect_all_frames: using YOLODetector (%s).", detector_cfg.yolo_model)
        else:
            detector = FallbackDetector()
            logger.warning(
                "detect_all_frames: YOLO model unavailable — using FallbackDetector."
            )
    else:
        detector = FallbackDetector()
        logger.info(
            "detect_all_frames: ultralytics not installed — using FallbackDetector."
        )

    detections: List[FrameDetection] = []
    notes: List[str] = []

    stride = detector_cfg.detection_stride
    if stride < 1:
        stride = 1

    # Run detection
    last_detection: Optional[FrameDetection] = None
    for pf in frames:
        if pf.frame_idx % stride != 0 and last_detection is not None:
            # Carry forward the previous detection for skipped frames
            carried = FrameDetection(
                frame_idx=pf.frame_idx,
                timestamp_sec=pf.timestamp_sec,
                baseball=last_detection.baseball,
                batter=last_detection.batter,
                bat=last_detection.bat,
            )
            detections.append(carried)
            continue

        try:
            det = detector.detect(pf.frame, pf.frame_idx, pf.timestamp_sec)
        except Exception as exc:
            logger.error(
                "detect_all_frames: detector raised on frame %d: %s — using empty detection.",
                pf.frame_idx,
                exc,
            )
            det = FrameDetection(
                frame_idx=pf.frame_idx,
                timestamp_sec=pf.timestamp_sec,
            )

        detections.append(det)
        last_detection = det

    # Aggregate summary
    total = len(detections)
    baseball_frames = sum(1 for d in detections if d.baseball is not None)
    batter_frames = sum(1 for d in detections if d.batter is not None)
    bat_frames = sum(1 for d in detections if d.bat is not None)

    if isinstance(detector, FallbackDetector):
        notes.append(
            "FallbackDetector used: batter detections are full-frame proxies "
            "(confidence=0.3); bat detections are absent; baseball uses colour heuristics."
        )
        if not _CV2_AVAILABLE:
            notes.append(
                "OpenCV not installed: all detections are empty (confidence=0)."
            )
    if stride > 1:
        notes.append(
            f"detection_stride={stride}: detections were run on every {stride}th frame; "
            "intermediate frames carry forward the previous result."
        )

    summary = DetectionSummary(
        baseball_detected_frames=baseball_frames,
        batter_detected_frames=batter_frames,
        bat_detected_frames=bat_frames,
        total_frames=total,
        baseball_detection_rate=baseball_frames / total if total else 0.0,
        batter_detection_rate=batter_frames / total if total else 0.0,
        bat_detection_rate=bat_frames / total if total else 0.0,
        notes=notes,
    )

    logger.info(
        "detect_all_frames: %d frames — baseball %.1f%%, batter %.1f%%, bat %.1f%%.",
        total,
        summary.baseball_detection_rate * 100,
        summary.batter_detection_rate * 100,
        summary.bat_detection_rate * 100,
    )

    return detections, summary
