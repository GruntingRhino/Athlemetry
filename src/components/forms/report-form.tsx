"use client";

import { useState, type FormEvent } from "react";

type ReportFormProps = {
  submissionId: string;
};

export function ReportForm({ submissionId }: ReportFormProps) {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const formData = new FormData(event.currentTarget);
    const payload = {
      submissionId,
      reason: formData.get("reason"),
      details: formData.get("details"),
    };

    const response = await fetch("/api/reports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to submit report.");
      return;
    }

    setMessage("Report submitted for admin review.");
  }

  return (
    <form className="mt-2 space-y-2" onSubmit={onSubmit}>
      <input
        name="reason"
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        placeholder="Report reason"
        required
      />
      <textarea
        name="details"
        className="w-full rounded border border-slate-300 px-2 py-1 text-xs"
        placeholder="Optional details"
        rows={2}
      />
      <button
        type="submit"
        className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
      >
        Submit report
      </button>
      {message ? <p className="text-xs text-slate-600">{message}</p> : null}
    </form>
  );
}
