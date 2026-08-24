import Link from "next/link";

import { QueueOperationsPanel } from "@/components/admin/queue-operations-panel";
import { ManualOverrideForm } from "@/components/forms/manual-override-form";
import { MetricValidationPanel } from "@/components/forms/metric-validation-panel";
import { ModelControls } from "@/components/forms/model-controls";
import { ProcessingRunner } from "@/components/forms/processing-runner";
import { requireRole } from "@/lib/authz";
import { getAdminDashboardData } from "@/lib/dashboard";
import { DRILL_PROTOCOLS } from "@/lib/drill-protocols";
import { prisma } from "@/lib/prisma";
import { getQueueOperationsSnapshot } from "@/lib/processing/queue-operations";
import { getWorkerHealth } from "@/lib/processing/worker-heartbeat";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const admin = await requireRole(["ADMIN"]);
  const [data, drills, validationRecords, queueSnapshot, workerHealth] = await Promise.all([
    getAdminDashboardData(),
    prisma.drillDefinition.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.metricValidation.findMany({ include: { drillDefinition: true }, orderBy: { updatedAt: "desc" } }),
    getQueueOperationsSnapshot(),
    getWorkerHealth(),
  ]);
  const validationDrills = drills.flatMap((drill) => {
    const protocol = DRILL_PROTOCOLS[drill.slug as keyof typeof DRILL_PROTOCOLS];
    return protocol ? [{ id: drill.id, name: drill.name, slug: drill.slug, metrics: protocol.metrics.map((metric) => metric.key) }] : [];
  });

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[
          ["Total users", data.totalUsers],
          ["Total submissions", data.totalSubmissions],
          ["Queued", data.queuedSubmissions],
          ["Failed", data.failedSubmissions],
        ].map(([label, value]) => (
          <article key={label as string} className="athlemetry-stat">
            <p className="athlemetry-stat-label">{label}</p>
            <p className="athlemetry-stat-value">{value}</p>
          </article>
        ))}
      </section>

      <QueueOperationsPanel snapshot={queueSnapshot} workerHealth={workerHealth} />

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Processing controls</h2>
          <p className="mt-1 text-sm text-slate-600">Queue execution and manual submission overrides.</p>
          <div className="mt-5">
            <ProcessingRunner />
          </div>
          <div className="mt-5">
            <ManualOverrideForm />
          </div>
        </article>

        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Model and retraining pipeline</h2>
          <p className="mt-1 text-sm text-slate-600">Version-controlled model activation and queued retraining jobs.</p>
          <div className="mt-5">
            <ModelControls />
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Drill adoption analytics</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {data.adoption.map((item) => (
              <li key={item.drillType} className="athlemetry-panel-item flex items-center justify-between">
                <span>{item.drillType}</span>
                <span className="font-semibold text-slate-950">{item._count.drillType}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Dataset growth metrics</h2>
          <ul className="mt-4 space-y-3 text-sm text-slate-700">
            {data.growth.map((item) => (
              <li key={item.month} className="athlemetry-panel-item flex items-center justify-between">
                <span>{item.month}</span>
                <span className="font-semibold text-slate-950">{item.total}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="athlemetry-card p-5 md:p-6">
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Subscription lifecycle</h2>
        <p className="mt-1 text-sm text-slate-600">Provider-recorded lifecycle events only. Conversion is the share of recorded trial starts that later reached paid active status; it excludes direct paid subscriptions and does not represent revenue or retention.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <article className="athlemetry-panel-item">
            <p className="athlemetry-stat-label">Recorded trial starts</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{data.billingLifecycle.trialStartedCount}</p>
          </article>
          <article className="athlemetry-panel-item">
            <p className="athlemetry-stat-label">Trial-to-paid conversion</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{data.billingLifecycle.trialConversionRate === null ? "Unavailable" : `${data.billingLifecycle.trialConversionRate}%`}</p>
          </article>
          <article className="athlemetry-panel-item">
            <p className="athlemetry-stat-label">Recent cancellations</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{data.billingLifecycle.cancellationCount}</p>
            <p className="mt-1 text-xs text-slate-500">Provider events from the last 30 days</p>
          </article>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-2">
        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">System error monitoring</h2>
          <ul className="mt-4 space-y-3 text-xs text-slate-700">
            {data.systemErrors.map((error) => (
              <li key={error.id} className="athlemetry-panel-item">
                <p className="font-medium text-rose-700">{error.message}</p>
                <p>{error.createdAt.toISOString().slice(0, 19).replace("T", " ")}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="athlemetry-card p-5 md:p-6">
          <h2 className="text-lg font-semibold tracking-tight text-slate-950">Performance processing logs</h2>
          <ul className="mt-4 space-y-3 text-xs text-slate-700">
            {data.processingLogs.map((log) => (
              <li key={log.id} className="athlemetry-panel-item">
                <p className="font-medium text-slate-950">{log.status}</p>
                <p>{log.message}</p>
                <p>{log.createdAt.toISOString().slice(0, 19).replace("T", " ")}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section>
        <div className="mb-4">
          <h2 className="text-xl font-semibold tracking-tight text-slate-950">Customer metric validation</h2>
          <p className="mt-1 text-sm text-slate-600">Submit ground-truth and expert-review evidence. A different administrator must approve it before reports or rankings can expose the metric.</p>
        </div>
        <MetricValidationPanel drills={validationDrills} records={validationRecords} currentUserId={admin.id} />
      </section>

      <section className="flex flex-wrap gap-3">
        <Link href="/admin/submissions" className="athlemetry-button athlemetry-button-primary">
          Admin submissions view
        </Link>
        <Link href="/admin/reports" className="athlemetry-button athlemetry-button-secondary">
          User report review
        </Link>
      </section>
    </div>
  );
}
