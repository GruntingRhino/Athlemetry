import { open, stat } from "node:fs/promises";

import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { materializeStoredVideo } from "@/lib/storage";
import { prisma } from "@/lib/prisma";

const MAX_RANGE_BYTES = 4 * 1024 * 1024;

function parseRange(value: string | null, size: number) {
  const match = value?.match(/^bytes=(\d+)-(\d*)$/);
  if (!match || size <= 0) return null;
  const start = Number(match[1]);
  const requestedEnd = match[2] ? Number(match[2]) : Math.min(size - 1, start + MAX_RANGE_BYTES - 1);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(requestedEnd) || start >= size || requestedEnd < start) return null;
  const end = Math.min(size - 1, requestedEnd, start + MAX_RANGE_BYTES - 1);
  return { start, end, length: end - start + 1 };
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const { id } = await params;
  const submission = await prisma.drillSubmission.findFirst({
    where: {
      id,
      videoDeletedAt: null,
      videoExpiresAt: { gt: new Date() },
      ...(session.user.role === "ADMIN" ? {} : { athleteId: session.user.id }),
    },
    select: { storageProvider: true, storageKey: true, mimeType: true },
  });
  if (!submission) return NextResponse.json({ error: "Video not found." }, { status: 404 });

  let materialized: Awaited<ReturnType<typeof materializeStoredVideo>> | null = null;
  try {
    materialized = await materializeStoredVideo(submission);
    const info = await stat(materialized.path);
    const range = parseRange(request.headers.get("range"), info.size);
    if (!range) {
      await materialized.cleanup();
      return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${info.size}` } });
    }

    const handle = await open(materialized.path, "r");
    try {
      const body = Buffer.allocUnsafe(range.length);
      await handle.read(body, 0, range.length, range.start);
      return new NextResponse(body, {
        status: 206,
        headers: {
          "Accept-Ranges": "bytes",
          "Cache-Control": "private, no-store",
          "Content-Length": String(range.length),
          "Content-Range": `bytes ${range.start}-${range.end}/${info.size}`,
          "Content-Type": submission.mimeType,
        },
      });
    } finally {
      await handle.close();
      await materialized.cleanup();
    }
  } catch {
    if (materialized) await materialized.cleanup().catch(() => undefined);
    return NextResponse.json({ error: "Video could not be retrieved safely." }, { status: 503 });
  }
}
