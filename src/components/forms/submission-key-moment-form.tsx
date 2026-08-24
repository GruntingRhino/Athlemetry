"use client";

import { useState, type FormEvent } from "react";

type SubmissionKeyMomentFormProps = {
  submissionId: string;
  disabled: boolean;
};

export function SubmissionKeyMomentForm({ submissionId, disabled }: SubmissionKeyMomentFormProps) {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const response = await fetch(`/api/admin/submissions/${submissionId}/key-moments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        frameIndex: formData.get("frameIndex"),
        label: formData.get("label"),
        note: formData.get("note"),
      }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setMessage(payload?.error ?? "The reviewed key moment could not be saved.");
      return;
    }
    form.reset();
    setMessage("Reviewed key moment saved. Refresh to see it in the list.");
  }

  return (
    <details className="mt-4 rounded-2xl border border-slate-200 bg-slate-50/80 p-3" aria-disabled={disabled}>
      <summary className="cursor-pointer text-xs font-bold uppercase tracking-[0.16em] text-slate-700">Add reviewed key moment</summary>
      <form className="mt-3 space-y-3" onSubmit={onSubmit}>
        <p className="text-xs leading-5 text-slate-600">Available after processing completes. Notes are visible to the athlete without reviewer identity and must not make automated coaching, health, or performance claims.</p>
        <label className="block text-xs font-semibold text-slate-700">Frame index
          <input name="frameIndex" type="number" min="0" step="1" required disabled={disabled} className="athlemetry-control mt-1 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">Short label
          <input name="label" minLength={3} maxLength={80} required disabled={disabled} className="athlemetry-control mt-1 text-sm" />
        </label>
        <label className="block text-xs font-semibold text-slate-700">Reviewed note
          <textarea name="note" minLength={3} maxLength={300} required disabled={disabled} className="athlemetry-control mt-1 min-h-20 text-sm" />
        </label>
        <p className="text-xs text-slate-500">Do not include contact details or external links.</p>
        <button type="submit" disabled={disabled} className="athlemetry-button athlemetry-button-primary px-3 py-1.5 text-xs">Save reviewed moment</button>
        {message ? <p className="text-xs text-slate-600" role="status">{message}</p> : null}
      </form>
    </details>
  );
}
