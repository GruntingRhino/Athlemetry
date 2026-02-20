"use client";

import { useState, type FormEvent } from "react";

export function ModelControls() {
  const [message, setMessage] = useState<string | null>(null);

  async function activateVersion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      version: formData.get("version"),
      notes: formData.get("notes"),
    };

    const response = await fetch("/api/admin/model/version", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to activate model version.");
      return;
    }

    setMessage("Model version activated.");
  }

  async function queueRetrain() {
    setMessage(null);
    const response = await fetch("/api/admin/model/retrain", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notes: "Manual retraining requested from dashboard." }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to queue retraining.");
      return;
    }

    setMessage(`Retraining job queued: ${data.job.id}`);
  }

  return (
    <div className="space-y-4">
      <form className="space-y-3" onSubmit={activateVersion}>
        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm text-slate-700">
            Version
            <input name="version" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" placeholder="v1.1.0" required />
          </label>
          <label className="text-sm text-slate-700">
            Notes
            <input name="notes" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" placeholder="Summary of model changes" />
          </label>
        </div>
        <button
          type="submit"
          className="rounded-md border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Activate version
        </button>
      </form>

      <button
        type="button"
        onClick={queueRetrain}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800"
      >
        Queue retraining job
      </button>

      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
    </div>
  );
}
