"use client";

import { useEffect, useRef } from "react";

import { cameraRecorderStatusMessage, useBrowserCamera } from "@/lib/browser-camera";
import type { CameraRecorderStatus } from "@/lib/browser-camera";

export type BrowserCameraRecorderProps = {
  onFileReady: (file: File) => void;
  disabled?: boolean;
};

/**
 * A self-contained browser camera recorder for authenticated drill submissions.
 *
 * Manages getUserMedia/MediaRecorder lifecycle with user-visible error states,
 * proper track cleanup, and object URL revocation.
 */
export function BrowserCameraRecorder({
  onFileReady,
  disabled = false,
}: BrowserCameraRecorderProps) {
  const {
    status,
    stream,
    startCamera,
    startRecording,
    stopRecording,
    reset,
  } = useBrowserCamera({ onFileReady });

  return (
    <div className="space-y-3">
      <p className="athlemetry-label">Camera recording</p>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {cameraRecorderStatusMessage(status)}
      </p>

      {status.type === "idle" ? (
        <IdleView onStart={startCamera} disabled={disabled} />
      ) : null}

      {status.type === "requesting-permission" ? <RequestingView /> : null}

      {status.type === "preview" || status.type === "recording" ? (
        <RecordingView
          status={status}
          stream={stream}
          onStartRecording={startRecording}
          onStopRecording={stopRecording}
          onCancel={reset}
        />
      ) : null}

      {status.type === "recorded" ? (
        <RecordedView
          blob={status.blob}
          file={status.file}
          onReset={reset}
        />
      ) : null}

      {status.type === "error" ? (
        <ErrorView message={status.message} onRetry={reset} />
      ) : null}
    </div>
  );
}

function IdleView({
  onStart,
  disabled,
}: {
  onStart: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onStart}
      disabled={disabled}
      className="athlemetry-button athlemetry-button-secondary flex w-full items-center justify-center gap-2 disabled:opacity-50"
    >
      <CameraIcon />
      Record from camera
    </button>
  );
}

function RequestingView() {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-4 text-sm text-slate-700">
      <Spinner />
      <span>Requesting camera access&hellip;</span>
    </div>
  );
}

function RecordingView({
  status,
  stream,
  onStartRecording,
  onStopRecording,
  onCancel,
}: {
  status: CameraRecorderStatus;
  stream: MediaStream | null;
  onStartRecording: () => void;
  onStopRecording: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-black">
        <CameraPreview stream={stream} />
        {status.type === "recording" ? (
          <div className="absolute left-3 top-3 flex items-center gap-2 rounded-full bg-red-600/90 px-3 py-1 text-xs font-bold uppercase tracking-wider text-white">
            <span className="h-2 w-2 animate-pulse rounded-full bg-white" />
            Recording
          </div>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {status.type === "preview" ? (
          <button
            type="button"
            onClick={onStartRecording}
            className="athlemetry-button athlemetry-button-primary flex items-center gap-2"
          >
            <RecordIcon />
            Start recording
          </button>
        ) : (
          <button
            type="button"
            onClick={onStopRecording}
            className="athlemetry-button athlemetry-button-primary flex items-center gap-2"
          >
            <StopIcon />
            Stop recording
          </button>
        )}
        <button
          type="button"
          onClick={onCancel}
          className="athlemetry-button athlemetry-button-secondary"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function RecordedView({
  blob,
  file,
  onReset,
}: {
  blob: Blob;
  file: File;
  onReset: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-2xl border border-teal-200 bg-black">
        <RecordedPreview blob={blob} />
      </div>

      <div className="flex items-center gap-3 rounded-2xl border border-teal-100 bg-teal-50/60 px-4 py-3">
        <CheckCircleIcon />
        <span className="flex-1 text-sm text-teal-900">
          Recording captured ({file.size < 1048576
            ? `${(file.size / 1024).toFixed(0)} KB`
            : `${(file.size / 1048576).toFixed(1)} MB`})
        </span>
        <button
          type="button"
          onClick={onReset}
          className="athlemetry-button athlemetry-button-secondary text-xs"
        >
          Re-record
        </button>
      </div>
    </div>
  );
}

function RecordedPreview({ blob }: { blob: Blob }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const previewUrl = URL.createObjectURL(blob);
    video.src = previewUrl;
    return () => {
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(previewUrl);
    };
  }, [blob]);

  return <video ref={videoRef} controls className="block w-full max-h-64" />;
}

function ErrorView({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}) {
  return (
    <div className="space-y-3">
      <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-6 text-red-950">
        {message}
      </div>
      <button
        type="button"
        onClick={onRetry}
        className="athlemetry-button athlemetry-button-secondary text-sm"
      >
        Try again
      </button>
    </div>
  );
}

function CameraPreview({ stream }: { stream: MediaStream | null }) {
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.srcObject = stream;
    if (stream) {
      video.play().catch(() => {
        // Autoplay may be blocked; user interaction begins recording.
      });
    }
    return () => {
      video.pause();
      video.srcObject = null;
    };
  }, [stream]);

  return (
    <video
      ref={videoRef}
      muted
      playsInline
      className="block w-full max-h-64"
    />
  );
}

function CameraIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      <path d="M23 7l-7 5 7 5V7Z" />
      <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    </svg>
  );
}

function RecordIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0 text-red-600">
      <circle cx="12" cy="12" r="8" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="currentColor" className="shrink-0">
      <rect x="6" y="6" width="12" height="12" rx="1" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-teal-700">
      <circle cx="12" cy="12" r="10" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin text-slate-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
