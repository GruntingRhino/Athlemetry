import { ChangePasswordForm } from "@/components/forms/change-password-form";
import { GoalProgressForm } from "@/components/forms/goal-progress-form";
import { ProfileForm } from "@/components/forms/profile-form";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const user = await requireUser();
  const profile = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      name: true,
      age: true,
      primarySport: true,
      performanceGoal: true,
      position: true,
      team: true,
      competitionLevel: true,
      gender: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
      goalProgressCheckIns: {
        select: { progressPercent: true, note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
  });

  if (!profile) {
    return <p>User profile not found.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Profile</div>
        <h1 className="mt-4 text-3xl font-bold tracking-tight text-slate-950">Athlete profile</h1>
        <p className="mt-3 athlemetry-body">Manage athlete metadata, cohort attributes, and privacy settings.</p>
        <div className="mt-6">
          <ProfileForm
            profile={{
              name: profile.name || "",
              age: profile.age ?? 14,
              primarySport: profile.primarySport || "soccer",
              performanceGoal: profile.performanceGoal || "",
              position: profile.position || "MID",
              team: profile.team || "",
              competitionLevel: profile.competitionLevel || "academy",
              gender: profile.gender || "",
              shareInBenchmarks: profile.shareInBenchmarks,
              anonymizeForBenchmark: profile.anonymizeForBenchmark,
            }}
          />
        </div>
      </section>
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Goal progress</div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">Personal progress check-ins</h2>
        <p className="mt-3 athlemetry-body">Record your own progress toward the goal in your profile. Check-ins are self-reported and do not validate a coaching or performance claim.</p>
        <div className="mt-6">
          <GoalProgressForm
            hasPerformanceGoal={Boolean(profile.performanceGoal)}
            initialCheckIns={profile.goalProgressCheckIns.map((checkIn) => ({
              progressPercent: checkIn.progressPercent,
              note: checkIn.note,
              createdAt: checkIn.createdAt.toISOString(),
            }))}
          />
        </div>
      </section>
      <section className="athlemetry-card p-6 md:p-8">
        <div className="athlemetry-kicker">Security</div>
        <h2 className="mt-4 text-2xl font-bold tracking-tight text-slate-950">Change password</h2>
        <div className="mt-6">
          <ChangePasswordForm />
        </div>
      </section>
    </div>
  );
}
