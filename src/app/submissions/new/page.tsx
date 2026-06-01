import { UploadForm } from "@/components/forms/upload-form";
import { requireUser } from "@/lib/authz";
import { getAvailableDrills } from "@/lib/drills";

export const dynamic = "force-dynamic";

export default async function NewSubmissionPage() {
  await requireUser();

  const drills = (await getAvailableDrills()).map((drill) => ({
    id: drill.id ?? drill.slug,
    name: drill.name,
    slug: drill.slug,
    sport: drill.sport,
    guidelines: drill.guidelines,
  }));

  return (
    <div className="space-y-5">
      <section className="rounded-[32px] border border-emerald-100 bg-white p-6 shadow-sm md:p-8">
        <h1 className="text-3xl font-black tracking-tight text-slate-950">Submit drill footage</h1>
        <p className="mt-3 max-w-3xl text-base leading-7 text-slate-600">
          Upload a clip with the sport, drill context, frame markers, and camera-angle details needed for conservative analysis. Baseball flows are designed to say when a clip is not clear enough instead of faking certainty.
        </p>
      </section>

      <section className="rounded-[32px] border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <UploadForm drills={drills} />
      </section>
    </div>
  );
}
