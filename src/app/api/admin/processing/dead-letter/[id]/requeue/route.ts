import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { requeueDeadLetter } from "@/lib/processing/queue-operations";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  let result;
  try {
    result = await requeueDeadLetter(id, session.user.id);
  } catch {
    return NextResponse.json({ error: "Dead-letter requeue could not be completed safely." }, { status: 503 });
  }
  if (!result.ok) {
    return NextResponse.json({ error: result.reason }, { status: 409 });
  }
  return NextResponse.json({ ok: true });
}
