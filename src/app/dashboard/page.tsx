import Link from "next/link";

import { FrequencyChart } from "@/components/dashboard/frequency-chart";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { getAthleteDashboardData } from "@/lib/dashboard";
import { requireUser } from "@/lib/authz";
import { formatPercent } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const user = await requireUser();
  const data = await getAthleteDashboardData(user.id);

  const frequency = Object.entries(data.drillFrequency).map(([drill, count]) => ({
    drill,
    count,
  }));

  const currentPercentile = data.timeline[data.timeline.length - 1]?.percentile ?? 50;

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Completed drills</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.submissions.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Current percentile</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatPercent(currentPercentile)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Consistency score</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.consistencyScore.toFixed(1)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Trend slope</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.trendSlope.toFixed(4)}</p>
        </article>
      </section>

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900">Performance trend timeline</h2>
          <Link href="/submissions/new" className="text-sm font-medium text-slate-700 underline">
            Submit new drill
          </Link>
        </div>
        <PerformanceChart points={data.timeline} />
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Drill frequency summary</h2>
          <p className="mt-1 text-sm text-slate-600">Frequency by drill type across historical submissions.</p>
          <div className="mt-4">
            <FrequencyChart data={frequency} />
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Strengths and focus areas</h2>
          <div className="mt-3 space-y-3">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">Strength indicators</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                {data.strengths.map((strength) => (
                  <li key={strength}>{strength}</li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-amber-700">Suggested focus areas</h3>
              <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-slate-700">
                {data.suggestions.map((suggestion) => (
                  <li key={suggestion}>{suggestion}</li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
