import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth";
import { TEAM_INVITATION_TTL_DAYS } from "@/lib/constants";
import { checkDatabaseRateLimit, rateLimitSource } from "@/lib/distributed-rate-limit";
import { prisma } from "@/lib/prisma";
import { teamInvitationSchema } from "@/lib/validators";

function canManageTeams(role: string | undefined) {
  return role === "COACH" || role === "ADMIN";
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ teamId: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  if (!canManageTeams(session.user.role)) return NextResponse.json({ error: "Team management is restricted to coaches and administrators." }, { status: 403 });

  try {
    const sourceLimit = await checkDatabaseRateLimit({
      namespace: "team-invitation-source",
      identifier: rateLimitSource(request.headers),
      windowMs: 60 * 60_000,
      maxRequests: 30,
    });
    if (!sourceLimit.allowed) {
      return NextResponse.json({ error: "Too many team invitation attempts. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(sourceLimit.retryAfterSeconds) },
      });
    }

    const ownerLimit = await checkDatabaseRateLimit({
      namespace: "team-invitation-owner",
      identifier: session.user.id,
      windowMs: 60 * 60_000,
      maxRequests: 20,
    });
    if (!ownerLimit.allowed) {
      return NextResponse.json({ error: "Too many team invitation attempts. Try again later." }, {
        status: 429,
        headers: { "Retry-After": String(ownerLimit.retryAfterSeconds) },
      });
    }
  } catch {
    return NextResponse.json({ error: "Team invitation protection is temporarily unavailable." }, { status: 503 });
  }

  const payload = await request.json().catch(() => null);
  const parsed = teamInvitationSchema.safeParse(payload);
  if (!parsed.success) return NextResponse.json({ error: "Invalid invitation details." }, { status: 400 });

  const { teamId } = await params;
  const team = await prisma.team.findFirst({
    where: { id: teamId, ownerId: session.user.id },
    select: { id: true, sport: true },
  });
  if (!team) return NextResponse.json({ error: "Team not found." }, { status: 404 });

  const recipient = await prisma.user.findFirst({
    where: {
      email: parsed.data.recipientEmail,
      role: "ATHLETE",
      primarySport: team.sport,
      deletedAt: null,
    },
    select: { id: true },
  });
  if (!recipient) return NextResponse.json({ error: "An active athlete with that email and primary sport could not be invited." }, { status: 400 });

  try {
    const invitation = await prisma.$transaction(async (transaction) => {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + TEAM_INVITATION_TTL_DAYS * 24 * 60 * 60_000);
      const subscription = await transaction.billingSubscription.findFirst({ where: { billingAccount: { userId: session.user.id }, planKey: { in: ["coach-monthly", "club-monthly"] }, status: { in: ["active", "trialing"] }, seatLimit: { gt: 1 } }, select: { seatLimit: true } });
      if (!subscription?.seatLimit) throw new Error("TEAM_ENTITLEMENT_REQUIRED");
      const [memberships, pendingInvitations] = await Promise.all([
        transaction.teamMembership.count({ where: { teamId: team.id } }),
        transaction.teamInvitation.count({ where: { teamId: team.id, status: "PENDING", expiresAt: { gt: now } } }),
      ]);
      if (memberships + pendingInvitations >= subscription.seatLimit) throw new Error("TEAM_SEAT_LIMIT_REACHED");
      const existing = await transaction.teamInvitation.findUnique({
        where: { teamId_recipientId: { teamId: team.id, recipientId: recipient.id } },
        select: { id: true, status: true, expiresAt: true },
      });
      if (existing && (existing.status !== "PENDING" || existing.expiresAt > now)) return null;

      const created = existing
        ? await transaction.teamInvitation.update({
          where: { id: existing.id },
          data: { inviterId: session.user.id, createdAt: now, expiresAt },
          select: { id: true, status: true, createdAt: true, expiresAt: true },
        })
        : await transaction.teamInvitation.create({
          data: { teamId: team.id, recipientId: recipient.id, inviterId: session.user.id, expiresAt },
          select: { id: true, status: true, createdAt: true, expiresAt: true },
        });
      await transaction.systemLog.create({
        data: {
          level: "INFO",
          category: "SECURITY_AUDIT",
          message: "Team invitation created",
          metadata: { action: existing ? "TEAM_INVITATION_REISSUED" : "TEAM_INVITATION_CREATED", actorUserId: session.user.id, teamId: team.id, invitationId: created.id },
        },
      });
      return created;
    });
    if (!invitation) return NextResponse.json({ error: "An active or completed invitation already exists for this athlete." }, { status: 409 });
    return NextResponse.json({
      ok: true,
      invitation: {
        ...invitation,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      },
    }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "TEAM_ENTITLEMENT_REQUIRED") {
      return NextResponse.json({ error: "An active coach or club plan is required to invite athletes." }, { status: 403 });
    }
    if (error instanceof Error && error.message === "TEAM_SEAT_LIMIT_REACHED") {
      return NextResponse.json({ error: "Your plan's team seat limit has been reached." }, { status: 409 });
    }
    return NextResponse.json({ error: "Invitation could not be created safely." }, { status: 503 });
  }
}
