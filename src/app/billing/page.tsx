import { BillingActions } from "@/components/forms/billing-actions";
import { RefundRequestForm } from "@/components/forms/refund-request-form";
import { requireUser } from "@/lib/authz";
import { canStartNewCheckout, getBillingRecoveryState, hasPaidEntitlement } from "@/lib/billing";
import { BILLING_PLANS, isBillingPlanConfigured } from "@/lib/billing-plans";
import { prisma } from "@/lib/prisma";
import { getMonthlySubmissionQuotaSummary, getSubmissionUsageMonthStart } from "@/lib/submission-usage";

export const dynamic = "force-dynamic";

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<{ required?: string }> | { required?: string };
}) {
  const user = await requireUser();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const subscriptionRequired = resolvedSearchParams.required === "subscription";
  const monthStart = getSubmissionUsageMonthStart();
  const [account, monthlyUsage] = await Promise.all([
    prisma.billingAccount.findUnique({
      where: { userId: user.id },
      include: { subscription: true },
    }),
    user.role === "ADMIN"
      ? Promise.resolve(null)
      : prisma.monthlySubmissionUsage.findUnique({
          where: { userId_monthStart: { userId: user.id, monthStart } },
          select: { submissionCount: true },
        }),
  ]);
  const entitled = hasPaidEntitlement(account?.subscription);
  const recoveryState = getBillingRecoveryState(account?.subscription);
  const submissionQuota = getMonthlySubmissionQuotaSummary(monthlyUsage?.submissionCount, user.role);

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="athlemetry-kicker">Subscription</div>
        <h1 className="mt-4 athlemetry-section-heading">Athlemetry membership</h1>
        <p className="athlemetry-section-lead">
          Hosted Checkout and the billing portal keep payment details out of Athlemetry. Access changes only after a signed Stripe webhook updates the local entitlement.
        </p>
      </section>

      {subscriptionRequired ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950" role="alert">
          <h2 className="font-semibold">Subscription required</h2>
          <p className="mt-1">An active Athlemetry membership is required to access athlete reports, coaching plans, and peer benchmarking.</p>
        </section>
      ) : null}

      {recoveryState ? (
        <section className="rounded-2xl border border-amber-300 bg-amber-50 p-5 text-sm text-amber-950" role="alert">
          <h2 className="font-semibold">{recoveryState.title}</h2>
          <p className="mt-1">{recoveryState.description}</p>
        </section>
      ) : null}

      <section className="grid gap-4 md:grid-cols-4">
        <article className="athlemetry-stat">
          <p className="athlemetry-stat-label">Access</p>
          <p className="athlemetry-stat-value">{entitled ? "Active" : "Inactive"}</p>
        </article>
        <article className="athlemetry-stat">
          <p className="athlemetry-stat-label">Subscription status</p>
          <p className="athlemetry-stat-value text-2xl">{account?.subscription?.status ?? "None"}</p>
        </article>
        <article className="athlemetry-stat">
          <p className="athlemetry-stat-label">Current period</p>
          <p className="athlemetry-stat-value text-2xl">
            {account?.subscription?.currentPeriodEnd?.toISOString().slice(0, 10) ?? "Not started"}
          </p>
        </article>
        {submissionQuota ? (
          <article className="athlemetry-stat">
            <p className="athlemetry-stat-label">Video submissions this month</p>
            <p className="athlemetry-stat-value text-2xl">{submissionQuota.used} / {submissionQuota.limit}</p>
            <p className="mt-1 text-xs text-slate-600">{submissionQuota.remaining} remaining; resets at the next UTC month.</p>
          </article>
        ) : null}
      </section>

      <section className="athlemetry-card p-5 md:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Choose or manage a plan</h2>
        <p className="mt-1 text-sm text-slate-600">The exact amount and renewal interval are shown on Stripe’s hosted payment page before purchase.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {BILLING_PLANS.map((plan) => {
            const configured = isBillingPlanConfigured(plan.key);
            return <div className="athlemetry-panel-item" key={plan.key}><p className="font-semibold text-slate-950">{plan.label}</p><p className="mt-1 text-xs text-slate-600">{plan.seats} seat{plan.seats === 1 ? "" : "s"} · {plan.interval}</p><p className="mt-2 text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">{configured ? "Configured" : "Unavailable"}</p></div>;
          })}
        </div>
        <div className="mt-5">
          <BillingActions
            canStartCheckout={canStartNewCheckout(account?.subscription)}
            hasAccount={Boolean(account?.stripeCustomerId)}
            portalLabel={recoveryState?.portalLabel}
          />
        </div>
      </section>

      {account?.stripeCustomerId ? (
        <section className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Request a refund review</h2>
          <p className="mt-1 text-sm text-slate-600">Submit a request for human review. Payment/refund processing remains in Stripe and is never automatic.</p>
          <div className="mt-5"><RefundRequestForm /></div>
        </section>
      ) : null}
    </div>
  );
}
