import Link from "next/link";

import { FrequencyChart } from "@/components/dashboard/frequency-chart";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { BackToSports } from "@/components/layout/back-to-sports";
import { getAthleteDashboardData } from "@/lib/dashboard";
import { requireUser } from "@/lib/authz";
import { formatPercent } from "@/lib/utils";
import { normalizeSport } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ sport?: string }> | { sport?: string };
}) {
  const user = await requireUser();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const sport = typeof resolvedSearchParams.sport === "string" && resolvedSearchParams.sport.trim() ? normalizeSport(resolvedSearchParams.sport) : null;
  const data = await getAthleteDashboardData(user.id, sport);

  const frequency = Object.entries(data.drillFrequency).map(([drill, count]) => ({
    drill,
    count,
  }));

  const currentPercentile = data.timeline[data.timeline.length - 1]?.percentile ?? 50;

  return (
    <div className="space-y-6">
      <BackToSports />
      <section className="grid gap-4 md:grid-cols-5">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm md:col-span-5">
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-700">{sport ? `${SPORT_LABELS[sport]} dashboard` : "Performance dashboard"}</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">{sport ? `${SPORT_LABELS[sport]} trend and score view` : "Trend and score view"}</h1>
          <p className="mt-1 text-sm text-slate-600">
            {sport
              ? `This dashboard is filtered to ${SPORT_LABELS[sport].toLowerCase()} so uploads, submissions, and benchmarking stay aligned.`
              : "See completed drill history, percentile movement, and the strongest / weakest signals across your sessions."}
          </p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Completed drills</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.submissions.length}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Current percentile</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{formatPercent(currentPercentile)}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Average score</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.averageScore.toFixed(1)}/100</p>
          <p className="mt-1 text-xs text-slate-500">Average of scored fields across completed sessions</p>
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Performance trend timeline</h2>
            <p className="text-sm text-slate-600">Primary metric, benchmark percentile, and composite score progression.</p>
          </div>
          <Link href={sport ? `/submissions/new?sport=${sport}` : "/submissions/new"} className="text-sm font-medium text-slate-700 underline">
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
