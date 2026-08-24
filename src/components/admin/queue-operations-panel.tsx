"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type QueueSnapshot = {
  queued: number;
  retrying: number;
  processing: number;
  deadLettered: number;
  oldestReadyLagSeconds: number;
  deadLetters: Array<{
    id: string;
    fileName: string;
    processingAttempts: number;
    lastError: string | null;
    deadLetteredAt: Date | null;
    drillDefinition: { name: string; sport: string };
    athlete: { email: string };
  }>;
};

type WorkerHealth = {
  activeCount: number;
  staleCount: number;
  workers: Array<{
    id: string;
    workerId: string;
    status: string;
    startedAt: Date;
    lastSeenAt: Date;
    processedTotal: number;
    errorTotal: number;
    health: "ACTIVE" | "STALE" | "STOPPED";
  }>;
};

function formatLag(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  return `${Math.floor(seconds / 3600)}h ${Math.floor((seconds % 3600) / 60)}m`;
}

export function QueueOperationsPanel({ snapshot, workerHealth }: { snapshot: QueueSnapshot; workerHealth: WorkerHealth }) {
  const router = useRouter();
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function requeue(id: string) {
    if (!window.confirm("Requeue this submission for another processing attempt?")) return;
    setPendingId(id);
    setMessage(null);
    const response = await fetch(`/api/admin/processing/dead-letter/${id}/requeue`, { method: "POST" });
    const payload = await response.json() as { error?: string };
    setPendingId(null);
    if (!response.ok) {
      setMessage(payload.error ?? "Unable to requeue submission.");
      return;
    }
    setMessage("Submission requeued.");
    router.refresh();
  }

  return (
    <section className="athlemetry-card p-5 md:p-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-slate-950">Queue operations</h2>
        <p className="mt-1 text-sm text-slate-600">Live processing backlog, retry state, and poison-job recovery.</p>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
        {[
          ["Queued", snapshot.queued],
          ["Retrying", snapshot.retrying],
          ["Processing", snapshot.processing],
          ["Dead-lettered", snapshot.deadLettered],
          ["Oldest ready job", formatLag(snapshot.oldestReadyLagSeconds)],
          ["Active workers", workerHealth.activeCount],
          ["Stale workers", workerHealth.staleCount],
        ].map(([label, value]) => (
          <div key={label} className="athlemetry-panel-item">
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</p>
            <p className="mt-1 text-xl font-semibold text-slate-950">{value}</p>
          </div>
        ))}
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-slate-950">Worker fleet</h3>
        {workerHealth.workers.length === 0 ? (
          <p className="mt-2 text-sm text-rose-700">No worker heartbeat has been recorded.</p>
        ) : (
          <ul className="mt-3 grid gap-3 lg:grid-cols-2">
            {workerHealth.workers.map((worker) => (
              <li key={worker.id} className="athlemetry-panel-item text-sm text-slate-700">
                <div className="flex items-center justify-between gap-3">
                  <p className="truncate font-semibold text-slate-950">{worker.workerId}</p>
                  <span className={worker.health === "ACTIVE" ? "text-emerald-700" : worker.health === "STALE" ? "text-rose-700" : "text-slate-500"}>
                    {worker.health}
                  </span>
                </div>
                <p className="mt-1">Processed {worker.processedTotal} · Errors {worker.errorTotal}</p>
                <p className="mt-1 text-xs text-slate-500">Last seen {new Date(worker.lastSeenAt).toLocaleString()}</p>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-6">
        <h3 className="font-semibold text-slate-950">Dead-letter queue</h3>
        {snapshot.deadLetters.length === 0 ? (
          <p className="mt-2 text-sm text-slate-600">No dead-lettered submissions.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {snapshot.deadLetters.map((submission) => (
              <li key={submission.id} className="athlemetry-panel-item text-sm text-slate-700">
                <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-center">
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-950">{submission.drillDefinition.name} · {submission.fileName}</p>
                    <p className="mt-1">{submission.athlete.email} · {submission.processingAttempts} attempts</p>
                    <p className="mt-1 break-words text-rose-700">{submission.lastError ?? "No error detail recorded."}</p>
                    {submission.deadLetteredAt ? (
                      <p className="mt-1 text-xs text-slate-500">Dead-lettered {new Date(submission.deadLetteredAt).toLocaleString()}</p>
                    ) : null}
                  </div>
                  <button
                    type="button"
                    className="athlemetry-button athlemetry-button-secondary shrink-0"
                    disabled={pendingId !== null}
                    onClick={() => requeue(submission.id)}
                  >
                    {pendingId === submission.id ? "Requeueing…" : "Requeue"}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
        {message ? <p className="mt-3 text-sm text-slate-700">{message}</p> : null}
      </div>
    </section>
  );
}
