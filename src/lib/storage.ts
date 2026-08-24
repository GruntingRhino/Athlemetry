import { randomUUID, createHash, timingSafeEqual } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

import {
  DeleteObjectsCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectVersionsCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { CompressionStatus } from "@prisma/client";

import type { ReviewRetentionDays } from "@/lib/constants";

export type StorageProviderName = "local" | "s3";

type UploadInput = {
  key: string;
  buffer: Buffer;
  contentType: string;
};

type StoredAsset = {
  provider: StorageProviderName;
  storageKey: string;
};

interface VideoStorageProvider {
  readonly provider: StorageProviderName;
  upload(input: UploadInput): Promise<StoredAsset>;
  delete(storageKey: string): Promise<void>;
  materialize(storageKey: string): Promise<{ path: string; cleanup: () => Promise<void> }>;
}

class LocalStorageProvider implements VideoStorageProvider {
  readonly provider: StorageProviderName = "local";

  private getUploadsDir() {
    const configuredDir = process.env.LOCAL_STORAGE_DIR?.trim();
    if (configuredDir) {
      return configuredDir;
    }

    const isServerlessRuntime = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
    if (isServerlessRuntime) {
      return "/tmp/athlemetry-uploads";
    }

    return path.join(process.cwd(), "uploads");
  }

  private getAbsolutePath(storageKey: string) {
    const uploadsDir = this.getUploadsDir();
    return path.join(uploadsDir, storageKey.replaceAll("/", "_"));
  }

  async upload(input: UploadInput): Promise<StoredAsset> {
    const uploadsDir = this.getUploadsDir();
    await mkdir(uploadsDir, { recursive: true });

    const absolutePath = this.getAbsolutePath(input.key);
    await writeFile(absolutePath, input.buffer);

    return {
      provider: this.provider,
      storageKey: input.key,
    };
  }

  async delete(storageKey: string): Promise<void> {
    const absolutePath = this.getAbsolutePath(storageKey);
    await rm(absolutePath, { force: true });
  }

  async materialize(storageKey: string) {
    return {
      path: this.getAbsolutePath(storageKey),
      cleanup: async () => undefined,
    };
  }
}

export function s3ObjectVersioningEnabled(environment: Record<string, string | undefined> = process.env) {
  if (environment.S3_OBJECT_VERSIONING_ENABLED === "true") return true;
  if (environment.S3_OBJECT_VERSIONING_ENABLED === "false") return false;
  if (environment.NODE_ENV === "production") {
    throw new Error("S3_OBJECT_VERSIONING_ENABLED must be explicitly set to true or false in production.");
  }
  return false;
}

class S3CompatibleStorageProvider implements VideoStorageProvider {
  readonly provider: StorageProviderName = "s3";

  private readonly bucket: string;
  private readonly client: S3Client;

  constructor() {
    const bucket = process.env.S3_BUCKET?.trim();
    const accessKeyId = process.env.S3_ACCESS_KEY_ID?.trim();
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY?.trim();

    if (!bucket || !accessKeyId || !secretAccessKey) {
      throw new Error(
        "S3 storage requires S3_BUCKET, S3_ACCESS_KEY_ID, and S3_SECRET_ACCESS_KEY.",
      );
    }

    this.bucket = bucket;

    this.client = new S3Client({
      region: process.env.S3_REGION || "auto",
      endpoint: process.env.S3_ENDPOINT?.trim() || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === "true",
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
    });
  }

  async upload(input: UploadInput): Promise<StoredAsset> {
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: input.key,
        Body: input.buffer,
        ContentType: input.contentType,
      }),
    );

    return {
      provider: this.provider,
      storageKey: input.key,
    };
  }

  async delete(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: storageKey,
      }),
    );

    if (!s3ObjectVersioningEnabled()) return;

    for (let cleanupPass = 0; cleanupPass < 5; cleanupPass += 1) {
      const objects: Array<{ Key: string; VersionId: string }> = [];
      let keyMarker: string | undefined;
      let versionIdMarker: string | undefined;

      for (let page = 0; page < 10_000; page += 1) {
        const listed = await this.client.send(new ListObjectVersionsCommand({
          Bucket: this.bucket,
          Prefix: storageKey,
          KeyMarker: keyMarker,
          VersionIdMarker: versionIdMarker,
        }));
        for (const candidate of [...(listed.Versions ?? []), ...(listed.DeleteMarkers ?? [])]) {
          if (candidate.Key === storageKey && candidate.VersionId) {
            objects.push({ Key: candidate.Key, VersionId: candidate.VersionId });
          }
        }
        if (!listed.IsTruncated) break;
        if (!listed.NextKeyMarker || (listed.NextKeyMarker === keyMarker && listed.NextVersionIdMarker === versionIdMarker)) {
          throw new Error("S3 version listing did not advance while deleting video data.");
        }
        keyMarker = listed.NextKeyMarker;
        versionIdMarker = listed.NextVersionIdMarker;
        if (page === 9_999) throw new Error("S3 version listing exceeded the safety page limit.");
      }

      if (objects.length === 0) return;
      for (let index = 0; index < objects.length; index += 1_000) {
        const deleted = await this.client.send(new DeleteObjectsCommand({
          Bucket: this.bucket,
          Delete: { Objects: objects.slice(index, index + 1_000), Quiet: true },
        }));
        if (deleted.Errors?.length) {
          throw new Error(`S3 version deletion failed for ${deleted.Errors.length} object version(s).`);
        }
      }
    }

    throw new Error("S3 object versions remained after repeated deletion attempts.");
  }

  async materialize(storageKey: string) {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
    if (!response.Body) {
      throw new Error("S3 video object returned an empty response body.");
    }

    const temporaryDirectory = await mkdtemp(path.join(os.tmpdir(), "athlemetry-video-"));
    const extension = path.extname(storageKey).replace(/[^.a-zA-Z0-9]/g, "") || ".mp4";
    const temporaryPath = path.join(temporaryDirectory, `input${extension}`);
    try {
      await pipeline(
        Readable.from(response.Body as AsyncIterable<Uint8Array>),
        createWriteStream(temporaryPath, { flags: "wx", mode: 0o600 }),
      );
    } catch (error) {
      await rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }

    return {
      path: temporaryPath,
      cleanup: async () => rm(temporaryDirectory, { recursive: true, force: true }),
    };
  }

  async createPresignedUpload(params: {
    storageKey: string;
    contentType: string;
    contentLength: number;
    sha256: string;
  }) {
    return getSignedUrl(this.client, new PutObjectCommand({
      Bucket: this.bucket,
      Key: params.storageKey,
      ContentType: params.contentType,
      ContentLength: params.contentLength,
      Metadata: { sha256: params.sha256 },
    }), { expiresIn: 15 * 60 });
  }

  async verifyUpload(params: { storageKey: string; contentLength: number; contentType: string; sha256: string }) {
    const head = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: params.storageKey }));
    return head.ContentLength === params.contentLength &&
      head.ContentType === params.contentType &&
      head.Metadata?.sha256 === params.sha256;
  }
}

