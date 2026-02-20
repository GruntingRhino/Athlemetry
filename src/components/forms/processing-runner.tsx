"use client";

import { useState } from "react";

export function ProcessingRunner() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [purgePending, setPurgePending] = useState(false);

  async function runBatch() {
    setPending(true);
    setMessage(null);

    const response = await fetch("/api/processing/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ limit: 20 }),
    });

    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setMessage(data.error || "Batch run failed.");
      return;
    }

    setMessage(`Processed ${data.total} submissions (${data.completed} completed, ${data.failed} failed).`);
  }

  async function purgeExpired() {
    setPurgePending(true);
    setMessage(null);

    const response = await fetch("/api/admin/storage/purge-expired", {
      method: "POST",
    });

    const data = await response.json();
    setPurgePending(false);

    if (!response.ok) {
      setMessage(data.error || "Purge run failed.");
      return;
    }

    setMessage(`Purged ${data.purged} expired video assets.`);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={pending}
          onClick={runBatch}
          className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
        >
          {pending ? "Running..." : "Run processing batch"}
        </button>
        <button
          type="button"
          disabled={purgePending}
          onClick={purgeExpired}
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-60"
        >
          {purgePending ? "Purging..." : "Purge expired videos"}
        </button>
      </div>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
