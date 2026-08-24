import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  send: vi.fn(),
}));

vi.mock("@aws-sdk/client-s3", async (importActual) => {
  const actual = await importActual<typeof import("@aws-sdk/client-s3")>();
  return {
    ...actual,
    S3Client: class {
      send = mocks.send;
    },
  };
});

const { purgeStoredVideo, s3ObjectVersioningEnabled } = await import("@/lib/storage");

describe("S3 version-aware privacy deletion", () => {
  beforeEach(() => {
    mocks.send.mockReset();
    process.env.STORAGE_PROVIDER = "s3";
    process.env.S3_BUCKET = "privacy-fixture";
    process.env.S3_ACCESS_KEY_ID = "fixture-access";
    process.env.S3_SECRET_ACCESS_KEY = "fixture-secret";
    process.env.S3_OBJECT_VERSIONING_ENABLED = "true";
  });

  afterEach(() => {
    for (const key of [
      "STORAGE_PROVIDER",
      "S3_BUCKET",
      "S3_ACCESS_KEY_ID",
      "S3_SECRET_ACCESS_KEY",
      "S3_OBJECT_VERSIONING_ENABLED",
    ]) delete process.env[key];
  });

  it("requires an explicit production versioning declaration", () => {
    expect(() => s3ObjectVersioningEnabled({ NODE_ENV: "production" })).toThrow(/explicitly set/i);
    expect(s3ObjectVersioningEnabled({ NODE_ENV: "production", S3_OBJECT_VERSIONING_ENABLED: "false" })).toBe(false);
    expect(s3ObjectVersioningEnabled({ NODE_ENV: "production", S3_OBJECT_VERSIONING_ENABLED: "true" })).toBe(true);
  });

  it("deletes every exact-key version and delete marker across paginated listings", async () => {
    let listCall = 0;
    mocks.send.mockImplementation(async (command: { constructor: { name: string }; input: Record<string, unknown> }) => {
      if (command.constructor.name === "DeleteObjectCommand") return {};
      if (command.constructor.name === "DeleteObjectsCommand") return {};
      if (command.constructor.name !== "ListObjectVersionsCommand") throw new Error("unexpected command");
      listCall += 1;
      if (listCall === 1) {
        return {
          Versions: [
            { Key: "2026-07-27/clip.mp4", VersionId: "version-1" },
            { Key: "2026-07-27/clip.mp4.backup", VersionId: "unrelated" },
          ],
          IsTruncated: true,
          NextKeyMarker: "2026-07-27/clip.mp4",
          NextVersionIdMarker: "version-1",
        };
      }
      if (listCall === 2) {
        return {
          DeleteMarkers: [{ Key: "2026-07-27/clip.mp4", VersionId: "marker-1" }],
          IsTruncated: false,
        };
      }
      return { Versions: [], DeleteMarkers: [], IsTruncated: false };
    });

    await expect(purgeStoredVideo({
      storageProvider: "s3",
      storageKey: "2026-07-27/clip.mp4",
    })).resolves.toEqual({ ok: true });

    const bulkDelete = mocks.send.mock.calls
      .map(([command]) => command)
      .find((command) => command.constructor.name === "DeleteObjectsCommand");
    expect(bulkDelete.input.Delete.Objects).toEqual([
      { Key: "2026-07-27/clip.mp4", VersionId: "version-1" },
      { Key: "2026-07-27/clip.mp4", VersionId: "marker-1" },
    ]);
    expect(listCall).toBe(3);
  });

  it("fails closed when the provider reports a version deletion error", async () => {
    mocks.send.mockImplementation(async (command: { constructor: { name: string } }) => {
      if (command.constructor.name === "DeleteObjectCommand") return {};
      if (command.constructor.name === "ListObjectVersionsCommand") {
        return { Versions: [{ Key: "clip.mp4", VersionId: "version-1" }], IsTruncated: false };
      }
      return { Errors: [{ Key: "clip.mp4", VersionId: "version-1", Code: "AccessDenied" }] };
    });

    await expect(purgeStoredVideo({ storageProvider: "s3", storageKey: "clip.mp4" }))
      .rejects.toThrow(/version deletion failed/i);
  });
});
