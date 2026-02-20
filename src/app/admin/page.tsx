import Link from "next/link";

import { ManualOverrideForm } from "@/components/forms/manual-override-form";
import { ModelControls } from "@/components/forms/model-controls";
import { ProcessingRunner } from "@/components/forms/processing-runner";
import { requireRole } from "@/lib/authz";
import { getAdminDashboardData } from "@/lib/dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  await requireRole(["ADMIN"]);

  const data = await getAdminDashboardData();

  return (
    <div className="space-y-6">
      <section className="grid gap-4 md:grid-cols-4">
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total users</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.totalUsers}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Total submissions</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.totalSubmissions}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Queued</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.queuedSubmissions}</p>
        </article>
        <article className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-xs uppercase tracking-wide text-slate-500">Failed</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{data.failedSubmissions}</p>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Processing controls</h2>
          <p className="mt-1 text-sm text-slate-600">Queue execution and manual submission overrides.</p>
          <div className="mt-4">
            <ProcessingRunner />
          </div>
          <div className="mt-5">
            <ManualOverrideForm />
          </div>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Model and retraining pipeline</h2>
          <p className="mt-1 text-sm text-slate-600">Version-controlled model activation and queued retraining jobs.</p>
          <div className="mt-4">
            <ModelControls />
          </div>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Drill adoption analytics</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {data.adoption.map((item) => (
              <li key={item.drillType} className="flex items-center justify-between rounded bg-slate-50 px-3 py-2">
                <span>{item.drillType}</span>
                <span className="font-semibold">{item._count.drillType}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Dataset growth metrics</h2>
          <ul className="mt-3 space-y-2 text-sm text-slate-700">
            {data.growth.map((item) => (
              <li key={item.month} className="flex items-center justify-between rounded bg-slate-50 px-3 py-2">
                <span>{item.month}</span>
                <span className="font-semibold">{item.total}</span>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-4 md:grid-cols-2">
        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">System error monitoring</h2>
          <ul className="mt-3 space-y-2 text-xs text-slate-700">
            {data.systemErrors.map((error) => (
              <li key={error.id} className="rounded bg-slate-50 p-2">
                <p className="font-medium text-rose-700">{error.message}</p>
                <p>{error.createdAt.toISOString().slice(0, 19).replace("T", " ")}</p>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">Performance processing logs</h2>
          <ul className="mt-3 space-y-2 text-xs text-slate-700">
            {data.processingLogs.map((log) => (
              <li key={log.id} className="rounded bg-slate-50 p-2">
                <p className="font-medium">{log.status}</p>
                <p>{log.message}</p>
                <p>{log.createdAt.toISOString().slice(0, 19).replace("T", " ")}</p>
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="flex gap-3">
        <Link
          href="/admin/submissions"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Admin submissions view
        </Link>
        <Link
          href="/admin/reports"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          User report review
        </Link>
      </section>
    </div>
  );
}
