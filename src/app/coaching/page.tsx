import Link from "next/link";

import { BackToSports } from "@/components/layout/back-to-sports";
import { CoachingPlanActions } from "@/components/forms/coaching-plan-actions";
import { requireUser } from "@/lib/authz";
import { requirePaidFeatureAccess } from "@/lib/billing-access";
import { isCoachingPlanEvidenceCurrent } from "@/lib/coaching-plans";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export const metadata = { title: "Coaching plans" };

export default async function CoachingPlansPage() {
  const user = await requireUser();
  await requirePaidFeatureAccess(user);
  const candidatePlans = await prisma.coachingPlan.findMany({
    where: { athleteId: user.id, status: "ACTIVE" },
    include: {
      drillDefinition: true,
      sourceSubmission: { include: { metricResult: true } },
      actionCompletions: { select: { actionIndex: true } },
    },
    orderBy: { createdAt: "desc" },
  });
  const plans = (await Promise.all(candidatePlans.map(async (plan) => {
    const primaryMetricName = plan.drillDefinition.metricPrimaryKey;
    const primaryMetricValue = plan.sourceSubmission.metricResult?.[
      primaryMetricName as keyof NonNullable<typeof plan.sourceSubmission.metricResult>
    ];
    const visible = await isCoachingPlanEvidenceCurrent({
      drillDefinitionId: plan.drillDefinitionId,
      drillSlug: plan.drillDefinition.slug,
      primaryMetricName,
      primaryMetricValue,
      metricVersion: plan.sourceSubmission.metricResult?.metricVersion ?? "unavailable",
      metadata: plan.sourceSubmission.metadata,
    });
    return visible ? plan : null;
  }))).filter((plan): plan is NonNullable<typeof plan> => plan !== null);

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <h1 className="athlemetry-section-heading">Coaching plans</h1>
        <p className="athlemetry-section-lead">Plans appear only after both the drill measurement and the recommendation model have passed independent validation and expert review.</p>
      </section>

      {plans.length === 0 ? (
        <section className="athlemetry-card p-6">
          <p className="max-w-3xl text-sm leading-6 text-slate-700">
            No coaching plan yet. Athlemetry holds back recommendations until you have a result that passed validation and the recommendation model has passed separate expert review.
          </p>
          <Link href="/submissions" className="athlemetry-button athlemetry-button-primary mt-4 min-h-11">See your clips</Link>
        </section>
      ) : (
        <section className="grid gap-5 xl:grid-cols-2">
          {plans.map((plan) => (
            <article key={plan.id} className="athlemetry-card p-5 md:p-6">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-semibold text-slate-950">{plan.drillDefinition.name}</h2><span className="athlemetry-chip">{Math.round(plan.confidenceScore)}% confidence</span></div>
              <p className="mt-1 text-xs text-slate-500">Based on {plan.sourceSubmission.recordingDate.toISOString().slice(0, 10)}</p>
              <p className="mt-1 text-xs text-slate-500">Suggested reassessment from {plan.reassessmentDueAt.toISOString().slice(0, 10)}</p>
              <h3 className="mt-5 text-sm font-semibold text-slate-900">Observed focus areas</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-slate-600">{stringArray(plan.weaknesses).map((item) => <li key={item}>{item}</li>)}</ul>
              <CoachingPlanActions
                planId={plan.id}
                recommendations={stringArray(plan.recommendations)}
                initialCompletedActionIndexes={plan.actionCompletions.map((completion) => completion.actionIndex)}
              />
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
