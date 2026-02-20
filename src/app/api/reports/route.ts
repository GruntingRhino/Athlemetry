import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reportSchema } from "@/lib/validators";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const payload = await request.json();
  const parsed = reportSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid report payload.", issues: parsed.error.flatten() }, { status: 400 });
  }

  const report = await prisma.userReport.create({
    data: {
      reporterId: session.user.id,
      submissionId: parsed.data.submissionId,
      reason: parsed.data.reason,
      details: parsed.data.details,
    },
  });

  return NextResponse.json({ ok: true, report });
}
