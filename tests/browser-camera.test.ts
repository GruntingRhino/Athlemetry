/**
 * Tests for browser-camera utilities.
 *
 * Pure functions (pickBestRecordingMimeType, createVideoFileFromBlob) are
 * tested directly.  The useBrowserCamera hook depends on React rendering and
 * browser globals (MediaRecorder, getUserMedia) that are not available in the
 * vitest node environment.  It is verified via type-check + lint + build.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";

import {
  cameraRecorderStatusMessage,
  createVideoFileFromBlob,
  pickBestRecordingMimeType,
  stopMediaStreamTracks,
} from "@/lib/browser-camera";

describe("cameraRecorderStatusMessage", () => {
  it("gives assistive technology a clear instruction or state for every camera-recorder phase", () => {
    expect(cameraRecorderStatusMessage({ type: "idle" })).toBe("Camera recording is ready. Select Record from camera to begin.");
    expect(cameraRecorderStatusMessage({ type: "requesting-permission" })).toBe("Requesting camera access.");
    expect(cameraRecorderStatusMessage({ type: "preview" })).toBe("Camera preview is ready. Select Start recording when you are ready.");
    expect(cameraRecorderStatusMessage({ type: "recording" })).toBe("Recording in progress. Select Stop recording when finished.");
    expect(cameraRecorderStatusMessage({
      type: "recorded",
      blob: new Blob(),
      file: new File([], "capture.webm", { type: "video/webm" }),
    })).toBe("Recording captured. Review it or select Re-record.");
    expect(cameraRecorderStatusMessage({
      type: "error",
      errorCode: "permission-denied",
      message: "Camera access was denied.",
    })).toBe("Camera access was denied.");
  });
});

/* ------------------------------------------------------------------ */
/*  pickBestRecordingMimeType                                          */
/* ------------------------------------------------------------------ */

describe("pickBestRecordingMimeType", () => {
  beforeEach(() => {
    // Ensure MediaRecorder.isTypeSupported exists for each test.
    // Tests that need "unsupported" scenarios overwrite this.
    vi.stubGlobal(
      "MediaRecorder",
      class MockMediaRecorder {
        static isTypeSupported() {
          return true;
        }
      },
    );
  });

  it("returns the user-provided fallback when MediaRecorder is undefined", () => {
    vi.stubGlobal("MediaRecorder", undefined);
    const result = pickBestRecordingMimeType("video/webm");
    expect(result).toBe("video/webm");
  });

  it("prefers vp9 over vp8 when supported", () => {
    const supported: string[] = [];
    vi.stubGlobal(
      "MediaRecorder",
      class Mock {
        static isTypeSupported(t: string) {
          return supported.includes(t);
        }
      },
    );
    supported.push(
      "video/webm;codecs=vp9,opus",
      "video/webm;codecs=vp8,opus",
    );
    expect(pickBestRecordingMimeType("fallback")).toBe(
      "video/webm;codecs=vp9,opus",
    );
  });

  it("falls back through the list when codecs are unsupported", () => {
    const supported = ["video/webm"];
    vi.stubGlobal(
      "MediaRecorder",
      class Mock {
        static isTypeSupported(t: string) {
          return supported.includes(t);
        }
      },
    );
    expect(pickBestRecordingMimeType("fallback")).toBe("video/webm");
  });

  it("returns the fallback when nothing is supported", () => {
    vi.stubGlobal(
      "MediaRecorder",
      class Mock {
        static isTypeSupported() {
          return false;
        }
      },
    );
    expect(pickBestRecordingMimeType("video/mp4")).toBe("video/mp4");
  });

  it("returns fallback when MediaRecorder.isTypeSupported does not exist", () => {
    vi.stubGlobal(
      "MediaRecorder",
      class Mock {
        // No isTypeSupported
      },
    );
    expect(pickBestRecordingMimeType("fallback")).toBe("fallback");
  });
});

/* ------------------------------------------------------------------ */
/*  createVideoFileFromBlob                                            */
/* ------------------------------------------------------------------ */

describe("createVideoFileFromBlob", () => {
  it("creates a File with .webm extension for webm blobs", () => {
    const blob = new Blob(["fake-video-data"], { type: "video/webm" });
    const file = createVideoFileFromBlob(blob, "drill-1");
    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe("drill-1.webm");
    expect(file.type).toBe("video/webm");
    expect(file.size).toBe(blob.size);
  });

  it("creates a File with .mp4 extension for mp4 blobs", () => {
    const blob = new Blob(["fake-mp4-data"], { type: "video/mp4" });
    const file = createVideoFileFromBlob(blob, "pitch-capture");
    expect(file.name).toBe("pitch-capture.mp4");
    expect(file.type).toBe("video/mp4");
  });

  it("uses the default suffix when none is provided", () => {
    const blob = new Blob(["data"], { type: "video/webm" });
    const file = createVideoFileFromBlob(blob);
    expect(file.name).toMatch(/^camera-recording\.\w+$/);
  });

  it("preserves the blob type as the file type", () => {
    const blob = new Blob(["data"], { type: "video/webm;codecs=vp8" });
    const file = createVideoFileFromBlob(blob);
    expect(file.type).toBe("video/webm;codecs=vp8");
  });

  it("sets lastModified to a recent timestamp", () => {
    const blob = new Blob(["data"], { type: "video/webm" });
    const file = createVideoFileFromBlob(blob);
    const now = Date.now();
    expect(file.lastModified).toBeGreaterThanOrEqual(now - 5000);
    expect(file.lastModified).toBeLessThanOrEqual(now + 1000);
  });
});

describe("stopMediaStreamTracks", () => {
  it("stops every active stream track and tolerates an absent stream", () => {
    const firstStop = vi.fn();
    const secondStop = vi.fn();
    const stream = {
      getTracks: () => [{ stop: firstStop }, { stop: secondStop }],
    } as unknown as MediaStream;

    stopMediaStreamTracks(stream);
    stopMediaStreamTracks(null);

    expect(firstStop).toHaveBeenCalledOnce();
    expect(secondStop).toHaveBeenCalledOnce();
  });
});
