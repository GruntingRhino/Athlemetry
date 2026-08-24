import { ProcessingRunner } from "@/components/forms/processing-runner";
import { SubmissionKeyMomentForm } from "@/components/forms/submission-key-moment-form";
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
      reviewedKeyMoments: {
        select: { frameIndex: true, label: true, note: true, createdAt: true },
        orderBy: { createdAt: "desc" },
        take: 10,
      },
    },
    orderBy: {
      submittedAt: "desc",
    },
    take: 100,
  });

  return (
    <div className="space-y-6 lg:space-y-8">
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <div className="athlemetry-kicker">Admin operations</div>
            <h1 className="mt-4 athlemetry-section-heading">Submissions monitor</h1>
            <p className="athlemetry-section-lead">
              Queue status, processing state transitions, and the latest processing notes for athlete uploads.
            </p>
          </div>
          <ProcessingRunner />
        </div>
      </section>

      <section className="space-y-3">
        {submissions.map((submission) => (
          <article key={submission.id} className="athlemetry-card p-5 md:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">{submission.drillType}</p>
                  <span className="athlemetry-chip px-3 py-1 text-[11px] uppercase tracking-[0.16em]">
                    {submission.processingStatus}
                  </span>
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-950">{submission.athlete.email}</p>
                <p className="text-xs text-slate-500">Role: {submission.athlete.role}</p>
              </div>
              <form action={`/api/submissions/${submission.id}/retry`} method="post">
                <button className="athlemetry-button athlemetry-button-secondary px-3 py-2 text-xs" type="submit">
                  Force retry
                </button>
              </form>
            </div>

            <div className="mt-5 grid gap-3 text-xs text-slate-700 md:grid-cols-4">
              <p className="athlemetry-panel-item">Attempts: {submission.processingAttempts}</p>
              <p className="athlemetry-panel-item">Upload progress: {submission.uploadProgress}%</p>
              <p className="athlemetry-panel-item">Compression: {submission.compressionStatus}</p>
              <p className="athlemetry-panel-item">Sprint: {submission.metricResult?.sprintTime?.toFixed(2) ?? "-"}</p>
            </div>
            <p className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3 text-xs text-slate-600">
              Latest log: {submission.processingLogs[0]?.message ?? "No logs yet"}
            </p>
            <SubmissionKeyMomentForm submissionId={submission.id} disabled={submission.processingStatus !== "COMPLETED"} />
            {submission.reviewedKeyMoments.length > 0 ? (
              <ol className="mt-4 space-y-2 text-xs text-slate-700">
                {submission.reviewedKeyMoments.map((moment) => (
                  <li key={`${moment.frameIndex}-${moment.label}`} className="rounded-2xl border border-slate-200 bg-slate-50/80 p-3">
                    <strong>{moment.label}</strong> · frame {moment.frameIndex} · {moment.createdAt.toISOString().slice(0, 10)}
                    <p className="mt-1">{moment.note}</p>
                  </li>
                ))}
              </ol>
            ) : null}
          </article>
        ))}
      </section>
    </div>
  );
}
