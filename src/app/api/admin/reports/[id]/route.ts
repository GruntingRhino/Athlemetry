import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const { id } = await params;
  const payload = (await request.json()) as { status?: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED" };

  if (!payload.status) {
    return NextResponse.json({ error: "status is required." }, { status: 400 });
  }

  const report = await prisma.userReport.update({
    where: { id },
    data: {
      status: payload.status,
      reviewedAt: new Date(),
      reviewedById: session.user.id,
    },
  });

  return NextResponse.json({ ok: true, report });
}
