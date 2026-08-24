import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { canUsePaidFeatures } from "@/lib/billing";
import { ALLOWED_VIDEO_MIME_TYPES, MAX_VIDEO_SIZE_BYTES } from "@/lib/constants";
import { prisma } from "@/lib/prisma";
import { createPresignedVideoUpload } from "@/lib/storage";
import { createUploadClaim } from "@/lib/upload-claims";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const user = await prisma.user.findFirst({ where: { id: session.user.id, deletedAt: null } });
  if (!user) return NextResponse.json({ error: "User not found." }, { status: 404 });
  if (user.age && user.age < 18 && !user.parentConsentVerified) {
    return NextResponse.json({ error: "Parental approval is required." }, { status: 403 });
  }
  if (!await canUsePaidFeatures(user.id, user.role)) {
    return NextResponse.json({ error: "An active Athlemetry subscription is required." }, { status: 402 });
  }

  const body = await request.json().catch(() => ({}));
  const fileName = typeof body.fileName === "string" ? body.fileName.slice(0, 255) : "";
  const contentType = typeof body.contentType === "string" ? body.contentType : "";
  const contentLength = typeof body.contentLength === "number" ? body.contentLength : 0;
  const sha256 = typeof body.sha256 === "string" ? body.sha256.toLowerCase() : "";
  if (!fileName || !ALLOWED_VIDEO_MIME_TYPES.includes(contentType as never) || contentLength <= 0 || contentLength > MAX_VIDEO_SIZE_BYTES || !/^[a-f0-9]{64}$/.test(sha256)) {
    return NextResponse.json({ error: "Invalid video upload request." }, { status: 400 });
  }

  const upload = await createPresignedVideoUpload({ fileName, contentType, contentLength, sha256 });
  if (!upload) return NextResponse.json({ error: "Direct cloud upload is not enabled." }, { status: 409 });
  const uploadClaim = createUploadClaim({
    userId: user.id,
    storageKey: upload.storageKey,
    contentLength,
    contentType,
    sha256,
  });
  return NextResponse.json({ ...upload, uploadClaim });
}
