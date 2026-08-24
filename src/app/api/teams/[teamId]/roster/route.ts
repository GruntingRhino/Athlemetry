import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function canManageTeams(role: string | undefined) {
  return role === "COACH" || role === "ADMIN";
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canManageTeams(session.user.role)) return NextResponse.json({ error: "Team management is restricted to coaches and administrators." }, { status: 403 });

  const { teamId } = await params;
  try {
    const team = await prisma.$transaction(async (transaction) => {
      const ownedTeam = await transaction.team.findFirst({
        where: { id: teamId, ownerId: session.user.id },
        select: { id: true, name: true, sport: true },
      });
      if (!ownedTeam) return null;

      const memberships = await transaction.teamMembership.findMany({
        where: { teamId: ownedTeam.id, role: "ATHLETE" },
        select: { id: true, joinedAt: true, user: { select: { name: true, position: true } } },
        orderBy: [{ user: { name: "asc" } }, { joinedAt: "asc" }],
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Team roster viewed",
          metadata: { action: "TEAM_ROSTER_VIEWED", actorUserId: session.user.id, teamId: ownedTeam.id },
        },
      });
      return { ...ownedTeam, memberships };
    });

    if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });
    return NextResponse.json({
      team: {
        id: team.id,
        name: team.name,
        sport: team.sport,
        athletes: team.memberships.map((membership) => ({
          membershipId: membership.id,
          name: membership.user.name,
          position: membership.user.position,
          joinedAt: membership.joinedAt.toISOString(),
        })),
      },
    });
  } catch {
    return NextResponse.json({ error: "Team roster could not be viewed safely." }, { status: 503 });
  }
}
