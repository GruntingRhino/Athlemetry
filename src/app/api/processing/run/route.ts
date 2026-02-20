import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { assertRole } from "@/lib/authz";
import { runProcessingBatch } from "@/lib/processing/queue";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  if (!assertRole(session.user.role, ["ADMIN"])) {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = (await request.json().catch(() => ({}))) as { limit?: number };
  const limit = typeof payload.limit === "number" ? Math.min(Math.max(payload.limit, 1), 50) : 10;

  const result = await runProcessingBatch(limit);
  return NextResponse.json({ ok: true, ...result });
}
