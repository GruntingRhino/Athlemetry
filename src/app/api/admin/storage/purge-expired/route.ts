import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { purgeExpiredVideos } from "@/lib/processing/queue";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const result = await purgeExpiredVideos(500);
  return NextResponse.json({ ok: true, ...result });
}
