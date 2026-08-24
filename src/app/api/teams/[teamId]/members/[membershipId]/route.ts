import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManageTeams(role: string | undefined) {
  return role === "COACH" || role === "ADMIN";
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ teamId: string; membershipId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canManageTeams(session.user.role)) return NextResponse.json({ error: "Team management is restricted to coaches and administrators." }, { status: 403 });

  const { teamId, membershipId } = await params;
  try {
    const removed = await prisma.$transaction(async (transaction) => {
      const team = await transaction.team.findFirst({
        where: { id: teamId, ownerId: session.user.id },
        select: { id: true },
      });
      if (!team) return false;

      const membership = await transaction.teamMembership.deleteMany({
        where: { id: membershipId, teamId: team.id, role: "ATHLETE" },
      });
      if (membership.count !== 1) return false;

      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Team athlete membership removed",
          metadata: {
            action: "TEAM_ATHLETE_MEMBERSHIP_REMOVED",
            actorUserId: session.user.id,
            teamId: team.id,
            membershipId,
          },
        },
      });
      return true;
    });

    if (!removed) return NextResponse.json({ error: "Team membership not found." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "Team membership could not be removed safely." }, { status: 503 });
  }
}
