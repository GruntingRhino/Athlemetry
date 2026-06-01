import Link from "next/link";

import { BackToSports } from "@/components/layout/back-to-sports";
import { getAvailableDrills, groupDrillsBySport } from "@/lib/drills";

export const dynamic = "force-dynamic";

export default async function DrillsPage() {
  const drills = await getAvailableDrills();

  const groups = groupDrillsBySport(drills);

  return (
    <div className="space-y-6">
      <BackToSports />
      <section className="rounded-[32px] border border-emerald-100 bg-white p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">Sports drill library</p>
            <h1 className="mt-3 text-3xl font-black tracking-tight text-slate-950 md:text-5xl">
              Visible sport sections, clear recording rules, and upload-ready drill cards.
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              Soccer, baseball, and basketball now share the same product surface with explicit calibration defaults instead of hidden placeholders.
            </p>
          </div>
          <Link href="/submissions/new" className="rounded-full bg-emerald-600 px-5 py-3 text-sm font-semibold text-white shadow-lg shadow-emerald-600/20 transition hover:bg-emerald-700">
            Submit footage
          </Link>
        </div>
      </section>

      <div className="space-y-6">
        {groups.map((group) => (
          <section key={group.sport} id={group.sport} className="scroll-mt-28 rounded-[30px] border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-col gap-3 border-b border-slate-100 pb-5 md:flex-row md:items-end md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.22em] text-emerald-700">{group.label}</p>
                <h2 className="mt-2 text-2xl font-bold text-slate-950">{group.description}</h2>
              </div>
              {group.sport === "basketball" ? (
                <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-amber-700">
                  Coming next
                </span>
              ) : null}
            </div>

            <div className="mt-5 grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
              {group.drills.map((drill) => (
                <article key={drill.id} className="rounded-[26px] border border-slate-200 bg-slate-50/70 p-5 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-lg font-semibold text-slate-950">{drill.name}</h3>
                    <span className="rounded-full border border-emerald-200 bg-white px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-emerald-700">
                      {drill.metricPrimaryKey}
                    </span>
                  </div>
                  <p className="mt-3 text-sm leading-6 text-slate-600">{drill.description}</p>
                  <div className="mt-4 rounded-2xl border border-white bg-white p-4 text-sm text-slate-700">
                    <p className="font-semibold text-slate-950">Recording guidance</p>
                    <p className="mt-2 leading-6">{drill.guidelines}</p>
                  </div>
                  <div className="mt-5 flex flex-wrap gap-3">
                    <Link href="/submissions/new" className="rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700">
                      Upload for this drill
                    </Link>
                    {drill.instructionVideoUrl ? (
                      <a href={drill.instructionVideoUrl} target="_blank" rel="noreferrer" className="rounded-full border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-emerald-200 hover:text-emerald-800">
                        Reference video
                      </a>
                    ) : null}
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
