/**
 * Browser camera recording utilities for authenticated drill submissions.
 *
 * The hook manages the full getUserMedia / MediaRecorder lifecycle:
 *   idle → requesting → preview → recording → recorded
 *                      ↘ error
 *
 * Cleanup guarantees: all tracks are stopped, all object URLs revoked.
 */

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const RECORDING_MIME_TYPE = "video/webm;codecs=vp8,opus";

export type CameraRecorderStatus =
  | { type: "idle" }
  | { type: "requesting-permission" }
  | { type: "preview" }
  | { type: "recording" }
  | { type: "recorded"; blob: Blob; file: File }
  | { type: "error"; errorCode: CameraErrorCode; message: string };

export type CameraErrorCode =
  | "permission-denied"
  | "no-camera"
  | "recording-failed"
  | "unsupported";

/**
 * Explain camera-recorder state changes without relying on visual previews or
 * recording indicators. The consuming component announces this text through a
 * polite live region.
 */
export function cameraRecorderStatusMessage(status: CameraRecorderStatus) {
  switch (status.type) {
    case "idle":
      return "Camera recording is ready. Select Record from camera to begin.";
    case "requesting-permission":
      return "Requesting camera access.";
    case "preview":
      return "Camera preview is ready. Select Start recording when you are ready.";
    case "recording":
      return "Recording in progress. Select Stop recording when finished.";
    case "recorded":
      return "Recording captured. Review it or select Re-record.";
    case "error":
      return status.message;
  }
}

/**
 * Pick the best available MediaRecorder MIME type.
 * Falls back to the provided type if none of the preferred types match.
 */
export function pickBestRecordingMimeType(mimeType: string): string {
  if (typeof MediaRecorder === "undefined") return mimeType;
  const preferred = [
    "video/webm;codecs=vp9,opus",
    "video/webm;codecs=vp8,opus",
    "video/webm;codecs=h264,opus",
    "video/webm",
    "video/mp4",
  ];
  for (const maybe of preferred) {
    if (
      typeof MediaRecorder.isTypeSupported === "function" &&
      MediaRecorder.isTypeSupported(maybe)
    )
      return maybe;
  }
  return mimeType;
}

/**
 * Create a File from a recording Blob with a deterministic name.
 */
export function createVideoFileFromBlob(
  blob: Blob,
  suffix = "camera-recording",
): File {
  const extension = blob.type.startsWith("video/mp4") ? "mp4" : "webm";
  return new File([blob], `${suffix}.${extension}`, {
    type: blob.type,
    lastModified: Date.now(),
  });
}

/** Stop every track in a stream. Safe to call when no stream was acquired. */
export function stopMediaStreamTracks(stream: MediaStream | null) {
  if (!stream) return;
  for (const track of stream.getTracks()) {
    track.stop();
  }
}

export type BrowserCameraCallbacks = {
  onFileReady?: (file: File) => void;
};

export function useBrowserCamera(callbacks?: BrowserCameraCallbacks) {
  const [status, setStatus] = useState<CameraRecorderStatus>({
    type: "idle",
  });
  const [stream, setStream] = useState<MediaStream | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  /* ---- internal helpers ---- */

  const stopAllTracks = useCallback(() => {
    stopMediaStreamTracks(streamRef.current);
    streamRef.current = null;
    setStream(null);
  }, []);

  /** Release all resources: tracks, recorder, object URLs. */
  const cleanup = useCallback(() => {
    stopAllTracks();
    recorderRef.current = null;
    chunksRef.current = [];
  }, [stopAllTracks]);

  const setStatusSafe = useCallback((next: CameraRecorderStatus) => {
    setStatus((prev) => {
      // If already recorded we keep the blob/file; only allow terminal errors
      // or a reset back to idle.
      if (
        prev.type === "recorded" &&
        next.type !== "idle" &&
        next.type !== "error"
      ) {
        return prev;
      }
      return next;
    });
  }, []);

  /* ---- public actions ---- */

  const startCamera = useCallback(async () => {
    cleanup();
    setStatusSafe({ type: "requesting-permission" });

    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices?.getUserMedia
    ) {
      setStatusSafe({
        type: "error",
        errorCode: "unsupported",
        message:
          "Camera access is not supported in this browser or environment.",
      });
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "environment",
        },
        audio: false,
      });
      streamRef.current = stream;
      setStream(stream);
      setStatusSafe({ type: "preview" });
    } catch (err) {
      const error =
        err instanceof DOMException
          ? err
          : new DOMException("Unknown camera error");

      let errorCode: CameraErrorCode = "no-camera";
      let message = "Could not access the camera.";

      if (
        error.name === "NotAllowedError" ||
        error.name === "PermissionDeniedError"
      ) {
        errorCode = "permission-denied";
        message =
          "Camera permission was denied. Please allow camera access in your browser settings and try again.";
      } else if (
        error.name === "NotFoundError" ||
        error.message?.includes("NotFound")
      ) {
        errorCode = "no-camera";
        message =
          "No camera found. Connect a camera or switch to file upload.";
      } else {
        message = `Camera error: ${error.message || "unknown"}`;
      }

      setStatusSafe({ type: "error", errorCode, message });
    }
  }, [cleanup, setStatusSafe]);

  const startRecording = useCallback(() => {
    const stream = streamRef.current;
    if (!stream) return;

    chunksRef.current = [];
    const mimeType = pickBestRecordingMimeType(RECORDING_MIME_TYPE);

    try {
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const file = createVideoFileFromBlob(blob);
        stopAllTracks();
        setStatusSafe({ type: "recorded", blob, file });
        callbacks?.onFileReady?.(file);
      };

      recorder.onerror = () => {
        stopAllTracks();
        setStatusSafe({
          type: "error",
          errorCode: "recording-failed",
          message: "An error occurred during recording. Please try again.",
        });
      };

      recorder.start();
      setStatusSafe({ type: "recording" });
    } catch {
      setStatusSafe({
        type: "error",
        errorCode: "unsupported",
        message:
          "Recording is not supported in this browser. Try a different browser or use file upload.",
      });
    }
  }, [callbacks, setStatusSafe, stopAllTracks]);

  const stopRecording = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const reset = useCallback(() => {
    cleanup();
    chunksRef.current = [];
    setStatusSafe({ type: "idle" });
  }, [cleanup, setStatusSafe]);

  /* ---- cleanup on unmount ---- */
  useEffect(() => {
    return () => {
      stopMediaStreamTracks(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
    };
  }, []);

  return {
    status,
    stream,
    startCamera,
    startRecording,
    stopRecording,
    reset,
  } as const;
}
