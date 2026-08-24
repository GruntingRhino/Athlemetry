import Link from "next/link";

import { BackToSports } from "@/components/layout/back-to-sports";
import { getAvailableDrills, groupDrillsBySport } from "@/lib/drills";

export const dynamic = "force-dynamic";

export default async function DrillsPage() {
  const drills = await getAvailableDrills();
  const groups = groupDrillsBySport(drills);

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="athlemetry-kicker">Sports drill library</div>
            <h1 className="mt-4 athlemetry-section-heading">
              Visible sport sections, clear recording rules, and upload-ready drill cards.
            </h1>
            <p className="athlemetry-section-lead">
              Soccer, baseball, and basketball now share the same product surface with explicit calibration defaults instead of hidden placeholders.
            </p>
          </div>
          <Link href="/submissions/new" className="athlemetry-button athlemetry-button-primary">
            Submit footage
          </Link>
        </div>
      </section>

      <div className="space-y-6 lg:space-y-8">
        {groups.map((group) => (
          <section key={group.sport} id={group.sport} className="athlemetry-card scroll-mt-28 p-6 md:p-7">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.2em] text-teal-800">{group.label}</p>
                <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-950">{group.description}</h2>
              </div>
              {group.sport === "basketball" ? (
                <span className="athlemetry-chip border-amber-200 bg-amber-50 px-3 py-1 text-xs uppercase tracking-[0.16em] text-amber-800">
                  Coming next
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {group.drills.map((drill) => (
                <article key={drill.id} className="athlemetry-panel-item">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-950">{drill.name}</h3>
                    <span className="athlemetry-chip border-teal-200 bg-white px-3 py-1 text-[11px] font-bold uppercase tracking-[0.16em] text-teal-800">
                      {drill.metricPrimaryKey}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{drill.description}</p>
                  <div className="mt-4 rounded-2xl border border-white bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-950">Recording guidance</p>
                    <p className="mt-2 leading-6">{drill.guidelines}</p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href={`/submissions/new?sport=${encodeURIComponent(drill.sport)}&drill=${encodeURIComponent(drill.slug)}`} className="athlemetry-button athlemetry-button-primary px-4 py-2 text-sm">
                      Upload for this drill
                    </Link>
                    <Link href={`/protocols#${drill.slug}`} className="athlemetry-button athlemetry-button-secondary px-4 py-2 text-sm">
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
