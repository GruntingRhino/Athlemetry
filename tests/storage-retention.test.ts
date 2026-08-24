import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import {
  getDuplicateUploadWindowHours,
  getFailedDebugExpiryDate,
  getFailedDebugRetentionHours,
  getInitialExpiryDate,
  getReviewExpiryDate,
  materializeStoredVideo,
  verifyMaterializedVideoHash,
} from "@/lib/storage";

afterEach(() => {
  delete process.env.FAILED_ANALYSIS_RETENTION_HOURS;
  delete process.env.DUPLICATE_UPLOAD_WINDOW_HOURS;
  delete process.env.LOCAL_STORAGE_DIR;
});

describe("video retention policy", () => {
  const now = new Date("2026-02-20T10:00:00.000Z");

  it("defaults successful uploads to a one-day processing window", () => {
    expect(getInitialExpiryDate(now).toISOString()).toBe("2026-02-21T10:00:00.000Z");
  });

  it("computes explicit review expiry for allowed periods", () => {
    expect(getReviewExpiryDate(7, now).toISOString()).toBe("2026-02-27T10:00:00.000Z");
    expect(getReviewExpiryDate(30, now).toISOString()).toBe("2026-03-22T10:00:00.000Z");
    expect(getReviewExpiryDate(90, now).toISOString()).toBe("2026-05-21T10:00:00.000Z");
  });

  it("keeps terminal failures for a bounded 24–72 hour debug period", () => {
    expect(getFailedDebugExpiryDate(now).toISOString()).toBe("2026-02-23T10:00:00.000Z");
    process.env.FAILED_ANALYSIS_RETENTION_HOURS = "24";
    expect(getFailedDebugRetentionHours()).toBe(24);
    expect(getFailedDebugExpiryDate(now).toISOString()).toBe("2026-02-21T10:00:00.000Z");
  });

  it("rejects unsafe duplicate-window configuration", () => {
    process.env.DUPLICATE_UPLOAD_WINDOW_HOURS = "0";
    expect(getDuplicateUploadWindowHours()).toBe(24);
    process.env.DUPLICATE_UPLOAD_WINDOW_HOURS = "12";
    expect(getDuplicateUploadWindowHours()).toBe(12);
  });

  it("materializes local storage without copying and exposes a safe cleanup callback", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "athlemetry-storage-test-"));
    process.env.LOCAL_STORAGE_DIR = directory;
    const storedPath = path.join(directory, "2026-07-26_clip.mp4");
    await writeFile(storedPath, "fixture");

    try {
      const materialized = await materializeStoredVideo({
        storageProvider: "local",
        storageKey: "2026-07-26/clip.mp4",
      });
      expect(materialized.path).toBe(storedPath);
      await expect(materialized.cleanup()).resolves.toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("verifies downloaded bytes instead of trusting object metadata", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "athlemetry-hash-test-"));
    const file = path.join(directory, "clip.mp4");
    await writeFile(file, "actual-video-bytes");

    try {
      await expect(verifyMaterializedVideoHash(file, "9e0f072746ed9ddad5d1b7030b3d23360df9fdb576ec2c772b33c37508360aab")).resolves.toBe(true);
      await expect(verifyMaterializedVideoHash(file, "0".repeat(64))).resolves.toBe(false);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
});
