import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "ATHLETE") return NextResponse.json({ error: "Team invitations are available to athletes only." }, { status: 403 });

  let invitations;
  try {
    invitations = await prisma.$transaction(async (transaction) => {
      const pendingInvitations = await transaction.teamInvitation.findMany({
        where: { recipientId: session.user.id, status: "PENDING", expiresAt: { gt: new Date() } },
        select: {
          id: true,
          createdAt: true,
          expiresAt: true,
          team: { select: { name: true, sport: true } },
        },
        orderBy: { createdAt: "desc" },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Team invitations viewed",
          metadata: { action: "TEAM_INVITATIONS_VIEWED", actorUserId: session.user.id },
        },
      });
      return pendingInvitations;
    });
  } catch {
    return NextResponse.json({ error: "Team invitations could not be loaded safely." }, { status: 503 });
  }
  return NextResponse.json({
    invitations: invitations.map((invitation) => ({
      ...invitation,
      createdAt: invitation.createdAt.toISOString(),
      expiresAt: invitation.expiresAt.toISOString(),
    })),
  });
}
