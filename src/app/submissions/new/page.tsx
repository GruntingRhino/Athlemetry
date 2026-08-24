import { UploadForm } from "@/components/forms/upload-form";
import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { getAvailableDrills, normalizeSport, resolveSelectedDrillSlug } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";
import { getMonthlySubmissionLimit } from "@/lib/submission-usage";

export const dynamic = "force-dynamic";

export default async function NewSubmissionPage({
  searchParams,
}: {
  searchParams?: Promise<{ sport?: string; drill?: string }> | { sport?: string; drill?: string };
}) {
  const user = await requireUser();
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
  const selectedDrillSlug = resolveSelectedDrillSlug(drills, resolvedSearchParams.drill);
  const selectedDrillId = selectedDrillSlug
    ? drills.find((drill) => drill.slug === selectedDrillSlug)?.id
    : undefined;

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="max-w-3xl">
          <div className="athlemetry-kicker">{sport ? `${SPORT_LABELS[sport]} uploads` : "Upload drill footage"}</div>
          <h1 className="mt-4 athlemetry-section-heading">
            {sport ? `Submit ${SPORT_LABELS[sport]} footage` : "Submit drill footage"}
          </h1>
          <p className="athlemetry-section-lead">
            {sport
              ? `This upload lane is locked to ${SPORT_LABELS[sport].toLowerCase()} so the drill picker, defaults, and analysis guidance stay in sync.`
              : "Upload a clip with the sport, drill context, frame markers, and camera-angle details needed for conservative analysis. Baseball flows are designed to say when a clip is not clear enough instead of faking certainty."}
          </p>
        </div>
      </section>

      <section className="athlemetry-form-shell p-6 md:p-8 lg:p-10">
        <UploadForm
          drills={drills}
          initialSelectedDrillId={selectedDrillId}
          userRole={user.role}
          monthlySubmissionLimit={getMonthlySubmissionLimit()}
        />
      </section>
    </div>
  );
}
