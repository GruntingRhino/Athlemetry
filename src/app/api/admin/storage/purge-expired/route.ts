import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { purgeExpiredVideos } from "@/lib/processing/queue";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  try {
    await prisma.systemLog.create({
      data: {
        level: "INFO",
        category: "SECURITY_AUDIT",
        message: "Expired video purge initiated",
        metadata: { action: "EXPIRED_VIDEO_PURGE_INITIATED", actorUserId: session.user.id },
      },
    });
  } catch {
    return NextResponse.json({ error: "Expired video purge could not be initiated safely." }, { status: 503 });
  }

  let result;
  try {
    result = await purgeExpiredVideos(500);
  } catch {
    return NextResponse.json({ error: "Expired video purge could not be completed safely." }, { status: 503 });
  }
  return NextResponse.json({ ok: true, ...result });
}
