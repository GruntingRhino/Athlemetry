import { TeamInvitationList } from "@/components/teams/team-invitation-list";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TeamInvitationsPage() {
  const user = await requireRole(["ATHLETE"]);
  const invitations = await prisma.$transaction(async (transaction) => {
    const pendingInvitations = await transaction.teamInvitation.findMany({
      where: { recipientId: user.id, status: "PENDING", expiresAt: { gt: new Date() } },
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
        metadata: { action: "TEAM_INVITATIONS_VIEWED", actorUserId: user.id },
      },
    });
    return pendingInvitations;
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Team membership</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Team invitations</h1>
        <p className="mt-3 athlemetry-body">Only accept a team invitation you recognize. Acceptance creates a team membership and does not share your submissions, reports, or profile.</p>
      </section>
      <TeamInvitationList initialInvitations={invitations.map((invitation) => ({
        ...invitation,
        createdAt: invitation.createdAt.toISOString(),
        expiresAt: invitation.expiresAt.toISOString(),
      }))} />
    </div>
  );
}
