import Link from "next/link";

import { FrequencyChart } from "@/components/dashboard/frequency-chart";
import { NotificationList } from "@/components/dashboard/notification-list";
import { PerformanceChart } from "@/components/dashboard/performance-chart";
import { BackToSports } from "@/components/layout/back-to-sports";
import { getAthleteDashboardData } from "@/lib/dashboard";
import { requireUser } from "@/lib/authz";
import { formatPercent } from "@/lib/utils";
import { normalizeSport } from "@/lib/drills";
import { SPORT_LABELS } from "@/lib/constants";
import { hasPaidEntitlement } from "@/lib/billing";
import { buildOnboardingSteps } from "@/lib/engagement";
import { prisma } from "@/lib/prisma";
import { getOrCreateReferralCode, getReferralAttributionSummary } from "@/lib/referrals";

export const dynamic = "force-dynamic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams?: Promise<{ sport?: string }> | { sport?: string };
}) {
  const user = await requireUser();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const sport = typeof resolvedSearchParams.sport === "string" && resolvedSearchParams.sport.trim() ? normalizeSport(resolvedSearchParams.sport) : null;
  const [data, engagementProfile, referralSummary] = await Promise.all([
    getAthleteDashboardData(user.id, sport),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        name: true,
        age: true,
        position: true,
        competitionLevel: true,
        parentConsentVerified: true,
        referralCode: true,
        billingAccount: { select: { subscription: true } },
        _count: { select: { submissions: true } },
        notifications: {
          where: { readAt: null },
          orderBy: { createdAt: "desc" },
          take: 3,
          select: { id: true, title: true, body: true, actionHref: true },
        },
      },
    }),
    getReferralAttributionSummary(user.id, prisma),
  ]);
  const onboardingSteps = engagementProfile ? buildOnboardingSteps({
    profileComplete: Boolean(engagementProfile.name && engagementProfile.age && engagementProfile.position && engagementProfile.competitionLevel),
    consentRequired: typeof engagementProfile.age === "number" && engagementProfile.age < 18,
    consentVerified: engagementProfile.parentConsentVerified,
    hasPaidAccess: hasPaidEntitlement(engagementProfile.billingAccount?.subscription),
    submissionCount: engagementProfile._count.submissions,
  }) : [];
  const completedOnboardingSteps = onboardingSteps.filter((step) => step.complete).length;
  const referralCode = engagementProfile?.referralCode ?? await getOrCreateReferralCode(user.id, prisma).catch(() => null);

  const frequency = Object.entries(data.drillFrequency).map(([drill, count]) => ({
    drill,
    count,
  }));

  const currentPercentile = data.timeline[data.timeline.length - 1]?.percentile;

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="athlemetry-kicker">{sport ? `${SPORT_LABELS[sport]} dashboard` : "Performance dashboard"}</div>
            <h1 className="mt-4 athlemetry-section-heading">
              {sport ? `${SPORT_LABELS[sport]} trend and score view` : "Trend and score view"}
            </h1>
            <p className="athlemetry-section-lead">
              {sport
                ? `This dashboard is filtered to ${SPORT_LABELS[sport].toLowerCase()} so uploads, submissions, and benchmarking stay aligned.`
                : "See completed drill history, percentile movement, and the strongest / weakest signals across your sessions."}
            </p>
          </div>
          <Link href={sport ? `/submissions/new?sport=${sport}` : "/submissions/new"} className="athlemetry-button athlemetry-button-primary">
            Submit new drill
          </Link>
        </div>
      </section>

      {onboardingSteps.length > 0 && completedOnboardingSteps < onboardingSteps.length ? (
        <section className="athlemetry-card p-5 md:p-6">
          <div className="flex items-center justify-between gap-4"><div><div className="athlemetry-kicker">Getting started</div><h2 className="mt-2 text-xl font-semibold text-slate-950">Complete your athlete setup</h2></div><span className="athlemetry-chip">{completedOnboardingSteps}/{onboardingSteps.length}</span></div>
          <ol className="mt-5 grid gap-3 md:grid-cols-2">
            {onboardingSteps.map((step) => <li key={step.key} className="athlemetry-panel-item flex items-center justify-between gap-3"><span className={step.complete ? "text-slate-500 line-through" : "font-medium text-slate-900"}>{step.label}</span>{step.complete ? <span aria-label="Complete">✓</span> : <Link className="text-sm font-semibold text-teal-800" href={step.href}>Continue</Link>}</li>)}
          </ol>
        </section>
      ) : null}

      <NotificationList initialNotifications={engagementProfile?.notifications ?? []} />

      {referralCode ? (
        <section className="athlemetry-card p-5 md:p-6">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="athlemetry-kicker">Referral</div>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">Invite a teammate</h2>
              <p className="mt-1 text-sm leading-6 text-slate-600">Share this registration link to record an invite. It does not promise a reward or alter anyone’s subscription.</p>
              <p className="mt-2 text-sm leading-6 text-slate-600">
                {referralSummary.attributedRegistrationCount} attributed {referralSummary.attributedRegistrationCount === 1 ? "registration" : "registrations"} · {referralSummary.currentPaidReferralCount} currently paid {referralSummary.currentPaidReferralCount === 1 ? "referral" : "referrals"}
              </p>
              <p className="mt-1 text-xs leading-5 text-slate-500">Counts are aggregate only. Current paid referrals are a point-in-time entitlement count, not revenue or retention analytics.</p>
            </div>
            <Link href={`/register?ref=${encodeURIComponent(referralCode)}`} className="athlemetry-button athlemetry-button-secondary">
              Your code: {referralCode}
            </Link>
          </div>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-5">
        {[
          ["Validated drills", data.releasedSubmissionCount],
          ["Current percentile", typeof currentPercentile === "number" ? formatPercent(currentPercentile) : "Unavailable"],
          ["Average score", typeof data.averageScore === "number" ? `${data.averageScore.toFixed(1)}/100` : "Unavailable"],
          ["Metric variability", typeof data.metricVariability === "number" ? data.metricVariability.toFixed(4) : "Unavailable"],
          ["Trend slope", data.timeline.length > 1 ? data.trendSlope.toFixed(4) : "Unavailable"],
        ].map(([label, value]) => (
          <article key={label as string} className="athlemetry-stat xl:col-span-1">
            <p className="athlemetry-stat-label">{label}</p>
            <p className="athlemetry-stat-value">{value}</p>
          </article>
        ))}
      </section>

      {data.researchOnlyCount > 0 ? (
        <section className="rounded-[24px] border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-950">
          {data.researchOnlyCount} completed {data.researchOnlyCount === 1 ? "analysis is" : "analyses are"} held in research-only mode. Metrics, progress claims, and rankings appear only after the exact drill protocol and metric pass the published validation gates.
        </section>
      ) : null}

      <section className="athlemetry-card p-5 md:p-6">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold tracking-tight text-slate-950">Performance trend timeline</h2>
            <p className="text-sm text-slate-600">
              {data.trendDrillName && data.trendMetricName
                ? `${data.trendDrillName} · ${data.trendMetricName.replace(/([A-Z])/g, " $1").trim()} progression. Different drill units are never combined into one trend.`
                : "A trend appears after comparable released results exist for the same drill metric."}
            </p>
          </div>
          <Link href={sport ? `/submissions/new?sport=${sport}` : "/submissions/new"} className="text-sm font-semibold text-teal-800 transition hover:text-teal-900">
            Submit new drill
          </Link>
        </div>
        <PerformanceChart points={data.timeline} />
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Drill frequency summary</h2>
          <p className="mt-1 text-sm text-slate-600">Frequency by drill type across historical submissions.</p>
          <div className="mt-4">
            <FrequencyChart data={frequency} />
          </div>
        </article>

        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Strengths and focus areas</h2>
          <div className="mt-4 space-y-4">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">Strength indicators</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {data.strengths.map((strength) => (
                  <li key={strength} className="athlemetry-panel-item">
                    {strength}
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="text-xs font-bold uppercase tracking-[0.18em] text-amber-700">Suggested focus areas</h3>
              <ul className="mt-3 space-y-2 text-sm text-slate-700">
                {data.suggestions.map((suggestion) => (
                  <li key={suggestion} className="athlemetry-panel-item">
                    {suggestion}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </article>
      </section>
    </div>
  );
}
