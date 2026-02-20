import { ReportReviewForm } from "@/components/forms/report-review-form";
import { requireRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function AdminReportsPage() {
  await requireRole(["ADMIN"]);

  const reports = await prisma.userReport.findMany({
    include: {
      reporter: {
        select: {
          email: true,
        },
      },
      submission: {
        select: {
          id: true,
          drillType: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  });

  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">User report review</h1>
        <p className="mt-1 text-sm text-slate-600">Review and resolve issue reports from athletes, parents, and coaches.</p>
      </section>

      <section className="space-y-3">
        {reports.map((report) => (
          <article key={report.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">{report.reason}</p>
                <p className="text-xs text-slate-500">Reporter: {report.reporter.email}</p>
              </div>
              <span className="rounded bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700">
                {report.status}
              </span>
            </div>
            {report.details ? <p className="mt-2 text-sm text-slate-700">{report.details}</p> : null}
            <p className="mt-2 text-xs text-slate-500">Submission: {report.submission?.drillType ?? "N/A"}</p>
            <ReportReviewForm reportId={report.id} currentStatus={report.status} />
          </article>
        ))}
      </section>
    </div>
  );
}
