import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (session.user.role !== "ATHLETE") return NextResponse.json({ error: "Team invitations are available to athletes only." }, { status: 403 });

  const body = await request.json().catch(() => null);
  if (!body || (body.action !== "accept" && body.action !== "decline")) {
    return NextResponse.json({ error: "Invalid invitation action." }, { status: 400 });
  }

  const { id } = await params;
  try {
    const changed = await prisma.$transaction(async (transaction) => {
      const invitation = await transaction.teamInvitation.findFirst({
        where: { id, recipientId: session.user.id, status: "PENDING", expiresAt: { gt: new Date() } },
        select: { id: true, teamId: true },
      });
      if (!invitation) return false;

      const status = body.action === "accept" ? "ACCEPTED" : "DECLINED";
      const updated = await transaction.teamInvitation.updateMany({
        where: { id: invitation.id, recipientId: session.user.id, status: "PENDING", expiresAt: { gt: new Date() } },
        data: { status },
      });
      if (updated.count !== 1) return false;

      if (status === "ACCEPTED") {
        await transaction.teamMembership.upsert({
          where: { teamId_userId: { teamId: invitation.teamId, userId: session.user.id } },
          update: {},
          create: { teamId: invitation.teamId, userId: session.user.id, role: "ATHLETE" },
        });
      }

      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: status === "ACCEPTED" ? "Team invitation accepted" : "Team invitation declined",
          metadata: {
            action: status === "ACCEPTED" ? "TEAM_INVITATION_ACCEPTED" : "TEAM_INVITATION_DECLINED",
            actorUserId: session.user.id,
            teamId: invitation.teamId,
            invitationId: invitation.id,
          },
        },
      });
      return true;
    });
    if (!changed) return NextResponse.json({ error: "Pending invitation not found." }, { status: 404 });
  } catch {
    return NextResponse.json({ error: "Invitation could not be updated safely." }, { status: 503 });
  }

  return NextResponse.json({ ok: true });
}