function parseStorageProvider(providerRaw: string | undefined): StorageProviderName {
  const value = (providerRaw || "local").toLowerCase();

  if (value === "local" || value === "s3") {
    return value;
  }

  throw new Error(`Unsupported storage provider: ${value}`);
}

function createStorageProvider(provider: StorageProviderName): VideoStorageProvider {
  switch (provider) {
    case "local":
      return new LocalStorageProvider();
    case "s3":
      return new S3CompatibleStorageProvider();
  }
}

export function computeVideoHash(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

export async function verifyMaterializedVideoHash(filePath: string, expectedSha256: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedSha256)) return false;
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(filePath)) hash.update(chunk);
  const actual = hash.digest();
  return timingSafeEqual(actual, Buffer.from(expectedSha256, "hex"));
}

export function getFailedDebugRetentionHours(): number {
  const raw = process.env.FAILED_ANALYSIS_RETENTION_HOURS;
  const parsed = raw ? Number.parseInt(raw, 10) : 72;
  return Number.isFinite(parsed) && parsed >= 24 && parsed <= 72 ? parsed : 72;
}

export function getDuplicateUploadWindowHours(): number {
  const raw = process.env.DUPLICATE_UPLOAD_WINDOW_HOURS;
  const parsed = raw ? Number.parseInt(raw, 10) : 24;
  return Number.isFinite(parsed) && parsed >= 1 && parsed <= 168 ? parsed : 24;
}

