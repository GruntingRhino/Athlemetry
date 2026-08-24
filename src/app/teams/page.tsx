import { TeamManagement } from "@/components/teams/team-management";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TeamsPage() {
  const user = await requireRole(["COACH", "ADMIN"]);
  const teams = await prisma.team.findMany({
    where: { ownerId: user.id },
    select: {
      id: true,
      name: true,
      sport: true,
      createdAt: true,
      _count: { select: { memberships: true } },
      invitations: {
        where: { status: "PENDING", expiresAt: { gt: new Date() } },
        select: { id: true, createdAt: true, expiresAt: true },
        orderBy: { createdAt: "desc" },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Team foundation</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Team management</h1>
        <p className="mt-3 athlemetry-body">Create and review teams owned by this coach or administrator, then invite existing eligible athletes. Invitations require athlete acceptance and do not grant submission access. Owners can review confirmed athlete rosters and remove athlete memberships without receiving emails, submissions, reports, or other profile details. Assignments, feedback, and team-wide access remain unavailable.</p>
      </section>
      <section className="athlemetry-card p-6 md:p-8">
        <TeamManagement initialTeams={teams.map((team) => ({
          id: team.id,
          name: team.name,
          sport: team.sport,
          createdAt: team.createdAt.toISOString(),
          memberCount: team._count.memberships,
          pendingInvitations: team.invitations.map((invitation) => ({
            id: invitation.id,
            createdAt: invitation.createdAt.toISOString(),
            expiresAt: invitation.expiresAt.toISOString(),
          })),
        }))} />
      </section>
    </div>
  );
}
