import Link from "next/link";

import { ReportForm } from "@/components/forms/report-form";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { formatPercent, formatSeconds } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SubmissionsPage() {
  const user = await requireUser();

  const submissions = await prisma.drillSubmission.findMany({
    where: user.role === "ADMIN" ? {} : { athleteId: user.id },
    include: {
      metricResult: true,
      benchmarkSnapshots: true,
      drillDefinition: true,
    },
    orderBy: {
      submittedAt: "desc",
    },
  });

  return (
    <div className="space-y-5">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Drill history archive</h1>
          <p className="mt-1 text-sm text-slate-600">Submission timeline with status, metrics, and benchmark snapshots.</p>
        </div>
        <Link href="/submissions/new" className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800">
          New submission
        </Link>
      </div>

      <div className="space-y-3">
        {submissions.map((submission) => (
          <article key={submission.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{submission.drillDefinition.name}</p>
                <p className="text-xs text-slate-500">
                  {submission.submittedAt.toISOString().slice(0, 19).replace("T", " ")} • {submission.location}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                  {submission.processingStatus}
                </span>
                <form action={`/api/submissions/${submission.id}/retry`} method="post">
                  <button
                    className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                    type="submit"
                  >
                    Retry
                  </button>
                </form>
              </div>
            </div>

            <div className="mt-3 grid gap-2 text-xs text-slate-700 md:grid-cols-5">
              <p>Sprint: {formatSeconds(submission.metricResult?.sprintTime)}</p>
              <p>Accel: {formatSeconds(submission.metricResult?.accelerationTiming)}</p>
              <p>COD: {formatSeconds(submission.metricResult?.changeOfDirectionMeasurement)}</p>
              <p>Shot: {formatSeconds(submission.metricResult?.shotTiming)}</p>
              <p>Percentile: {formatPercent(submission.benchmarkSnapshots[0]?.percentile ?? 50)}</p>
            </div>

            <details className="mt-3 rounded border border-slate-200 bg-slate-50 p-2">
              <summary className="cursor-pointer text-xs font-semibold text-slate-700">Report this submission</summary>
              <ReportForm submissionId={submission.id} />
            </details>
          </article>
        ))}
      </div>
    </div>
  );
}
