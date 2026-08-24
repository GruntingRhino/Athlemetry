import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  const { id } = await context.params;

  try {
    const dismissed = await prisma.$transaction(async (transaction) => {
      const result = await transaction.userNotification.updateMany({
        where: { id, userId: session.user.id, readAt: null },
        data: { readAt: new Date() },
      });
      if (result.count !== 1) return false;

      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Notification dismissed",
          metadata: {
            action: "NOTIFICATION_DISMISSED",
            actorUserId: session.user.id,
            notificationId: id,
          },
        },
      });
      return true;
    });

    if (!dismissed) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Notification could not be dismissed safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
