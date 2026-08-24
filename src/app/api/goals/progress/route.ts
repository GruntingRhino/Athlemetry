import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { goalProgressCheckInSchema } from "@/lib/validators";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const checkIns = await prisma.goalProgressCheckIn.findMany({
    where: { athleteId: session.user.id },
    select: { progressPercent: true, note: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  return NextResponse.json({
    checkIns: checkIns.map((checkIn) => ({
      ...checkIn,
      createdAt: checkIn.createdAt.toISOString(),
    })),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });

  const payload = await request.json().catch(() => null);
  const parsed = goalProgressCheckInSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid goal progress check-in." }, { status: 400 });

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { performanceGoal: true, deletedAt: true },
  });
  if (!user || user.deletedAt || !user.performanceGoal) {
    return NextResponse.json({ error: "Add a profile performance goal before recording progress." }, { status: 409 });
  }

  try {
    const checkIn = await prisma.$transaction(async (transaction) => {
      const created = await transaction.goalProgressCheckIn.create({
        data: {
          athleteId: session.user.id,
          progressPercent: parsed.data.progressPercent,
          note: parsed.data.note ?? null,
        },
        select: { progressPercent: true, note: true, createdAt: true },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Goal progress check-in recorded",
          metadata: { action: "GOAL_PROGRESS_CHECK_IN_RECORDED", actorUserId: session.user.id },
        },
      });
      return created;
    });

    return NextResponse.json({
      ok: true,
      checkIn: { ...checkIn, createdAt: checkIn.createdAt.toISOString() },
    });
  } catch {
    return NextResponse.json({ error: "Goal progress check-in could not be recorded safely." }, { status: 503 });
  }
}
