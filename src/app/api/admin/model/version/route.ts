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

  try {
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

      await tx.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Model version activated",
          metadata: {
            action: "MODEL_VERSION_ACTIVATED",
            actorUserId: session.user.id,
            modelVersion: version,
          },
        },
      });
    });
  } catch {
    return NextResponse.json({ error: "Model version activation could not be recorded safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
