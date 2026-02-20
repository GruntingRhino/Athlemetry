import { ProcessingRunner } from "@/components/forms/processing-runner";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminSubmissionsPage() {
  await requireRole(["ADMIN"]);

  const submissions = await prisma.drillSubmission.findMany({
    include: {
      athlete: {
        select: {
          email: true,
          role: true,
        },
      },
      metricResult: true,
      processingLogs: {
        orderBy: {
          createdAt: "desc",
        },
        take: 1,
      },
    },
    orderBy: {
      submittedAt: "desc",
    },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Admin submissions monitor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Queue status, processing state transitions, and latest log entries.
        </p>
        <div className="mt-4">
          <ProcessingRunner />
        </div>
      </section>

      <section className="space-y-3">
        {submissions.map((submission) => (
          <article key={submission.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{submission.drillType}</p>
                <p className="text-xs text-slate-500">{submission.athlete.email}</p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {submission.processingStatus}
              </span>
            </div>
            <div className="mt-2 grid gap-2 text-xs text-slate-700 md:grid-cols-4">
              <p>Attempts: {submission.processingAttempts}</p>
              <p>Upload progress: {submission.uploadProgress}%</p>
              <p>Compression: {submission.compressionStatus}</p>
              <p>Sprint: {submission.metricResult?.sprintTime?.toFixed(2) ?? "-"}</p>
            </div>
            <p className="mt-2 text-xs text-slate-600">Latest log: {submission.processingLogs[0]?.message ?? "No logs yet"}</p>
            <div className="mt-2">
              <form action={`/api/submissions/${submission.id}/retry`} method="post">
                <button
                  className="rounded border border-slate-300 px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-100"
                  type="submit"
                >
                  Force retry
                </button>
              </form>
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
