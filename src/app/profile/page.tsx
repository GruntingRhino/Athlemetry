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
      position: true,
      team: true,
      competitionLevel: true,
      gender: true,
      shareInBenchmarks: true,
      anonymizeForBenchmark: true,
    },
  });

  if (!profile) {
    return <p>User profile not found.</p>;
  }

  return (
    <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
      <h1 className="text-2xl font-semibold text-slate-900">Profile</h1>
      <p className="mt-1 text-sm text-slate-600">Manage athlete metadata, cohort attributes, and privacy settings.</p>
      <div className="mt-5">
        <ProfileForm
          profile={{
            name: profile.name || "",
            age: profile.age ?? 14,
            position: profile.position || "MID",
            team: profile.team || "",
            competitionLevel: profile.competitionLevel || "academy",
            gender: profile.gender || "",
            shareInBenchmarks: profile.shareInBenchmarks,
            anonymizeForBenchmark: profile.anonymizeForBenchmark,
          }}
        />
      </div>
    </div>
  );
}
