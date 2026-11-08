import Link from "next/link";

import { BackToSports } from "@/components/layout/back-to-sports";
import { getMetricLabel } from "@/lib/constants";
import { getAvailableDrills, groupDrillsBySport } from "@/lib/drills";

export const dynamic = "force-dynamic";

export const metadata = { title: "Drills" };

export default async function DrillsPage() {
  const drills = await getAvailableDrills();
  const groups = groupDrillsBySport(drills);

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <h1 className="athlemetry-section-heading">Drill library</h1>
            <p className="athlemetry-section-lead">
              Each drill lists how to record it. Pick one, follow the recording guidance, and upload your clip.
            </p>
          </div>
          <Link href="/submissions/new" className="athlemetry-button athlemetry-button-primary">
            Start an upload
          </Link>
        </div>
      </section>

      <div className="space-y-6 lg:space-y-8">
        {groups.map((group) => (
          <section key={group.sport} id={group.sport} className="scroll-mt-28">
            <div className="border-b border-slate-200 pb-5">
              <h2 className="text-2xl font-bold tracking-tight text-slate-950">{group.label}</h2>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-700">{group.description}</p>
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {group.drills.map((drill) => (
                <article key={drill.id} className="athlemetry-panel-item flex h-full min-w-0 flex-col">
                  <h3 className="break-words text-lg font-semibold text-slate-950">{drill.name}</h3>
                  <p className="mt-2">
                    <span className="athlemetry-chip max-w-full border-teal-200 bg-white px-3 py-1 text-xs font-semibold text-teal-900">
                      Reported when validated: {getMetricLabel(drill.metricPrimaryKey)}
                    </span>
                  </p>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{drill.description}</p>
                  <div className="mt-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-950">Recording guidance</p>
                    <p className="mt-1 break-words leading-6">{drill.guidelines}</p>
                  </div>
                  <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 pt-5">
                    <Link href={`/submissions/new?drill=${encodeURIComponent(drill.slug)}`} className="athlemetry-button athlemetry-button-secondary min-h-11">
                      Upload for this drill
                    </Link>
                    <Link href={`/protocols#${drill.slug}`} className="inline-flex min-h-11 items-center text-sm font-semibold text-teal-800 underline underline-offset-4">
                      View capture protocol
                    </Link>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
