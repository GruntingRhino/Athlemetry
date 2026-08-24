import { TeamRoster } from "@/components/teams/team-roster";
import { requireRole } from "@/lib/authz";

export const dynamic = "force-dynamic";

export default async function TeamRosterPage({ params }: { params: Promise<{ teamId: string }> }) {
  await requireRole(["COACH", "ADMIN"]);
  const { teamId } = await params;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Confirmed roster</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Team athletes</h1>
        <p className="mt-3 athlemetry-body">Only confirmed athlete memberships are listed. This view does not include emails, submissions, reports, or profile details. Team owners can remove an athlete membership without changing the athlete account or other access.</p>
      </section>
      <section className="athlemetry-card p-6 md:p-8">
        <TeamRoster teamId={teamId} />
      </section>
    </div>
  );
}
