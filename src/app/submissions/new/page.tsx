import { UploadForm } from "@/components/forms/upload-form";
import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { getAvailableDrills } from "@/lib/drills";
import { normalizeSport } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function NewSubmissionPage({
  searchParams,
}: {
  searchParams?: Promise<{ sport?: string }> | { sport?: string };
}) {
  await requireUser();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const sport = typeof resolvedSearchParams.sport === "string" && resolvedSearchParams.sport.trim() ? normalizeSport(resolvedSearchParams.sport) : null;

  const drills = (await getAvailableDrills())
    .filter((drill) => (sport ? drill.sport === sport : true))
    .map((drill) => ({
      id: drill.id ?? drill.slug,
      name: drill.name,
      slug: drill.slug,
      sport: drill.sport,
      guidelines: drill.guidelines,
    }));

  return (
    <div className="space-y-5">
      <BackToSports />
      <section className="rounded-[32px] border border-emerald-100 bg-white p-6 shadow-sm md:p-8">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">
          {sport ? `${SPORT_LABELS[sport]} uploads` : "Upload drill footage"}
        </p>
        <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950">
          {sport ? `Submit ${SPORT_LABELS[sport]} footage` : "Submit drill footage"}
        </h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          {sport
            ? `This upload lane is locked to ${SPORT_LABELS[sport].toLowerCase()} so the drill picker, defaults, and analysis guidance stay in sync.`
            : "Upload a clip with the sport, drill context, frame markers, and camera-angle details needed for conservative analysis. Baseball flows are designed to say when a clip is not clear enough instead of faking certainty."}
        </p>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <UploadForm drills={drills} />
      </section>
    </div>
  );
}
