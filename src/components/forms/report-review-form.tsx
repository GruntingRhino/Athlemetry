"use client";

import { useState, type FormEvent } from "react";

type ReportReviewFormProps = {
  reportId: string;
  currentStatus: "OPEN" | "IN_REVIEW" | "RESOLVED" | "DISMISSED";
};

export function ReportReviewForm({ reportId, currentStatus }: ReportReviewFormProps) {
  const [message, setMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const formData = new FormData(event.currentTarget);

    const response = await fetch(`/api/admin/reports/${reportId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: formData.get("status") }),
    });

    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error || "Failed to update report.");
      return;
    }

    setMessage("Report status updated.");
  }

  return (
    <form className="mt-2 flex items-center gap-2" onSubmit={onSubmit}>
      <select
        name="status"
        defaultValue={currentStatus}
        className="rounded border border-slate-300 px-2 py-1 text-xs"
      >
        <option value="OPEN">OPEN</option>
        <option value="IN_REVIEW">IN_REVIEW</option>
        <option value="RESOLVED">RESOLVED</option>
        <option value="DISMISSED">DISMISSED</option>
      </select>
      <button
        type="submit"
        className="rounded bg-slate-900 px-2 py-1 text-xs font-medium text-white hover:bg-slate-800"
      >
        Update
      </button>
      {message ? <span className="text-xs text-slate-600">{message}</span> : null}
    </form>
  );
}
