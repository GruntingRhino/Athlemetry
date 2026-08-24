import Link from "next/link";

import { BackToSports } from "@/components/layout/back-to-sports";
import { requireUser } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { readSharedSubmissionForRecipient } from "@/lib/submission-sharing";

export const dynamic = "force-dynamic";

export default async function SharedAccessPage({
  searchParams,
}: {
  searchParams?: Promise<{ submission?: string }> | { submission?: string };
}) {
  const user = await requireUser();
  const resolvedSearchParams = await Promise.resolve(searchParams ?? {});
  const selectedSubmissionId = typeof resolvedSearchParams.submission === "string" ? resolvedSearchParams.submission : null;
  const shares = await prisma.submissionShare.findMany({
    where: { recipientId: user.id, active: true },
    select: {
      submission: {
        select: {
          id: true,
          recordingDate: true,
          drillDefinition: { select: { name: true, sport: true } },
        },
      },
    },
    orderBy: { updatedAt: "desc" },
    take: 100,
  });

  let selectedSubmission = null;
  let selectedUnavailable = false;
  if (selectedSubmissionId) {
    try {
      selectedSubmission = await readSharedSubmissionForRecipient(user.id, selectedSubmissionId);
      selectedUnavailable = !selectedSubmission;
    } catch {
      selectedUnavailable = true;
    }
  }

  return (
    <div className="space-y-6 lg:space-y-8">
      <BackToSports />
      <section className="athlemetry-card p-6 md:p-8 lg:p-10">
        <div className="athlemetry-kicker">Read-only access</div>
        <h1 className="mt-4 athlemetry-section-heading">Shared with you</h1>
        <p className="athlemetry-section-lead">
          This page lists individual submissions another account has explicitly shared with you. It does not grant access to athlete profiles, other submissions, search, or team records.
        </p>
      </section>

      {selectedSubmission ? (
        <section className="athlemetry-card p-5 md:p-6" aria-labelledby="shared-submission-details">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">Shared submission details</p>
              <h2 id="shared-submission-details" className="mt-2 text-xl font-semibold text-slate-950">{selectedSubmission.drillDefinition.name}</h2>
              <p className="mt-1 text-sm text-slate-500">
                {selectedSubmission.drillDefinition.sport} · {selectedSubmission.recordingDate.toISOString().slice(0, 10)} · {selectedSubmission.processingStatus}
              </p>
            </div>
            <Link href="/shared" className="athlemetry-button athlemetry-button-secondary px-3 py-2 text-xs">Back to shared submissions</Link>
          </div>
          <p className="mt-5 text-sm leading-6 text-slate-700">Drill type: {selectedSubmission.drillType}</p>
          <div className="mt-5">
            <h3 className="text-sm font-semibold text-slate-900">Feedback reports</h3>
            {selectedSubmission.userReports.length === 0 ? (
              <p className="mt-2 text-sm text-slate-600">No feedback reports are attached to this submission.</p>
            ) : (
              <ul className="mt-3 space-y-3">
                {selectedSubmission.userReports.map((report) => (
                  <li key={report.id} className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700">
                    <p className="font-semibold text-slate-900">Status: {report.status}</p>
                    <p className="mt-2 text-xs text-slate-500">
                      Filed {report.createdAt.toISOString().slice(0, 10)}
                      {report.reviewedAt ? ` · Reviewed ${report.reviewedAt.toISOString().slice(0, 10)}` : ""}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
      ) : null}

      {selectedUnavailable ? (
        <section className="athlemetry-card p-6 text-sm text-slate-600">This shared submission is unavailable. The owner may have revoked access.</section>
      ) : null}

      {shares.length === 0 ? (
        <section className="athlemetry-card p-6 text-sm text-slate-600">No submissions are currently shared with this account.</section>
      ) : (
        <section className="space-y-4" aria-label="Shared submissions">
          {shares.map(({ submission }) => (
            <article key={submission.id} className="athlemetry-card flex flex-wrap items-center justify-between gap-4 p-5 md:p-6">
              <div>
                <p className="text-xs font-bold uppercase tracking-[0.18em] text-teal-800">{submission.drillDefinition.sport}</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">{submission.drillDefinition.name}</h2>
                <p className="mt-1 text-sm text-slate-500">Recorded {submission.recordingDate.toISOString().slice(0, 10)}</p>
              </div>
              <Link href={`/shared?submission=${encodeURIComponent(submission.id)}`} className="athlemetry-button athlemetry-button-secondary px-4 py-2 text-sm">
                Open shared submission
              </Link>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
