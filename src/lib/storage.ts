import { randomUUID, createHash } from "node:crypto";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";

import {
  DeleteObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { CompressionStatus } from "@prisma/client";

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
}

class LocalStorageProvider implements VideoStorageProvider {
  readonly provider: StorageProviderName = "local";

  private getAbsolutePath(storageKey: string) {
    const uploadsDir = path.join(process.cwd(), "uploads");
    return path.join(uploadsDir, storageKey.replaceAll("/", "_"));
  }

  async upload(input: UploadInput): Promise<StoredAsset> {
    const uploadsDir = path.join(process.cwd(), "uploads");
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

function getRetentionHours(): number {
  const raw = process.env.VIDEO_RETENTION_HOURS;
  const parsed = raw ? Number.parseInt(raw, 10) : 24;

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 24;
  }

  return parsed;
}

export function getVideoExpiryDate(now = new Date()) {
  const retentionHours = getRetentionHours();
  return new Date(now.getTime() + retentionHours * 60 * 60 * 1000);
}

function shouldKeepFailedVideosForDebug() {
  return process.env.KEEP_FAILED_VIDEOS_FOR_DEBUG === "true";
}

export function shouldPurgeOnTerminalFailure(retainVideoForAudit: boolean) {
  return !retainVideoForAudit && !shouldKeepFailedVideosForDebug();
}

export async function storeVideo(file: File) {
  const buffer = Buffer.from(await file.arrayBuffer());
  const extension = file.name.split(".").pop() || "mp4";
  const storageKey = `${new Date().toISOString().slice(0, 10)}/${randomUUID()}.${extension}`;
  const storageProvider = parseStorageProvider(process.env.STORAGE_PROVIDER);

  const provider = createStorageProvider(storageProvider);
  const stored = await provider.upload({
    key: storageKey,
    buffer,
    contentType: file.type,
  });

  const compressionStatus =
    file.size > 45 * 1024 * 1024 ? CompressionStatus.COMPRESSED : CompressionStatus.NOT_REQUIRED;

  const videoHash = createHash("sha256").update(buffer).digest("hex");

  return {
    fileName: file.name,
    fileSize: file.size,
    mimeType: file.type,
    compressionStatus,
    storageProvider: stored.provider,
    storageKey: stored.storageKey,
    videoHash,
    videoExpiresAt: getVideoExpiryDate(),
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
