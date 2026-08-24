import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { teamCreationSchema } from "@/lib/validators";

function canManageTeams(role: string | undefined) {
  return role === "COACH" || role === "ADMIN";
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canManageTeams(session.user.role)) return NextResponse.json({ error: "Team management is restricted to coaches and administrators." }, { status: 403 });

  const teams = await prisma.team.findMany({
    where: { ownerId: session.user.id },
    select: {
      id: true,
      name: true,
      sport: true,
      createdAt: true,
      _count: { select: { memberships: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({
    teams: teams.map((team) => ({ ...team, createdAt: team.createdAt.toISOString() })),
  });
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canManageTeams(session.user.role)) return NextResponse.json({ error: "Team management is restricted to coaches and administrators." }, { status: 403 });

  const payload = await request.json().catch(() => null);
  const parsed = teamCreationSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid team details." }, { status: 400 });

  try {
    const team = await prisma.$transaction(async (transaction) => {
      const created = await transaction.team.create({
        data: {
          name: parsed.data.name,
          sport: parsed.data.sport,
          ownerId: session.user.id,
          memberships: { create: { userId: session.user.id, role: "OWNER" } },
        },
        select: { id: true, name: true, sport: true, createdAt: true },
      });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Team created",
          metadata: { action: "TEAM_CREATED", actorUserId: session.user.id, teamId: created.id },
        },
      });
      return created;
    });

    return NextResponse.json({ ok: true, team: { ...team, createdAt: team.createdAt.toISOString() } }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Team could not be created safely." }, { status: 503 });
  }
}