export function getInitialExpiryDate(now = new Date()) {
  return new Date(now.getTime() + 24 * 60 * 60 * 1000);
}

export function getReviewExpiryDate(reviewDays: ReviewRetentionDays, now = new Date()) {
  return new Date(now.getTime() + reviewDays * 24 * 60 * 60 * 1000);
}

export function getFailedDebugExpiryDate(now = new Date()) {
  return new Date(now.getTime() + getFailedDebugRetentionHours() * 60 * 60 * 1000);
}

export async function storeVideo(params: { fileName: string; buffer: Buffer; contentType: string }) {
  const extension = params.fileName.split(".").pop() || "mp4";
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  const storageProvider = parseStorageProvider(process.env.STORAGE_PROVIDER);

  const provider = createStorageProvider(storageProvider);
  const stored = await provider.upload({
    key: storageKey,
    buffer: params.buffer,
    contentType: params.contentType,
  });

  const compressionStatus =
    params.buffer.length > 45 * 1024 * 1024 ? CompressionStatus.COMPRESSED : CompressionStatus.NOT_REQUIRED;

  const videoHash = computeVideoHash(params.buffer);

  return {
    fileName: params.fileName,
    fileSize: params.buffer.length,
    mimeType: params.contentType,
    compressionStatus,
    storageProvider: stored.provider,
    storageKey: stored.storageKey,
    videoHash,
    videoExpiresAt: getInitialExpiryDate(),
  };
}

export async function purgeStoredVideo(params: {
  storageProvider: string | null;
  storageKey: string | null;
}) {
  if (!params.storageProvider || !params.storageKey) {
    return { ok: false as const, reason: "Missing storage provider or key." };
  }

  const provider = createStorageProvider(parseStorageProvider(params.storageProvider));
  await provider.delete(params.storageKey);

  return { ok: true as const };
}

export async function materializeStoredVideo(params: {
  storageProvider: string | null;
  storageKey: string | null;
}) {
  if (!params.storageProvider || !params.storageKey) {
    throw new Error("Missing storage provider or key.");
  }

  const provider = createStorageProvider(parseStorageProvider(params.storageProvider));
  return provider.materialize(params.storageKey);
}

function createVideoStorageKey(fileName: string) {
  const extension = fileName.split(".").pop()?.replace(/[^a-zA-Z0-9]/g, "") || "mp4";
  return `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
}

export async function createPresignedVideoUpload(params: {
  fileName: string;
  contentType: string;
  contentLength: number;
  sha256: string;
}) {
  if (parseStorageProvider(process.env.STORAGE_PROVIDER) !== "s3") return null;
  const provider = new S3CompatibleStorageProvider();
  const storageKey = createVideoStorageKey(params.fileName);
  const url = await provider.createPresignedUpload({ storageKey, ...params });
  return { url, storageKey, expiresInSeconds: 15 * 60 };
}

export async function verifyPresignedVideoUpload(params: {
  storageKey: string;
  contentLength: number;
  contentType: string;
  sha256: string;
}) {
  if (parseStorageProvider(process.env.STORAGE_PROVIDER) !== "s3") return false;
  return new S3CompatibleStorageProvider().verifyUpload(params);
}
