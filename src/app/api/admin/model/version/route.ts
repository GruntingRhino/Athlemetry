import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user || session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  }

  const payload = (await request.json()) as { version?: string; notes?: string };
  if (!payload.version) {
    return NextResponse.json({ error: "version is required." }, { status: 400 });
  }
  const version = payload.version;

  await prisma.$transaction(async (tx) => {
    await tx.modelVersion.updateMany({
      where: { isActive: true },
      data: { isActive: false },
    });

    await tx.modelVersion.upsert({
      where: { version },
      update: {
        isActive: true,
        notes: payload.notes || "Manual version activation.",
      },
      create: {
        version,
        isActive: true,
        notes: payload.notes || "Manual version activation.",
      },
    });
  });

  return NextResponse.json({ ok: true });
}
