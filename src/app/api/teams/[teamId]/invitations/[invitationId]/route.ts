import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManageTeams(role: string | undefined) {
  return role === "COACH" || role === "ADMIN";
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; invitationId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canManageTeams(session.user.role)) return NextResponse.json({ error: "Team management is restricted to coaches and administrators." }, { status: 403 });

  const { teamId, invitationId } = await params;
  try {
    const revoked = await prisma.$transaction(async (transaction) => {
      const team = await transaction.team.findFirst({
        where: { id: teamId, ownerId: session.user.id },
        select: { id: true },
      });
      if (!team) return false;

      const invitation = await transaction.teamInvitation.deleteMany({
        where: { id: invitationId, teamId: team.id, status: "PENDING" },
      });
      if (invitation.count !== 1) return false;

      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Team invitation revoked",
          metadata: {
            action: "TEAM_INVITATION_REVOKED",
            actorUserId: session.user.id,
            teamId: team.id,
            invitationId,
          },
        },
      });
      return true;
    });

    if (!revoked) return NextResponse.json({ error: "Pending invitation not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Team invitation could not be revoked safely." }, { status: 503 });
  }
}
