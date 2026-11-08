import { getBeforeYouFilmItems } from "@/app/submissions/new/before-you-film";
import { UploadForm } from "@/components/forms/upload-form";
import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { getAvailableDrills } from "@/lib/drills";
import { getMonthlySubmissionLimit } from "@/lib/submission-usage";

export const dynamic = "force-dynamic";

export const metadata = { title: "Upload a clip" };

type NewSubmissionSearchParams = { sport?: string; drill?: string };

export default async function NewSubmissionPage({
  searchParams,
}: {
  searchParams?: Promise<NewSubmissionSearchParams> | NewSubmissionSearchParams;
}) {
  const user = await requireUser();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});

  const drills = (await getAvailableDrills()).map((drill) => ({
    id: drill.id ?? drill.slug,
    name: drill.name,
    slug: drill.slug,
    sport: drill.sport,
    guidelines: drill.guidelines,
    beforeYouFilm: getBeforeYouFilmItems(drill.slug),
  }));

  return (
    <div className="space-y-5 lg:space-y-6">
      <BackToSports />
      <div className="max-w-3xl">
        <h1 className="athlemetry-section-heading">Upload a clip</h1>
        <p className="athlemetry-section-lead mt-2">
          Pick the sport and drill, add your clip, and submit. Athlemetry checks the recording against the drill&apos;s capture requirements before reporting anything.
        </p>
      </div>

      <section className="athlemetry-form-shell p-4 sm:p-6 md:p-8">
        <UploadForm
          drills={drills}
          initialSport={typeof resolvedSearchParams.sport === "string" ? resolvedSearchParams.sport : undefined}
          initialDrillSlug={typeof resolvedSearchParams.drill === "string" ? resolvedSearchParams.drill : undefined}
          userRole={user.role}
          monthlySubmissionLimit={getMonthlySubmissionLimit()}
        />
      </section>
    </div>
  );
}
