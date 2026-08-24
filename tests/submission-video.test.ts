import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const directory = mkdtempSync(path.join(os.tmpdir(), "athlemetry-video-test-"));
const videoPath = path.join(directory, "clip.mp4");
writeFileSync(videoPath, "0123456789");

const mocks = vi.hoisted(() => ({
  session: null as { user: { id: string; role: string } } | null,
  findFirst: vi.fn(),
  materialize: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/prisma", () => ({ prisma: { drillSubmission: { findFirst: mocks.findFirst } } }));
vi.mock("@/lib/storage", () => ({ materializeStoredVideo: mocks.materialize }));

const { GET } = await import("@/app/api/submissions/[id]/video/route");

const params = { params: Promise.resolve({ id: "submission-1" }) };

afterAll(() => rmSync(directory, { recursive: true, force: true }));

describe("GET /api/submissions/[id]/video", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.session = { user: { id: "athlete-1", role: "ATHLETE" } };
    mocks.findFirst.mockResolvedValue({ storageProvider: "local", storageKey: "key", mimeType: "video/mp4" });
    mocks.materialize.mockResolvedValue({ path: videoPath, cleanup: vi.fn(async () => undefined) });
  });

  it("requires authentication before looking up a video", async () => {
    mocks.session = null;
    const response = await GET(new Request("http://localhost/api/submissions/submission-1/video"), params);
    expect(response.status).toBe(401);
    expect(mocks.findFirst).not.toHaveBeenCalled();
  });

  it("serves only an authorized, bounded byte range without exposing a storage key", async () => {
    const response = await GET(new Request("http://localhost/api/submissions/submission-1/video", {
      headers: { range: "bytes=2-5" },
    }), params);

    expect(response.status).toBe(206);
    expect(response.headers.get("Content-Range")).toBe("bytes 2-5/10");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    await expect(response.text()).resolves.toBe("2345");
    expect(mocks.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ id: "submission-1", athleteId: "athlete-1", videoDeletedAt: null }),
    }));
  });
});
