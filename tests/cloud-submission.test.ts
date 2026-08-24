import { beforeEach, describe, expect, it, vi } from "vitest";

import { createUploadClaim } from "@/lib/upload-claims";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "athlete-2" } } as { user: { id: string } } | null,
  userFindFirst: vi.fn(),
  drillFindFirst: vi.fn(),
  verifyUpload: vi.fn(),
  purge: vi.fn(),
}));

vi.mock("next-auth", () => ({ getServerSession: vi.fn(async () => mocks.session) }));
vi.mock("@/lib/auth", () => ({ authOptions: {} }));
vi.mock("@/lib/billing", () => ({ canUsePaidFeatures: vi.fn(async () => true) }));
vi.mock("@/lib/logging", () => ({ writeSystemLog: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findFirst: mocks.userFindFirst },
    drillDefinition: { findFirst: mocks.drillFindFirst },
    drillSubmission: { findFirst: vi.fn() },
  },
}));
vi.mock("@/lib/storage", () => ({
  getDuplicateUploadWindowHours: vi.fn(() => 24),
  getInitialExpiryDate: vi.fn(() => new Date()),
  purgeStoredVideo: mocks.purge,
  verifyPresignedVideoUpload: mocks.verifyUpload,
}));

const { POST } = await import("@/app/api/submissions/cloud/route");

const object = {
  storageKey: "2026-07-27/550e8400-e29b-41d4-a716-446655440000.mp4",
  fileName: "sprint.mp4",
  fileSize: 1234,
  mimeType: "video/mp4",
  videoHash: "a".repeat(64),
};

describe("POST /api/submissions/cloud upload ownership", () => {
  beforeEach(() => {
    process.env.UPLOAD_CLAIM_SECRET = "upload-claim-test-secret-that-is-long-enough";
    mocks.session = { user: { id: "athlete-2" } };
    mocks.userFindFirst.mockReset().mockResolvedValue({ id: "athlete-2", role: "ATHLETE", age: 20 });
    mocks.drillFindFirst.mockReset();
    mocks.verifyUpload.mockReset();
    mocks.purge.mockReset().mockResolvedValue({ ok: true });
  });

  it("rejects another athlete's upload claim before touching object storage", async () => {
    const uploadClaim = createUploadClaim({
      userId: "athlete-1",
      storageKey: object.storageKey,
      contentLength: object.fileSize,
      contentType: object.mimeType,
      sha256: object.videoHash,
    });
    const response = await POST(new Request("http://localhost/api/submissions/cloud", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...object, uploadClaim, metadata: {} }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.verifyUpload).not.toHaveBeenCalled();
    expect(mocks.drillFindFirst).not.toHaveBeenCalled();
  });

  it("purges an owned object when final submission metadata is invalid", async () => {
    const uploadClaim = createUploadClaim({
      userId: "athlete-2",
      storageKey: object.storageKey,
      contentLength: object.fileSize,
      contentType: object.mimeType,
      sha256: object.videoHash,
    });
    const response = await POST(new Request("http://localhost/api/submissions/cloud", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...object, uploadClaim, metadata: {} }),
    }));

    expect(response.status).toBe(400);
    expect(mocks.purge).toHaveBeenCalledWith({ storageProvider: "s3", storageKey: object.storageKey });
    expect(mocks.verifyUpload).not.toHaveBeenCalled();
  });
});