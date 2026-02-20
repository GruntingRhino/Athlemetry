"use client";

import { useState, type FormEvent } from "react";

export function ManualOverrideForm() {
  const [message, setMessage] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setMessage(null);

    const formData = new FormData(event.currentTarget);

    const payload = {
      submissionId: formData.get("submissionId"),
      action: formData.get("action"),
      notes: formData.get("notes"),
      processingStatus: formData.get("processingStatus") || undefined,
      sprintTime: formData.get("sprintTime") || undefined,
      accelerationTiming: formData.get("accelerationTiming") || undefined,
      changeOfDirectionMeasurement: formData.get("changeOfDirectionMeasurement") || undefined,
      shotTiming: formData.get("shotTiming") || undefined,
      repetitionCount: formData.get("repetitionCount") || undefined,
      consistencyScore: formData.get("consistencyScore") || undefined,
    };

    const response = await fetch("/api/admin/manual-override", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    setPending(false);

    if (!response.ok) {
      setMessage(data.error || "Override failed.");
      return;
    }

    setMessage("Manual override applied.");
  }

  return (
    <form className="space-y-3" onSubmit={onSubmit}>
      <label className="block text-sm text-slate-700">
        Submission ID
        <input name="submissionId" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" required />
      </label>
      <div className="grid gap-3 md:grid-cols-2">
        <label className="text-sm text-slate-700">
          Action
          <input name="action" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" defaultValue="MANUAL_CORRECTION" required />
        </label>
        <label className="text-sm text-slate-700">
          Processing status
          <select name="processingStatus" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2">
            <option value="">No change</option>
            <option value="QUEUED">QUEUED</option>
            <option value="PROCESSING">PROCESSING</option>
            <option value="COMPLETED">COMPLETED</option>
            <option value="FAILED">FAILED</option>
            <option value="RETRYING">RETRYING</option>
          </select>
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm text-slate-700">
          Sprint time
          <input type="number" step="0.01" name="sprintTime" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700">
          Acceleration
          <input type="number" step="0.01" name="accelerationTiming" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700">
          COD
          <input type="number" step="0.01" name="changeOfDirectionMeasurement" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm text-slate-700">
          Shot timing
          <input type="number" step="0.01" name="shotTiming" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700">
          Repetition count
          <input type="number" name="repetitionCount" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
        <label className="text-sm text-slate-700">
          Consistency score
          <input type="number" step="0.1" name="consistencyScore" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" />
        </label>
      </div>
      <label className="block text-sm text-slate-700">
        Notes
        <textarea name="notes" className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2" rows={3} />
      </label>
      {message ? <p className="text-sm text-slate-700">{message}</p> : null}
      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-60"
      >
        {pending ? "Applying..." : "Apply override"}
      </button>
    </form>
  );
}
