import { createHmac } from "node:crypto";
import { isIP } from "node:net";

import { Prisma } from "@prisma/client";

import { prisma } from "@/lib/prisma";

interface RateLimitRow {
  count: number;
  windowStart: Date;
}

interface QueryRawClient {
  $queryRaw(query: Prisma.Sql): Promise<RateLimitRow[]>;
}

interface ExecuteRawClient {
  $executeRaw(query: Prisma.Sql): Promise<number>;
}

export function rateLimitSource(
  headers: Headers | Record<string, string | string[] | undefined>,
  environment: Record<string, string | undefined> = process.env,
) {
  if (environment.NODE_ENV === "production" && environment.TRUST_PROXY_HEADERS !== "true") {
    throw new Error("Trusted proxy headers are not explicitly configured.");
  }
  const read = (name: string) => {
    if (headers instanceof Headers) return headers.get(name) ?? undefined;
    const value = headers[name];
    return Array.isArray(value) ? value[0] : value;
  };
  const candidate = read("x-forwarded-for")?.split(",")[0]?.trim()
    || read("x-real-ip")?.trim();
  return candidate && isIP(candidate) ? candidate : "unknown";
}

export function rateLimitKey(
  namespace: string,
  identifier: string,
  environment: Record<string, string | undefined> = process.env,
) {
  const dedicatedSecret = environment.RATE_LIMIT_HMAC_SECRET?.trim();
  if (!dedicatedSecret && environment.NODE_ENV === "production") {
    throw new Error("Rate-limit key material is not configured.");
  }
  const keyMaterial = dedicatedSecret
    || environment.NEXTAUTH_SECRET?.trim()
    || "athlemetry-development-rate-limit-key";
  const digest = createHmac("sha256", keyMaterial).update(identifier).digest("hex");
  return `${namespace}:${digest}`;
}

export async function checkDatabaseRateLimit({
  namespace,
  identifier,
  windowMs,
  maxRequests,
  now = new Date(),
  environment = process.env,
  client = prisma,
}: {
  namespace: string;
  identifier: string;
  windowMs: number;
  maxRequests: number;
  now?: Date;
  environment?: Record<string, string | undefined>;
  client?: QueryRawClient;
}) {
  if (!Number.isFinite(windowMs) || windowMs <= 0 || !Number.isInteger(maxRequests) || maxRequests <= 0) {
    throw new Error("Invalid database rate-limit configuration.");
  }
  const key = rateLimitKey(namespace, identifier, environment);
  const cutoff = new Date(now.getTime() - windowMs);
  const rows = await client.$queryRaw(Prisma.sql`
    INSERT INTO "RateLimitWindow" ("key", "windowStart", "count", "updatedAt")
    VALUES (${key}, ${now}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "windowStart" = CASE
        WHEN "RateLimitWindow"."windowStart" <= ${cutoff} THEN ${now}
        ELSE "RateLimitWindow"."windowStart"
      END,
      "count" = CASE
        WHEN "RateLimitWindow"."windowStart" <= ${cutoff} THEN 1
        ELSE "RateLimitWindow"."count" + 1
      END,
      "updatedAt" = ${now}
    RETURNING "count", "windowStart"
  `);
  const row = rows[0];
  if (!row) throw new Error("Database rate limiter did not return a window.");
  const retryAfterSeconds = row.count > maxRequests
    ? Math.max(1, Math.ceil((row.windowStart.getTime() + windowMs - now.getTime()) / 1000))
    : 0;
  return {
    allowed: row.count <= maxRequests,
    remaining: Math.max(0, maxRequests - row.count),
    retryAfterSeconds,
  };
}

export async function resetDatabaseRateLimit({
  namespace,
  identifier,
  environment = process.env,
  client = prisma,
}: {
  namespace: string;
  identifier: string;
  environment?: Record<string, string | undefined>;
  client?: ExecuteRawClient;
}) {
  const key = rateLimitKey(namespace, identifier, environment);
  await client.$executeRaw(Prisma.sql`DELETE FROM "RateLimitWindow" WHERE "key" = ${key}`);
}

export async function getDatabaseRateLimitStatus({
  namespace,
  identifier,
  windowMs,
  maxRequests,
  now = new Date(),
  environment = process.env,
  client = prisma,
}: {
  namespace: string;
  identifier: string;
  windowMs: number;
  maxRequests: number;
  now?: Date;
  environment?: Record<string, string | undefined>;
  client?: QueryRawClient;
}) {
  const key = rateLimitKey(namespace, identifier, environment);
  const rows = await client.$queryRaw(Prisma.sql`
    SELECT "count", "windowStart"
    FROM "RateLimitWindow"
    WHERE "key" = ${key}
  `);
  const row = rows[0];
  if (!row || row.windowStart.getTime() <= now.getTime() - windowMs) {
    return { blocked: false, retryAfterSeconds: 0 };
  }
  const blocked = row.count >= maxRequests;
  return {
    blocked,
    retryAfterSeconds: blocked
      ? Math.max(1, Math.ceil((row.windowStart.getTime() + windowMs - now.getTime()) / 1000))
      : 0,
  };
}

export async function purgeStaleRateLimits({
  now = new Date(),
  retentionMs = 24 * 60 * 60_000,
  batchSize = 1_000,
  client = prisma,
}: {
  now?: Date;
  retentionMs?: number;
  batchSize?: number;
  client?: ExecuteRawClient;
} = {}) {
  const cutoff = new Date(now.getTime() - Math.max(60_000, retentionMs));
  const boundedBatchSize = Math.min(Math.max(Math.trunc(batchSize), 1), 10_000);
  return client.$executeRaw(Prisma.sql`
    DELETE FROM "RateLimitWindow"
    WHERE "key" IN (
      SELECT "key"
      FROM "RateLimitWindow"
      WHERE "updatedAt" < ${cutoff}
      ORDER BY "updatedAt" ASC
      LIMIT ${boundedBatchSize}
    )
  `);
}
